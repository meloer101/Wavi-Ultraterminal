// The phone's cold start without the Mac (PRD F22 v1.220 ④, Figma 62B and 62F). The repo has no stand-in Mac, so this
// test is the host the way PlanSheetShots is: an AppModel built from a written cache that connects nowhere, its views
// drawn to PNGs — `test-results/offline/` (or the simulator's temporary folder, the paths in the test log). Four: the
// session list and an open session, dark and light.
import Foundation
import SwiftUI
import Testing
import UIKit
@testable import Wavi

private let pairing = Pairing(device: "phone-shot", secret: WaviCrypto.b64u(Data(repeating: 3, count: 32)),
  macName: "Jacoys-MacBook-Pro", urls: ["ws://127.0.0.1:9"])

// Times relative to now: the rows read as they would on a phone that was connected a few minutes ago.
private let now = Date().timeIntervalSince1970 * 1000

private let sessions = RemoteSessionList(
  projects: [RemoteProject(id: "p1", name: "terminal-reborn"), RemoteProject(id: "p2", name: "wavi-site")],
  sessions: [
    RemoteSession(id: "s1", projectId: "p1", title: "加离线缓存", agent: "claude", status: .running, action: "跑 WaviTests",
      since: now - 4 * 60_000, activity: now - 10_000, branch: "jacoy/phone-offline-cache", model: "opus", reply: nil,
      ship: nil, shipNotice: nil),
    RemoteSession(id: "s2", projectId: "p1", title: "修侧栏折叠的动画", agent: "codex", status: .needsYou, action: nil,
      since: now - 3 * 60_000, activity: now - 3 * 60_000, branch: "jacoy/sidebar-fold", model: nil, reply: nil, ship: nil,
      shipNotice: nil),
    RemoteSession(id: "s3", projectId: "p1", title: "合并前审阅的提示", agent: "pi", status: .doneUnread, action: nil,
      since: nil, activity: now - 40 * 60_000, branch: "jacoy/review-note", model: nil, reply: nil, ship: nil,
      shipNotice: nil),
    RemoteSession(id: "s4", projectId: "p2", title: "第二版首页", agent: "claude", status: .idle, action: nil, since: nil,
      activity: now - 2 * 3_600_000, branch: "main", model: nil, reply: nil, ship: nil, shipNotice: nil)
  ]
)

/// A conversation as the Mac would have sent it: what the agent said, a command it ran and an edit it made.
private let conversation: [ChatItem] = [
  ChatItem(kind: "user", id: "i0", at: 1_000, text: "手机离线时应该显示上次的会话列表和对话，重连之后马上替换成 Mac 上的。"),
  ChatItem(kind: "text", id: "i1", at: 2_000,
    text: "我读了 `ios/Wavi/Store/Keychain.swift` 和 `AppModel`：配对存在钥匙串里，会话列表只在内存里。先加一个落在 Application Support 的小缓存。"),
  ChatItem(kind: "tool", id: "i2", at: 3_000, ms: 42_000, name: "Bash", arg: "cd ios && xcodebuild test -scheme Wavi", state: "ok",
    output: "Test run with 78 tests in 12 suites passed after 51.2 seconds."),
  ChatItem(kind: "tool", id: "i3", at: 4_000, ms: 800, name: "Write", arg: "ios/Wavi/Store/Cache.swift", state: "ok",
    diff: ToolDiff(path: "ios/Wavi/Store/Cache.swift", hunks: [DiffHunk(oldStart: 0, newStart: 1, lines: [
      "+final class PhoneCache: Sendable {", "+  static let items = 200", "+  static let debounce: Duration = .seconds(1)", "+}"
    ])], added: 4, removed: 0, truncated: false)),
  ChatItem(kind: "text", id: "i4", at: 5_000, text: "缓存写好了，按配对密钥分开存，取消配对时删掉；退避换成 1 / 2 / 4 / 8 / 16 / 30 秒。")
]

@MainActor
private func model() async -> AppModel {
  let cache = PhoneCache(root: FileManager.default.temporaryDirectory.appendingPathComponent("wavi-offline-shots", isDirectory: true))
  let scope = PhoneCache.scope(pairing)
  // 12 minutes ago: 62B's notice reads 「显示的是 12 分钟前的状态」.
  cache.saveSessions(sessions, heardAt: now - 12 * 60_000, scope: scope)
  cache.saveConversation(Feed(start: 0, items: conversation), scope: scope, session: "s1")
  await cache.flush()
  return AppModel(pairing: pairing, cache: cache, connects: false)
}

/// The folder the PNGs go to: `test-results/offline/` in the repo when the shell named it, the simulator's temporary
/// folder otherwise.
private func shotFolder() -> URL {
  let fallback = FileManager.default.temporaryDirectory
  guard let wanted = ProcessInfo.processInfo.environment["WAVI_SHOT_DIR"], !wanted.isEmpty else { return fallback }
  let url = URL(fileURLWithPath: wanted, isDirectory: true)
  return (try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)) == nil ? fallback : url
}

@MainActor
private func shot<V: View>(_ view: V, _ style: UIUserInterfaceStyle, named name: String) async throws {
  let model = await model()
  guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else {
    Issue.record("\(name): no window scene to draw in")
    return
  }
  let window = UIWindow(windowScene: scene)
  window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
  window.overrideUserInterfaceStyle = style
  let host = UIHostingController(rootView: view.environment(model))
  host.view.backgroundColor = .clear
  window.rootViewController = host
  window.makeKeyAndVisible()
  // The view's tasks run first (the session opens on its cached conversation), then the first frame settles.
  try await Task.sleep(for: .milliseconds(600))
  host.view.layoutIfNeeded()
  let size = window.bounds.size
  let image = UIGraphicsImageRenderer(size: size).image { context in
    window.layer.render(in: context.cgContext)
  }
  let path = shotFolder().appendingPathComponent("offline-\(name).png")
  try image.pngData()?.write(to: path)
  print("SHOT \(name): \(path.path) \(Int(size.width))x\(Int(size.height))")
  window.isHidden = true
}

@Suite @MainActor struct OfflineShots {
  @Test func coldStartOfflineListAndSession() async throws {
    for (style, name) in [(UIUserInterfaceStyle.dark, "dark"), (.light, "light")] {
      try await shot(NavigationStack { SessionsView() }, style, named: "list-\(name)")
      try await shot(NavigationStack { SessionView(id: "s1") }, style, named: "session-\(name)")
    }
  }
}
