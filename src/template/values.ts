// Values move between variables and filters as plain JS values (strings,
// numbers, arrays, objects). A string that holds JSON (a prompt answer, a
// value from an imported template) is read as the array or object it holds
// by the filters that want one.

export function parseJsonish(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const t = v.trim()
  if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
    try {
      return JSON.parse(t)
    } catch {
      return v
    }
  }
  return v
}

export function asArray(v: unknown): unknown[] | null {
  const p = parseJsonish(v)
  return Array.isArray(p) ? p : null
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function asObject(v: unknown): Record<string, unknown> | null {
  const p = parseJsonish(v)
  return isPlainObject(p) ? p : null
}

export function isEmpty(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    v === false ||
    v === '' ||
    v === 0 ||
    (Array.isArray(v) && v.length === 0)
  )
}

export function truthy(v: unknown): boolean {
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '' || t === '[]') return false
  }
  return !isEmpty(v)
}

/** How a value prints into a note: arrays of plain values join with ", ",
 *  anything structured prints as JSON. */
export function stringify(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))) {
      return v.map((x) => stringify(x)).join(', ')
    }
    return JSON.stringify(v)
  }
  return JSON.stringify(v)
}

/** Text of a value for string filters. A highlight object reads as its text. */
export function textOf(v: unknown): string {
  if (isPlainObject(v) && typeof v.text === 'string') return v.text
  return stringify(v)
}

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Reads `a.b[0].c` style paths off a value. `[*]` maps over an array. */
export function getPath(root: unknown, path: string): unknown {
  const parts = path.match(/[^.[\]]+|\[(?:\*|\d+|"[^"]*"|'[^']*')\]/g) ?? []
  let cur: unknown[] | unknown = root
  let spread = false
  for (const part of parts) {
    const step = (v: unknown): unknown => {
      v = parseJsonish(v)
      if (v === null || v === undefined) return undefined
      if (part.startsWith('[')) {
        const inner = part.slice(1, -1)
        if (/^\d+$/.test(inner)) return Array.isArray(v) ? v[Number(inner)] : undefined
        const key = inner.replace(/^["']|["']$/g, '')
        return (v as Record<string, unknown>)[key]
      }
      if (Array.isArray(v) && !/^\d+$/.test(part)) {
        // A key on an array reads it from the first item, as JSON-LD often
        // wraps a single object in an array.
        const first = v[0]
        return first === null || first === undefined ? undefined : (first as Record<string, unknown>)[part]
      }
      return (v as Record<string, unknown>)[part]
    }
    if (part === '[*]') {
      const arr = spread ? (cur as unknown[]).flat() : asArray(cur)
      cur = arr ?? []
      spread = true
      continue
    }
    cur = spread ? (cur as unknown[]).map(step).filter((x) => x !== undefined) : step(cur)
  }
  return cur
}
