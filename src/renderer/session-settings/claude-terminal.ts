// Claude in a terminal: model, effort and permission changed for this session only by typing into its TUI (PRD F22
// v1.144, §6.16). Every step reads the screen before the next key; anything unexpected backs out with Esc. Only while
// the agent is idle at its input line: mid-turn its pickers swallow keys and a second question could take them.
import { maySendNow } from '@shared/dispatch'
import { defineMessages, pick } from '@shared/i18n'
import { remoteFail, type RemoteResult } from '@shared/remote'
import { SLASH_KEY_GAP_MS, SUBMIT_KEY, sendRefusal } from '@shared/send-protocol'
import type { SettingKind } from '@shared/session-settings'
import {
  claudePermissionOnScreen,
  CLAUDE_EFFORTS,
  CLAUDE_MODELS,
  CLAUDE_PERMISSIONS,
  effortOnPicker,
  effortPickerMoves,
  isSwitchModelPrompt,
  KEY,
  modelPickerMoves,
  modelPickerRows
} from '@shared/terminal-settings'
import type { Session } from '@shared/types'
import { exclusively } from '../session-io'
import { useSessionMeta } from '../session-meta/store'
import { getSendIo, readViewport } from '../terminal/registry'
import { typingIn } from '../terminal/typing'

const M = defineMessages({
  zh: {
    afterTurn: '这一轮结束后可以改',
    notReady: 'agent 还没准备好',
    unsentText: '终端里有没发出的文字',
    typingOnMac: 'Mac 上正在输入',
    noModel: '没有这个模型',
    modelPickerClosed: '模型选择没有打开',
    modelNotListed: 'Claude 没有列出这个模型',
    modelNotSelected: '没有选中这个模型',
    modelNotChanged: '模型没有换成',
    noEffort: '没有这个思考程度',
    effortPickerClosed: '思考程度没有打开',
    effortUnread: '没有读到现在的思考程度',
    effortNotChanged: '思考程度没有换成',
    noPermission: '没有这个权限',
    permissionUnread: '没有读到现在的权限',
    permissionMissing: 'Claude 的权限里没有这一项'
  },
  en: {
    afterTurn: 'Can change after this turn',
    notReady: 'The agent isn’t ready yet',
    unsentText: 'There’s unsent text in the terminal',
    typingOnMac: 'Someone is typing on the Mac',
    noModel: 'No such model',
    modelPickerClosed: 'The model picker didn’t open',
    modelNotListed: 'Claude doesn’t list this model',
    modelNotSelected: 'Couldn’t select this model',
    modelNotChanged: 'The model didn’t change',
    noEffort: 'No such effort',
    effortPickerClosed: 'The effort picker didn’t open',
    effortUnread: 'Couldn’t read the current effort',
    effortNotChanged: 'The effort didn’t change',
    noPermission: 'No such permission',
    permissionUnread: 'Couldn’t read the current permission',
    permissionMissing: 'Claude’s permissions don’t include this one'
  }
})

/** What Claude prints once a pick is kept to the session (2.1.319: "… for this session only", "(this session only)"). */
const SESSION_ONLY = /this session only/

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Polls the visible screen until `test` holds; null after `ms`. */
async function screenWhere(sessionId: string, test: (screen: string) => boolean, ms = 2500): Promise<string | null> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) {
    const screen = readViewport(sessionId)
    if (test(screen)) return screen
  }
  return null
}

/** Why the terminal cannot take keys now, or null. */
export function claudeBusy(session: Session): string | null {
  if (session.status === 'running' || session.status === 'needs_you') return pick(M).afterTurn
  if (session.phase !== 'ready') return pick(M).notReady
  if (typingIn(session.id).draft) return pick(M).unsentText
  // Someone is typing at the Mac: a key of theirs inside a picker could save a default.
  if (!maySendNow({ status: session.status, ...typingIn(session.id), now: Date.now() })) return pick(M).typingOnMac
  return sendRefusal(session.kind, readViewport(session.id))
}

