// Filter arguments come in several shapes (`date:"YYYY"`, `slice:1,4`,
// `replace:"a":"b"`, `callout:("info", "Title", true)`, `split:[0-9]`), so
// the parser hands each filter its raw argument text and these helpers split
// it while respecting quotes and brackets.

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

/** Index just past the quote that closes the one at `start`. */
export function skipQuoted(s: string, start: number): number {
  const q = s[start]
  let i = start + 1
  while (i < s.length) {
    if (s[i] === '\\') i += 2
    else if (s[i] === q) return i + 1
    else i++
  }
  return s.length
}

/** Splits `s` at every top-level occurrence of a character in `seps`. */
export function splitTop(s: string, seps: string): string[] {
  const out: string[] = []
  const stack: string[] = []
  let last = 0
  let i = 0
  while (i < s.length) {
    const c = s[i]!
    if (c === '"' || c === "'") {
      i = skipQuoted(s, i)
      continue
    }
    if (c === '\\') {
      i += 2
      continue
    }
    if (OPENERS[c]) stack.push(OPENERS[c]!)
    else if (stack.length && c === stack[stack.length - 1]) stack.pop()
    else if (!stack.length && seps.includes(c)) {
      out.push(s.slice(last, i))
      last = i + 1
    }
    i++
  }
  out.push(s.slice(last))
  return out
}

const LITERAL_ESCAPES = new Set([':', '|', '{', '}', '(', ')', "'", '"', '\\', ','])

/** Unescapes backslash sequences: `\n` and `\t` become whitespace, an escaped
 *  quote or separator becomes itself, anything else keeps its backslash (so
 *  regex escapes like `\s` and `\d` survive). */
export function unescapeArg(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1]!
      if (n === 'n') out += '\n'
      else if (n === 't') out += '\t'
      else if (LITERAL_ESCAPES.has(n)) out += n
      else out += '\\' + n
      i++
    } else out += c
  }
  return out
}

/** Trims and removes one pair of surrounding quotes. Quoted text has its
 *  escapes processed; bare text is returned as written. */
export function unquote(s: string): string {
  const t = s.trim()
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    return unescapeArg(t.slice(1, -1))
  }
  return t
}

export function isQuoted(s: string): boolean {
  const t = s.trim()
  return t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]
}

/** Inner text when `raw` is one parenthesized group, else null. */
export function parenthesized(raw: string): string | null {
  const t = raw.trim()
  if (!t.startsWith('(')) return null
  // The opening paren has to close at the very end: `(a)|(b)` is not one group.
  let depth = 0
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (c === '"' || c === "'") {
      i = skipQuoted(t, i) - 1
      continue
    }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0 && i !== t.length - 1) return null
    }
  }
  return t.endsWith(')') ? t.slice(1, -1) : null
}

/** The common argument list: `(a, b, c)` splits on commas, a bare
 *  `a:b` splits on colons. Items stay raw (quotes intact). */
export function rawArgList(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') return []
  const inner = parenthesized(raw)
  if (inner !== null) return splitTop(inner, ',').map((s) => s.trim())
  return splitTop(raw, ':').map((s) => s.trim())
}

/** `rawArgList`, unquoted. */
export function argList(raw: string | undefined): string[] {
  return rawArgList(raw).map(unquote)
}

/** Splits a raw argument like `"/x/g"` or `"text"` into a matcher. */
export function regexFromArg(raw: string): RegExp | null {
  const m = /^\/(.*)\/([gimsuy]*)$/s.exec(raw)
  if (!m) return null
  try {
    return new RegExp(m[1]!, m[2])
  } catch {
    return null
  }
}
