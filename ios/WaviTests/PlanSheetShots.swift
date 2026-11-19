// The plan sheet's screenshots (Figma 100A / 100B, approved 2026-11-19). The repo has no stand-in Mac, so this test is the
// host: a window with the session page the sheet is presented over, the sheet itself (its detents, background and the
// plan's Markdown) drawn to a PNG. Four: dark and light, a short plan and the long one — `plan-sheet-*.png` in the
// simulator's temporary folder, the paths in the test log (`xcodebuild test` prints them).
import Foundation
import SwiftUI
import Testing
import UIKit
@testable import Wavi

private let shortPlan = """
## 计划：登录改成 Set-Cookie

1. `server/auth.ts` 的登录不再写 localStorage，改成 `Set-Cookie`（`httpOnly`、`SameSite=Lax`）
2. 刷新接口从 cookie 读会话，读不到就 401
3. 跑一遍 `pnpm vitest run server/auth`
"""

private let longPlan = """
## 计划：登录与刷新都从 cookie 读会话

### 1. 登录接口

- `server/auth.ts` 里 `login()` 写 `res.cookie('session', token, { httpOnly: true, sameSite: 'lax' })`，去掉 localStorage 的三处读写
- 登录成功后返回用户和过期时间，不再把 token 放进响应体
- 补一条 `login.test.ts`：响应上有 cookie，body 里没有 token

### 2. 刷新接口

- `refresh()` 读 `req.cookies.session`，验签后重新签发，滚动过期时间
- 没有 cookie 或验签失败时返回 401，并在响应里带上 `WWW-Authenticate`
- 补一条 `refresh.test.ts`：过期前一小时续期、过期后 401、篡改签名 401

### 3. 前端

- `src/api/session.ts` 删掉 localStorage 的读写，`fetch` 统一带 `credentials: 'include'`
- 登录页不再存 token，路由守卫改成问 `/api/session`

### 4. 核对

- 跑 `pnpm vitest run server/auth` 和 `pnpm playwright test e2e/login.spec.ts`
- 手动过一遍 Safari：跨站 POST 不带 Lax cookie 时的表现为 401 而不是 500
"""

/// The sheet as the app shows it: SwiftUI presents it over a session, so its detents and background are the system's.
private struct Harness: View {
  let prompt: RemotePrompt
  @State private var shown = true

  var body: some View {
    Color.bgApp.ignoresSafeArea()
      .sheet(isPresented: $shown) { PlanAsk(prompt: prompt, error: .constant(nil), close: {}) }
  }
}

private func plan(_ text: String) -> RemotePrompt {
  RemotePrompt(kind: "plan", id: "s1:p1", sessionId: "s1", createdAt: Date().timeIntervalSince1970 * 1000 - 48_000, answerable: true, plan: text)
}

@MainActor
private func shot(_ text: String, _ style: UIUserInterfaceStyle, named name: String) async throws {
  let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
  window.windowScene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
  window.overrideUserInterfaceStyle = style
  let host = UIHostingController(rootView: Harness(prompt: plan(text)).environment(AppModel()))
  host.view.backgroundColor = .clear
  window.rootViewController = host
  window.makeKeyAndVisible()
  // The sheet's detent and the capped content area settle a pass after the presentation.
  try await Task.sleep(for: .milliseconds(400))
  guard let sheet = host.presentedViewController else {
    Issue.record("\(name): the sheet did not present")
    return
  }
  sheet.view.layoutIfNeeded()
  let size = window.bounds.size
  let image = UIGraphicsImageRenderer(size: size).image { context in
    window.layer.render(in: context.cgContext)
  }
  let path = FileManager.default.temporaryDirectory.appendingPathComponent("plan-sheet-\(name).png")
  try image.pngData()?.write(to: path)
  print("SHOT \(name): \(path.path) \(Int(size.width))x\(Int(size.height))")
  // Copy it off the simulator: `xcrun simctl` keeps the app's container, the window goes with this test.
  window.isHidden = true
}

@Suite @MainActor struct PlanSheetShots {
  @Test func darkAndLightShortAndLong() async throws {
    try await shot(shortPlan, .dark, named: "short-dark")
    try await shot(shortPlan, .light, named: "short-light")
    try await shot(longPlan, .dark, named: "long-dark")
    try await shot(longPlan, .light, named: "long-light")
  }
}
