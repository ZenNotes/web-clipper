// Parses template text into nodes. Output tags are `{{ expr }}`, logic tags
// are `{% if %}`, `{% elseif %}` (`elif` too), `{% else %}`, `{% endif %}`,
// `{% for x in expr %}`, `{% endfor %}` and `{% set x = expr %}`. A logic tag
// alone on its line takes the line with it, so templates can lay out their
// logic on separate lines without leaving blank lines behind; `{%-` and
// `-%}` (and `{{-`, `-}}`) trim the whitespace on that side explicitly.
//
// Filter arguments are captured as raw text and interpreted by each filter,
// because their shapes differ (`slice:1,4`, `replace:"a":"b"`,
// `map:item => item.name`).

import { skipQuoted } from './args'

export type Expr =
  | { k: 'lit'; v: unknown }
  | { k: 'array'; items: Expr[] }
  | { k: 'path'; head: string; segs: Seg[] }
  | { k: 'prefixed'; prefix: Prefix; raw: string }
  | { k: 'filter'; target: Expr; name: string; raw: string | undefined }
  | { k: 'not'; e: Expr }
  | { k: 'bin'; op: BinOp; l: Expr; r: Expr }

export type Seg = { k: 'prop'; name: string } | { k: 'index'; e: Expr }
export type Prefix = 'meta' | 'selector' | 'selectorHtml' | 'schema'
export type BinOp = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'and' | 'or' | '??'

export type Node =
  | { k: 'text'; v: string }
  | { k: 'out'; e: Expr; source: string; prompt: string | null }
  | { k: 'if'; branches: { cond: Expr | null; body: Node[] }[] }
  | { k: 'for'; name: string; iter: Expr; body: Node[] }
  | { k: 'set'; name: string; e: Expr }

export class TemplateSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateSyntaxError'
  }
}

const PREFIXES: Prefix[] = ['selectorHtml', 'selector', 'schema', 'meta']
const IDENT = /[\p{L}_$][\p{L}\p{N}_$]*/uy

type Ctx = 'output' | 'logic'

class ExprParser {
  i = 0
  constructor(
    readonly s: string,
    readonly ctx: Ctx
  ) {}

  ws(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++
  }

  at(str: string): boolean {
    return this.s.startsWith(str, this.i)
  }

  word(w: string): boolean {
    if (!this.s.startsWith(w, this.i)) return false
    const next = this.s[this.i + w.length]
    return next === undefined || !/[\p{L}\p{N}_$]/u.test(next)
  }

  fail(msg: string): never {
    throw new TemplateSyntaxError(`${msg} in "${this.s.trim()}"`)
  }

  parse(): Expr {
    const e = this.fallback()
    this.ws()
    if (this.i < this.s.length) this.fail(`Unexpected "${this.s.slice(this.i, this.i + 12)}"`)
    return e
  }

  fallback(): Expr {
    let l = this.or()
    for (;;) {
      this.ws()
      if (!this.at('??')) return l
      this.i += 2
      l = { k: 'bin', op: '??', l, r: this.or() }
    }
  }

  or(): Expr {
    let l = this.and()
    for (;;) {
      this.ws()
      if (this.word('or')) this.i += 2
      else if (this.at('||')) this.i += 2
      else return l
      l = { k: 'bin', op: 'or', l, r: this.and() }
    }
  }

  and(): Expr {
    let l = this.not()
    for (;;) {
      this.ws()
      if (this.word('and')) this.i += 3
      else if (this.at('&&')) this.i += 2
      else return l
      l = { k: 'bin', op: 'and', l, r: this.not() }
    }
  }

  not(): Expr {
    this.ws()
    if (this.word('not')) {
      this.i += 3
      return { k: 'not', e: this.not() }
    }
    if (this.at('!') && !this.at('!=')) {
      this.i += 1
      return { k: 'not', e: this.not() }
    }
    return this.cmp()
  }

  cmp(): Expr {
    const l = this.filtered()
    this.ws()
    for (const op of ['==', '!=', '>=', '<=', '>', '<'] as const) {
      if (this.at(op)) {
        this.i += op.length
        return { k: 'bin', op, l, r: this.filtered() }
      }
    }
    if (this.word('contains')) {
      this.i += 8
      return { k: 'bin', op: 'contains', l, r: this.filtered() }
    }
    return l
  }

  filtered(): Expr {
    let e = this.primary()
    for (;;) {
      this.ws()
      if (!this.at('|') || this.at('||')) return e
      this.i++
      this.ws()
      IDENT.lastIndex = this.i
      const m = IDENT.exec(this.s)
      if (!m) this.fail('Expected a filter name')
      this.i += m[0].length
      let raw: string | undefined
      if (this.at(':')) {
        this.i++
        raw = this.capture(false)
      }
      e = { k: 'filter', target: e, name: m[0], raw }
    }
  }

