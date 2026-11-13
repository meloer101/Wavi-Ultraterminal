// 新建会话 (PRD F4, Figma 15 Section 170:7853): one row per choice, each with a default, so ⌘↵ alone starts a session.
// 项目 · 工作目录 (新 worktree / 当前目录, remembered per project) · 基于 · 智能体 · 高级 (分支名 · 文件夹 · 准备).
// No task description: the user types the first message in the terminal — except when 看板 · GitHub hands an issue or
// PR over (Figma 77E): then the project is fixed, a 任务 row holds the first message (editable), the branch is named
// after the item and 创建并发送 sends it. Text appears only when something is limited or wrong (15E, 15F). Glass
// material from PRD §5; solid under "reduce transparency".
// 智能体 (Figma 24A, PRD F4 v1.68): a pop-up menu — 已安装 (Claude Code and Codex always, the other CLIs when found, each
// with its version) and 其他 (终端); remembered per project; the hint says how many are not installed. Several agents
// on one task start from a session instead (同任务多解, attempts/SameTaskSheet).
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, CircleAlert, GitBranch, GitFork, Globe } from 'lucide-react'
import {
  defaultBase,
  generateBranchName,
  groupBranches,
  initialUi,
  initialWorkdir,
  type NewSessionInfo,
  type Workdir
} from '@shared/new-session'
import { AGENT_SPECS, agentName, CLI_AGENTS } from '@shared/agents'
import { promptOnCommandLine } from '@shared/agent-launch'
import { itemBranch } from '@shared/github-board'
import type { SessionId } from '@shared/types'
import type { AgentAvailability, AgentVersions } from '@shared/ipc'
import type { AgentKind, ProjectId, SessionUi } from '@shared/types'
import { Toggle } from '../settings/controls'
import { Segmented } from '../ui/Segmented'
import { useWorkspace } from '../state/workspace'
import { setLaunch } from '../dispatch/store'
import { submitPrompt, whenAgentReady } from '../session-io'
import { runCreatePlan } from './creation'
import { binaryInstalled, branchProblemText, folderFor, isElsewhere, listedAgents, planCreate, prepareText, selectedBase, tilde, uiRow } from './model'
import { closeNewSessionSheet, useNewSessionSheet, type SheetTask } from './sheet-store'
import { SheetMenu, type SheetMenuSection } from './SheetMenu'
import styles from './NewSessionSheet.module.css'

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

const isKindChoice = (value: string): value is AgentKind => value === 'shell' || (CLI_AGENTS as readonly string[]).includes(value)

const UIS: ReadonlyArray<{ value: SessionUi; label: string }> = [
  { value: 'gui', label: 'GUI' },
  { value: 'cli', label: 'CLI' }
]

const WORKDIRS: ReadonlyArray<{ value: Workdir; label: string }> = [
  { value: 'worktree', label: '新 worktree' },
  { value: 'current', label: '当前目录' }
]

/** A project's git state as main read it; 'error' when it could not be read at all. */
type LoadedInfo = NewSessionInfo | 'error'

export function NewSessionSheet() {
  const open = useNewSessionSheet((s) => s.open)
  const generation = useNewSessionSheet((s) => s.generation)
  return open ? <Sheet key={generation} /> : null
}

