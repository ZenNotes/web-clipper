// Evaluates parsed templates against a page. Logic and variables resolve
// first; prompt variables (`{{"a summary"}}`) are left in place as their own
// source text and listed, so the Interpreter can answer them all in one
// request and finalizePrompts() can put the answers in afterwards.

import { applyFilter, type FilterEnv } from './filters'
import type { PageData } from './page'
import { parseTemplate, type Expr, type Node } from './parse'
import { resolveSchema } from './schema'
import { asArray, isPlainObject, parseJsonish, stringify, toNumber, truthy } from './values'

export interface PromptRef {
  /** The tag's source text, which stands in the output until answered. */
  token: string
  prompt: string
  filters: { name: string; raw: string | undefined }[]
}

export interface RenderEnv extends FilterEnv {
  page: PageData
  /** The document selector variables read; null parses page.fullHtml. */
  doc: Document | null
  /** Extra preset variables (noteName, model, ...). */
  extra?: Record<string, unknown>
  prompts: PromptRef[]
}

type Scope = Map<string, unknown>

function presetVars(env: RenderEnv): Record<string, unknown> {
  const p = env.page
  const now = env.now
  const pad = (n: number) => String(n).padStart(2, '0')
  const offset = -now.getTimezoneOffset()
  const tz = `${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${date}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${tz}`
  return {
    title: p.title,
    url: p.url,
    content: p.content,
    contentHtml: p.contentHtml,
    selection: p.selection,
    selectionHtml: p.selectionHtml,
    highlights: p.highlights.map((h) => ({ text: h.text, html: h.html, timestamp: h.timestamp })),
    date,
    time,
    author: p.author,
    published: p.published,
    description: p.description,
    domain: p.domain,
    site: p.site,
    image: p.image,
    favicon: p.favicon,
    language: p.language,
    words: p.words,
    fullHtml: p.fullHtml,
    ...env.extra
  }
}

let parsedDocCache: { html: string; doc: Document } | null = null

function selectorDoc(env: RenderEnv): Document | null {
  if (env.doc) return env.doc
  if (typeof DOMParser === 'undefined' || !env.page.fullHtml) return null
  if (parsedDocCache?.html !== env.page.fullHtml) {
    parsedDocCache = {
      html: env.page.fullHtml,
      doc: new DOMParser().parseFromString(env.page.fullHtml, 'text/html')
    }
  }
  return parsedDocCache.doc
}

function resolveSelector(raw: string, html: boolean, env: RenderEnv): unknown {
  const doc = selectorDoc(env)
  if (!doc) return undefined
  let selector = raw
  let attr: string | null = null
  const q = raw.lastIndexOf('?')
  if (!html && q > 0 && !/[\]"')]/.test(raw.slice(q))) {
    selector = raw.slice(0, q)
    attr = raw.slice(q + 1).trim()
  }
  let els: Element[]
  try {
    els = Array.from(doc.querySelectorAll(selector.trim()))
  } catch {
    return undefined
  }
  const vals = els.map((el) =>
    html ? el.outerHTML : attr ? (el.getAttribute(attr) ?? '') : (el.textContent ?? '').trim().replace(/\s+/g, ' ')
  )
  if (vals.length === 0) return undefined
  return vals.length === 1 ? vals[0] : vals
}

function resolveMeta(raw: string, env: RenderEnv): unknown {
  const m = /^(name|property):(.*)$/.exec(raw.trim())
  const kind = m ? m[1] : null
  const key = (m ? m[2]! : raw).trim().toLowerCase()
  const tag = env.page.metaTags.find((t) => {
    const name = (t.name ?? '').toLowerCase()
    const prop = (t.property ?? '').toLowerCase()
    if (kind === 'name') return name === key
    if (kind === 'property') return prop === key
    return name === key || prop === key
  })
  return tag?.content ?? undefined
}

class Evaluator {
  readonly vars: Record<string, unknown>
  constructor(readonly env: RenderEnv) {
    this.vars = presetVars(env)
  }

