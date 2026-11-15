// What the app takes from the Mac's src/shared instead of its own copy (Resources/Shared.json, written and checked by
// src/main/remote/phone-assets.test.ts): status words, agent names, branch-name words, the link's limits.
import Foundation

struct Shared: Decodable, Sendable {
  struct Agent: Decodable, Sendable, Hashable {
    let id: String
    /// By language (`zh`, `en`): a product name is the same in both, a plain shell's is not (终端 / Terminal).
    let names: [String: String]
    /// Has a logo in Assets.xcassets/Agents; the others show their first letter.
    let mark: Bool

    var name: String { names[AppLanguage.current.rawValue] ?? names[AppLanguage.zh.rawValue] ?? id }

    enum CodingKeys: String, CodingKey { case id, names = "name", mark }
  }
  struct Words: Decodable, Sendable {
    let adjectives: [String]
    let nouns: [String]
  }
  struct Limits: Decodable, Sendable {
    let codeMs: Double
    let textChars: Int
    let photos: Int
    let photoBytes: Int
    let feedPage: Int
  }
  struct Pairing: Decodable, Sendable {
    let alphabet: String
    let length: Int
    let defaultPort: Int
  }
  /// A colour that means something (status, diff) in both themes, `#rrggbb` or `#rrggbbaa`, from the desktop's tokens.css.
  struct ThemedColor: Decodable, Sendable {
    let dark: String
    let light: String
  }
  let colors: [String: ThemedColor]
  /// By language (`zh`, `en`), then by status.
  let statusLabel: [String: [String: String]]
  let agents: [Agent]
  let branchWords: Words
  let limits: Limits
  let pairing: Pairing
  /// What this app speaks to the Mac (REMOTE_PROTOCOL).
  let `protocol`: Int

  static let data: Shared = {
    guard let url = Bundle.main.url(forResource: "Shared", withExtension: "json"), let bytes = try? Data(contentsOf: url),
      let shared = try? JSONDecoder().decode(Shared.self, from: bytes)
    else { fatalError("Resources/Shared.json is missing or malformed: run the phone-assets test with WAVI_WRITE_PHONE_ASSETS=1") }
    return shared
  }()

  static func agent(_ id: String) -> Agent { data.agents.first { $0.id == id } ?? Agent(id: id, names: [:], mark: false) }

  static func statusLabel(_ status: String) -> String? { data.statusLabel[AppLanguage.current.rawValue]?[status] }
}

/// The language the app shows: the one iOS picked for it from the bundle's localizations (Settings › Wavi › Language,
/// else the system's order). The Mac is told it in `hello`; what the Mac writes is still in its own language (PRD v1.193).
enum AppLanguage: String, Sendable {
  case zh, en

  /// Chinese of any script or region is `zh`; anything else is `en`.
  init(localization: String?) {
    self = (localization ?? "zh").lowercased().hasPrefix("zh") ? .zh : .en
  }

  static var current: AppLanguage { AppLanguage(localization: Bundle.main.preferredLocalizations.first) }
}
