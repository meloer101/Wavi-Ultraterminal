// Validation of what the renderer sends to the ship handlers (src/shared/ship.ts): main trusts none of it. Pure.
import { MAX_MERGE_MESSAGE, MERGE_METHODS, multiLine, oneLine, type MergeMethod } from './git-merge'
import { MAX_SHIP_FILES, parsePrTarget } from './pull-requests'
import type { CommitRange, DiffSinceRequest, HandoffRequest, PushBaseRequest, ShipMainRequest, ShipOperationRequest, ShipPrepushRequest } from './ship'
import { HANDOFF_FILES, type HandoffKind } from './ship-handoff'

const MAX_PATH = 4096
/** A full or abbreviated commit id; the diff and the reset resolve it and require it to be an ancestor of HEAD. */
const SINCE = /^[0-9a-f]{7,40}$/i
/** A full commit id (SHA-1 or SHA-256), as the precheck reads it. */
const FULL_SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/
/** The squash commit's subject (the session's title), as the merge sheet's request caps it. */
const MAX_TITLE = 200

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A path as `git status` prints it: relative, no `.` / `..` segments, no NUL. */
function isRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value === '' || value.length > MAX_PATH || value.includes('\0') || value.startsWith('/')) return false
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

export function parseHandoffRequest(raw: unknown): HandoffRequest | null {
  const target = parsePrTarget(raw)
  if (!target || !isRecord(raw)) return null
  if (typeof raw.kind !== 'string' || !Object.prototype.hasOwnProperty.call(HANDOFF_FILES, raw.kind)) return null
  return { ...target, kind: raw.kind as HandoffKind }
}

export function parseDiffSinceRequest(raw: unknown): DiffSinceRequest | null {
  const target = parsePrTarget(raw)
  if (!target || !isRecord(raw)) return null
  if (typeof raw.since !== 'string' || !SINCE.test(raw.since)) return null
  return { ...target, since: raw.since.toLowerCase() }
}

/**
 * 合并: the message is cleaned like a commit message (newlines kept) and capped; with paths it must not be empty (it is
 * the commit's message). An empty `paths` list means nothing to commit, as null does. `push` only when it is true; the
 * title one line, capped (an empty one is left out); `head` a full commit id.
 */
export function parsePushBaseRequest(raw: unknown): PushBaseRequest | null {
  const target = parsePrTarget(raw)
  if (!target || !isRecord(raw)) return null
  if (raw.commit === undefined) return target
  return typeof raw.commit === 'string' && SINCE.test(raw.commit) ? { ...target, commit: raw.commit } : null
}

const PREPUSH: ReadonlySet<unknown> = new Set(['base', 'branch', 'new-pr'])

/** The push node's pull first: a worktree and which push. */
export function parsePrepushRequest(raw: unknown): ShipPrepushRequest | null {
  const target = parsePrTarget(raw)
  if (!target || !isRecord(raw) || !PREPUSH.has(raw.push)) return null
  return { ...target, push: raw.push as ShipPrepushRequest['push'] }
}

/** A commit range the renderer passes on (the pre-push review's): two full commit ids, nothing a shell or git could read
 *  as an option or a revision expression. */
export function parseCommitRange(raw: unknown): CommitRange | null {
  if (!isRecord(raw) || typeof raw.from !== 'string' || typeof raw.to !== 'string') return null
  if (!FULL_SHA.test(raw.from) || !FULL_SHA.test(raw.to)) return null
  return { from: raw.from, to: raw.to }
}

export function parseShipMainRequest(raw: unknown): ShipMainRequest | null {
  const target = parsePrTarget(raw)
  if (!target || !isRecord(raw)) return null
  if (typeof raw.message !== 'string' || raw.message.length > MAX_MERGE_MESSAGE) return null
  if (typeof raw.method !== 'string' || !(MERGE_METHODS as readonly string[]).includes(raw.method)) return null
  let paths: string[] | null = null
  if (raw.paths !== null && raw.paths !== undefined) {
    if (!Array.isArray(raw.paths) || raw.paths.length > MAX_SHIP_FILES || !raw.paths.every(isRelativePath)) return null
    if (raw.paths.length > 0) paths = [...new Set(raw.paths as string[])]
  }
  const message = multiLine(raw.message)
  if (paths && !message) return null
  if (raw.push !== undefined && typeof raw.push !== 'boolean') return null
  if (raw.title !== undefined && typeof raw.title !== 'string') return null
  if (raw.head !== undefined && (typeof raw.head !== 'string' || !FULL_SHA.test(raw.head))) return null
  const title = typeof raw.title === 'string' ? oneLine(raw.title).slice(0, MAX_TITLE) : ''
  return {
    ...target,
    message,
    method: raw.method as MergeMethod,
    paths,
    ...(raw.push === true ? { push: true } : {}),
    ...(title ? { title } : {}),
    ...(typeof raw.head === 'string' ? { head: raw.head } : {})
  }
}

/** 继续 / 中止: a worktree and one of the two actions. */
export function parseShipOperationRequest(raw: unknown): ShipOperationRequest | null {
  const target = parsePrTarget(raw)
  if (!target || !isRecord(raw)) return null
  if (raw.action !== 'continue' && raw.action !== 'abort') return null
  if (raw.force !== true) return { ...target, action: raw.action }
  if (raw.confirmed === undefined) return { ...target, action: raw.action, force: true }
  const confirmed = raw.confirmed
  if (!Array.isArray(confirmed) || confirmed.length > MAX_SHIP_FILES || !confirmed.every(isRelativePath)) return null
  return { ...target, action: raw.action, force: true, confirmed: [...confirmed] }
}