/** On the session's own queue: no prompt, report or other change can type into the picker meanwhile. */
export function setClaudeInTerminal(session: Session, kind: SettingKind, value: string): Promise<RemoteResult> {
  return exclusively(session.id, () => change(session, kind, value))
}

async function change(session: Session, kind: SettingKind, value: string): Promise<RemoteResult> {
  const busy = claudeBusy(session)
  if (busy) return remoteFail(busy)
  const io = getSendIo(session.id)
  const backOut = (why: string) => {
    io.write(KEY.esc)
    return remoteFail(why)
  }
  const remember = (settings: { model?: string; effort?: string; permission?: string }) => useSessionMeta.getState().setSettings(session.id, settings)

  if (kind === 'model') {
    if (!(CLAUDE_MODELS as readonly string[]).includes(value)) return remoteFail(pick(M).noModel)
    io.write(KEY.modelPicker)
    const picker = await screenWhere(session.id, (s) => modelPickerRows(s) !== null)
    if (!picker) return backOut(pick(M).modelPickerClosed)
    const moves = modelPickerMoves(picker, value)
    if (moves === null) return backOut(pick(M).modelNotListed)
    io.write(moves)
    // The cursor must be on the model before `s`: `s` keeps the pick to this session; Enter or a number would save it
    // as the default.
    const onTarget = await screenWhere(session.id, (s) => {
      const rows = modelPickerRows(s)
      return rows !== null && rows.names[rows.cursor] === value
    })
    if (!onTarget) return backOut(pick(M).modelNotSelected)
    io.write(KEY.sessionOnly)
    const after = await screenWhere(session.id, (s) => isSwitchModelPrompt(s) || SESSION_ONLY.test(s))
    if (after && isSwitchModelPrompt(after)) io.write('1')
    if (!(await screenWhere(session.id, (s) => SESSION_ONLY.test(s) && !isSwitchModelPrompt(s)))) return backOut(pick(M).modelNotChanged)
    remember({ model: value })
    return { ok: true }
  }

  if (kind === 'effort') {
    if (!(CLAUDE_EFFORTS as readonly string[]).includes(value)) return remoteFail(pick(M).noEffort)
    io.write('/')
    await sleep(SLASH_KEY_GAP_MS)
    io.write('effort')
    await sleep(SLASH_KEY_GAP_MS)
    io.write(SUBMIT_KEY)
    const picker = await screenWhere(session.id, (s) => effortOnPicker(s) !== null)
    if (!picker) return backOut(pick(M).effortPickerClosed)
    const moves = effortPickerMoves(picker, value)
    if (moves === null) return backOut(pick(M).effortUnread)
    io.write(moves)
    await sleep(200)
    if (effortOnPicker(readViewport(session.id)) !== value) return backOut(pick(M).effortNotChanged)
    io.write(KEY.sessionOnly)
    if (!(await screenWhere(session.id, (s) => effortOnPicker(s) === null && SESSION_ONLY.test(s)))) return backOut(pick(M).effortNotChanged)
    remember({ effort: value })
    return { ok: true }
  }

  // Permission: shift+tab steps through the cycle; the footer says where it is after each step.
  if (!(CLAUDE_PERMISSIONS as readonly string[]).includes(value)) return remoteFail(pick(M).noPermission)
  for (let step = 0; step <= CLAUDE_PERMISSIONS.length; step++) {
    const now = claudePermissionOnScreen(readViewport(session.id))
    if (now === null) return remoteFail(pick(M).permissionUnread)
    if (now === value) {
      remember({ permission: value })
      return { ok: true }
    }
    io.write(KEY.shiftTab)
    // No change on screen: stop pressing, say where it is.
    if (!(await screenWhere(session.id, (s) => claudePermissionOnScreen(s) !== now, 1500))) break
  }
  const now = claudePermissionOnScreen(readViewport(session.id))
  if (now) remember({ permission: now })
  return remoteFail(pick(M).permissionMissing)
}
