// schema.org JSON-LD comes as one object, an array, or an @graph; these
// helpers flatten it into a list of typed entities so variables and triggers
// can ask for `@Recipe` without caring how the page nested it.

import { getPath, isPlainObject } from './values'

export type SchemaEntity = Record<string, unknown>

export function schemaEntities(schema: unknown): SchemaEntity[] {
  const out: SchemaEntity[] = []
  const seen = new Set<unknown>()
  const visit = (v: unknown, depth: number): void => {
    if (depth > 6 || v === null || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1)
      return
    }
    const obj = v as SchemaEntity
    if (obj['@type'] !== undefined) out.push(obj)
    if (Array.isArray(obj['@graph'])) visit(obj['@graph'], depth + 1)
    for (const [k, child] of Object.entries(obj)) {
      if (k === '@graph') continue
      if (child && typeof child === 'object') visit(child, depth + 1)
    }
  }
  visit(schema, 0)
  return out
}

export function entityTypes(e: SchemaEntity): string[] {
  const t = e['@type']
  const list = Array.isArray(t) ? t : [t]
  return list.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/^.*[/#]/, ''))
}

export function hasType(e: SchemaEntity, type: string): boolean {
  const want = type.replace(/^@/, '').toLowerCase()
  return entityTypes(e).some((t) => t.toLowerCase() === want)
}

/** Resolves `@Type:path` or a bare `path` against the page's schema data. A
 *  bare path reads from the first entity that has its first key. */
export function resolveSchema(schema: unknown, raw: string): unknown {
  const entities = schemaEntities(schema)
  let type: string | null = null
  let path = raw.trim()
  const typed = /^@([^:.\s[]+)[:.]?(.*)$/.exec(path)
  if (typed) {
    type = typed[1]!
    path = typed[2]!.trim()
  }
  const candidates = type ? entities.filter((e) => hasType(e, type!)) : entities
  if (!path) return candidates[0]
  const firstKey = /^[^.[]+/.exec(path)?.[0] ?? path
  for (const e of candidates) {
    if (isPlainObject(e) && firstKey in e) return getPath(e, path)
  }
  return undefined
}
