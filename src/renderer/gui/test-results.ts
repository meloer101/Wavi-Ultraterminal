// A test run read from a command's output (PRD F23, Figma 90D): how many failed and passed, how long it took, and each
// failure's name, place and first lines. Reads the summaries of vitest, jest, pytest, go test and cargo test; any
// other output is not a test run (null). The model keeps only an output's end (CHAT_LIMITS.output), where the summary
// is; failures printed before that end are not listed. Pure.

export interface TestFailure {
  name: string
  /** `path:line[:col]` as printed (a FileRef reads it), when the runner gave one. */
  location?: string
  /** Its first lines: the assertion, expected / received. */
  message: string[]
}

export interface TestResults {
  failed: number
  passed: number
  /** As the runner printed it: `1.80s`, `1.8 s`, `900ms`. */
  duration?: string
  failures: TestFailure[]
}

/** Lines of a failure's message kept. */
const MESSAGE_LINES = 6
/** Failures listed. */
const MAX_FAILURES = 20

const count = (text: string, word: string): number => Number(new RegExp(`(\\d+) ${word}`).exec(text)?.[1] ?? 0)

export function testResults(output: string): TestResults | null {
  const text = output.replace(/\r/g, '')
  const lines = text.split('\n')
  const summary = summaryOf(text)
  if (!summary) return null
  const failures = failuresOf(lines).slice(0, MAX_FAILURES)
  return { ...summary, failures }
}

function summaryOf(text: string): Omit<TestResults, 'failures'> | null {
  const duration = (re: RegExp): { duration: string } | object => {
    const found = re.exec(text)?.[1]?.trim()
    return found ? { duration: found } : {}
  }
  // vitest: ` Tests  1 failed | 11 passed (12)`.
  const vitest = /^\s*Tests\s{2,}(.+?)\s*\(\d+\)\s*$/m.exec(text)
  if (vitest) return { failed: count(vitest[1]!, 'failed'), passed: count(vitest[1]!, 'passed'), ...duration(/^\s*Duration\s+(\S+)/m) }
  // jest: `Tests:       1 failed, 11 passed, 12 total`.
  const jest = /^Tests:\s+(.+)$/m.exec(text)
  if (jest) return { failed: count(jest[1]!, 'failed'), passed: count(jest[1]!, 'passed'), ...duration(/^Time:\s+(.+)$/m) }
  // pytest: `===== 1 failed, 11 passed, 2 skipped in 1.80s =====`.
  const pytest = /^=+ (.*(?:passed|failed|error).*?) in ([\d.]+s)\b.*=+$/m.exec(text)
  if (pytest) return { failed: count(pytest[1]!, 'failed') + count(pytest[1]!, 'error'), passed: count(pytest[1]!, 'passed'), duration: pytest[2]! }
  // cargo test: one `test result:` line per test binary.
  const cargo = [...text.matchAll(/^test result: \w+\. (\d+) passed; (\d+) failed;.*?finished in ([\d.]+s)/gm)]
  if (cargo.length > 0)
    return { passed: cargo.reduce((n, m) => n + Number(m[1]), 0), failed: cargo.reduce((n, m) => n + Number(m[2]), 0), duration: cargo[cargo.length - 1]![3]! }
  // go test: `--- FAIL: TestX` / `--- PASS: TestX` (-v), and `FAIL\tpkg\t0.01s` / `ok  \tpkg\t0.01s`.
  const go = [...text.matchAll(/^\s*--- (FAIL|PASS): /gm)]
  const goPackage = /^(?:FAIL|ok)\s+\S+\s+([\d.]+s)/m.exec(text)
  if (go.length > 0 && goPackage)
    return { failed: go.filter((m) => m[1] === 'FAIL').length, passed: go.filter((m) => m[1] === 'PASS').length, duration: goPackage[1]! }
  return null
}

function failuresOf(lines: readonly string[]): TestFailure[] {
  const out: TestFailure[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    // vitest: ` FAIL  file > suite > test`, then the message, then ` ❯ file:line:col`.
    const vitest = /^\s*FAIL\s+(\S+)\s+>\s+(.+)$/.exec(line)
    if (vitest) {
      const message: string[] = []
      let location: string | undefined
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j]!
        const at = /^\s*❯\s+(\S+:\d+(?::\d+)?)/.exec(next)
        if (at) {
          location = at[1]
          break
        }
        if (/^\s*FAIL\s/.test(next) || /^⎯/.test(next)) break
        if (next.trim() && !/^\s*\d+\|/.test(next)) message.push(next.trim())
      }
      out.push({ name: vitest[2]!.split(' > ').join(' › '), ...(location ? { location } : {}), message: message.slice(0, MESSAGE_LINES) })
      continue
    }
    // jest: `  ● suite › test`, the message, then `at … (file:line:col)`.
    const jest = /^\s*● (.+)$/.exec(line)
    if (jest && !/^Console\b/.test(jest[1]!)) {
      const message: string[] = []
      let location: string | undefined
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j]!
        if (/^\s*● /.test(next) || /^Tests:/.test(next)) break
        const at = /^\s+at .*\((\S+:\d+:\d+)\)/.exec(next) ?? /^\s+at (\S+:\d+:\d+)$/.exec(next)
        if (at) {
          location = at[1]
          break
        }
        if (next.trim()) message.push(next.trim())
      }
      out.push({ name: jest[1]!, ...(location ? { location } : {}), message: message.slice(0, MESSAGE_LINES) })
      continue
    }
    // pytest: `FAILED path::test - message`.
    const pytest = /^FAILED (\S+?)(?: - (.*))?$/.exec(line)
    if (pytest) {
      const name = pytest[1]!
      out.push({ name, location: name.split('::')[0]!, message: pytest[2] ? [pytest[2]] : [] })
      continue
    }
    // go test: `--- FAIL: TestX (0.00s)`, then `    file_test.go:27: message`.
    const go = /^\s*--- FAIL: (\S+)/.exec(line)
    if (go) {
      const message: string[] = []
      let location: string | undefined
      for (let j = i + 1; j < lines.length && /^\s{4,}\S/.test(lines[j]!); j++) {
        const at = /^\s+(\S+\.go:\d+): (.*)$/.exec(lines[j]!)
        if (at && !location) location = at[1]
        message.push((at ? at[2]! : lines[j]!).trim())
      }
      out.push({ name: go[1]!, ...(location ? { location } : {}), message: message.slice(0, MESSAGE_LINES) })
      continue
    }
    // cargo test: `---- name stdout ----`, `thread '…' panicked at file:line:col:`, the message up to a blank line.
    const cargo = /^---- (\S+) stdout ----$/.exec(line)
    if (cargo) {
      const message: string[] = []
      let location: string | undefined
      for (let j = i + 1; j < lines.length && lines[j]!.trim(); j++) {
        const at = /panicked at (\S+:\d+:\d+):?$/.exec(lines[j]!)
        if (at) location = at[1]
        else message.push(lines[j]!.trim())
      }
      out.push({ name: cargo[1]!, ...(location ? { location } : {}), message: message.slice(0, MESSAGE_LINES) })
    }
  }
  return out
}
