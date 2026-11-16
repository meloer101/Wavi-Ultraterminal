// One-line Chinese description of what an agent is doing, from a PreToolUse payload (PRD §3.2).
import { defineMessages, pick } from './i18n'

const M = defineMessages({
  zh: {
    read: (file: string) => `读取 ${file}`,
    edit: (file: string) => `编辑 ${file}`,
    run: (command: string) => `运行 ${command}`,
    search: (pattern: string) => `搜索 '${pattern}'`,
    fetch: (host: string) => `抓取 ${host}`,
    subtask: (description: string) => `子任务：${description}`,
    ask: (question: string) => `提问：${question}`,
    asking: '提问',
    confirmPlan: '确认计划'
  },
  en: {
    read: (file: string) => `Reading ${file}`,
    edit: (file: string) => `Editing ${file}`,
    run: (command: string) => `Running ${command}`,
    search: (pattern: string) => `Searching '${pattern}'`,
    fetch: (host: string) => `Fetching ${host}`,
    subtask: (description: string) => `Subtask: ${description}`,
    ask: (question: string) => `Asking: ${question}`,
    asking: 'Asking',
    confirmPlan: 'Confirm plan'
  }
})

const BASH_PREVIEW_CHARS = 40
const DETAIL_PREVIEW_CHARS = 60

function str(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** Last path segment; tolerates trailing slashes and Windows separators. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '')
  return parts[parts.length - 1] ?? path
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function host(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

/** The action line for a tool call; unknown tools (and known ones without usable input) fall back to the tool name. */
export function currentAction(tool: string, input: Record<string, unknown>): string {
  const m = pick(M)
  switch (tool) {
    case 'Read': {
      const path = str(input, 'file_path')
      return path ? m.read(basename(path)) : tool
    }
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit': {
      const path = str(input, 'file_path') ?? str(input, 'notebook_path')
      return path ? m.edit(basename(path)) : tool
    }
    case 'Bash': {
      const command = str(input, 'command')
      return command ? m.run(oneLine(command, BASH_PREVIEW_CHARS)) : tool
    }
    case 'Grep':
    case 'Glob': {
      const pattern = str(input, 'pattern')
      return pattern ? m.search(oneLine(pattern, DETAIL_PREVIEW_CHARS)) : tool
    }
    case 'WebSearch': {
      const query = str(input, 'query')
      return query ? m.search(oneLine(query, DETAIL_PREVIEW_CHARS)) : tool
    }
    case 'WebFetch': {
      const url = str(input, 'url')
      return url ? m.fetch(host(url)) : tool
    }
    case 'Task':
    case 'Agent': {
      const description = str(input, 'description') ?? str(input, 'prompt')
      return description ? m.subtask(oneLine(description, DETAIL_PREVIEW_CHARS)) : tool
    }
    case 'AskUserQuestion': {
      const questions = input.questions
      const first = Array.isArray(questions) ? (questions[0] as { question?: unknown } | undefined) : undefined
      const question = typeof first?.question === 'string' ? first.question : undefined
      return question ? m.ask(oneLine(question, DETAIL_PREVIEW_CHARS)) : m.asking
    }
    case 'ExitPlanMode':
      return m.confirmPlan
    default:
      return tool
  }
}
