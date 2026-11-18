// Figma 98′ / 98D: how a message of yours that just left the composer comes into the conversation, the same rule as the
// Mac's (src/renderer/gui/model.ts flightOf). Pure; WaviTests/FlightTests.swift.
import CoreGraphics

enum Flight: Equatable {
  /// From where it lands back to where it left: the copy starts this far off and springs home.
  case fly(dx: CGFloat, dy: CGFloat)
  /// Fades in where it lands.
  case fade

  /// The most lines a sent message flies with (FLIGHT_ROWS on the Mac).
  static let rows: CGFloat = 6

  /// Its first line was at `from` in the composer; laid out in the conversation its words start at `to`, `height` tall
  /// in lines of `line` points. It flies when it has words, is laid out and is no longer than `rows` lines; otherwise,
  /// and when motion is reduced, it fades in.
  static func of(from: CGPoint, to: CGPoint, height: CGFloat, line: CGFloat, reduced: Bool) -> Flight {
    if reduced || line <= 0 || height <= 0 || height > rows * line + 1 { return .fade }
    return .fly(dx: from.x - to.x, dy: from.y - to.y)
  }
}
