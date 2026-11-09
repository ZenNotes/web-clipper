// The page highlighter. While it is on, a text selection becomes a
// highlight when the mouse is released or when H or Enter is pressed, a
// click on an image highlights the image, a click on a highlight removes
// it, U undoes the last one and Esc turns the highlighter off. Highlights
// are saved per page (see storage.pageKey) and drawn again on the next
// visit when the content script runs there.
//
// One instance per page, shared by the full content script and the small
// restore script, which both run in the extension's isolated world.

import { UI_ATTR } from '../shared/ui-attr'
import { loadHighlights, saveHighlights } from '../shared/storage'
import type { Highlight } from '../shared/types'
import { anchorFromRange, locate, splitForSpan } from './anchor'

const MARK_ATTR = 'data-zn-hl'
const EL_ATTR = 'data-zn-hl-el'
const STRUCTURAL = new Set(['TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'UL', 'OL', 'DL', 'SELECT'])

const PAGE_CSS = `
mark[${MARK_ATTR}] { background: rgb(216 166 87 / 0.45) !important; color: inherit !important; border-radius: 2px; padding: 0; box-shadow: none; }
[${EL_ATTR}] { outline: 3px solid rgb(216 166 87 / 0.9) !important; outline-offset: 2px; }
html[data-zn-hl-active] mark[${MARK_ATTR}], html[data-zn-hl-active] img { cursor: pointer; }
`

const newId = () => Math.random().toString(36).slice(2, 10)

function editable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

export class Highlighter {
  highlights: Highlight[] = []
  active = false
  private loadedFor = ''
  private toolbar: HTMLElement | null = null
  private countLabel: HTMLElement | null = null
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e)
  private readonly onPointerUp = (e: PointerEvent) => this.handlePointerUp(e)
  private readonly onClick = (e: MouseEvent) => this.handleClick(e)

  constructor(readonly doc: Document = document) {}

  get url(): string {
    return this.doc.location?.href ?? ''
  }

  async load(): Promise<void> {
    if (this.loadedFor === this.url) return
    this.loadedFor = this.url
    this.erase()
    this.highlights = await loadHighlights(this.url)
    this.draw()
  }

  private ensureStyle(): void {
    if (this.doc.getElementById('zn-clipper-hl-style')) return
    const style = this.doc.createElement('style')
    style.id = 'zn-clipper-hl-style'
    style.setAttribute(UI_ATTR, '')
    style.textContent = PAGE_CSS
    ;(this.doc.head ?? this.doc.documentElement).appendChild(style)
  }

  draw(): void {
    if (!this.highlights.length) return
    this.ensureStyle()
    for (const h of this.highlights) this.drawOne(h)
  }

  private drawOne(h: Highlight): void {
    const body = this.doc.body
    if (!body) return
    if (h.kind === 'element') {
      const img = Array.from(this.doc.images).find((i) => i.currentSrc === h.anchor.prefix || i.src === h.anchor.prefix)
      img?.setAttribute(EL_ATTR, h.id)
      return
    }
    const span = locate(body, h.anchor, h.text)
    if (!span) return
    for (const node of splitForSpan(body, span.start, span.end)) {
      const parent = node.parentElement
      if (!parent || (STRUCTURAL.has(parent.tagName) && !node.data.trim())) continue
      const mark = this.doc.createElement('mark')
      mark.setAttribute(MARK_ATTR, h.id)
      parent.insertBefore(mark, node)
      mark.appendChild(node)
    }
  }

  /** Lifts every mark off the page, leaving its text where it was. */
  erase(): void {
    const parents = new Set<Node>()
    this.doc.querySelectorAll(`mark[${MARK_ATTR}]`).forEach((m) => {
      const p = m.parentNode
      if (!p) return
      while (m.firstChild) p.insertBefore(m.firstChild, m)
      p.removeChild(m)
      parents.add(p)
    })
    parents.forEach((p) => p.normalize())
    this.doc.querySelectorAll(`[${EL_ATTR}]`).forEach((el) => el.removeAttribute(EL_ATTR))
  }

  /** Runs `fn` on the page as it is without highlights drawn. */
  withoutMarks<T>(fn: () => T): T {
    this.erase()
    try {
      return fn()
    } finally {
      this.draw()
    }
  }

  private async save(): Promise<void> {
    await saveHighlights(this.url, this.doc.title, this.highlights)
    this.updateCount()
  }

  addSelection(): boolean {
    const sel = this.doc.getSelection()
    const body = this.doc.body
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !body) return false
    const range = sel.getRangeAt(0)
    const anc = range.commonAncestorContainer
    const el = anc.nodeType === 1 ? (anc as Element) : anc.parentElement
    if (!el || el.closest(`[${UI_ATTR}]`) || !body.contains(el)) return false
    const text = range.toString()
    if (!text.trim()) return false
    const anchor = anchorFromRange(body, range)
    if (!anchor) return false
    const box = this.doc.createElement('div')
    box.appendChild(range.cloneContents())
    box.querySelectorAll(`mark[${MARK_ATTR}]`).forEach((m) => m.replaceWith(...Array.from(m.childNodes)))
    const h: Highlight = {
      id: newId(),
      text,
      html: box.innerHTML,
      timestamp: new Date().toISOString(),
      kind: 'text',
      anchor
    }
    // A new highlight over old ones replaces them.
    this.highlights = this.highlights.filter(
      (o) => o.kind !== 'text' || o.anchor.end <= anchor.start || o.anchor.start >= anchor.end
    )
    this.highlights.push(h)
    this.highlights.sort((a, b) => a.anchor.start - b.anchor.start)
    sel.removeAllRanges()
    this.erase()
    this.draw()
    void this.save()
    return true
  }

  addImage(img: HTMLImageElement): void {
    const src = img.currentSrc || img.src
    if (!src) return
    const existing = this.highlights.find((h) => h.kind === 'element' && h.anchor.prefix === src)
    if (existing) {
      this.remove(existing.id)
      return
    }
    this.ensureStyle()
    const h: Highlight = {
      id: newId(),
      text: img.alt || '',
      html: `<img src="${src.replace(/"/g, '&quot;')}" alt="${(img.alt || '').replace(/"/g, '&quot;')}">`,
      timestamp: new Date().toISOString(),
      kind: 'element',
      anchor: { start: -1, end: -1, prefix: src, suffix: '' }
    }
    this.highlights.push(h)
    img.setAttribute(EL_ATTR, h.id)
    void this.save()
  }

  remove(id: string): void {
    this.highlights = this.highlights.filter((h) => h.id !== id)
    this.erase()
    this.draw()
    void this.save()
  }

  undo(): void {
    const last = [...this.highlights].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
    if (last) this.remove(last.id)
  }

  clear(): void {
    this.highlights = []
    this.erase()
    void this.save()
  }

  toggle(): boolean {
    this.setActive(!this.active)
    return this.active
  }

  setActive(on: boolean): void {
    if (on === this.active) return
    this.active = on
    const win = this.doc.defaultView
    if (!win) return
    if (on) {
      this.ensureStyle()
      this.doc.documentElement.setAttribute('data-zn-hl-active', '')
      win.addEventListener('keydown', this.onKey, true)
      win.addEventListener('pointerup', this.onPointerUp, true)
      win.addEventListener('click', this.onClick, true)
      this.showToolbar()
      // A selection made before turning the highlighter on is taken at once.
      this.addSelection()
    } else {
      this.doc.documentElement.removeAttribute('data-zn-hl-active')
      win.removeEventListener('keydown', this.onKey, true)
      win.removeEventListener('pointerup', this.onPointerUp, true)
      win.removeEventListener('click', this.onClick, true)
      this.toolbar?.remove()
      this.toolbar = null
    }
  }

  private handleKey(e: KeyboardEvent): void {
    if (editable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
    const key = e.key.toLowerCase()
    if (e.key === 'Escape') this.setActive(false)
    else if ((key === 'h' || e.key === 'Enter') && this.addSelection()) {
      /* taken */
    } else if (key === 'u') this.undo()
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  private handlePointerUp(e: PointerEvent): void {
    if ((e.target as Element | null)?.closest?.(`[${UI_ATTR}]`)) return
    setTimeout(() => this.addSelection(), 0)
  }

  private handleClick(e: MouseEvent): void {
    const target = e.target as Element | null
    if (!target || target.closest(`[${UI_ATTR}]`)) return
    const sel = this.doc.getSelection()
    if (sel && !sel.isCollapsed) return
    const mark = target.closest(`mark[${MARK_ATTR}]`)
    if (mark) {
      e.preventDefault()
      e.stopPropagation()
      this.remove(mark.getAttribute(MARK_ATTR)!)
      return
    }
    if (target instanceof HTMLImageElement) {
      e.preventDefault()
      e.stopPropagation()
      this.addImage(target)
    }
  }

  private updateCount(): void {
    if (this.countLabel) {
      const n = this.highlights.length
      this.countLabel.textContent = n === 1 ? '1 highlight' : `${n} highlights`
    }
  }

  private showToolbar(): void {
    const host = this.doc.createElement('div')
    host.setAttribute(UI_ATTR, '')
    host.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483647;'
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = `
      <style>
        .bar { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:10px;
          font:13px -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif;
          background: rgb(29 32 33); color: rgb(212 190 152); box-shadow: 0 20px 60px -20px rgb(0 0 0 / .5); }
        .dot { width:8px; height:8px; border-radius:50%; background: rgb(216 166 87); }
        .hint { color: rgb(146 131 116); }
        kbd { font: 11px "JetBrains Mono","SF Mono",Menlo,monospace; border:1px solid rgb(80 73 69); border-radius:4px; padding:0 4px; }
        button { font: inherit; color: inherit; background: rgb(60 56 54); border: 0; border-radius: 6px; padding: 3px 8px; cursor: pointer; }
        button:focus-visible { outline: 2px solid rgb(231 138 78); }
      </style>
      <div class="bar" role="status">
        <span class="dot"></span>
        <span class="count"></span>
        <span class="hint">Select text, then <kbd>H</kbd>. <kbd>U</kbd> undo, <kbd>Esc</kbd> done</span>
        <button type="button" data-act="clear">Clear</button>
        <button type="button" data-act="done">Done</button>
      </div>`
    root.querySelector('[data-act="clear"]')!.addEventListener('click', () => this.clear())
    root.querySelector('[data-act="done"]')!.addEventListener('click', () => this.setActive(false))
    this.countLabel = root.querySelector('.count')
    this.doc.documentElement.appendChild(host)
    this.toolbar = host
    this.updateCount()
  }
}

const KEY = '__zennotesClipperHighlighter'

export function getHighlighter(): Highlighter {
  const g = globalThis as unknown as Record<string, Highlighter | undefined>
  if (!g[KEY]) g[KEY] = new Highlighter(document)
  return g[KEY]!
}
