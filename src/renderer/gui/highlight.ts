// Code colored by its language in a GUI session (PRD F23, Figma 90C): Markdown code blocks, diffs and the file-link
// card. lowlight (highlight.js grammars, the common set) splits code into scopes; each token keeps its scope's first
// name (`keyword`, `string`, `title` …), which Chat.module.css colors with the terminal theme's eight colors, so a
// theme switch needs no new pass. Pure.
import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)

/** Longer code is drawn plain: highlighting stays well under a frame (Codex TUI stops at a similar size). */
export const MAX_HIGHLIGHT_CHARS = 20_000

export interface Token {
  text: string
  /** The highlight scope (`keyword`, `string`, `comment` …); absent for plain text. */
  kind?: string
}

interface HastNode {
  type: string
  value?: string
  properties?: { className?: unknown }
  children?: HastNode[]
}

/** The code as lines of tokens, colored by `language` (a name or alias); null when it is unknown or too long. */
export function highlightLines(code: string, language: string): Token[][] | null {
  if (code.length > MAX_HIGHLIGHT_CHARS || !lowlight.registered(language)) return null
  let tree: HastNode
  try {
    tree = lowlight.highlight(language, code) as HastNode
  } catch {
    // A grammar that throws on odd input: the code stays readable, uncolored.
    return null
  }
  const lines: Token[][] = [[]]
  const walk = (node: HastNode, kind: string | undefined): void => {
    if (node.type === 'text') {
      const parts = (node.value ?? '').split('\n')
      parts.forEach((text, i) => {
        if (i > 0) lines.push([])
        if (text) lines[lines.length - 1]!.push(kind ? { text, kind } : { text })
      })
      return
    }
    const own = scopeOf(node)
    for (const child of node.children ?? []) walk(child, kind ?? own)
  }
  walk(tree, undefined)
  return lines
}

/** `hljs-title function_` → `title`: the scope's first name decides the color. */
function scopeOf(node: HastNode): string | undefined {
  const names = node.properties?.className
  if (!Array.isArray(names)) return undefined
  const first = names.find((n): n is string => typeof n === 'string' && n.startsWith('hljs-'))
  return first?.slice('hljs-'.length)
}

// Extensions whose language is not their own name in highlight.js.
const BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  m: 'objectivec',
  mm: 'objectivec',
  h: 'c',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  html: 'xml',
  svg: 'xml',
  vue: 'xml',
  css: 'css',
  scss: 'scss',
  json: 'json',
  toml: 'ini',
  sql: 'sql'
}
const BY_NAME: Readonly<Record<string, string>> = { makefile: 'makefile', dockerfile: 'dockerfile' }

/** A file's language by its extension (or name, for a Makefile); undefined when none is known. */
export function languageOfPath(path: string): string | undefined {
  const name = (path.split('/').pop() ?? '').toLowerCase()
  if (Object.hasOwn(BY_NAME, name)) return BY_NAME[name]
  const ext = /\.([a-z0-9]+)$/.exec(name)?.[1]
  if (!ext) return undefined
  const language = Object.hasOwn(BY_EXTENSION, ext) ? BY_EXTENSION[ext]! : ext
  return lowlight.registered(language) ? language : undefined
}