  primary(): Expr {
    this.ws()
    const c = this.s[this.i]
    if (c === undefined) this.fail('Expected a value')
    if (c === '"' || c === "'") {
      const end = skipQuoted(this.s, this.i)
      const body = this.s.slice(this.i + 1, end - 1)
      this.i = end
      const v = body.replace(/\\(["'\\nt])/g, (_, ch: string) => (ch === 'n' ? '\n' : ch === 't' ? '\t' : ch))
      return { k: 'lit', v }
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(this.s[this.i + 1] ?? ''))) {
      const m = /-?\d+(?:\.\d+)?/y
      m.lastIndex = this.i
      const r = m.exec(this.s)!
      this.i += r[0].length
      return { k: 'lit', v: Number(r[0]) }
    }
    if (c === '[') {
      this.i++
      const items: Expr[] = []
      this.ws()
      while (!this.at(']')) {
        items.push(this.fallback())
        this.ws()
        if (this.at(',')) {
          this.i++
          this.ws()
        } else if (!this.at(']')) this.fail('Expected "," or "]"')
      }
      this.i++
      return { k: 'array', items }
    }
    if (c === '(') {
      this.i++
      const e = this.fallback()
      this.ws()
      if (!this.at(')')) this.fail('Expected ")"')
      this.i++
      return e
    }
    for (const p of PREFIXES) {
      if (this.s.startsWith(p + ':', this.i)) {
        this.i += p.length + 1
        return { k: 'prefixed', prefix: p, raw: this.capture(true) }
      }
    }
    IDENT.lastIndex = this.i
    const m = IDENT.exec(this.s)
    if (!m) this.fail(`Unexpected "${c}"`)
    this.i += m[0].length
    if (m[0] === 'true') return { k: 'lit', v: true }
    if (m[0] === 'false') return { k: 'lit', v: false }
    if (m[0] === 'null' || m[0] === 'undefined') return { k: 'lit', v: null }
    const segs: Seg[] = []
    for (;;) {
      if (this.at('.')) {
        this.i++
        const n = /[\p{L}\p{N}_$-]+/uy
        n.lastIndex = this.i
        const k = n.exec(this.s)
        if (!k) this.fail('Expected a property name')
        this.i += k[0].length
        segs.push({ k: 'prop', name: k[0] })
      } else if (this.at('[')) {
        this.i++
        const e = this.fallback()
        this.ws()
        if (!this.at(']')) this.fail('Expected "]"')
        this.i++
        segs.push({ k: 'index', e })
      } else break
    }
    return { k: 'path', head: m[0], segs }
  }

  /** Raw text up to the next top-level pipe, `??`, unmatched `)` or end. In a
   *  logic tag, a following operator ends it too. A variable's CSS selector
   *  may hold `>` and spaces, so for those only word operators and `==`-style
   *  comparisons end it. */
  capture(isVariable: boolean): string {
    const start = this.i
    let depth = 0
    const s = this.s
    while (this.i < s.length) {
      const c = s[this.i]!
      if (c === '"' || c === "'") {
        this.i = skipQuoted(s, this.i)
        continue
      }
      if (c === '\\') {
        this.i += 2
        continue
      }
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) break
        depth--
      } else if (depth === 0) {
        if (c === '|' && s[this.i + 1] !== '|') break
        if (c === '?' && s[this.i + 1] === '?') break
        if (this.ctx === 'logic' && /\s/.test(c) && this.operatorAhead(this.i, isVariable)) break
      }
      this.i++
    }
    return s.slice(start, this.i).trim()
  }

  operatorAhead(at: number, isVariable: boolean): boolean {
    let j = at
    while (j < this.s.length && /\s/.test(this.s[j]!)) j++
    const rest = this.s.slice(j)
    if (/^(==|!=|>=|<=|&&|\|\|)/.test(rest)) return true
    if (/^(contains|and|or)(?![\p{L}\p{N}_$])/u.test(rest)) return true
    if (!isVariable && /^[<>](?!=)/.test(rest) && !/^=>/.test(rest)) return true
    return false
  }
}

export function parseExpr(src: string, ctx: Ctx = 'output'): Expr {
  return new ExprParser(src, ctx).parse()
}

/** The prompt text when an output tag is a prompt variable: a quoted string
 *  at the head, optionally filtered. */
function promptOf(e: Expr): string | null {
  let cur = e
  while (cur.k === 'filter') cur = cur.target
  return cur.k === 'lit' && typeof cur.v === 'string' ? cur.v : null
}

type Token =
  | { t: 'text'; v: string }
  | { t: 'out'; v: string; source: string }
  | { t: 'tag'; v: string }

/** Where the tag opened before `from` closes. Quotes inside a tag protect a
 *  closing delimiter; an unbalanced quote is read as a plain character. */
