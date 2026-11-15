// 合并后自动归档, wired (auto-archive-model.ts has the rules): the PR poll, 推送 of the base and its CI, the worktree's
// sessions and Ship runs drive it; the chain is read fresh before anything is archived, and archiving is the existing
// 归档 (archive/actions.ts) as the phone runs it — an archive script still waiting for its approval stops it. Once per
// window.
import { archiveTargetFor, archiveWorktree } from '../archive/actions'
import { gitOf } from '../panels/git/store'
import { useWorkspace } from '../state/workspace'
import { createAutoArchiver, type AutoArchiveView } from './auto-archive-model'
import { baseWantsFix } from './auto-fix'
import { useBaseCi } from './base-ci'
import { chainPlace, chainPlanOf } from './chain-actions'
import { loadPreflight } from './chain-store'
import { useShips } from './ship-runner'
import { setPrNotice, usePullRequests } from './store'

let started = false

export function startAutoArchive(): () => void {
  if (started) return () => {}
  started = true
  let on: boolean | null = null

  const record = (worktree: string) => useWorkspace.getState().worktrees.find((w) => w.path === worktree && !w.archived)

  const view = (worktree: string): AutoArchiveView => {
    const state = useWorkspace.getState()
    const w = record(worktree)
    const ids = new Set(state.worktrees.filter((x) => x.path === worktree && !x.archived).map((x) => x.id))
    const base = useBaseCi.getState()
    return {
      on,
      present: w !== undefined,
      isMain: w?.isMain === true,
      sessions: state.sessions.filter((s) => ids.has(s.worktreeId)),
      shipping: useShips.getState().byWorktree[worktree] !== undefined,
      ci: base.byWorktree[worktree] ?? null,
      fixing: Boolean(base.automation[worktree]?.run) || baseWantsFix(worktree)
    }
  }

  const archiver = createAutoArchiver({
    view,
    readChain: async (worktree) => {
      const place = chainPlace(worktree)
      if (!place) return null
      const [changes, preflight] = await Promise.all([
        window.tr.git.changes(worktree, place.worktree.baseBranch ?? undefined).catch(() => null),
        loadPreflight({ root: place.project.rootPath, worktree })
      ])
      if (!changes) return null
      const pr = usePullRequests.getState()
      const prStatus = pr.gh === 'ready' ? (pr.byWorktree[worktree] ?? null) : null
      return chainPlanOf(place, { preflight, changes, prStatus, unticked: gitOf(worktree).unticked }).chain
    },
    archive: async (worktree) => {
      const w = record(worktree)
      const target = w ? archiveTargetFor(w.id) : null
      if (!target) return { ok: false, message: '找不到这个 worktree' }
      // Nobody may be at the Mac: an archive script not yet approved stops here, as on the phone; a failing one does not.
      const outcome = await archiveWorktree(target, { unattended: true, ignoreScriptFailure: true })
      return outcome.ok ? { ok: true } : { ok: false, message: outcome.message }
    },
    say: (worktree, text) => setPrNotice(worktree, { tone: 'error', text }),
    now: () => Date.now(),
    later: (run, ms) => {
      const timer = setTimeout(run, ms)
      return () => clearTimeout(timer)
    }
  })

  const offSettings = window.tr.settings.onChange((next) => {
    on = next.archive.afterMerge
    archiver.evaluateAll()
  })
  void window.tr.settings.get().then((initial) => {
    on = initial.archive.afterMerge
    archiver.evaluateAll()
  })

  for (const [worktree, status] of Object.entries(usePullRequests.getState().byWorktree)) archiver.pr(worktree, status.pr)
  const offPr = usePullRequests.subscribe((s, prev) => {
    if (s.byWorktree === prev.byWorktree) return
    for (const [worktree, status] of Object.entries(s.byWorktree)) {
      if (status !== prev.byWorktree[worktree]) archiver.pr(worktree, status.pr)
    }
  })
  const offBase = useBaseCi.subscribe((s, prev) => {
    for (const [worktree, push] of Object.entries(s.pushes)) {
      if (push !== prev.pushes[worktree]) archiver.basePush(worktree, push)
    }
    if (s.byWorktree !== prev.byWorktree || s.automation !== prev.automation) archiver.evaluateAll()
  })
  const offWorkspace = useWorkspace.subscribe((s, prev) => {
    if (s.sessions !== prev.sessions || s.worktrees !== prev.worktrees) archiver.evaluateAll()
  })
  const offShips = useShips.subscribe((s, prev) => {
    if (s.byWorktree !== prev.byWorktree) archiver.evaluateAll()
  })
  return () => {
    started = false
    archiver.stop()
    offSettings()
    offPr()
    offBase()
    offWorkspace()
    offShips()
  }
}
