// What the Mac last said, kept on the phone (PRD F22 v1.220 ④; Figma 62B, 62F and 63B3): the session list as of when it
// arrived, and per session the newest 200 items of its conversation, so opening the app while the Mac is off shows the
// list and the conversation it showed before instead of nothing. Scoped to the pairing it belongs to (a digest of that
// pairing's secret), so another Mac's data never shows and 取消配对 leaves nothing behind. The Mac's full session list
// prunes the conversations of sessions it no longer has. The files hold a conversation:
// readable only after the first unlock (a background wake still reads the pairing) and never in a backup. Writes are
// coalesced — a streamed frame does not write — and happen off the main actor; reads are small and taken on the main
// actor, at a cold start and when a session opens.
import CryptoKit
import Foundation

final class PhoneCache: Sendable {
  /// One session's conversation as last written: items `start` … `start + items.count - 1`, the newest ones the phone
  /// has seen.
  struct Conversation: Codable, Sendable, Equatable {
    var start: Int
    var items: [ChatItem]
  }

  /// The session list as last heard, with when (ms): the age the notice over a stale list reads (62B).
  struct Sessions: Codable, Sendable, Equatable {
    var heardAt: Double
    var list: RemoteSessionList
  }

  /// How many of a conversation's newest items are kept.
  static let items = 200
  /// A write happens this long after the last change: a burst of streamed frames writes once.
  static let debounce: Duration = .seconds(1)

  static let shared = PhoneCache()

  private let root: URL
  private let sink = Sink()

  /// `root`: where this app's cache lives (`Application Support/Wavi/Remote`); a test passes its own folder.
  init(root: URL = PhoneCache.defaultRoot) { self.root = root }

