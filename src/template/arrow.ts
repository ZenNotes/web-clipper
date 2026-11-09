// The `map` filter's arrow functions, read without eval: extension pages run
// under a CSP that forbids it, and a template is untrusted input. Supported
// bodies: a path (`item.a.b`, `item[0]`), a string with `${path}`
// interpolation, a number, and an object literal in parentheses whose values
// are any of those.

import { skipQuoted, splitTop } from './args'
import { getPath, stringify } from './values'

function evalBody(body: string, param: string, item: unknown): unknown {
  const t = body.trim()
  if (t.startsWith('(') && t.endsWith(')')) return evalBody(t.slice(1, -1), param, item)
  if (t.startsWith('{') && t.endsWith('}')) {
    const out: Record<string, unknown> = {}
    for (const entry of splitTop(t.slice(1, -1), ',')) {
      if (!entry.trim()) continue
      const [k, ...rest] = splitTop(entry, ':')
      const key = k!.trim().replace(/^["']|["']$/g, '')
      out[key] = evalBody(rest.join(':'), param, item)
    }
    return out
  }
  if ((t.startsWith('"') || t.startsWith("'") || t.startsWith('`')) && skipQuoted(t, 0) === t.length) {
    const inner = t.slice(1, -1)
    return inner.replace(/\$\{\s*([^}]+?)\s*\}/g, (_, expr: string) => stringify(evalPath(expr, param, item)))
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  return evalPath(t, param, item)
}

function evalPath(expr: string, param: string, item: unknown): unknown {
  const t = expr.trim()
  if (t === param) return item
  if (t.startsWith(param + '.') || t.startsWith(param + '[')) {
    const rest = t.slice(param.length).replace(/^\./, '')
    return getPath(item, rest)
  }
  return undefined
}

export function evalArrow(raw: string, item: unknown): unknown {
  const m = /^\s*\(?\s*([\p{L}_$][\p{L}\p{N}_$]*)\s*\)?\s*=>\s*([\s\S]+)$/u.exec(raw)
  if (!m) return item
  return evalBody(m[2]!, m[1]!, item)
}
