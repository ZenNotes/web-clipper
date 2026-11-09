// Picks the template for a page. Templates are checked in list order and
// the first rule that matches wins; with no match the first template is
// used. Rules: a URL prefix, a /regex/ (flags after the closing slash), or
// schema:@Type, schema:@Type.key, schema:@Type.key=value (compared without
// regard to case).

import type { Template } from '../shared/types'
import { hasType, schemaEntities } from './schema'
import { getPath, stringify } from './values'

export function ruleMatches(rule: string, url: string, schema: unknown): boolean {
  const r = rule.trim()
  if (!r) return false
  if (r.toLowerCase().startsWith('schema:')) {
    const m = /^schema:@?([^.=\s]+)(?:\.([^=]+))?(?:=(.*))?$/i.exec(r)
    if (!m) return false
    const [, type, key, value] = m
    for (const e of schemaEntities(schema)) {
      if (!hasType(e, type!)) continue
      if (!key) return true
      const v = getPath(e, key.trim())
      if (v === undefined || v === null) continue
      if (value === undefined) return true
      const want = value.trim().toLowerCase()
      const vals = Array.isArray(v) ? v : [v]
      if (vals.some((x) => stringify(x).trim().toLowerCase() === want)) return true
    }
    return false
  }
  const re = /^\/(.+)\/([gimsuy]*)$/s.exec(r)
  if (re) {
    try {
      return new RegExp(re[1]!, re[2]!.replace('g', '')).test(url)
    } catch {
      return false
    }
  }
  return url.startsWith(r)
}

export function matchTemplate(templates: Template[], url: string, schema: unknown): Template | null {
  for (const t of templates) {
    if (t.triggers.some((rule) => ruleMatches(rule, url, schema))) return t
  }
  return templates[0] ?? null
}
