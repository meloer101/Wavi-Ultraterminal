// The English beside the Chinese (Resources/Localizable.xcstrings, Chinese keys): the built app carries an English
// table that answers the Chinese keys, counts take English plurals, and the language the Mac is told is zh or en. The
// scheme runs the other tests in Chinese, so the English table is read here directly.
import Foundation
import Testing
@testable import Wavi

private let english: Bundle? = Bundle.main.path(forResource: "en", ofType: "lproj").flatMap(Bundle.init(path:))

private func en(_ key: String) -> String { english?.localizedString(forKey: key, value: "∅", table: nil) ?? "∅" }

@Suite struct LocalizationTests {
  @Test func theAppDeclaresBothLanguages() {
    #expect(Set(Bundle.main.localizations).isSuperset(of: ["zh-Hans", "en"]))
    #expect(english != nil)
  }

  @Test func englishAnswersTheChineseKeys() {
    #expect(en("会话") == "Sessions")
    #expect(en("等你处理") == "Needs you")
    #expect(en("等你确认") == "Needs approval")
    #expect(en("已等 %@") == "waiting %@")
    #expect(en("还没有 PR · %@ 有分支保护") == "No PR yet · %@ is protected")
    #expect(en("在后台继续") == "Continue in background")
  }

  @Test func englishCountsArePlural() {
    // With English plural rules: the scheme's Chinese has one form only.
    let english = Locale(identifier: "en")
    let format = en("%lld 个文件")
    #expect(String(format: format, locale: english, 1) == "1 file")
    #expect(String(format: format, locale: english, 5) == "5 files")
    #expect(String(format: en("%lld 个提交"), locale: english, 3) == "3 commits")
  }

  @Test func noEnglishValueIsLeftInChinese() throws {
    let url = try #require(english?.url(forResource: "Localizable", withExtension: "strings"))
    let table = try #require(NSDictionary(contentsOf: url) as? [String: String])
    #expect(table.count > 100)
    let chinese = table.filter { $0.value.unicodeScalars.contains { (0x4E00...0x9FFF).contains($0.value) } }
    #expect(chinese.isEmpty, "\(chinese.keys.sorted())")
  }

  /// English is the development region (a phone in neither language gets English), so a key without its own
  /// zh-Hans value would show Chinese users the English: the Chinese table answers every key the English one does.
  @Test func chineseAnswersEveryKey() throws {
    let chinese = try #require(Bundle.main.path(forResource: "zh-Hans", ofType: "lproj").flatMap(Bundle.init(path:)))
    let url = try #require(english?.url(forResource: "Localizable", withExtension: "strings"))
    let keys = try #require(NSDictionary(contentsOf: url) as? [String: String]).keys
    let missing = keys.filter { chinese.localizedString(forKey: $0, value: "∅", table: nil) == "∅" }
    #expect(missing.isEmpty, "\(missing.sorted())")
  }

  @Test func theMacIsToldZhOrEn() {
    #expect(AppLanguage(localization: "zh-Hans") == .zh)
    #expect(AppLanguage(localization: "zh-Hant-TW") == .zh)
    #expect(AppLanguage(localization: "en") == .en)
    #expect(AppLanguage(localization: "en-GB") == .en)
    #expect(AppLanguage(localization: "ja") == .en)
    // The scheme runs the tests in Chinese.
    #expect(AppLanguage.current == .zh)
  }

  @Test func sharedWordsComeInBothLanguages() {
    #expect(Shared.data.statusLabel["zh"]?["needs_you"] == "等你处理")
    #expect(Shared.data.statusLabel["en"]?.keys.sorted() == Shared.data.statusLabel["zh"]?.keys.sorted())
    #expect(Shared.agent("shell").names.keys.sorted() == ["en", "zh"])
    #expect(Shared.agent("claude").name == "Claude Code")
  }
}
