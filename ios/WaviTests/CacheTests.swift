// The phone's offline copy of the Mac's list and conversations, and the reconnect backoff (PRD F22 v1.220 ④, Figma 62B /
// 62F / 63B3): a cold start without the Mac shows what it last showed, scoped to the Mac it was paired with and gone when
// the pairing is; the waits between reconnects double from 1 s to 30 s and start over after a link opens.
import Foundation
import Testing
@testable import Wavi

private func pairing(_ seed: UInt8) -> Pairing {
  Pairing(device: "phone-\(seed)", secret: WaviCrypto.b64u(Data(repeating: seed, count: 32)), macName: "Mac \(seed)",
    urls: ["ws://127.0.0.1:9"])
}

private func item(_ n: Int) -> ChatItem { ChatItem(kind: "text", id: "i\(n)", at: Double(n) * 1000, text: "t\(n)") }

private func session(_ id: String, status: SessionStatus = .running) -> RemoteSession {
  RemoteSession(id: id, projectId: "p1", title: "会话 \(id)", agent: "claude", status: status, action: "跑测试", since: 0,
    activity: 1_000, branch: "main", model: nil, reply: nil, ship: nil, shipNotice: nil)
}

private let list = RemoteSessionList(
  projects: [RemoteProject(id: "p1", name: "terminal-reborn")],
  sessions: [session("s1"), session("s2", status: .needsYou)]
)

/// A cache in this test's own folder.
private func tempCache(_ name: String = UUID().uuidString) -> PhoneCache {
  PhoneCache(root: FileManager.default.temporaryDirectory.appendingPathComponent("wavi-cache-tests/\(name)", isDirectory: true))
}

@Suite struct CacheTests {
  @Test func whatWasWrittenComesBack() async throws {
    let cache = tempCache()
    let scope = PhoneCache.scope(pairing(1))
    let feed = Feed(start: 40, items: [item(40), item(41), item(42)])
    cache.saveSessions(list, heardAt: 1_700_000_000_000, scope: scope)
    cache.saveConversation(feed, scope: scope, session: "s1")
    await cache.flush()
    #expect(cache.sessions(scope) == PhoneCache.Sessions(heardAt: 1_700_000_000_000, list: list))
    #expect(cache.conversation(scope, "s1") == PhoneCache.Conversation(start: 40, items: feed.items))
    // Nothing was written for the session next door, and nothing at all before the first write (63B3).
    #expect(cache.conversation(scope, "s2") == nil)
    #expect(cache.sessions(nil) == nil)
    #expect(cache.conversation(nil, "s1") == nil)
    let empty = tempCache()
    #expect(empty.sessions(PhoneCache.scope(pairing(9))) == nil)
    await cache.clearAll()
    await empty.clearAll()
  }

  @Test func aConversationKeepsItsNewestTwoHundredItems() async {
    let cache = tempCache()
    let scope = PhoneCache.scope(pairing(1))
    // 250 items seen, the first 50 of them long past: the cache keeps the last 200 and their indices stay put.
    let items = (0..<250).map(item)
    cache.saveConversation(Feed(start: 0, items: items), scope: scope, session: "s1")
    await cache.flush()
    let cached = cache.conversation(scope, "s1")
    #expect(cached?.items.count == 200)
    #expect(cached?.items.first?.id == "i50")
    #expect(cached?.items.last?.id == "i249")
    #expect(cached?.start == 50)
    // The same off a feed that already starts somewhere else, and one shorter than the cap keeps what it has.
    let later = PhoneCache.capped(Feed(start: 900, items: items))
    #expect(later.start == 950)
    #expect(later.items.count == 200)
    #expect(PhoneCache.capped(Feed(start: 7, items: [item(7)])).start == 7)
    #expect(PhoneCache.capped(Feed(start: 0, items: [])).items.isEmpty)
    await cache.clearAll()
  }

  @Test func eachPairingHasItsOwnFolderAndUnpairingTakesItAway() async {
    let cache = tempCache()
    let first = PhoneCache.scope(pairing(1))
    let second = PhoneCache.scope(pairing(2))
    #expect(first != second)
    cache.saveSessions(list, heardAt: 1_700_000_000_000, scope: first)
    cache.saveConversation(Feed(start: 0, items: [item(0)]), scope: first, session: "s1")
    await cache.flush()
    // The other Mac's pairing sees nothing of the first one's list or conversation.
    #expect(cache.sessions(second) == nil)
    #expect(cache.conversation(second, "s1") == nil)
    #expect(cache.sessions(first) != nil)
    // 取消配对 while a write is still waiting (a frame landed a moment before): the folder goes and the write does not
    // bring it back.
    cache.saveConversation(Feed(start: 0, items: [item(0), item(1)]), scope: first, session: "s2")
    await cache.clear(first)
    await cache.flush()
    #expect(cache.sessions(first) == nil)
    #expect(cache.conversation(first, "s1") == nil)
    #expect(cache.conversation(first, "s2") == nil)
    // The same when the Mac revokes the phone: the app clears this pairing's folder and nothing else.
    cache.saveSessions(list, heardAt: 1, scope: second)
    await cache.flush()
    await cache.clear(first)
    #expect(cache.sessions(second) != nil)
    await cache.clearAll()
  }

