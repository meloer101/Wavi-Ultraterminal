// 设置 · 快捷键 (Figma 97E): every shortcut, grouped by where it works; the action on the left, the keys on the right.
// Read-only (no rebinding). Elsewhere the hints show only on hover (PRD v1.209), so this page is where they are all seen.
import { Fragment } from 'react'
import { defineMessages } from '@shared/i18n'
import { useMessages } from '../ui/i18n'
import { Section } from './controls'
import { SHORTCUT_GROUPS, keyText, type ShortcutGroupId, type ShortcutRowId } from './shortcut-list'
import styles from './ShortcutsPane.module.css'

interface Strings {
  title: string
  click: string
  space: string
  groups: Record<ShortcutGroupId, string>
  rows: Record<ShortcutRowId, string>
}

const M = defineMessages<Strings>({
  zh: {
    title: '快捷键',
    click: '点击',
    space: '空格',
    groups: { sessions: '会话', window: '窗口与面板', split: '分屏', terminal: '终端', browser: '浏览器', files: '文件', sheets: '面板、看板与对话' },
    rows: {
      'new-session': '新建会话',
      'same-task': '同任务多解…',
      'close-session': '关闭会话',
      'command-palette': '跳转到…',
      nth: '切换到第 1–9 个会话',
      'next-attention': '下一个等你处理的会话',
      'toggle-overview': '看板',
      find: '在终端里查找',
      'merge-worktree': 'Git · 变更的主按钮（合并、推送、创建 PR…）',
      'quit-all': '退出并结束所有会话',
      'open-project': '打开项目…',
      'open-project-in-window': '在新窗口打开项目…',
      'toggle-sidebar': '收起 / 展开侧栏',
      'toggle-right-panel': '收起 / 展开右侧栏',
      settings: '设置',
      'open-usage': '额度',
      'open-schedules': '定时任务',
      'font-size': '终端字号放大 / 缩小 / 还原',
      fullscreen: '全屏',
      'split-right': '向右分屏',
      'split-down': '向下分屏',
      'close-pane': '关闭这一格',
      'focus-pane': '移到左 / 右 / 上 / 下一格',
      'delete-line': '删到行首',
      'line-ends': '到行首 / 行尾',
      word: '按词移动',
      'find-steps': '查找：上一个 / 下一个 / 关闭',
      'open-link': '链接用系统浏览器或默认编辑器打开',
      'paste-file': '粘贴截图或文件',
      address: '地址栏',
      reload: '刷新 / 强制刷新',
      history: '后退 / 前进',
      'port-outside': '端口用系统浏览器打开',
      'file-preview': '预览',
      'file-open': '用默认编辑器打开',
      'file-reveal': '在 Finder 中显示',
      'file-insert': '把路径插入终端',
      'file-copy': '复制相对路径',
      'sheet-confirm': '面板的主按钮（合并、归档、创建…）',
      'sheet-cancel': '取消 / 关闭面板',
      chat: '对话：发送 / 换行 / 停止',
      board: '看板：筛选 / 预览 / 进入会话',
      'multi-pick': '侧栏、看板多选'
    }
  },
  en: {
    title: 'Shortcuts',
    click: 'click',
    space: 'Space',
    groups: { sessions: 'Sessions', window: 'Window and panels', split: 'Split', terminal: 'Terminal', browser: 'Browser', files: 'Files', sheets: 'Sheets, board and chat' },
    rows: {
      'new-session': 'New session',
      'same-task': 'Same task, several tries…',
      'close-session': 'Close session',
      'command-palette': 'Jump to…',
      nth: 'Go to session 1–9',
      'next-attention': 'Next session that needs you',
      'toggle-overview': 'Board',
      find: 'Find in terminal',
      'merge-worktree': 'Git · Changes primary button (merge, push, create PR…)',
      'quit-all': 'Quit and end all sessions',
      'open-project': 'Open project…',
      'open-project-in-window': 'Open project in new window…',
      'toggle-sidebar': 'Hide / show sidebar',
      'toggle-right-panel': 'Hide / show right panel',
      settings: 'Settings',
      'open-usage': 'Usage',
      'open-schedules': 'Scheduled tasks',
      'font-size': 'Terminal font bigger / smaller / default',
      fullscreen: 'Full screen',
      'split-right': 'Split right',
      'split-down': 'Split down',
      'close-pane': 'Close pane',
      'focus-pane': 'Move to the pane left / right / above / below',
      'delete-line': 'Delete to line start',
      'line-ends': 'Line start / end',
      word: 'Move by word',
      'find-steps': 'Find: previous / next / close',
      'open-link': 'Open a link in the system browser or default editor',
      'paste-file': 'Paste a screenshot or files',
      address: 'Address bar',
      reload: 'Reload / hard reload',
      history: 'Back / forward',
      'port-outside': 'Open a port in the system browser',
      'file-preview': 'Preview',
      'file-open': 'Open in default editor',
      'file-reveal': 'Show in Finder',
      'file-insert': 'Insert path into terminal',
      'file-copy': 'Copy relative path',
      'sheet-confirm': "A sheet's primary button (merge, archive, create…)",
      'sheet-cancel': 'Cancel / close a sheet',
      chat: 'Chat: send / new line / stop',
      board: 'Board: filter / peek / enter session',
      'multi-pick': 'Pick several in the sidebar or board'
    }
  }
})

export function ShortcutsPane() {
  const m = useMessages(M)
  return (
    <div className={styles.page}>
      <div className={styles.form}>
        <h1 className={styles.title}>{m.title}</h1>
        {SHORTCUT_GROUPS.map((group) => (
          <Section key={group.id} title={m.groups[group.id]}>
            <dl className={styles.list}>
              {group.rows.map((row) => (
                <div key={row.id} className={styles.row}>
                  <dt className={styles.label}>{m.rows[row.id]}</dt>
                  <dd className={styles.keys}>
                    {row.keys.map((key, i) => (
                      <Fragment key={key}>
                        {i > 0 && 'range' in row && <span aria-hidden> – </span>}
                        <kbd className={styles.key}>{keyText(key, m)}</kbd>
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        ))}
      </div>
    </div>
  )
}
