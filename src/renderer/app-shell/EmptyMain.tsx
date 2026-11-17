// Welcome page: the main area when no session is selected (PRD F18 · Figma 14). A greeting, one short line and one
// next step. The sidebar already carries navigation and projects, so nothing here repeats it; the agent install
// block appears only when neither supported agent is installed. It comes in with the mark's entrance (Figma 39G,
// mark-entrance.ts), carried on from the boot screen on a cold start (Figma 39I, boot.ts).
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type RefObject } from 'react'
import { Copy } from '../ui/icons'
import type { AgentAvailability } from '@shared/ipc'
import type { AgentKind } from '@shared/types'
import { SHORTCUTS } from '@shared/shortcuts'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../ui/i18n'
import { openProjectInteractive, openProjectPath } from '../state/session-actions'
import { useWorkspace } from '../state/workspace'
import { IconButton } from '../ui/IconButton'
import { Segmented } from '../ui/Segmented'
import { StatusGlyph } from '../ui/StatusGlyph'
import { formatAccelerator } from '../ui/menu-model'
import { claimBoot, rememberBootLayout, type BootPose } from './boot'
import { defaultAgent, greeting, INSTALLABLE_AGENTS, needsAgentInstall, pickQuote } from './empty-main'
import { entranceTracks, type EntranceStart } from './mark-entrance'
import { MARK_SEGMENTS, MARK_VIEW_BOX } from './mark-segments'
import styles from './EmptyMain.module.css'

/** Picked once per launch, so the line does not change every time the page reappears (in either language). */
const QUOTE_DRAW = Math.random()

const M = defineMessages({
  zh: {
    jumpTo: '跳转到',
    board: '看板',
    nextAttention: '下一个等你处理',
    openProjectHint: '打开项目',
    installAgent: '安装 agent',
    noAgent: '还没有装任何 agent，选一个装上：',
    chooseAgent: '选择 agent',
    copyInstall: (name: string) => `复制 ${name} 安装命令`,
    dropLine: '松开就打开这个文件夹',
    shortcuts: '快捷键',
    openProject: '打开项目…',
    dropHint: '或把文件夹拖进窗口'
  },
  en: {
    jumpTo: 'Jump to',
    board: 'Board',
    nextAttention: 'Next that needs you',
    openProjectHint: 'Open project',
    installAgent: 'Install an agent',
    noAgent: 'No agent installed yet. Pick one to install:',
    chooseAgent: 'Choose an agent',
    copyInstall: (name: string) => `Copy the ${name} install command`,
    dropLine: 'Release to open this folder',
    shortcuts: 'Shortcuts',
    openProject: 'Open project…',
    dropHint: 'or drag a folder into the window'
  }
})

const hints = (m: (typeof M)['zh']) =>
  [
    [SHORTCUTS['command-palette'], m.jumpTo],
    [SHORTCUTS['toggle-overview'], m.board],
    [SHORTCUTS['next-attention'], m.nextAttention],
    [SHORTCUTS['open-project'], m.openProjectHint]
  ] as const

function useAgentAvailability(): AgentAvailability | null {
  const [agents, setAgents] = useState<AgentAvailability | null>(null)
  useEffect(() => {
    let live = true
    window.tr.app
      .detectAgents()
      .then((result) => live && setAgents(result))
      .catch(() => live && setAgents({}))
    return () => {
      live = false
    }
  }, [])
  return agents
}

/** Read once per launch: later visits to the welcome page have it at once. */
let knownName: string | null = null

/** The user's name; null until it is known. */
function useUserName(): string | null {
  const [name, setName] = useState(knownName)
  useEffect(() => {
    if (knownName !== null) return
    let live = true
    window.tr.app
      .userName()
      .catch(() => '')
      .then((result) => {
        knownName = result
        if (live) setName(result)
      })
    return () => {
      live = false
    }
  }, [])
  return name
}

