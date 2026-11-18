// Flight.swift: a message of yours flies in from the composer, or fades in where it lands (Figma 98′ / 98D).
import CoreGraphics
import Testing
@testable import Wavi

@Suite struct FlightTests {
  let line: CGFloat = 26
  let from = CGPoint(x: 52, y: 800)
  let to = CGPoint(x: 222, y: 525)

  @Test func aMessageOfUpToSixLinesFliesBackFromWhereItLands() {
    #expect(Flight.of(from: from, to: to, height: line, line: line, reduced: false) == .fly(dx: -170, dy: 275))
    #expect(Flight.of(from: from, to: to, height: 6 * line, line: line, reduced: false) == .fly(dx: -170, dy: 275))
  }

  @Test func longerWithoutWordsNotLaidOutOrReducedMotionFadesIn() {
    #expect(Flight.of(from: from, to: to, height: 7 * line, line: line, reduced: false) == .fade)
    #expect(Flight.of(from: from, to: to, height: 0, line: line, reduced: false) == .fade)
    #expect(Flight.of(from: from, to: to, height: line, line: 0, reduced: false) == .fade)
    #expect(Flight.of(from: from, to: to, height: line, line: line, reduced: true) == .fade)
  }
}
