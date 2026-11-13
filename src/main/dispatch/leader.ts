// What keeps an agent from being a project's leader session on this machine (PRD F21 v1.177 · 不改代码). A Codex leader
// runs with a read-only permission profile (`leaderLaunchArgs`), which Codex ignores when its config sets
// `sandbox_mode` (Codex docs, §6.14 v1.177): then the new-session panel does not offer Codex as leader. Only reads the
// user's config, never writes it.
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'
import { parse } from 'smol-toml'
import type { LeaderCheck } from '@shared/dispatch'

/**
 * Whether a Codex config.toml sets `sandbox_mode`: at the top, or in the profile its `profile` key selects. A file
 * that does not parse is searched for the key on any line instead.
 */
export function setsSandboxMode(toml: string): boolean {
  let config: Record<string, unknown>
  try {
    config = parse(toml) as Record<string, unknown>
  } catch {
    return /^\s*sandbox_mode\s*=/m.test(toml)
  }
  if (config.sandbox_mode !== undefined) return true
  const profiles = config.profiles
  const chosen = typeof config.profile === 'string' && typeof profiles === 'object' && profiles !== null ? (profiles as Record<string, unknown>)[config.profile] : undefined
  return typeof chosen === 'object' && chosen !== null && (chosen as Record<string, unknown>).sandbox_mode !== undefined
}

/** `$CODEX_HOME/config.toml`, else `~/.codex/config.toml`. */
export function codexConfigPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const codexHome = env.CODEX_HOME && isAbsolute(env.CODEX_HOME) ? env.CODEX_HOME : join(home, '.codex')
  return join(codexHome, 'config.toml')
}

/** Read each time the panel asks: the user may change the file between two new sessions. A missing file sets nothing. */
export async function leaderCheck(path = codexConfigPath()): Promise<LeaderCheck> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return { codexSandboxMode: false }
  }
  return { codexSandboxMode: setsSandboxMode(text) }
}