/** The greeting waits this long for the name at most, so its row does not shift once the mark has landed beside it. */
const NAME_WAIT = 300

/** The boot screen's mark, claimed once per launch (StrictMode runs the effect twice; both share the claim). */
let bootHandOff: Promise<BootPose | null> | null = null
/** Set while the claim waits; the boot screen lets go if the page goes away before it arrives. */
let bootWaiting = false
let letGo: ReturnType<typeof setTimeout> | undefined

/**
 * Plays the entrance (mark-entrance.ts) once the name is known: from the boot screen's mark on a cold start, else the
 * full weave. A page that is not on screen (behind the overview, or drawn in another window) skips it.
 */
function useEntrance(cardRef: RefObject<HTMLDivElement | null>, welcomeRef: RefObject<HTMLDivElement | null>, nameKnown: boolean): void {
  useLayoutEffect(() => {
    if (welcomeRef.current) welcomeRef.current.dataset.entrance = 'hold'
  }, [welcomeRef])
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), NAME_WAIT)
    return () => clearTimeout(timer)
  }, [])
  const go = nameKnown || waited
  useEffect(() => {
    const card = cardRef.current
    const welcome = welcomeRef.current
    const mark = welcome?.querySelector<SVGSVGElement>('[data-entrance-part="mark"]')
    const text = welcome?.querySelector<HTMLElement>('[data-entrance-part="greeting"]')
    if (!go || !card || !welcome || !mark || !text || welcome.dataset.entrance !== 'hold') return
    if (welcome.ownerDocument !== document || card.getClientRects().length === 0) {
      void claimBoot('away')
      welcome.dataset.entrance = 'done'
      return
    }
    let live = true
    const animations: Animation[] = []
    const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    const cardBox = card.getBoundingClientRect()
    const anchor = { x: cardBox.left + cardBox.width / 2, y: centre(mark.getBoundingClientRect()).y }
    rememberBootLayout({
      left: cardBox.left,
      top: cardBox.top,
      right: window.innerWidth - cardBox.right,
      bottom: window.innerHeight - cardBox.bottom,
      anchorY: anchor.y - cardBox.top
    })
    clearTimeout(letGo)
    if (!bootHandOff) {
      bootWaiting = true
      bootHandOff = claimBoot('welcome', anchor)
      // Spent once it arrives, used or not: a later visit weaves instead of starting from a stale pose.
      void bootHandOff.then(() => {
        bootWaiting = false
        bootHandOff = Promise.resolve(null)
      })
    }
    void bootHandOff.then((pose) => {
      if (!live) return
      const box = mark.getBoundingClientRect()
      const rest = Array.from(welcome.querySelectorAll<HTMLElement>('[data-entrance-rest]'))
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const start: EntranceStart = reduce ? { kind: 'reduced' } : pose ? { kind: 'boot', scale: pose.size / box.width } : { kind: 'weave' }
      const from = pose ?? anchor
      const tracks = entranceTracks(start, { dx: from.x - centre(box).x, dy: from.y - centre(box).y, size: box.width, rest: rest.length })
      for (const { target, keyframes, options } of tracks) {
        const el =
          target === 'mark' ? mark : target === 'greeting' ? text : 'segment' in target ? mark.children[target.segment] : rest[target.rest]
        if (el) animations.push(el.animate(keyframes, options))
      }
      welcome.dataset.entrance = 'play'
      void Promise.all(animations.map((a) => a.finished)).then(
        () => live && (welcome.dataset.entrance = 'done'),
        () => {}
      )
    })
    return () => {
      live = false
      // Gone before the mark arrived (a session was picked during the boot): the dots scatter. Deferred, because
      // StrictMode runs this cleanup and the effect again at once, and that run still wants the mark.
      if (bootWaiting) letGo = setTimeout(() => void claimBoot('away'))
      for (const a of animations) a.cancel()
      // Cancelled half way (StrictMode, or the page went away): the next run starts over.
      if (welcome.dataset.entrance === 'play') welcome.dataset.entrance = 'hold'
    }
  }, [go, cardRef, welcomeRef])
}