  @Test func aFailedWriteLeavesNoHalfFileAndNoSessionNameOutsideTheFolder() async {
    let cache = tempCache()
    let scope = PhoneCache.scope(pairing(1))
    // A session id is the Mac's, but a file name never leaves the folder even if it is not.
    cache.saveConversation(Feed(start: 0, items: [item(0)]), scope: scope, session: "../../etc/passwd")
    await cache.flush()
    #expect(cache.conversation(scope, "../../etc/passwd")?.items.count == 1)
    #expect(PhoneCache.name("../../etc/passwd").contains("/") == false)
    #expect(PhoneCache.name("s1") != PhoneCache.name("s_1"))
    await cache.clearAll()
  }
}

@Suite struct ReconnectTests {
  @Test func theWaitsDoubleToThirtySecondsAndStayThere() {
    var reconnect = Reconnect()
    #expect((0..<5).map { _ in reconnect.next() } == [1, 2, 4, 8, 16])
    #expect(reconnect.next() == 30)
    #expect(reconnect.next() == 30)
    #expect(reconnect.next() == 30)
  }

  @Test func aLinkThatOpensStartsTheWaitsOver() {
    var reconnect = Reconnect()
    for _ in 0..<4 { _ = reconnect.next() }
    #expect(reconnect.next() == 16)
    // Connected: the next drop waits a second, as it did the first time.
    reconnect.opened()
    #expect(reconnect.next() == 1)
    #expect(reconnect.next() == 2)
    // Nothing will open until someone acts (revoked, a protocol mismatch): the longest wait, and no growth from it.
    reconnect.slowest()
    #expect(reconnect.next() == 30)
    #expect(reconnect.next() == 30)
    reconnect.opened()
    #expect(reconnect.next() == 1)
  }
}

@Suite @MainActor struct ColdStartTests {
  @Test func withACachedListTheAppShowsItAsOfWhenTheMacSentIt() async {
    let cache = tempCache()
    let pairing = pairing(1)
    let scope = PhoneCache.scope(pairing)
    let heardAt = Date().timeIntervalSince1970 * 1000 - 12 * 60_000
    cache.saveSessions(list, heardAt: heardAt, scope: scope)
    cache.saveConversation(Feed(start: 8, items: [item(8), item(9)]), scope: scope, session: "s1")
    await cache.flush()
    // A cold start with the Mac off (nothing connects: `connects: false` is the state before the first attempt).
    let model = AppModel(pairing: pairing, cache: cache, connects: false)
    // 62B: the list the Mac last sent, dimmed, under 「显示的是 N 分钟前的状态 · 重试」.
    #expect(model.link == .offline(.unknown))
    #expect(groupSessions(model.sessions).map(\.title) == ["等你处理", "terminal-reborn"])
    #expect(model.sessions.sessions.map(\.id) == ["s1", "s2"])
    #expect(model.heardAt == heardAt)
    #expect(staleNotice(heardAt: model.heardAt, now: Date().timeIntervalSince1970 * 1000) == "显示的是 12 分钟前的状态")
    #expect(model.connection.text == "连不上 Mac 1")
    // 62F: the session opens on the conversation it last showed, not on nothing.
    await model.watch("s1")
    #expect(model.conversation?.feed.items.map(\.id) == ["i8", "i9"])
    #expect(model.conversation?.loading == false)
    await cache.clearAll()
  }

  @Test func withoutACacheTheListSaysItIsNotTheLatest() async {
    let cache = tempCache()
    let model = AppModel(pairing: pairing(1), cache: cache, connects: false)
    // 63B3: nothing cached, nothing heard — the state already says so and offers 重试.
    #expect(model.sessions == .empty)
    #expect(model.heardAt == nil)
    #expect(groupSessions(model.sessions).isEmpty)
    #expect(staleNotice(heardAt: model.heardAt, now: 0) == "显示的不是最新的状态")
    await model.watch("s1")
    #expect(model.conversation?.feed.items.isEmpty == true)
    #expect(model.conversation?.loading == false)
    await cache.clearAll()
  }
}
