// Reader view: the page's main content, extracted with Defuddle, laid over
// the page in a shadow root with ZenNotes' type and colors. Esc closes it,
// `-` and `=` change the text size, `o` focuses the outline, and the
// article scrolls with the usual keys because it holds focus.

import DOMPurify from 'dompurify'
import Defuddle from 'defuddle/full'
import { UI_ATTR } from '../shared/ui-attr'
import type { Settings } from '../shared/types'

const LIGHT = {
  bg: '251 241 199',
  bg1: '242 229 188',
  bg2: '229 213 173',
  fg: '80 73 69',
  fg1: '60 56 54',
  grey: '124 111 100',
  accent: '195 94 10'
}
const DARK = {
  bg: '29 32 33',
  bg1: '50 48 47',
  bg2: '60 56 54',
  fg: '212 190 152',
  fg1: '221 199 161',
  grey: '146 131 116',
  accent: '231 138 78'
}

const FONTS: Record<Settings['reader']['font'], string> = {
  sans: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif',
  serif: '"Iowan Old Style","Source Serif Pro",Georgia,serif',
  mono: '"JetBrains Mono","SF Mono",Menlo,monospace'
}

function palette(appearance: Settings['reader']['appearance'], win: Window): typeof LIGHT {
  if (appearance === 'dark') return DARK
  if (appearance === 'light') return LIGHT
  return win.matchMedia?.('(prefers-color-scheme: dark)').matches ? DARK : LIGHT
}

function css(r: Settings['reader'], p: typeof LIGHT): string {
  return `
:host { all: initial; }
.wrap { position: fixed; inset: 0; z-index: 2147483646; overflow: auto; background: rgb(${p.bg});
  color: rgb(${p.fg}); font-family: ${FONTS[r.font]}; font-size: ${r.fontSize}px; line-height: ${r.lineHeight}; outline: none; }
.top { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 20px; background: rgb(${p.bg} / 0.92); backdrop-filter: blur(12px);
  font: 12px -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif; color: rgb(${p.grey}); z-index: 2; }
.top button { font: inherit; color: rgb(${p.fg}); background: rgb(${p.bg2}); border: 0; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.top button:focus-visible, .outline a:focus-visible { outline: 2px solid rgb(${p.accent}); outline-offset: 2px; }
kbd { font: 11px "JetBrains Mono","SF Mono",Menlo,monospace; border: 1px solid rgb(${p.bg2}); border-radius: 4px; padding: 0 4px; }
.layout { display: flex; justify-content: center; gap: 48px; padding: 32px 20px 120px; }
.outline { position: sticky; top: 64px; align-self: flex-start; width: 220px; max-height: calc(100vh - 96px); overflow: auto;
  font: 13px -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif; }
.outline a { display: block; color: rgb(${p.grey}); text-decoration: none; padding: 3px 0; }
.outline a:hover { color: rgb(${p.fg}); }
.outline .h3 { padding-left: 12px; }
@media (max-width: 1100px) { .outline { display: none; } }
@media (hover: none) and (pointer: coarse) { .keys { display: none; } }
article { width: 100%; max-width: ${r.maxWidth}px; }
h1.title { font-size: 2em; line-height: 1.2; margin: 0 0 .4em; color: rgb(${p.fg1}); }
.byline { font: 13px -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif; color: rgb(${p.grey}); margin-bottom: 2em; }
article h1, article h2, article h3, article h4 { color: rgb(${p.fg1}); line-height: 1.3; margin: 1.6em 0 .6em; }
article p, article ul, article ol, article blockquote, article pre, article figure, article table { margin: 0 0 1em; }
article a { color: rgb(${p.accent}); }
article img, article video { max-width: 100%; height: auto; border-radius: 6px; }
article blockquote { border-left: 3px solid rgb(${p.bg2}); margin-left: 0; padding-left: 1em; color: rgb(${p.grey}); }
article pre { background: rgb(${p.bg1}); padding: 12px 14px; border-radius: 8px; overflow: auto; font: 0.8em/1.5 "JetBrains Mono","SF Mono",Menlo,monospace; }
article code { font-family: "JetBrains Mono","SF Mono",Menlo,monospace; font-size: .85em; background: rgb(${p.bg1}); padding: 1px 4px; border-radius: 4px; }
article pre code { background: none; padding: 0; }
article table { border-collapse: collapse; width: 100%; font-size: .9em; }
article th, article td { border: 1px solid rgb(${p.bg2}); padding: 6px 8px; text-align: left; }
article mark { background: rgb(216 166 87 / 0.45); color: inherit; }
article hr { border: 0; border-top: 1px solid rgb(${p.bg2}); margin: 2em 0; }
${r.customCss}
`
}