/** The folder in a drop, if the first dropped item is one. */
function droppedFolder(e: DragEvent): string | null {
  const item = Array.from(e.dataTransfer.items).find((i) => i.kind === 'file')
  const entry = item?.webkitGetAsEntry()
  const file = item?.getAsFile()
  if (!entry?.isDirectory || !file) return null
  const path = window.tr.files.pathForFile(file)
  return path.length > 0 ? path : null
}

function InstallAgent() {
  const m = useMessages(M)
  const [selected, setSelected] = useState(INSTALLABLE_AGENTS[0]!)
  return (
    <section className={styles.install} aria-label={m.installAgent} data-testid="install-agent" data-entrance-rest>
      <p className={styles.installMessage}>
        <StatusGlyph status="needs_you" />
        {m.noAgent}
      </p>
      <Segmented
        label={m.chooseAgent}
        variant="plain"
        className={styles.picker}
        value={selected.id}
        options={INSTALLABLE_AGENTS.map((agent) => ({ value: agent.id, label: agent.name }))}
        onChange={(id) => setSelected(INSTALLABLE_AGENTS.find((agent) => agent.id === id) ?? selected)}
      />
      <div className={styles.command}>
        <code>{selected.command}</code>
        <IconButton label={m.copyInstall(selected.name)} onClick={() => void navigator.clipboard.writeText(selected.command).catch(() => {})}>
          <Copy size={16} strokeWidth={1.75} />
        </IconButton>
      </div>
    </section>
  )
}

export function EmptyMain() {
  const m = useMessages(M)
  const quote = pickQuote(() => QUOTE_DRAW)
  const hasProjects = useWorkspace((s) => s.projects.length > 0)
  const agents = useAgentAvailability()
  const name = useUserName()
  const [dragging, setDragging] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const welcomeRef = useRef<HTMLDivElement>(null)
  useEntrance(cardRef, welcomeRef, name !== null)

  // New sessions start the installed agent: Claude Code, else Codex.
  const kind: AgentKind = defaultAgent(agents)

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    setDragging(false)
    const path = droppedFolder(e)
    if (path) openProjectPath(path, kind)
  }

  return (
    <div
      ref={cardRef}
      className={styles.empty}
      data-testid="empty-main"
      data-glass-card=""
      data-dragging={dragging}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div ref={welcomeRef} className={styles.welcome}>
        <h2 className={styles.greeting}>
          <svg className={styles.mark} viewBox={MARK_VIEW_BOX} aria-hidden data-entrance-part="mark">
            {MARK_SEGMENTS.map((d) => (
              <path key={d.slice(0, 16)} d={d} />
            ))}
          </svg>
          <span data-entrance-part="greeting">{greeting(new Date().getHours(), name ?? '')}</span>
        </h2>
        <p className={styles.quote} data-entrance-rest>
          {dragging ? (
            <span className={styles.dropLine}>{m.dropLine}</span>
          ) : (
            <>
              {quote.text}
              {quote.by && <span className={styles.by}>— {quote.by}</span>}
            </>
          )}
        </p>

        {hasProjects ? (
          <ul className={styles.hints} aria-label={m.shortcuts} data-entrance-rest>
            {hints(m).map(([accelerator, label]) => (
              <li key={label}>
                <kbd className={styles.key}>{formatAccelerator(accelerator)}</kbd>
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.next} data-entrance-rest>
            <button type="button" className={styles.open} onClick={() => void openProjectInteractive(kind)}>
              {m.openProject}
              <kbd className={styles.kbd}>{formatAccelerator(SHORTCUTS['open-project'])}</kbd>
            </button>
            <span className={styles.dropHint}>{m.dropHint}</span>
          </div>
        )}

        {needsAgentInstall(agents) && <InstallAgent />}
      </div>
    </div>
  )
}