function findClose(src: string, from: number, close: string): number {
  let i = from
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'") {
      const end = skipQuoted(src, i)
      if (end >= src.length) return src.indexOf(close, from)
      i = end
      continue
    }
    if (src.startsWith(close, i)) return i
    i++
  }
  return -1
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let text = ''
  const pushText = () => {
    if (text) tokens.push({ t: 'text', v: text })
    text = ''
  }
  while (i < src.length) {
    const isOut = src.startsWith('{{', i)
    const isTag = src.startsWith('{%', i)
    if (!isOut && !isTag) {
      text += src[i]
      i++
      continue
    }
    const close = isOut ? '}}' : '%}'
    const end = findClose(src, i + 2, close)
    if (end === -1) {
      text += src.slice(i)
      break
    }
    let inner = src.slice(i + 2, end)
    let after = end + 2
    const trimLeft = inner.startsWith('-')
    const trimRight = inner.endsWith('-')
    if (trimLeft) inner = inner.slice(1)
    if (trimRight) inner = inner.slice(0, -1)
    if (trimLeft) text = text.replace(/\s+$/, '')
    if (isTag && !trimLeft && !trimRight) {
      const lineStart = src.lastIndexOf('\n', i - 1) + 1
      const rest = /^[ \t]*(\r?\n|$)/.exec(src.slice(after))
      if (/^[ \t]*$/.test(src.slice(lineStart, i)) && rest) {
        text = text.replace(/[ \t]*$/, '')
        after += rest[0].length
      }
    }
    pushText()
    if (isOut) tokens.push({ t: 'out', v: inner, source: src.slice(i, end + 2) })
    else tokens.push({ t: 'tag', v: inner.trim() })
    if (trimRight) {
      const m = /^\s*/.exec(src.slice(after))
      after += m ? m[0].length : 0
    }
    i = after
  }
  pushText()
  return tokens
}

type Frame =
  | { kind: 'root'; body: Node[] }
  | { kind: 'if'; node: Extract<Node, { k: 'if' }> }
  | { kind: 'for'; node: Extract<Node, { k: 'for' }> }

export function parseTemplate(src: string): Node[] {
  const root: Node[] = []
  const stack: Frame[] = [{ kind: 'root', body: root }]
  const body = (): Node[] => {
    const f = stack[stack.length - 1]!
    if (f.kind === 'root') return f.body
    if (f.kind === 'for') return f.node.body
    return f.node.branches[f.node.branches.length - 1]!.body
  }
  for (const tok of tokenize(src)) {
    if (tok.t === 'text') {
      body().push({ k: 'text', v: tok.v })
      continue
    }
    if (tok.t === 'out') {
      const e = parseExpr(tok.v, 'output')
      body().push({ k: 'out', e, source: tok.source, prompt: promptOf(e) })
      continue
    }
    const m = /^(\w+)\s*([\s\S]*)$/.exec(tok.v)
    if (!m) throw new TemplateSyntaxError(`Empty tag`)
    const [, kw, rest] = m as unknown as [string, string, string]
    switch (kw) {
      case 'if': {
        const node: Extract<Node, { k: 'if' }> = {
          k: 'if',
          branches: [{ cond: parseExpr(rest, 'logic'), body: [] }]
        }
        body().push(node)
        stack.push({ kind: 'if', node })
        break
      }
      case 'elseif':
      case 'elif':
      case 'else': {
        const f = stack[stack.length - 1]!
        if (f.kind !== 'if') throw new TemplateSyntaxError(`{% ${kw} %} outside {% if %}`)
        if (kw === 'else' && /^if\s/.test(rest)) {
          f.node.branches.push({ cond: parseExpr(rest.slice(3), 'logic'), body: [] })
        } else {
          f.node.branches.push({ cond: kw === 'else' ? null : parseExpr(rest, 'logic'), body: [] })
        }
        break
      }
      case 'endif': {
        const f = stack.pop()
        if (!f || f.kind !== 'if') throw new TemplateSyntaxError('{% endif %} without {% if %}')
        break
      }
      case 'for': {
        const fm = /^([\p{L}_$][\p{L}\p{N}_$]*)\s+in\s+([\s\S]+)$/u.exec(rest)
        if (!fm) throw new TemplateSyntaxError(`Expected {% for item in list %}, got {% ${tok.v} %}`)
        const node: Extract<Node, { k: 'for' }> = {
          k: 'for',
          name: fm[1]!,
          iter: parseExpr(fm[2]!, 'logic'),
          body: []
        }
        body().push(node)
        stack.push({ kind: 'for', node })
        break
      }
      case 'endfor': {
        const f = stack.pop()
        if (!f || f.kind !== 'for') throw new TemplateSyntaxError('{% endfor %} without {% for %}')
        break
      }
      case 'set': {
        const sm = /^([\p{L}_$][\p{L}\p{N}_$]*)\s*=\s*([\s\S]+)$/u.exec(rest)
        if (!sm) throw new TemplateSyntaxError(`Expected {% set name = value %}, got {% ${tok.v} %}`)
        body().push({ k: 'set', name: sm[1]!, e: parseExpr(sm[2]!, 'logic') })
        break
      }
      default:
        throw new TemplateSyntaxError(`Unknown tag {% ${kw} %}`)
    }
  }
  if (stack.length > 1) {
    const f = stack[stack.length - 1]!
    throw new TemplateSyntaxError(f.kind === 'if' ? 'Missing {% endif %}' : 'Missing {% endfor %}')
  }
  return root
}