export class ReaderView {
  private host: HTMLElement | null = null
  private savedOverflow = ''
  private size = 0

  constructor(readonly doc: Document = document) {}

  get active(): boolean {
    return this.host !== null
  }

  toggle(settings: Settings): boolean {
    if (this.host) this.close()
    else this.open(settings)
    return this.active
  }

  close(): void {
    this.host?.remove()
    this.host = null
    this.doc.documentElement.style.overflow = this.savedOverflow
  }

  open(settings: Settings): void {
    const win = this.doc.defaultView
    if (!win || this.host) return
    let result: ReturnType<Defuddle['parse']>
    try {
      result = new Defuddle(this.doc, { url: this.doc.location.href, useAsync: false }).parse()
    } catch {
      return
    }
    const r = settings.reader
    this.size = r.fontSize
    const p = palette(r.appearance, win)
    const host = this.doc.createElement('div')
    host.setAttribute(UI_ATTR, '')
    const root = host.attachShadow({ mode: 'open' })
    const style = this.doc.createElement('style')
    style.textContent = css(r, p)
    root.appendChild(style)

    const wrap = this.doc.createElement('div')
    wrap.className = 'wrap'
    wrap.tabIndex = -1
    wrap.setAttribute('role', 'document')

    const top = this.doc.createElement('div')
    top.className = 'top'
    const site = this.doc.createElement('span')
    site.textContent = [result.site, result.domain].filter(Boolean).join(' · ')
    const right = this.doc.createElement('span')
    right.innerHTML = '<span class="keys"><kbd>-</kbd> <kbd>=</kbd> size &nbsp; <kbd>O</kbd> outline &nbsp; </span>'
    const close = this.doc.createElement('button')
    close.type = 'button'
    close.textContent = win.matchMedia?.('(hover: none) and (pointer: coarse)').matches ? 'Close' : 'Close (Esc)'
    close.addEventListener('click', () => this.close())
    right.appendChild(close)
    top.append(site, right)

    const layout = this.doc.createElement('div')
    layout.className = 'layout'
    const article = this.doc.createElement('article')
    const h1 = this.doc.createElement('h1')
    h1.className = 'title'
    h1.textContent = result.title || this.doc.title
    const byline = this.doc.createElement('div')
    byline.className = 'byline'
    byline.textContent = [result.author, result.published?.slice(0, 10), result.domain].filter(Boolean).join(' · ')
    const body = this.doc.createElement('div')
    body.innerHTML = DOMPurify.sanitize(result.content, { FORBID_TAGS: ['style', 'form', 'input', 'button'] })
    article.append(h1, byline, body)

    const nav = this.doc.createElement('nav')
    nav.className = 'outline'
    nav.setAttribute('aria-label', 'Outline')
    const heads = Array.from(body.querySelectorAll('h2, h3'))
    heads.forEach((h, i) => {
      const id = `zn-reader-h-${i}`
      h.id = id
      const a = this.doc.createElement('a')
      a.href = `#${id}`
      a.className = h.tagName === 'H3' ? 'h3' : 'h2'
      a.textContent = h.textContent?.trim() ?? ''
      a.addEventListener('click', (e) => {
        e.preventDefault()
        h.scrollIntoView({ block: 'start' })
        wrap.focus({ preventScroll: true })
      })
      nav.appendChild(a)
    })
    layout.append(heads.length > 1 ? nav : this.doc.createElement('span'), article)
    wrap.append(top, layout)
    root.appendChild(wrap)

    wrap.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') this.close()
      else if (e.key === '-' || e.key === '=' || e.key === '+') {
        this.size = Math.min(32, Math.max(12, this.size + (e.key === '-' ? -1 : 1)))
        wrap.style.fontSize = `${this.size}px`
      } else if (e.key.toLowerCase() === 'o') {
        ;(nav.querySelector('a') as HTMLElement | null)?.focus()
      } else return
      e.preventDefault()
      e.stopPropagation()
    })

    this.savedOverflow = this.doc.documentElement.style.overflow
    this.doc.documentElement.style.overflow = 'hidden'
    this.doc.documentElement.appendChild(host)
    this.host = host
    wrap.focus()
  }
}

const KEY = '__zennotesClipperReader'

export function getReader(): ReaderView {
  const g = globalThis as unknown as Record<string, ReaderView | undefined>
  if (!g[KEY]) g[KEY] = new ReaderView(document)
  return g[KEY]!
}
