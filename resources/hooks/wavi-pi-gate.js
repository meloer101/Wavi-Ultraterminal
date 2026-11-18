// Wavi's permission gate for a Pi terminal session (`pi -e <this file>`, never installed into ~/.pi; PRD F24 v1.205).
// A 定时任务's 权限 reaches it as `WAVI_PI_PERMISSION` (src/shared/agent-launch.ts CLI_PERMISSIONS). Pi has no approval
// dialogs of its own, so under 询问 every call that is not read-only, and under 接受编辑 every one that is not a file
// change either, asks in Pi's own TUI (`ctx.ui.confirm`). Unset or anything else: Pi's own default, nothing asked.
// Loaded on its own, not inside wavi-pi.js, so it holds even when Wavi's hook server is down and that one is not loaded
// (src/main/pty/index.ts). Wavi hears the wait through wavi-pi.js's `ui_prompt_start`. Event shapes:
// @earendil-works/pi-coding-agent core/extensions/types (1.5.2).
/* global process */

/** Pi's read-only tools and the ones that change files (as wavi-pi-gui.js and src/main/gui/pi-rpc.ts list them). */
const READ_ONLY = new Set(['read', 'grep', 'find', 'ls'])
const FILE_CHANGES = new Set(['edit', 'write'])

/** What a call needs before it runs: nothing (undefined), or a block when there is no one to ask or it was declined. */
export async function decide(level, event, ctx) {
  if (level !== 'ask' && level !== 'accept-edits') return undefined
  if (READ_ONLY.has(event.toolName) || (level === 'accept-edits' && FILE_CHANGES.has(event.toolName))) return undefined
  if (!ctx.hasUI) return { block: true, reason: `${event.toolName} needs approval and there is no one to ask.` }
  const input = event.input && typeof event.input === 'object' ? event.input : {}
  const detail = event.toolName === 'bash' && typeof input.command === 'string' ? input.command : JSON.stringify(input).slice(0, 2000)
  const approved = await ctx.ui.confirm(`Allow ${event.toolName}?`, detail)
  return approved ? undefined : { block: true, reason: `${event.toolName} was declined.` }
}

export default function waviGate(pi) {
  const level = process.env.WAVI_PI_PERMISSION
  if (level !== 'ask' && level !== 'accept-edits') return
  pi.on('tool_call', (event, ctx) => decide(level, event, ctx))
}