  lookup(name: string, scopes: Scope[]): unknown {
    for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i]!.has(name)) return scopes[i]!.get(name)
    return this.vars[name]
  }

  eval(e: Expr, scopes: Scope[]): unknown {
    switch (e.k) {
      case 'lit':
        return e.v
      case 'array':
        return e.items.map((x) => this.eval(x, scopes))
      case 'path': {
        let v = this.lookup(e.head, scopes)
        for (const seg of e.segs) {
          const key = seg.k === 'prop' ? seg.name : this.eval(seg.e, scopes)
          v = parseJsonish(v)
          if (v === null || v === undefined) return undefined
          const k = String(key)
          if (Array.isArray(v) && /^-?\d+$/.test(k)) v = v.at(Number(k))
          else if (Array.isArray(v)) v = (v[0] as Record<string, unknown> | undefined)?.[k]
          else if (typeof v === 'object') v = (v as Record<string, unknown>)[k]
          else if (typeof v === 'string' && /^\d+$/.test(k)) v = v[Number(k)]
          else return undefined
        }
        return v
      }
      case 'prefixed':
        switch (e.prefix) {
          case 'selector':
            return resolveSelector(e.raw, false, this.env)
          case 'selectorHtml':
            return resolveSelector(e.raw, true, this.env)
          case 'meta':
            return resolveMeta(e.raw, this.env)
          case 'schema':
            return resolveSchema(this.env.page.schema, e.raw)
        }
        return undefined
      case 'filter':
        return applyFilter(e.name, this.eval(e.target, scopes), e.raw, this.env)
      case 'not':
        return !truthy(this.eval(e.e, scopes))
      case 'bin': {
        if (e.op === 'and') return truthy(this.eval(e.l, scopes)) && truthy(this.eval(e.r, scopes))
        if (e.op === 'or') return truthy(this.eval(e.l, scopes)) || truthy(this.eval(e.r, scopes))
        const l = this.eval(e.l, scopes)
        if (e.op === '??') return truthy(l) ? l : this.eval(e.r, scopes)
        const r = this.eval(e.r, scopes)
        return compare(e.op, l, r)
      }
    }
  }

  render(nodes: Node[], scopes: Scope[]): string {
    let out = ''
    for (const n of nodes) {
      switch (n.k) {
        case 'text':
          out += n.v
          break
        case 'out':
          if (n.prompt !== null) {
            const filters: PromptRef['filters'] = []
            let cur: Expr = n.e
            while (cur.k === 'filter') {
              filters.unshift({ name: cur.name, raw: cur.raw })
              cur = cur.target
            }
            if (!this.env.prompts.some((p) => p.token === n.source)) {
              this.env.prompts.push({ token: n.source, prompt: n.prompt, filters })
            }
            out += n.source
          } else {
            out += stringify(this.eval(n.e, scopes))
          }
          break
        case 'set':
          scopes[scopes.length - 1]!.set(n.name, this.eval(n.e, scopes))
          break
        case 'if':
          for (const b of n.branches) {
            if (b.cond === null || truthy(this.eval(b.cond, scopes))) {
              out += this.render(b.body, scopes)
              break
            }
          }
          break
        case 'for': {
          const raw = this.eval(n.iter, scopes)
          const arr = asArray(raw) ?? (isPlainObject(raw) ? Object.values(raw) : truthy(raw) ? [raw] : [])
          arr.forEach((item, i) => {
            const scope: Scope = new Map()
            scope.set(n.name, item)
            scope.set(`${n.name}_index`, i)
            scope.set('loop', {
              index: i + 1,
              index0: i,
              first: i === 0,
              last: i === arr.length - 1,
              length: arr.length
            })
            out += this.render(n.body, [...scopes, scope])
            // `set` inside a loop updates names that already existed outside it.
            for (const [k, v] of scope) {
              if (k === n.name || k === 'loop' || k === `${n.name}_index`) continue
              const owner = [...scopes].reverse().find((s) => s.has(k))
              ;(owner ?? scopes[scopes.length - 1]!).set(k, v)
            }
          })
          break
        }
      }
    }
    return out
  }
}

function compare(op: string, l: unknown, r: unknown): boolean {
  if (op === 'contains') {
    const arr = asArray(l)
    if (arr) return arr.some((x) => stringify(x) === stringify(r))
    return stringify(l).includes(stringify(r))
  }
  const ln = toNumber(l)
  const rn = toNumber(r)
  const numeric = ln !== null && rn !== null
  const a: number | string = numeric ? ln! : stringify(l)
  const b: number | string = numeric ? rn! : stringify(r)
  switch (op) {
    case '==':
      return a === b
    case '!=':
      return a !== b
    case '>':
      return a > b
    case '<':
      return a < b
    case '>=':
      return a >= b
    default:
      return a <= b
  }
}

export function renderTemplate(src: string, env: RenderEnv): string {
  if (!src.includes('{{') && !src.includes('{%')) return src
  const ev = new Evaluator(env)
  return ev.render(parseTemplate(src), [new Map()])
}

/** Puts Interpreter answers in place of their prompt tags, running each
 *  tag's filters on its answer. Unanswered prompts become empty. */
export function finalizePrompts(
  text: string,
  prompts: PromptRef[],
  answers: Map<string, unknown>,
  env: Pick<RenderEnv, 'url' | 'now' | 'toMarkdown'>
): string {
  let out = text
  for (const p of prompts) {
    if (!out.includes(p.token)) continue
    let value: unknown = answers.has(p.prompt) ? answers.get(p.prompt) : ''
    for (const f of p.filters) value = applyFilter(f.name, value, f.raw, env)
    out = out.split(p.token).join(stringify(value))
  }
  return out
}