function Sheet() {
  const projects = useWorkspace((s) => s.projects)
  // Read once: a sheet opened from 看板 · GitHub keeps its item while it is open.
  const [task] = useState<SheetTask | null>(() => useNewSessionSheet.getState().task)
  const [taskText, setTaskText] = useState(() => task?.prompt ?? '')
  const remembered = useWorkspace((s) => s.newSessionWorkdir)
  const [projectId, setProjectId] = useState<ProjectId | null>(() => useNewSessionSheet.getState().projectId ?? projects[0]?.id ?? null)
  const project = projects.find((p) => p.id === projectId) ?? null

  const [infos, setInfos] = useState<Record<ProjectId, LoadedInfo>>({})
  const loaded = projectId ? infos[projectId] : undefined
  const info = loaded && loaded !== 'error' ? loaded : null
  const notRepo = loaded === 'error' || info?.repo === false

  const [workdirChoice, setWorkdirChoice] = useState<Workdir | null>(null)
  const [baseChoice, setBaseChoice] = useState<string | null>(null)
  const [branchInput, setBranchInput] = useState<string | null>(null)
  const rememberedAgents = useWorkspace((s) => s.newSessionAgent)
  const [kindChoice, setKindChoice] = useState<AgentKind | null>(null)
  const kind: AgentKind = kindChoice ?? (projectId ? rememberedAgents[projectId] : undefined) ?? 'claude'
  const setKind = setKindChoice
  const rememberedUis = useWorkspace((s) => s.newSessionUi)
  const [uiChoice, setUiChoice] = useState<SessionUi | null>(null)
  const [copiedInstall, setCopiedInstall] = useState(false)
  const [found, setFound] = useState<AgentAvailability | null>(null)
  const [versions, setVersions] = useState<AgentVersions>({})
  const [prepareChoice, setPrepareChoice] = useState(true)
  const [advanced, setAdvanced] = useState(false)
  const [menu, setMenu] = useState<{ kind: 'project' | 'base' | 'agent'; anchor: HTMLElement } | null>(null)

  const sheetRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!project || infos[project.id]) return
    let cancelled = false
    window.tr.gitWorktrees
      .newSessionInfo(project.rootPath)
      .then((next) => !cancelled && setInfos((all) => ({ ...all, [project.id]: next })))
      .catch(() => !cancelled && setInfos((all) => ({ ...all, [project.id]: 'error' })))
    return () => {
      cancelled = true
    }
  }, [project, infos])

  useEffect(() => sheetRef.current?.focus(), [])

  useEffect(() => {
    let cancelled = false
    void window.tr.app
      .detectAgents()
      .then((next) => !cancelled && setFound(next))
      .catch(() => {})
    void window.tr.app
      .agentVersions()
      .then((next) => !cancelled && setVersions(next))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // A generated name per project, made once its branches are known (and kept while the sheet is open).
  // A PR whose branch is already here: checked out in a worktree, the session opens there; otherwise the new branch gets
  // the item's name and still starts at, and tracks, the PR head (WorktreeCreateRequest.startAt).
  const localPrBranch = task?.branch && info ? (info.branches.find((b) => !b.remote && b.name === task.branch) ?? null) : null
  const generated = useMemo(() => {
    if (!info?.repo) return ''
    const taken = new Set(info.branches.filter((b) => !b.remote).map((b) => b.name))
    if (task) return task.branch && !taken.has(task.branch) ? task.branch : itemBranch(info.prefix, task.branchFrom.kind, task.branchFrom.number, task.branchFrom.title, taken)
    return generateBranchName(info.prefix, taken)
  }, [info, task])

  const workdir: Workdir = notRepo ? 'current' : (workdirChoice ?? (task ? 'worktree' : initialWorkdir(remembered, projectId ?? '', true)))
  const base = baseChoice ?? (isElsewhere(localPrBranch) ? localPrBranch.name : task?.base) ?? (info ? defaultBase(info) : null)
  const branch = branchInput ?? generated
  const prepare = prepareChoice && ((info?.includeCount ?? 0) > 0 || info?.hasSetup === true)
  const form = { workdir, base, branch, prepare }
  const result = project ? planCreate(project.rootPath, info, form) : null
  const baseBranch = info ? selectedBase(info, form) : null
  const elsewhere = workdir === 'worktree' && isElsewhere(baseBranch) ? baseBranch : null
  const problem = result?.problem ?? null
  const branchProblem = problem === 'exists' || problem === 'invalid' || problem === 'empty' ? problem : null
  const showAdvanced = !!info?.repo && workdir === 'worktree' && !elsewhere
  const canCreate = !!result?.plan
  const advancedOpen = advanced || branchProblem !== null
  const ui = uiRow(kind, uiChoice ?? initialUi(rememberedUis, projectId ?? ''), binaryInstalled(found))

  const chooseProject = (id: ProjectId): void => {
    setProjectId(id)
    setWorkdirChoice(null)
    setBaseChoice(null)
    setBranchInput(null)
    setPrepareChoice(true)
    setKindChoice(null)
    setUiChoice(null)
  }

  const sends = task !== null && kind !== 'shell' && taskText.trim() !== ''

  const create = (): void => {
    if (!project || !result?.plan) return
    closeNewSessionSheet(false)
    // A PR's worktree starts at the PR head main fetched; the chosen base stays what it merges into.
    const plan = task?.startAt && result.plan.type === 'worktree' ? { ...result.plan, request: { ...result.plan.request, startAt: task.startAt } } : result.plan
    // A choice made before the git state arrived still counts; only a folder known not to be a repo is not remembered.
    const id = runCreatePlan(project.id, plan, kind, workdir, !notRepo, ui?.value ?? 'cli', ui?.forced ?? false)
    if (id && task) handTask(id, task, kind, ui?.value ?? 'cli', sends ? taskText : null)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    // The menus handle (and stop) their own Esc / Enter first; an input method composing (分支名) owns them too.
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeNewSessionSheet(true)
    } else if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault()
      create()
    }
  }

  const onScrimMouseDown = (event: MouseEvent): void => {
    if (event.target === event.currentTarget) closeNewSessionSheet(true)
  }

  const closeMenu = useCallback((refocus: boolean) => {
    setMenu((open) => {
      if (refocus) open?.anchor.focus()
      return null
    })
  }, [])

  const toggleMenu = (kind: 'project' | 'base' | 'agent', anchor: HTMLElement): void => setMenu(menu?.kind === kind ? null : { kind, anchor })

  const agentSections = useCallback(
    (query: string): SheetMenuSection[] => {
      const q = query.trim().toLowerCase()
      const matches = (label: string): boolean => q === '' || label.toLowerCase().includes(q)
      const check = (value: AgentKind) => (value === kind ? <Check {...ICON} /> : null)
      const installed = listedAgents(found)
        .filter((id) => matches(agentName(id)) || (id !== 'shell' && matches(AGENT_SPECS[id].binary)))
        .map((id) => ({
          value: id,
          label: agentName(id),
          icon: check(id),
          meta: id !== 'shell' && found && found[id] === false ? '没装' : (id !== 'shell' ? (versions[id] ?? undefined) : undefined)
        }))
      const others = [{ value: 'shell', label: '终端', icon: check('shell') }].filter((item) => matches(item.label))
      return [
        { title: '已安装', items: installed },
        { title: '其他', items: others }
      ]
    },
    [found, versions, kind]
  )
  const missingAgents = found ? CLI_AGENTS.filter((id) => !found[id]).length : 0

  const projectSections = useCallback(
    (): SheetMenuSection[] => [
      { items: projects.map((p) => ({ value: p.id, label: p.name, icon: p.id === projectId ? <Check {...ICON} /> : null })) }
    ],
    [projects, projectId]
  )

  const branchSections = useCallback(
    (query: string): SheetMenuSection[] => {
      if (!info) return []
      const groups = groupBranches(info.branches, info.defaultBranch, query)
      const icon = (name: string, remote: boolean, other: boolean) =>
        name === base ? <Check {...ICON} /> : remote ? <Globe {...ICON} /> : other ? <GitFork {...ICON} /> : <GitBranch {...ICON} />
      return [
        {
          title: '本地分支',
          items: groups.local.map((b) => ({
            value: b.name,
            label: b.name,
            icon: icon(b.name, false, isElsewhere(b)),
            meta: isElsewhere(b) ? '已在 worktree 里' : b.name === info.defaultBranch ? '项目默认' : undefined
          }))
        },
        { title: '远程分支', items: groups.remote.map((b) => ({ value: b.name, label: b.name, icon: icon(b.name, true, false) })) }
      ]
    },
    [info, base]
  )

  const hasElsewhere = info?.branches.some(isElsewhere) ?? false
  const home = window.tr.homeDir
  const prepText = info ? prepareText(info) : null
  const folderPath = info ? `${info.worktreesDir}/${folderFor(info, branch)}` : ''

  return (
    <div className={styles.scrim} onMouseDown={onScrimMouseDown} data-region="new-session">
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-testid="new-session-sheet"
      >
        <header className={styles.context}>
          <h2 id={titleId} className={styles.title}>
            新建会话
          </h2>
          {task && <span className={styles.subtitle}>{task.title}</span>}
        </header>

        <div className={styles.fields}>
          <Field label="项目">
            <SelectButton
              label="项目"
              value={project?.name ?? '—'}
              disabled={task !== null}
              expanded={menu?.kind === 'project'}
              onClick={(anchor) => toggleMenu('project', anchor)}
            />
          </Field>

          <Field label="工作目录" note={notRepo ? notRepoText(loaded) : null}>
            <Segmented
              label="工作目录"
              value={workdir}
              options={WORKDIRS.map((o) => ({ ...o, disabled: o.value === 'worktree' && notRepo }))}
              onChange={setWorkdirChoice}
            />
          </Field>

          {!notRepo && (
            <Field
              label="基于"
              disabled={workdir === 'current'}
              note={elsewhere ? `已在 worktree 里：会在 ${tilde(elsewhere.worktreePath, home)} 里再开一个会话` : null}
            >
              <SelectButton
                label="基于"
                value={workdir === 'current' ? `${info?.currentBranch ?? 'HEAD'}（当前分支）` : (base ?? (info ? '没有分支' : '…'))}
                disabled={workdir === 'current' || !info}
                expanded={menu?.kind === 'base'}
                onClick={(anchor) => toggleMenu('base', anchor)}
              />
            </Field>
          )}

          <Field label="智能体">
            <SelectButton label="智能体" value={agentName(kind)} expanded={menu?.kind === 'agent'} onClick={(anchor) => toggleMenu('agent', anchor)} />
          </Field>

          {ui && (
            <Field label="界面">
              <Segmented
                label="界面"
                value={ui.value}
                options={UIS.map((o) => (o.value === 'gui' ? { ...o, disabled: ui.guiDisabled, title: ui.guiTitle } : o))}
                onChange={setUiChoice}
              />
            </Field>
          )}

          {ui?.adapter && (
            <div className={styles.adapter} role="group" aria-label="GUI 适配器">
              <span className={styles.labelSpacer} />
              <span className={styles.adapterText}>GUI 要先装 {ui.adapter.binary}</span>
              <button
                type="button"
                className={styles.adapterCopy}
                onClick={() => {
                  const command = ui.adapter?.install ?? ''
                  void navigator.clipboard
                    .writeText(command)
                    .then(() => setCopiedInstall(true))
                    .catch(() => {})
                }}
              >
                {copiedInstall ? '已复制' : '复制安装命令'}
              </button>
            </div>
          )}

          {task && (
            <Field label="任务">
              <textarea
                className={styles.task}
                aria-label="任务"
                value={taskText}
                spellCheck={false}
                rows={9}
                onChange={(event) => setTaskText(event.currentTarget.value)}
              />
            </Field>
          )}

          {showAdvanced && (
            <button
              type="button"
              className={styles.advanced}
              aria-expanded={advancedOpen}
              onClick={() => setAdvanced(!advancedOpen)}
              disabled={branchProblem !== null}
            >
              <span className={styles.label}>高级</span>
              {!advancedOpen && <span className={styles.advancedBranch}>{branch}</span>}
              <span className={styles.spacer} />
              {advancedOpen ? <ChevronDown {...ICON} /> : <ChevronRight {...ICON} />}
            </button>
          )}

          {showAdvanced && advancedOpen && (
            <>
              <Field
                label="分支名"
                error={branchProblemText(branchProblem, branch)}
              >
                <input
                  className={styles.input}
                  data-invalid={branchProblem !== null}
                  aria-invalid={branchProblem !== null}
                  aria-label="分支名"
                  value={branch}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => setBranchInput(event.currentTarget.value)}
                />
              </Field>
              <Field label="文件夹">
                <span className={styles.path} title={folderPath}>
                  {tilde(folderPath, home)}
                </span>
              </Field>
              <Field label="准备">
                <div className={styles.prep}>
                  <span className={styles.prepText}>{prepText ?? '没有 .worktreeinclude 要复制的文件，也没有 setup 脚本'}</span>
                  {prepText && <Toggle checked={prepare} onChange={setPrepareChoice} label="准备：复制被忽略的文件、运行 setup 脚本" />}
                </div>
              </Field>
            </>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.cancel} onClick={() => closeNewSessionSheet(true)}>
            取消
          </button>
          <button type="button" className={styles.primary} disabled={!canCreate} onClick={create}>
            {sends ? '创建并发送' : '创建'}
            <span className={styles.shortcut}>⌘↵</span>
          </button>
        </footer>
      </div>

      {menu?.kind === 'project' && (
        <SheetMenu
          anchor={menu.anchor}
          label="项目"
          sections={projectSections}
          selected={projectId}
          empty="没有项目"
          onPick={(id) => {
            chooseProject(id)
            closeMenu(true)
          }}
          onClose={closeMenu}
        />
      )}
      {menu?.kind === 'agent' && (
        <SheetMenu
          anchor={menu.anchor}
          label="智能体"
          sections={agentSections}
          selected={kind}
          search="搜索智能体"
          empty="没有匹配的智能体"
          align="selected"
          hint={missingAgents > 0 ? `还有 ${missingAgents} 家没装：在设置 · 智能体里看怎么装 · 按项目记住上次的选择` : '按项目记住上次的选择'}
          onPick={(value) => {
            if (!isKindChoice(value)) return
            setKind(value)
            setCopiedInstall(false)
            closeMenu(true)
          }}
          onClose={closeMenu}
        />
      )}
      {menu?.kind === 'base' && (
        <SheetMenu
          anchor={menu.anchor}
          label="基于"
          sections={branchSections}
          selected={base}
          search="搜索分支"
          hint={hasElsewhere ? '已在 worktree 里的分支：会改为在那个 worktree 里再开一个会话' : null}
          onPick={(name) => {
            setBaseChoice(name)
            closeMenu(true)
          }}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

/**
 * The new session takes the item's title and link, and its first message: on the CLI's command line or the GUI's
 * launch where the agent has one, else typed in once the agent is ready (as 一题多解 does).
 */
function handTask(id: SessionId, task: SheetTask, kind: AgentKind, ui: SessionUi, text: string | null): void {
  useWorkspace.getState().patchSession(id, { title: task.title, titleSource: 'prompt', github: task.link })
  if (text === null || kind === 'shell') return
  if (ui === 'gui' || promptOnCommandLine(kind)) {
    setLaunch(id, { initialPrompt: text })
    return
  }
  void whenAgentReady(id)
    .then(() => submitPrompt(id, text))
    .catch((error: unknown) => console.error('[new-session] the task did not reach the agent:', error))
}

function notRepoText(loaded: LoadedInfo | undefined): string {
  return loaded === 'error' ? '读不出这个文件夹的 git 状态，只能在当前目录里开' : '这个文件夹不是 git 仓库，只能在当前目录里开'
}

export function Field({
  label,
  children,
  note,
  error,
  disabled = false
}: {
  label: string
  children: ReactNode
  note?: string | null
  error?: string | null
  disabled?: boolean
}) {
  return (
    <div className={styles.field} role="group" aria-label={label} data-disabled={disabled}>
      <span className={styles.labelBox}>
        <span className={styles.label}>{label}</span>
      </span>
      <div className={styles.control}>
        {children}
        {error && (
          <p className={styles.error} role="alert">
            <CircleAlert size={14} strokeWidth={1.75} aria-hidden />
            {error}
          </p>
        )}
        {note && <p className={styles.note}>{note}</p>}
      </div>
    </div>
  )
}

export function SelectButton({
  label,
  value,
  expanded,
  disabled = false,
  onClick
}: {
  label: string
  value: string
  expanded: boolean
  disabled?: boolean
  onClick: (anchor: HTMLElement) => void
}) {
  return (
    <button
      type="button"
      className={styles.select}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={expanded}
      disabled={disabled}
      onClick={(event) => onClick(event.currentTarget)}
      onKeyDown={(event) => {
        if (!expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault()
          onClick(event.currentTarget)
        }
      }}
    >
      <span className={styles.selectValue}>{value}</span>
      <ChevronDown {...ICON} />
    </button>
  )
}
