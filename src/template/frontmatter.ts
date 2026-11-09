// Properties become YAML frontmatter. Text is always double-quoted (a title
// like `Yes: no` or a value starting with `[[` would otherwise change type),
// dates and numbers stay bare so the app reads them as what they are, and
// lists are block sequences. Empty properties are left out.

import type { PropertyType } from '../shared/types'
import { asArray, stringify } from './values'

export interface RenderedProperty {
  name: string
  type: PropertyType
  value: string
}

const quote = (s: string) => JSON.stringify(s)

function key(name: string): string {
  return /^[\p{L}\p{N}_-][\p{L}\p{N}_ -]*$/u.test(name) && !/\s$/.test(name) ? name : quote(name)
}

const PLAIN_ITEM = /^[\p{L}\p{N}][\p{L}\p{N} _./-]*$/u

export function listItems(value: string): string[] {
  const arr = asArray(value)
  if (arr) return arr.map((x) => stringify(x).trim()).filter(Boolean)
  return value
    .split(/,(?![^[]*\]\])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function yamlFor(p: RenderedProperty): string | null {
  const v = p.value.trim()
  if (!v) return null
  switch (p.type) {
    case 'multitext': {
      const items = listItems(v)
      if (!items.length) return null
      return `${key(p.name)}:\n${items.map((i) => `  - ${PLAIN_ITEM.test(i) ? i : quote(i)}`).join('\n')}`
    }
    case 'number': {
      const n = Number(v.replace(/,/g, ''))
      return `${key(p.name)}: ${Number.isFinite(n) ? n : quote(v)}`
    }
    case 'checkbox':
      return `${key(p.name)}: ${/^(true|yes|1|on|checked)$/i.test(v) ? 'true' : 'false'}`
    case 'date':
      return `${key(p.name)}: ${/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : quote(v)}`
    case 'datetime':
      return `${key(p.name)}: ${/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v) ? v : quote(v)}`
    default:
      return `${key(p.name)}: ${quote(v)}`
  }
}

export function frontmatter(props: RenderedProperty[]): string {
  const lines = props.map(yamlFor).filter((l): l is string => l !== null)
  return lines.length ? `---\n${lines.join('\n')}\n---\n` : ''
}
