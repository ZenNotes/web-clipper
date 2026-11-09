// The filter library: `{{value|name:args}}`. Each filter receives the value
// and its raw argument text (see args.ts for the shapes). Unknown filters
// leave the value alone, so a template written for a newer clipper still
// renders.

import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import advancedFormat from 'dayjs/plugin/advancedFormat'
import {
  argList,
  isQuoted,
  parenthesized,
  rawArgList,
  regexFromArg,
  splitTop,
  unescapeArg,
  unquote
} from './args'
import { evalArrow } from './arrow'
import {
  asArray,
  asObject,
  getPath,
  isPlainObject,
  parseJsonish,
  stringify,
  textOf,
  toNumber
} from './values'

dayjs.extend(customParseFormat)
dayjs.extend(advancedFormat)

export interface FilterEnv {
  /** The page URL: the base for links and text fragments. */
  url: string
  now: Date
  /** HTML to Markdown, the same converter extraction uses. */
  toMarkdown(html: string): string
}

export type Filter = (value: unknown, raw: string | undefined, env: FilterEnv) => unknown

const each = (v: unknown, fn: (s: string) => string): unknown => {
  const arr = asArray(v)
  if (arr) return arr.map((x) => fn(textOf(x)))
  return fn(textOf(v))
}

function words(s: string): string[] {
  return s
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function parseDate(v: unknown, inputFormat?: string): dayjs.Dayjs | null {
  if (v instanceof Date) return dayjs(v)
  if (typeof v === 'number') return dayjs(v < 1e12 ? v * 1000 : v)
  const s = textOf(v).trim()
  if (!s) return null
  const d = inputFormat ? dayjs(s, inputFormat) : dayjs(s)
  return d.isValid() ? d : null
}

function parseDuration(v: unknown): number | null {
  const s = textOf(v).trim()
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const m = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(s)
  if (!m || s === 'P' || s === 'PT') return null
  const [, y, mo, w, d, h, mi, se] = m.map((x) => (x ? Number(x) : 0))
  return (
    (y ?? 0) * 31536000 +
    (mo ?? 0) * 2592000 +
    (w ?? 0) * 604800 +
    (d ?? 0) * 86400 +
    (h ?? 0) * 3600 +
    (mi ?? 0) * 60 +
    (se ?? 0)
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

function htmlDoc(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
}

function listArg(raw: string | undefined): string[] {
  return argList(raw)
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function textFragment(text: string): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D')
  const w = text.trim().split(/\s+/)
  if (w.length > 10) return `${enc(w.slice(0, 5).join(' '))},${enc(w.slice(-5).join(' '))}`
  return enc(text.trim())
}

function mdTable(rows: unknown[][], headers: string[]): string {
  const cell = (v: unknown) => stringify(v).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const lines = [
    `| ${headers.map(cell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${headers.map((_, i) => cell(r[i] ?? '')).join(' | ')} |`)
  ]
  return lines.join('\n')
}

function nthKeep(pattern: string, count: number): Set<number> {
  const keep = new Set<number>()
  const grouped = /^([\d,\s]+):(\d+)$/.exec(pattern)
  if (grouped) {
    const positions = grouped[1]!.split(',').map((x) => Number(x.trim())).filter((x) => x > 0)
    const size = Number(grouped[2])
    for (let start = 0; start < count; start += size) {
      for (const p of positions) if (p <= size && start + p <= count) keep.add(start + p)
    }
    return keep
  }
  for (const part of pattern.split(',')) {
    const t = part.replace(/\s+/g, '')
    if (/^\d+$/.test(t)) {
      keep.add(Number(t))
      continue
    }
    const m = /^(-?\d*)n([+-]\d+)?$/.exec(t)
    if (!m) continue
    const a = m[1] === '' ? 1 : m[1] === '-' ? -1 : Number(m[1])
    const b = m[2] ? Number(m[2]) : 0
    for (let n = 0; n <= count; n++) {
      const pos = a * n + b
      if (pos >= 1 && pos <= count) keep.add(pos)
    }
  }
  return keep
}

function stripMarkdown(s: string): string {
  return s
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/^\|.*\|$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/^\[\^[^\]]+\]:.*$/gm, '')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?\[![^\]]+\][+-]?\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/gm, '$1')
    .replace(/^(\s*)[-*+]\s+/gm, '$1')
    .replace(/^(\s*)\d+\.\s+/gm, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/==(.*?)==/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

function safeName(s: string, os?: string): string {
  let out = s
  // eslint-disable-next-line no-control-regex
  const control = /[\u0000-\u001f\u007f]/g
  switch (os) {
    case 'mac':
      out = out.replace(/[/:]/g, '').replace(control, '')
      break
    case 'linux':
      out = out.replace(/\//g, '').replace(control, '')
      break
    case 'windows':
      out = out.replace(/[<>:"/\\|?*]/g, '').replace(control, '').replace(/[. ]+$/, '')
      if (WINDOWS_RESERVED.test(out)) out = `_${out}`
      break
    default:
      // Also drops the characters that break a [[wikilink]] (#, |, ^, [, ]).
      out = out.replace(/[<>:"/\\|?*#^[\]]/g, '').replace(control, '')
      if (WINDOWS_RESERVED.test(out)) out = `_${out}`
  }
  out = out.replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '')
  return out.slice(0, 245)
}

export const FILTERS: Record<string, Filter> = {
  // ---- dates ----
  date(v, raw) {
    const [out = 'YYYY-MM-DD', inFmt] = argList(raw)
    if (isEmpty(v)) return v
    const d = parseDate(v, inFmt)
    return d ? d.format(out) : v
  },
  date_modify(v, raw) {
    const [spec = ''] = argList(raw)
    const d = parseDate(v)
    const m = /^([+-])\s*(\d+)\s*([a-z]+)$/i.exec(spec.trim())
    if (!d || !m) return v
    const unit = m[3]!.toLowerCase().replace(/s$/, '') as dayjs.ManipulateType
    const n = Number(m[2]) * (m[1] === '-' ? -1 : 1)
    const next = d.add(n, unit)
    return /^\d{4}-\d{2}-\d{2}$/.test(textOf(v).trim()) ? next.format('YYYY-MM-DD') : next.format()
  },
  duration(v, raw) {
    const secs = parseDuration(v)
    if (secs === null) return v
    const [fmt] = argList(raw)
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = Math.floor(secs % 60)
    const format = fmt ?? (secs >= 3600 ? 'HH:mm:ss' : 'mm:ss')
    return format.replace(/HH|H|mm|m|ss|s/g, (t) =>
      t === 'HH' ? pad(h) : t === 'H' ? String(h) : t === 'mm' ? pad(m) : t === 'm' ? String(m) : t === 'ss' ? pad(s) : String(s)
    )
  },

  // ---- text ----
  lower: (v) => each(v, (s) => s.toLowerCase()),
  upper: (v) => each(v, (s) => s.toUpperCase()),
  trim: (v) => each(v, (s) => s.trim()),
  capitalize: (v) => each(v, (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()),
  title: (v) => each(v, (s) => s.replace(/\p{L}[\p{L}\p{N}'\u2019]*/gu, (w) => upperFirst(w.toLowerCase()))),
  camel: (v) =>
    each(v, (s) => words(s).map((w, i) => (i ? upperFirst(w.toLowerCase()) : w.toLowerCase())).join('')),
  pascal: (v) => each(v, (s) => words(s).map((w) => upperFirst(w.toLowerCase())).join('')),
  kebab: (v) => each(v, (s) => words(s).map((w) => w.toLowerCase()).join('-')),
  snake: (v) => each(v, (s) => words(s).map((w) => w.toLowerCase()).join('_')),
  uncamel: (v) =>
    each(v, (s) =>
      s
        .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
        .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
        .toLowerCase()
    ),
  decode_uri: (v) =>
    each(v, (s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    }),
  unescape: (v) =>
    each(v, (s) => s.replace(/\\(["'\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t')),
  safe_name(v, raw) {
    const [os] = argList(raw)
    return each(v, (s) => safeName(s, os?.toLowerCase()))
  },
  replace(v, raw) {
    if (raw === undefined) return v
    const inner = parenthesized(raw)
    const pairs: [string, string][] = (inner !== null ? splitTop(inner, ',') : [raw]).map((p) => {
      const parts = splitTop(p.trim(), ':')
      const search = parts[0] ?? ''
      const repl = parts.slice(1).join(':')
      return [search.trim(), repl.trim()]
    })
    return each(v, (s) => {
      let out = s
      for (const [searchRaw, replRaw] of pairs) {
        const search = unquote(searchRaw)
        const repl = replRaw === '' ? '' : unquote(replRaw)
        const re = regexFromArg(search)
        out = re ? out.replace(re, repl) : out.split(search).join(repl)
      }
      return out
    })
  },
  prompt: (v) => v,

  // ---- formatting ----
  blockquote: (v) =>
    each(v, (s) =>
      s
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n')
    ),
  callout(v, raw) {
    const [type = 'info', title = '', fold] = argList(raw)
    const foldMark = fold === 'true' ? '-' : fold === 'false' ? '+' : ''
    const body = stringify(v)
    const head = `> [!${type || 'info'}]${foldMark}${title ? ' ' + title : ''}`
    const lines = body ? body.split('\n').map((l) => (l ? `> ${l}` : '>')) : []
    return [head, ...lines].join('\n')
  },
  footnote(v) {
    const arr = asArray(v)
    if (arr) return arr.map((x, i) => `[^${i + 1}]: ${textOf(x)}`).join('\n\n')
    const obj = asObject(v)
    if (obj) {
      return Object.entries(obj)
        .map(([k, x]) => `[^${words(k).map((w) => w.toLowerCase()).join('-')}]: ${stringify(x)}`)
        .join('\n\n')
    }
    return v
  },
  fragment_link(v, raw, env) {
    const [label = 'link'] = argList(raw)
    const base = env.url.split('#')[0]
    const one = (x: unknown) => {
      const t = textOf(x)
      return t ? `${t} [${label}](${base}#:~:text=${textFragment(t)})` : ''
    }
    const arr = asArray(v)
    return arr ? arr.map(one) : one(v)
  },
  image(v, raw) {
    const [alt = ''] = argList(raw)
    const arr = asArray(v)
    if (arr) return arr.map((x) => `![${alt}](${textOf(x)})`)
    const obj = asObject(v)
    if (obj) return Object.entries(obj).map(([src, a]) => `![${stringify(a)}](${src})`)
    const s = textOf(v)
    return s ? `![${alt}](${s})` : ''
  },
  link(v, raw) {
    const [label] = argList(raw)
    const arr = asArray(v)
    if (arr) return arr.map((x) => `[${label ?? textOf(x)}](${textOf(x)})`).join('\n')
    const obj = asObject(v)
    if (obj) return Object.entries(obj).map(([url, t]) => `[${stringify(t)}](${url})`).join('\n')
    const s = textOf(v)
    return s ? `[${label ?? s}](${s})` : ''
  },
  wikilink(v, raw) {
    const [alias] = argList(raw)
    const one = (page: string, a?: string) => (page ? (a ? `[[${page}|${a}]]` : `[[${page}]]`) : '')
    const arr = asArray(v)
    if (arr) return arr.map((x) => one(textOf(x).trim(), alias)).filter(Boolean)
    const obj = asObject(v)
    if (obj) return Object.entries(obj).map(([page, a]) => one(page, stringify(a) || undefined))
    return one(textOf(v).trim(), alias)
  },
  list(v, raw) {
    const [kind = ''] = argList(raw)
    const arr = asArray(v) ?? (textOf(v) ? [v] : [])
    return arr
      .map((x, i) => {
        const t = textOf(x)
        switch (kind) {
          case 'task':
            return `- [ ] ${t}`
          case 'numbered':
            return `${i + 1}. ${t}`
          case 'numbered-task':
            return `${i + 1}. [ ] ${t}`
          default:
            return `- ${t}`
        }
      })
      .join('\n')
  },
  table(v, raw) {
    const headers = argList(raw)
    const arr = asArray(v)
    if (!arr || arr.length === 0) return v
    if (arr.every(isPlainObject)) {
      const keys = headers.length
        ? headers
        : [...new Set(arr.flatMap((o) => Object.keys(o as Record<string, unknown>)))]
      return mdTable(
        arr.map((o) => keys.map((k) => (o as Record<string, unknown>)[k])),
        keys
      )
    }
    if (arr.every(Array.isArray)) {
      const width = Math.max(...arr.map((r) => (r as unknown[]).length))
      const hs = headers.length ? headers : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
      return mdTable(arr as unknown[][], hs)
    }
    if (headers.length > 1) {
      const rows: unknown[][] = []
      for (let i = 0; i < arr.length; i += headers.length) rows.push(arr.slice(i, i + headers.length))
      return mdTable(rows, headers)
    }
    return mdTable(
      arr.map((x) => [x]),
      headers.length ? headers : ['Value']
    )
  },

  // ---- numbers ----
  calc(v, raw) {
    const n = toNumber(v)
    const [expr = ''] = argList(raw)
    const m = /^\s*(\*\*|\^|[+\-*/])\s*(-?\d+(?:\.\d+)?)\s*$/.exec(expr)
    if (n === null || !m) return v
    const x = Number(m[2])
    switch (m[1]) {
      case '+':
        return n + x
      case '-':
        return n - x
      case '*':
        return n * x
      case '/':
        return x === 0 ? v : n / x
      default:
        return n ** x
    }
  },
  length(v) {
    const p = parseJsonish(v)
    if (Array.isArray(p)) return p.length
    if (isPlainObject(p)) return Object.keys(p).length
    return stringify(v).length
  },
  round(v, raw) {
    const n = toNumber(v)
    if (n === null) return v
    const [d = '0'] = argList(raw)
    const f = 10 ** Number(d)
    return Math.round(n * f) / f
  },
  number_format(v, raw) {
    const [dec = '0', thousands = ',', point = '.'] = argList(raw)
    const fmt = (x: unknown): unknown => {
      if (Array.isArray(x)) return x.map(fmt)
      if (isPlainObject(x)) return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, fmt(y)]))
      const n = toNumber(x)
      if (n === null) return x
      const fixed = Math.abs(n).toFixed(Number(dec))
      const [int, frac] = fixed.split('.')
      const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, thousands)
      return `${n < 0 ? '-' : ''}${grouped}${frac ? point + frac : ''}`
    }
    return fmt(parseJsonish(v))
  },

  // ---- HTML ----
  markdown: (v, _raw, env) => each(v, (s) => env.toMarkdown(s)),
  strip_md: (v) => each(v, stripMarkdown),
  strip_tags(v, raw) {
    const keep = new Set(listArg(raw).map((t) => t.toLowerCase()))
    return each(v, (s) => {
      if (!keep.size) {
        const doc = htmlDoc(s)
        return doc.body.textContent ?? ''
      }
      return s.replace(/<\/?([a-zA-Z][\w-]*)[^>]*>/g, (tag, name: string) =>
        keep.has(name.toLowerCase()) ? tag : ''
      )
    })
  },
  remove_html(v, raw) {
    const selectors = listArg(raw)
    if (!selectors.length) return v
    return each(v, (s) => {
      const doc = htmlDoc(s)
      for (const sel of selectors) {
        try {
          doc.body.querySelectorAll(sel).forEach((el) => el.remove())
        } catch {
          /* an invalid selector removes nothing */
        }
      }
      return doc.body.innerHTML
    })
  },
  remove_tags(v, raw) {
    const tags = listArg(raw)
    return each(v, (s) => {
      const doc = htmlDoc(s)
      for (const t of tags) {
        doc.body.querySelectorAll(t).forEach((el) => el.replaceWith(...Array.from(el.childNodes)))
      }
      return doc.body.innerHTML
    })
  },
  replace_tags(v, raw) {
    const [from, to] = argList(raw)
    if (!from || !to) return v
    return each(v, (s) => {
      const doc = htmlDoc(s)
      doc.body.querySelectorAll(from).forEach((el) => {
        const next = doc.createElement(to)
        for (const a of Array.from(el.attributes)) next.setAttribute(a.name, a.value)
        next.append(...Array.from(el.childNodes))
        el.replaceWith(next)
      })
      return doc.body.innerHTML
    })
  },
  remove_attr(v, raw) {
    const attrs = listArg(raw)
    return each(v, (s) => {
      const doc = htmlDoc(s)
      doc.body.querySelectorAll('*').forEach((el) => attrs.forEach((a) => el.removeAttribute(a)))
      return doc.body.innerHTML
    })
  },
  strip_attr(v, raw) {
    const keep = new Set(listArg(raw).map((a) => a.toLowerCase()))
    return each(v, (s) => {
      const doc = htmlDoc(s)
      doc.body.querySelectorAll('*').forEach((el) => {
        for (const a of Array.from(el.attributes)) if (!keep.has(a.name.toLowerCase())) el.removeAttribute(a.name)
      })
      return doc.body.innerHTML
    })
  },
  html_to_json(v) {
    const toJson = (n: Node): unknown => {
      if (n.nodeType === 3) return { type: 'text', content: n.textContent ?? '' }
      if (n.nodeType !== 1) return null
      const el = n as Element
      return {
        tag: el.tagName.toLowerCase(),
        attributes: Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value])),
        children: Array.from(el.childNodes).map(toJson).filter(Boolean)
      }
    }
    const doc = htmlDoc(textOf(v))
    return Array.from(doc.body.childNodes).map(toJson).filter(Boolean)
  },

  // ---- arrays and objects ----
  first(v) {
    const arr = asArray(v)
    return arr ? arr[0] : v
  },
  last(v) {
    const arr = asArray(v)
    return arr ? arr[arr.length - 1] : v
  },
  join(v, raw) {
    const arr = asArray(v)
    if (!arr) return v
    const [sep = ','] = raw === undefined ? [] : [unquote(raw)]
    return arr.map(textOf).join(sep)
  },
  split(v, raw) {
    const s = textOf(v)
    if (raw === undefined || raw === '') return Array.from(s)
    const t = raw.trim()
    if (!isQuoted(t) && /^\[.*\]$/.test(t)) return s.split(new RegExp(t))
    const sep = unquote(t)
    const re = regexFromArg(sep)
    return s.split(re ?? sep)
  },
  slice(v, raw) {
    const [a, b] = splitTop(raw ?? '', ',').map((x) => (x.trim() === '' ? undefined : Number(unquote(x))))
    const arr = asArray(v)
    if (arr) return arr.slice(a, b)
    return stringify(v).slice(a, b)
  },
  reverse(v) {
    const p = parseJsonish(v)
    if (Array.isArray(p)) return [...p].reverse()
    if (isPlainObject(p)) return Object.fromEntries(Object.entries(p).reverse())
    return Array.from(stringify(v)).reverse().join('')
  },
  unique(v) {
    const p = parseJsonish(v)
    if (Array.isArray(p)) {
      const seen = new Set<string>()
      return p.filter((x) => {
        const k = JSON.stringify(x)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    }
    if (isPlainObject(p)) {
      const byValue = new Map<string, string>()
      for (const [k, x] of Object.entries(p)) {
        const key = JSON.stringify(x)
        byValue.delete(key)
        byValue.set(key, k)
      }
      const keepKeys = new Set(byValue.values())
      return Object.fromEntries(Object.entries(p).filter(([k]) => keepKeys.has(k)))
    }
    return v
  },
  merge(v, raw) {
    const base = asArray(v) ?? (v === undefined || v === null || v === '' ? [] : [v])
    const extra = rawArgList(raw).flatMap((item) =>
      isQuoted(item) && item.trim().startsWith("'")
        ? splitTop(unquote(item), ',').map((x) => unquote(x))
        : [unquote(item)]
    )
    return [...base, ...extra]
  },
  nth(v, raw) {
    const arr = asArray(v)
    if (!arr || raw === undefined) return v
    const keep = nthKeep(unquote(raw), arr.length)
    return arr.filter((_, i) => keep.has(i + 1))
  },
  object(v, raw) {
    const obj = asObject(v)
    if (!obj) return v
    switch (unquote(raw ?? '')) {
      case 'keys':
        return Object.keys(obj)
      case 'values':
        return Object.values(obj)
      default:
        return Object.entries(obj)
    }
  },
  map(v, raw) {
    const arr = asArray(v)
    if (!arr || !raw) return v
    return arr.map((item) => evalArrow(raw, item))
  },
  template(v, raw) {
    const tpl = unescapeArg(unquote(raw ?? ''))
    const fill = (item: unknown) =>
      tpl.replace(/\$\{\s*([^}]+?)\s*\}/g, (_, path: string) => {
        if (typeof item !== 'object' || item === null) return stringify(item)
        return stringify(getPath(item, path))
      })
    const p = parseJsonish(v)
    if (Array.isArray(p)) return p.map(fill).join('')
    if (isPlainObject(p)) return fill(p)
    return v
  }
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === ''
}

export function applyFilter(name: string, value: unknown, raw: string | undefined, env: FilterEnv): unknown {
  const f = FILTERS[name]
  if (!f) return value
  try {
    return f(value, raw, env)
  } catch {
    return value
  }
}
