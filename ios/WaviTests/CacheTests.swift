// The phone's offline copy of the Mac's list and conversations, and the reconnect waits (PRD v1.223 / F22 v1.220 ④, Figma
// 62B / 62F / 63B3): a cold start without the Mac shows what it last showed, scoped to the Mac it was paired with, pruned
// to the sessions the Mac still has and gone only with 取消配对; between reconnects the phone waits 1 s, then 2 s each
// time, and a link that opens starts over.
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
    cache.clearAll()
    empty.clearAll()
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
    cache.clearAll()
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
    cache.clear(first)
    await cache.flush()
    #expect(cache.sessions(first) == nil)
    #expect(cache.conversation(first, "s1") == nil)
    #expect(cache.conversation(first, "s2") == nil)
    // The same when the Mac revokes the phone: the app clears this pairing's folder and nothing else.
    cache.saveSessions(list, heardAt: 1, scope: second)
    await cache.flush()
    cache.clear(first)
    #expect(cache.sessions(second) != nil)
    cache.clearAll()
  }

  @Test func theMacsFullListPrunesTheSessionsItNoLongerHas() async {
    let cache = tempCache()
    let scope = PhoneCache.scope(pairing(1))
    cache.saveConversation(Feed(start: 0, items: [item(0)]), scope: scope, session: "s1")
    cache.saveConversation(Feed(start: 0, items: [item(0)]), scope: scope, session: "s2")
    await cache.flush()
    // The Mac lists s1 only (s2 was archived): s2 cannot be opened again, so its conversation goes.
    await cache.prune(RemoteSessionList(projects: list.projects, sessions: [session("s1")]), scope: scope)
    #expect(cache.conversation(scope, "s1") != nil)
    #expect(cache.conversation(scope, "s2") == nil)
    // A write still waiting for a session that is not in the list does not land, and one for a session that is survives.
    cache.saveConversation(Feed(start: 0, items: [item(1)]), scope: scope, session: "s3")
    cache.saveConversation(Feed(start: 0, items: [item(0), item(2)]), scope: scope, session: "s1")
    await cache.prune(RemoteSessionList(projects: list.projects, sessions: [session("s1")]), scope: scope)
    await cache.flush()
    #expect(cache.conversation(scope, "s3") == nil)
    #expect(cache.conversation(scope, "s1")?.items.map(\.id) == ["i0", "i2"])
    // Unlike 取消配对 this is not final: a session the Mac lists again is cached again.
    cache.saveConversation(Feed(start: 0, items: [item(1)]), scope: scope, session: "s2")
    await cache.flush()
    #expect(cache.conversation(scope, "s2") != nil)
    // A list with nothing in it prunes everything.
    await cache.prune(.empty, scope: scope)
    #expect(cache.conversation(scope, "s1") == nil)
    #expect(cache.conversation(scope, "s2") == nil)
    cache.clearAll()
  }

  @Test func aClearedFolderDoesNotComeBackFromAWriteThatArrivesAfterIt() async {
    let cache = tempCache()
    let scope = PhoneCache.scope(pairing(1))
    cache.saveConversation(Feed(start: 0, items: [item(0)]), scope: scope, session: "s1")
    await cache.flush()
    #expect(cache.conversation(scope, "s1") != nil)
    // 取消配对: the folder goes with the pairing, now.
    cache.clear(scope)
    #expect(!FileManager.default.fileExists(atPath: cache.folder(scope).path))
    // A write that was on its way anyway (a frame that landed a moment before, a session closing) must not bring the
    // folder — or its file — back.
    cache.saveConversation(Feed(start: 0, items: [item(1)]), scope: scope, session: "s1")
    cache.saveSessions(list, heardAt: 1, scope: scope)
    await cache.flush()
    #expect(!FileManager.default.fileExists(atPath: cache.folder(scope).path))
    #expect(cache.conversation(scope, "s1") == nil)
    #expect(cache.sessions(scope) == nil)
    cache.clearAll()
  }

  @Test func anUnpairDuringAFlushLeavesNothingBehind() async {
    let cache = tempCache()
    let scope = PhoneCache.scope(pairing(1))
    // Enough waiting writes that the drain is still writing when the unpair comes: the folder must be deleted after them,
    // never between them (a write taken, then the folder removed, then that write's createDirectory).
    for n in 0..<300 {
      cache.saveConversation(Feed(start: 0, items: (0..<32).map(item)), scope: scope, session: "s\(n)")
    }
    async let writing: Void = cache.flush()
    // The drain is under way: 取消配对 lands in the middle of it.
    try? await Task.sleep(for: .milliseconds(10))
    cache.clear(scope)
    await writing
    await cache.flush()
    #expect(!FileManager.default.fileExists(atPath: cache.folder(scope).path))
    cache.clearAll()
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
    cache.clearAll()
  }
}

