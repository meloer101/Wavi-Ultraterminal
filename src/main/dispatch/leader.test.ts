import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { codexConfigPath, codexLeaderSandboxArgs, leaderCheck, setsSandboxMode } from './leader'

describe('Codex as a leader (PRD F21 v1.177 · 不改代码)', () => {
  let dir: string | null = null
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('sees a sandbox_mode at the top or in the chosen profile, which would override the read-only profile', () => {
    expect(setsSandboxMode('sandbox_mode = "workspace-write"\nmodel = "gpt-5"\n')).toBe(true)
    expect(setsSandboxMode('profile = "fast"\n[profiles.fast]\nsandbox_mode = "danger-full-access"\n')).toBe(true)
    expect(setsSandboxMode('model = "gpt-5"\n[profiles.fast]\nsandbox_mode = "danger-full-access"\n')).toBe(false)
    expect(setsSandboxMode('model = "gpt-5"\n# sandbox_mode = "read-only"\n')).toBe(false)
    expect(setsSandboxMode('')).toBe(false)
  })

  it('falls back to a line search when the file does not parse', () => {
    expect(setsSandboxMode('model = \nsandbox_mode = "workspace-write"\n')).toBe(true)
    expect(setsSandboxMode('model = \n')).toBe(false)
  })

  it('reads $CODEX_HOME/config.toml, else ~/.codex/config.toml; a missing file sets nothing', async () => {
    expect(codexConfigPath({ CODEX_HOME: '/opt/codex' }, '/Users/me')).toBe('/opt/codex/config.toml')
    expect(codexConfigPath({ CODEX_HOME: 'relative' }, '/Users/me')).toBe('/Users/me/.codex/config.toml')
    expect(codexConfigPath({}, '/Users/me')).toBe('/Users/me/.codex/config.toml')
    dir = mkdtempSync(join(tmpdir(), 'wavi-leader-'))
    const file = join(dir, 'config.toml')
    expect(await leaderCheck(file)).toEqual({ codexSandboxMode: false })
    writeFileSync(file, 'sandbox_mode = "workspace-write"\n')
    expect(await leaderCheck(file)).toEqual({ codexSandboxMode: true })
  })

  it('pins a Codex leader read-only on its command line when the config sets sandbox_mode, else adds nothing', () => {
    expect(codexLeaderSandboxArgs({ codexSandboxMode: true })).toEqual(['-c', 'sandbox_mode="read-only"'])
    expect(codexLeaderSandboxArgs({ codexSandboxMode: false })).toEqual([])
  })
})
