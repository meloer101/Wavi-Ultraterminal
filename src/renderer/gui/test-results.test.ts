import { describe, expect, it } from 'vitest'
import { testResults } from './test-results'

describe('testResults', () => {
  it('reads vitest: counts, time, and each failure with its place and assertion', () => {
    const out = [
      ' FAIL  server/auth/refresh.test.ts > refresh > renews from the cookie when expired',
      'AssertionError: expected 401 to be 200 // Object.is equality',
      '',
      '- Expected',
      '+ Received',
      '',
      '- 200',
      '+ 401',
      '',
      ' ❯ server/auth/refresh.test.ts:27:19',
      '     25|     const res = await refresh(req)',
      '',
      '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯',
      '',
      ' Test Files  1 failed | 3 passed (4)',
      '      Tests  1 failed | 11 passed (12)',
      '   Start at  10:00:00',
      '   Duration  1.80s (transform 40ms, setup 0ms)'
    ].join('\n')
    expect(testResults(out)).toEqual({
      failed: 1,
      passed: 11,
      duration: '1.80s',
      failures: [
        {
          name: 'refresh › renews from the cookie when expired',
          location: 'server/auth/refresh.test.ts:27:19',
          message: ['AssertionError: expected 401 to be 200 // Object.is equality', '- Expected', '+ Received', '- 200', '+ 401']
        }
      ]
    })
  })

  it('reads jest', () => {
    const out = [
      '  ● refresh › renews from the cookie',
      '',
      '    expect(received).toBe(expected)',
      '',
      '    Expected: 200',
      '    Received: 401',
      '',
      '      at Object.<anonymous> (server/auth/refresh.test.ts:27:19)',
      '',
      'Tests:       1 failed, 11 passed, 12 total',
      'Time:        1.8 s'
    ].join('\n')
    expect(testResults(out)).toMatchObject({
      failed: 1,
      passed: 11,
      duration: '1.8 s',
      failures: [{ name: 'refresh › renews from the cookie', location: 'server/auth/refresh.test.ts:27:19', message: ['expect(received).toBe(expected)', 'Expected: 200', 'Received: 401'] }]
    })
  })

  it('reads pytest', () => {
    const out = ['FAILED tests/test_auth.py::test_refresh - AssertionError: assert 401 == 200', '========= 1 failed, 11 passed, 2 skipped in 1.80s ========='].join('\n')
    expect(testResults(out)).toEqual({
      failed: 1,
      passed: 11,
      duration: '1.80s',
      failures: [{ name: 'tests/test_auth.py::test_refresh', location: 'tests/test_auth.py', message: ['AssertionError: assert 401 == 200'] }]
    })
  })

  it('reads go test and cargo test', () => {
    const go = ['--- FAIL: TestRefresh (0.00s)', '    refresh_test.go:27: expected 200, got 401', '--- PASS: TestLogin (0.00s)', 'FAIL', 'FAIL\tacme/auth\t0.012s'].join('\n')
    expect(testResults(go)).toEqual({
      failed: 1,
      passed: 1,
      duration: '0.012s',
      failures: [{ name: 'TestRefresh', location: 'refresh_test.go:27', message: ['expected 200, got 401'] }]
    })
    const cargo = [
      '---- auth::tests::refresh stdout ----',
      "thread 'auth::tests::refresh' panicked at src/auth.rs:27:5:",
      'assertion `left == right` failed',
      '  left: 401',
      ' right: 200',
      '',
      'failures:',
      '    auth::tests::refresh',
      '',
      'test result: FAILED. 11 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.80s'
    ].join('\n')
    expect(testResults(cargo)).toEqual({
      failed: 1,
      passed: 11,
      duration: '1.80s',
      failures: [{ name: 'auth::tests::refresh', location: 'src/auth.rs:27:5', message: ['assertion `left == right` failed', 'left: 401', 'right: 200'] }]
    })
  })

  it('reads a run with no failures, and nothing from output that is not a test run', () => {
    expect(testResults(' Test Files  4 passed (4)\n      Tests  12 passed (12)\n   Duration  900ms')).toEqual({ failed: 0, passed: 12, duration: '900ms', failures: [] })
    expect(testResults('Compiled 12 files in 1.8s\n2 passed the lint')).toBeNull()
  })
})
