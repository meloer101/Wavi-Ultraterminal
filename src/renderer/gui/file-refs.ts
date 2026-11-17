// File references in a GUI session's words and tool output (PRD F23, Figma 90A / 90E): `src/a.ts`, `src/a.ts:42`,
// `src/a.ts#L42`, a Markdown link to a file, a stack frame's location. Claude is asked for `file_path:line_number`,
// Codex for a path in inline code with `:line` or `#Lline`; both are what the terminal's finder reads
// (terminal/file-links.ts). This only finds candidates; main says which are files of the session's worktree, and only
// those become links (FileRef). Pure.
import { findPathCandidates } from '../terminal/file-links'
import { plainOutput } from './model'

export interface FileRefTarget {
  /** As written (relative to the worktree, or absolute), without the line suffix. */
  path: string
  line: number | null
  column: number | null
}

/** A run of text split into plain pieces and references. */
export type RefPiece = string | { text: string; target: FileRefTarget }

/** Inline code that is a path and nothing else (`server/auth/refresh.ts:42`); null for any other code. */
export function codeRef(code: string): FileRefTarget | null {
  const text = code.trim()
  const whole = findPathCandidates(text).find((c) => c.start === 0 && c.end === text.length)
  return whole ? { path: whole.path, line: whole.line, column: whole.column } : null
}

/** A Markdown link's href naming a file (`src/a.ts#L42`, `/abs/a.ts:3`); null for a URL or anything with a scheme. */
export function hrefRef(href: string): FileRefTarget | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) return null
  let decoded = href
  try {
    decoded = decodeURI(href)
  } catch {
    // A stray % in a path: read it as written.
  }
  return codeRef(decoded)
}

/**
 * Text split around the path-looking runs in it, line by line. Where two candidates overlap (a run with CJK prose
 * glued to it and the same run without it, file-links.ts), the later, unglued one is kept: prose is not part of a path.
 */
export function refPieces(text: string): RefPiece[] {
  const pieces: RefPiece[] = []
  let offset = 0
  let plain = ''
  for (const line of text.split('\n')) {
    if (offset > 0) plain += '\n'
    const kept: ReturnType<typeof findPathCandidates> = []
    for (const candidate of findPathCandidates(line)) {
      const last = kept[kept.length - 1]
      if (last && candidate.start < last.end) kept[kept.length - 1] = candidate
      else kept.push(candidate)
    }
    let at = 0
    for (const c of kept) {
      plain += line.slice(at, c.start)
      if (plain) pieces.push(plain)
      plain = ''
      pieces.push({ text: line.slice(c.start, c.end), target: { path: c.path, line: c.line, column: c.column } })
      at = c.end
    }
    plain += line.slice(at)
    offset++
  }
  if (plain) pieces.push(plain)
  return pieces
}

/** A stack frame in a dependency: `    at fn (…/node_modules/x/y.js:1:2)` (Node), `File "…/site-packages/…"` (Python). */
const DEPENDENCY_FRAME = /^\s*(?:at\s.*[/\\](?:node_modules)[/\\]|File\s+".*[/\\](?:site-packages|dist-packages)[/\\])/


/** Output as runs of lines: kept as they are, or two or more dependency frames in a row, folded (Figma 90E). */
export type OutputRun = { kind: 'text'; text: string } | { kind: 'frames'; text: string; count: number }

export function outputRuns(raw: string): OutputRun[] {
  const lines = raw.split('\n')
  const runs: OutputRun[] = []
  let i = 0
  let text: string[] = []
  const flushText = (): void => {
    if (text.length > 0) runs.push({ kind: 'text', text: text.join('\n') })
    text = []
  }
  while (i < lines.length) {
    let j = i
    while (j < lines.length && DEPENDENCY_FRAME.test(plainOutput(lines[j]!))) j++
    if (j - i >= 2) {
      flushText()
      runs.push({ kind: 'frames', text: lines.slice(i, j).join('\n'), count: j - i })
      i = j
    } else {
      text.push(lines[i]!)
      i++
    }
  }
  flushText()
  return runs
}

// --- Markdown: paths in prose ----------------------------------------------------------------------------------------

interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

/** Elements whose text is not prose: code is read whole (codeRef), a link already points somewhere. */
const NOT_PROSE: ReadonlySet<string> = new Set(['code', 'pre', 'a'])

/**
 * A rehype plugin (after sanitizing): paths in prose become `<span data-ref-path data-ref-line data-ref-column>`, which
 * ChatMarkdown draws as a FileRef. Runs per render of a message, like the rest of its Markdown.
 */
export function rehypeFileRefs() {
  const visit = (node: HastNode): void => {
    if (!node.children || (node.tagName && NOT_PROSE.has(node.tagName))) return
    const next: HastNode[] = []
    let changed = false
    for (const child of node.children) {
      if (child.type !== 'text' || !child.value) {
        visit(child)
        next.push(child)
        continue
      }
      const pieces = refPieces(child.value)
      if (!pieces.some((p) => typeof p !== 'string')) {
        next.push(child)
        continue
      }
      changed = true
      for (const piece of pieces) {
        if (typeof piece === 'string') next.push({ type: 'text', value: piece })
        else
          next.push({
            type: 'element',
            tagName: 'span',
            properties: {
              dataRefPath: piece.target.path,
              ...(piece.target.line !== null ? { dataRefLine: String(piece.target.line) } : {}),
              ...(piece.target.column !== null ? { dataRefColumn: String(piece.target.column) } : {})
            },
            children: [{ type: 'text', value: piece.text }]
          })
      }
    }
    if (changed) node.children = next
  }
  return (tree: HastNode): void => visit(tree)
}

/** A FileRef target from a span the plugin made (its data-ref-* attributes as React props). */
export function spanRef(props: Record<string, unknown>): FileRefTarget | null {
  const path = props['data-ref-path']
  if (typeof path !== 'string') return null
  const line = Number(props['data-ref-line'])
  const column = Number(props['data-ref-column'])
  return { path, line: Number.isInteger(line) && line > 0 ? line : null, column: Number.isInteger(column) && column > 0 ? column : null }
}