  /// `<userData>/Library/Application Support/Wavi/Remote`: nothing in the documents folder, which a device restore puts
  /// back.
  static var defaultRoot: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("Wavi", isDirectory: true).appendingPathComponent("Remote", isDirectory: true)
  }

  /// The pairing's own folder name: the secret's digest. Each pairing has its own secret, so pairing another Mac (or
  /// pairing this one again) starts from its own empty folder.
  static func scope(_ pairing: Pairing) -> String {
    digest(WaviCrypto.fromB64u(pairing.secret) ?? Data(pairing.secret.utf8), count: 32)
  }

  /// A conversation's file name: the session id's own characters (ids are hex-ish), then a digest of the whole id so two
  /// ids that escape to the same characters never share a file.
  static func name(_ session: String) -> String {
    let allowed = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
    let safe = String(session.prefix(64).map { allowed.contains($0) ? $0 : "_" })
    return "\(safe)-\(digest(Data(session.utf8), count: 8)).json"
  }

  private static func digest(_ data: Data, count: Int) -> String {
    String(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined().prefix(count))
  }

  func folder(_ scope: String) -> URL { root.appendingPathComponent(scope, isDirectory: true) }

  private func sessionsFile(_ scope: String) -> URL { folder(scope).appendingPathComponent("sessions.json") }

  private func feedFile(_ scope: String, _ session: String) -> URL {
    folder(scope).appendingPathComponent("feed", isDirectory: true).appendingPathComponent(PhoneCache.name(session))
  }

  // MARK: - reading

  /// The list the Mac last sent, or nil when nothing was written yet (63B3).
  func sessions(_ scope: String?) -> Sessions? {
    guard let scope, let data = try? Data(contentsOf: sessionsFile(scope)) else { return nil }
    return try? JSONDecoder().decode(Sessions.self, from: data)
  }

  /// The newest items of a session's conversation the phone has seen, or nil when it never had them.
  func conversation(_ scope: String?, _ session: String) -> Conversation? {
    guard let scope, let data = try? Data(contentsOf: feedFile(scope, session)) else { return nil }
    return try? JSONDecoder().decode(Conversation.self, from: data)
  }

  /// A feed as the cache keeps it: its newest `items`, the start moved up so the last item keeps its index.
  static func capped(_ feed: Feed) -> Conversation {
    let kept = feed.items.suffix(items)
    return Conversation(start: feed.start + feed.items.count - kept.count, items: Array(kept))
  }

  // MARK: - writing

  func saveSessions(_ list: RemoteSessionList, heardAt: Double, scope: String?) {
    guard let scope, let data = try? JSONEncoder().encode(Sessions(heardAt: heardAt, list: list)) else { return }
    sink.add(data, to: sessionsFile(scope))
  }

  func saveConversation(_ feed: Feed, scope: String?, session: String) {
    guard let scope, let data = try? JSONEncoder().encode(PhoneCache.capped(feed)) else { return }
    sink.add(data, to: feedFile(scope, session))
  }

  /// The pairing is gone (取消配对, the user's own action): its folder goes now, and a write still waiting for it does not
  /// bring it back. A Mac that says it does not know this phone keeps its files — the pairing is kept then, the user
  /// decides (PRD v1.223).
  func clear(_ scope: String) async {
    let folder = folder(scope)
    sink.discard(under: folder)
    await Task.detached { try? FileManager.default.removeItem(at: folder) }.value
  }

  /// Every pairing's folder (a test's clean-up; the app clears one pairing at a time).
  func clearAll() async {
    sink.discard(under: root)
    let root = self.root
    await Task.detached { try? FileManager.default.removeItem(at: root) }.value
  }

  /// Writes what is waiting now and returns once it is on disk (a test waits for this; the app never has to).
  func flush() async { await Task.detached { [sink] in sink.drain() }.value }

  /// The Mac's full list: sessions it no longer has cannot be opened again, so their cached conversations go (and a write
  /// still waiting for one does not land).
  func prune(_ list: RemoteSessionList, scope: String?) async {
    guard let scope else { return }
    let folder = folder(scope).appendingPathComponent("feed", isDirectory: true)
    let keep = Set(list.sessions.map { PhoneCache.name($0.id) })
    sink.discard(under: folder, except: keep)
    await Task.detached {
      guard let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else { return }
      for name in names where !keep.contains(name) {
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
      }
    }.value
  }

  /// The writes not yet on disk, one per file, and the timer of the current burst. A lock rather than an actor: adding a
  /// write is synchronous, so one enqueued before 取消配对 cannot land after the folder was deleted.
  private final class Sink: @unchecked Sendable {
    private let lock = NSLock()
    private var pending: [URL: Data] = [:]
    private var timer: Task<Void, Never>?

    func add(_ data: Data, to url: URL) {
      lock.lock()
      defer { lock.unlock() }
      pending[url] = data
      // One timer for a burst: the first change starts it, the rest ride along.
      guard timer == nil else { return }
      timer = Task.detached { [self] in
        try? await Task.sleep(for: PhoneCache.debounce)
        guard !Task.isCancelled else { return }
        drain()
      }
    }

    /// Every waiting write, off the caller's actor (the file work is what takes the time).
    func drain() {
      lock.lock()
      let writes = pending
      pending.removeAll()
      timer = nil
      lock.unlock()
      for (url, data) in writes { PhoneCache.write(data, to: url) }
    }

    func discard(under folder: URL) {
      discard(under: folder, except: [])
    }

    /// Drops what is waiting under `folder`, all of it or everything whose file name is not in `except`.
    func discard(under folder: URL, except keep: Set<String>) {
      lock.lock()
      pending = pending.filter { url, _ in
        !url.path.hasPrefix(folder.path) || keep.contains(url.lastPathComponent)
      }
      if pending.isEmpty {
        timer?.cancel()
        timer = nil
      }
      lock.unlock()
    }
  }

  /// Written whole (half a file never loads), readable only after the first unlock, out of a backup.
  private nonisolated static func write(_ data: Data, to url: URL) {
    let manager = FileManager.default
    do {
      try manager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true,
        attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
      try data.write(to: url, options: .atomic)
      try manager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
      var mutable = url
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try mutable.setResourceValues(values)
    } catch {
      // No cache is not something the user can act on: the next change tries again, and without it the app shows what a
      // fresh install shows (63B3).
    }
  }
}