@Suite struct ReconnectTests {
  @Test func theWaitsAreASecondThenTwoSecondsSoTheMacIsBackWithinThree() {
    // Acceptance ⑫: Wavi reopening on the Mac reaches the phone within 3 s, so no wait may grow past what those two add up
    // to; a closed port fails in under 1.5 s, so trying again is cheap.
    var reconnect = Reconnect()
    #expect((0..<6).map { _ in reconnect.next() } == [1, 2, 2, 2, 2, 2])
  }

  @Test func aMacThatTakesTheLinkAndClosesItSlowsDownAfterThree() {
    // A Mac that accepts the pairing and drops the link at once (an old daemon, a half-started Wavi): dialling it every
    // 1–2 s forever is a loop of pairing proofs, so the third in a row goes to 30 s.
    var reconnect = Reconnect()
    #expect(reconnect.next() == 1)
    reconnect.tookAndClosed()
    #expect(reconnect.next() == 2)
    reconnect.tookAndClosed()
    #expect(reconnect.next() == 2)
    reconnect.tookAndClosed()
    #expect(reconnect.next() == 30)
    reconnect.tookAndClosed()
    #expect(reconnect.next() == 30)
    // A link that holds — or the phone coming to the foreground, or onto another network — starts the fast waits over.
    reconnect.opened()
    #expect(reconnect.closedQuickly == 0)
    #expect(reconnect.next() == 1)
    #expect(reconnect.next() == 2)
  }

  @Test func aLinkThatOpensStartsTheWaitsOver() {
    var reconnect = Reconnect()
    for _ in 0..<4 { _ = reconnect.next() }
    #expect(reconnect.next() == 2)
    // Connected: the next drop waits a second, as it did the first time.
    reconnect.opened()
    #expect(reconnect.next() == 1)
    #expect(reconnect.next() == 2)
    // Nothing will open until someone acts (revoked, a protocol mismatch): 30 s, and no growth from it.
    reconnect.slowest()
    #expect(reconnect.next() == 30)
    #expect(reconnect.next() == 30)
    #expect(reconnect.next() == 30)
    // Someone re-paired, or the Mac caught up: the fast waits are back.
    reconnect.opened()
    #expect(reconnect.next() == 1)
    #expect(reconnect.next() == 2)
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
    cache.clearAll()
  }

  @Test func aCachedSessionsExitIsDroppedUntilTheMacSaysOtherwise() async {
    let cache = tempCache()
    let pairing = pairing(1)
    let scope = PhoneCache.scope(pairing)
    // The list was sent while a 合并到 main was running: that was minutes or hours ago, and an exit it showed then may be
    // over — the row shows without it (the Mac's snapshot sends it again if it still runs).
    let shipping = RemoteSession(id: "s1", projectId: "p1", title: "合并这一轮改动", agent: "claude", status: .running,
      action: "合并到 main", since: 0, activity: 0, branch: "main", model: nil, reply: nil,
      ship: RemoteShip(kind: "main", title: "合并到 main", agent: "claude", stage: .running, steps: [],
        texts: RemoteShip.Texts(commit: "合并", title: "合并这一轮改动", body: "", draft: false), fields: [],
        submitLabel: "提交", submitBlocker: nil, error: nil), shipNotice: nil)
    cache.saveSessions(RemoteSessionList(projects: list.projects, sessions: [shipping]), heardAt: 1_000, scope: scope)
    await cache.flush()
    let model = AppModel(pairing: pairing, cache: cache, connects: false)
    #expect(model.session("s1")?.ship == nil)
    // The rest of the row is what the Mac said, and still shows.
    #expect(model.session("s1")?.title == "合并这一轮改动")
    #expect(model.session("s1")?.branch == "main")
    cache.clearAll()
  }

  @Test func aPruneGoesByTheListItWasQueuedWith() async {
    let cache = tempCache()
    let pairing = pairing(1)
    let scope = PhoneCache.scope(pairing)
    cache.saveSessions(list, heardAt: 1_000, scope: scope)
    cache.saveConversation(Feed(start: 0, items: [item(0)]), scope: scope, session: "s2")
    await cache.flush()
    let model = AppModel(pairing: pairing, cache: cache, connects: false)
    #expect(model.sessions.sessions.map(\.id) == ["s1", "s2"])
    // The Mac's next list no longer has s2. The prune is queued with that list; it must not read the list the model holds
    // by the time it runs (still s1 and s2 here), which would keep s2's conversation.
    let prune = model.cacheSessions(RemoteSessionList(projects: list.projects, sessions: [session("s1")]), scope: scope,
      heardAt: 2_000)
    await prune?.value
    await cache.flush()
    #expect(model.sessions.sessions.map(\.id) == ["s1", "s2"])
    #expect(cache.conversation(scope, "s2") == nil)
    #expect(cache.sessions(scope)?.list.sessions.map(\.id) == ["s1"])
    #expect(cache.sessions(scope)?.heardAt == 2_000)
    cache.clearAll()
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
    cache.clearAll()
  }
}
