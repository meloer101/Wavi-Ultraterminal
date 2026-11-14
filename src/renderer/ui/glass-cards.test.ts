// The base layer (GlassBase, PRD v1.183) is cut out only where an element says it is a card ([data-glass-card]). A card
// on the glass draws its edge with box-shadow: var(--card-edge); a stylesheet that does must be used by a component
// that marks its card, or that card would sit on the tint and look darker than its opacity.
import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')

function files(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry: Dirent) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return files(path, ext)
    return entry.name.endsWith(ext) ? [path] : []
  })
}

/** Stylesheets that draw a card's edge (comments left out; defining the --card-edge variable does not count). */
function cardSheets(): string[] {
  return files(ROOT, '.module.css').filter((path) => /box-shadow\s*:\s*var\(--card-edge\)/.test(readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
}

describe('cards on the glass', () => {
  const components = files(ROOT, '.tsx').map((path) => ({ path, text: readFileSync(path, 'utf8') }))

  it('finds the card stylesheets', () => {
    expect(cardSheets().length).toBeGreaterThanOrEqual(7)
  })

  it.each(cardSheets().map((path) => [relative(ROOT, path), path]))('%s is used by a component that marks its card', (_name, sheet) => {
    const users = components.filter((c) => c.text.includes(`/${basename(sheet)}'`) && c.path.startsWith(join(sheet, '..')))
    expect(users.length).toBeGreaterThan(0)
    expect(users.some((c) => c.text.includes('data-glass-card'))).toBe(true)
  })
})
