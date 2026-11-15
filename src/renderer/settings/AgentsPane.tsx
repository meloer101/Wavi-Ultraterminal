// Settings · 智能体 (Figma 25B; agent marks and the copy button's edge from 35A, PRD v1.92; PRD F4 v1.68): the agent CLIs 新建会话 can start. 已安装 lists each with its version and
// whether Wavi knows its state exactly (准确: per-launch hooks or the terminal's program-status protocol) or only
// estimates it from the title (估计); 没装 offers the vendor's install command to copy — Wavi never installs anything.
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { AGENT_SPECS, CLI_AGENTS, type CliAgent } from '@shared/agents'
import type { AgentAvailability, AgentVersions } from '@shared/ipc'
import { defineMessages } from '@shared/i18n'
import { AgentIcon } from '../ui/AgentIcon'
import { useMessages } from '../i18n'
import { agentStatusNote, statusAccuracy } from './agents-model'
import { Section } from './controls'
import styles from './AgentsPane.module.css'

const M = defineMessages({
  zh: {
    title: '智能体',
    lead: '新建会话时能选的智能体。每次启动时 Wavi 只给这一个会话注入状态 hooks，不改它们的全局配置。“准确”= 知道它在跑、在等你批准还是做完了；“估计”= 只能看终端状态协议和标题。',
    searching: '正在查找…',
    installed: '已安装',
    noneFound: '一个都没有找到。',
    status: (accuracy: string) => `状态 ${accuracy}`,
    missing: (n: number) => `没装 · ${n} 家`,
    copied: '已复制',
    copyInstall: '复制安装命令',
    collapse: '收起',
    showRest: (n: number, names: readonly string[]) => `显示其余 ${n} 家（${names.join('、')}）`
  },
  en: {
    title: 'Agents',
    lead: 'The agents you can pick for a new session. At each launch Wavi injects status hooks into that one session only and leaves their global config alone. “Precise” = it knows whether the agent is running, waiting for your approval or done; “estimated” = it can only read the terminal status protocol and the title.',
    searching: 'Looking…',
    installed: 'Installed',
    noneFound: 'None found.',
    status: (accuracy: string) => `Status: ${accuracy}`,
    missing: (n: number) => `Not installed · ${n}`,
    copied: 'Copied',
    copyInstall: 'Copy install command',
    collapse: 'Show less',
    showRest: (n: number, names: readonly string[]) => `Show ${n} more (${names.join(', ')})`
  }
})

/** Not-installed CLIs shown before 显示其余 N 家. */
const SHOWN_MISSING = 2

/** The not-installed agent the pane opens on (在此新建会话's grey rows): its row is unfolded and scrolled to. */
export const useAgentFocus = create<{ agent: CliAgent | null }>()(() => ({ agent: null }))

export function AgentsPane() {
  const [found, setFound] = useState<AgentAvailability | null>(null)
  const [versions, setVersions] = useState<AgentVersions>({})
  const [allMissing, setAllMissing] = useState(false)
  const [copied, setCopied] = useState<CliAgent | null>(null)
  const m = useMessages(M)

  useEffect(() => {
    let live = true
    void window.tr.app
      .detectAgents()
      .then((next) => live && setFound(next))
      .catch(() => live && setFound({}))
    void window.tr.app
      .agentVersions()
      .then((next) => live && setVersions(next))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const focus = useAgentFocus((s) => s.agent)
  useEffect(() => {
    if (found && focus) requestAnimationFrame(() => document.querySelector(`[data-agent="${focus}"]`)?.scrollIntoView({ block: 'nearest' }))
  }, [found, focus])
  useEffect(() => () => useAgentFocus.setState({ agent: null }), [])

  const installed = found ? CLI_AGENTS.filter((id) => found[id]) : []
  const missing = found ? CLI_AGENTS.filter((id) => !found[id]) : []
  const rest = missing.slice(SHOWN_MISSING)
  // Unfolded by hand, or for the agent it was opened on.
  const unfolded = allMissing || (focus !== null && rest.includes(focus))
  const shownMissing = unfolded ? missing : missing.slice(0, SHOWN_MISSING)
  const toggleMissing = (): void => {
    useAgentFocus.setState({ agent: null })
    setAllMissing(!unfolded)
  }

  const copy = (id: CliAgent): void => {
    void navigator.clipboard
      .writeText(AGENT_SPECS[id].install)
      .then(() => setCopied(id))
      .catch(() => {})
  }

  return (
    <div className={styles.page}>
      <div className={styles.form}>
        <h1 className={styles.title}>{m.title}</h1>
        <p className={styles.lead}>{m.lead}</p>
        {found === null ? (
          <p className={styles.hint}>{m.searching}</p>
        ) : (
          <>
            <Section title={m.installed}>
              {installed.length === 0 && <p className={styles.hint}>{m.noneFound}</p>}
              {installed.map((id) => {
                const note = agentStatusNote(id, versions[id] ?? null)
                return (
                  <div key={id} className={styles.agentRow} role="group" aria-label={AGENT_SPECS[id].label} data-agent={id}>
                    <span className={styles.agentText}>
                      <AgentName id={id} />
                      {note && <span className={styles.agentNote}>{note}</span>}
                    </span>
                    {versions[id] && <span className={styles.meta}>{versions[id]}</span>}
                    <span className={styles.meta}>{m.status(statusAccuracy(id, versions[id] ?? null))}</span>
                  </div>
                )
              })}
            </Section>
            {missing.length > 0 && (
              <Section title={m.missing(missing.length)}>
                {shownMissing.map((id) => (
                  <div key={id} className={styles.agentRow} role="group" aria-label={AGENT_SPECS[id].label} data-agent={id}>
                    <span className={styles.agentText}>
                      <AgentName id={id} />
                      <span className={styles.command}>{AGENT_SPECS[id].install}</span>
                    </span>
                    <button type="button" className={styles.copy} onClick={() => copy(id)}>
                      {copied === id ? m.copied : m.copyInstall}
                    </button>
                  </div>
                ))}
                {rest.length > 0 && (
                  <button type="button" className={styles.more} aria-expanded={unfolded} onClick={toggleMissing}>
                    {unfolded ? <ChevronDown size={16} strokeWidth={1.75} aria-hidden /> : <ChevronRight size={16} strokeWidth={1.75} aria-hidden />}
                    {unfolded ? m.collapse : m.showRest(rest.length, rest.map((id) => AGENT_SPECS[id].label))}
                  </button>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The CLI's mark on the section's left edge, its name after it (Figma 35A, as 设置 · 额度 in 33I). */
function AgentName({ id }: { id: CliAgent }) {
  return (
    <span className={styles.nameLine}>
      <AgentIcon kind={id} />
      <span className={styles.agentName}>{AGENT_SPECS[id].label}</span>
    </span>
  )
}
