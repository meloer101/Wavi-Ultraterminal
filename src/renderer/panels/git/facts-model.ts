// The checks fact above Git · 变更's ship zone (PRD F13 v1.78, Figma 29A / 29J): its words and which mark it takes.
// A ✓ only when every check that ran passed; nothing ran (every kind 未跑) is a —, never a tick.
import { checksText, type TurnCheckView } from '@shared/turn-checks'
import { defineMessages, pick } from '@shared/i18n'

const M = defineMessages({
  zh: {
    notRun: (current: boolean) => `${current ? '这一轮' : '上一轮'}没跑检查`,
    ran: (current: boolean, checks: string) => `${current ? '这一轮' : '上一轮'}跑过：${checks}`
  },
  en: {
    notRun: (current: boolean) => `No checks ran ${current ? 'this turn' : 'last turn'}`,
    ran: (current: boolean, checks: string) => `${current ? 'This turn' : 'Last turn'} ran: ${checks}`
  }
})

export type ChecksRowTone = 'ok' | 'fail' | 'none'

/** `这一轮跑过：测试 ✓ · lint ✓ · 类型 未跑`; `这一轮没跑检查` when nothing ran; 上一轮 when this turn has not edited or checked yet. */
export function checksRow(view: TurnCheckView): { tone: ChecksRowTone; text: string } {
  const current = view.turn === 'current'
  const ran = view.kinds.filter((k) => k.status !== 'not-run')
  if (ran.length === 0) return { tone: 'none', text: pick(M).notRun(current) }
  const text = pick(M).ran(current, checksText(view))
  if (ran.some((k) => k.status === 'fail')) return { tone: 'fail', text }
  return { tone: ran.every((k) => k.status === 'pass') ? 'ok' : 'none', text }
}
