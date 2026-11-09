import { fakeStore } from './fake-ext'
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { anchorFromRange, indexText, locate } from '../src/highlight/anchor'
import { drawable, Highlighter } from '../src/highlight/highlighter'
import { fixtureDom } from './helpers'
import { extractPage } from '../src/extract/extract'
import { loadHighlights, pageKey } from '../src/shared/storage'

const HTML = `<body><article><h1>Title</h1><p>The quick <em>brown</em> fox jumps over the lazy dog.</p>
<p>Second paragraph with a quick fox too.</p><script>var no = "quick"</script></article></body>`

function setup(url = 'https://hl.test/page?utm_source=x#frag') {
  const dom = new JSDOM(HTML, { url, pretendToBeVisual: true })
  ;(globalThis as unknown as { document: Document }).document = dom.window.document
  return dom
}

function select(dom: JSDOM, text: string, nth = 0) {
  const doc = dom.window.document
  const idx = indexText(doc.body)
  let at = -1
  for (let i = 0; i <= nth; i++) at = idx.text.indexOf(text, at + 1)
  // Map back to (node, offset) pairs.
  const find = (off: number) => {
    for (let i = idx.nodes.length - 1; i >= 0; i--) if (idx.starts[i]! <= off) return [idx.nodes[i]!, off - idx.starts[i]!] as const
    throw new Error('offset')
  }
  const [sn, so] = find(at)
  const [en, eo] = find(at + text.length)
  const range = doc.createRange()
  range.setStart(sn, so)
  range.setEnd(en, eo)
  const sel = dom.window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  return range
}

describe('anchors', () => {
  it('skips scripts and survives marks', () => {
    const dom = setup()
    const range = select(dom, 'quick brown fox')
    const anchor = anchorFromRange(dom.window.document.body, range)!
    expect(indexText(dom.window.document.body).text.slice(anchor.start, anchor.end)).toBe('quick brown fox')
    expect(indexText(dom.window.document.body).text).not.toContain('var no')
  })

  it('finds a highlight again after the page shifts, by its surroundings', () => {
    const dom = setup()
    const body = dom.window.document.body
    const anchor = anchorFromRange(body, select(dom, 'quick fox', 0))!
    body.querySelector('article')!.insertAdjacentHTML('afterbegin', '<p>New intro with a quick fox.</p>')
    const span = locate(body, anchor, 'quick fox')!
    const text = indexText(body).text
    expect(text.slice(span.start - 7, span.end)).toBe('with a quick fox')
    expect(text.slice(span.end, span.end + 4)).toBe(' too')
  })
})

describe('Highlighter', () => {
  it('saves a selection, draws it, and lifts it off on demand', async () => {
    const dom = setup()
    const doc = dom.window.document
    const hl = new Highlighter(doc)
    await hl.load()
    select(dom, 'brown fox jumps')
    expect(hl.addSelection()).toBe(true)
    const marks = doc.querySelectorAll('mark[data-zn-hl]')
    expect(Array.from(marks).map((m) => m.textContent).join('')).toBe('brown fox jumps')
    expect(doc.querySelector('em mark')).not.toBeNull()

    await new Promise((r) => setTimeout(r, 0))
    const saved = await loadHighlights('https://hl.test/page')
    expect(saved).toHaveLength(1)
    expect(saved[0]!.text).toBe('brown fox jumps')
    expect(saved[0]!.html).toBe('<em>brown</em> fox jumps')
    expect(fakeStore.has('hl:' + pageKey('https://hl.test/page'))).toBe(true)

    const page = hl.withoutMarks(() => extractPage(doc, { url: doc.location.href, highlights: hl.highlights, contentMode: 'nothing' }))
    expect(page.content).not.toContain('==')
    expect(doc.querySelectorAll('mark[data-zn-hl]').length).toBeGreaterThan(0)
  })

  it('draws saved highlights on a fresh visit and removes them', async () => {
    const dom = setup()
    const doc = dom.window.document
    const hl = new Highlighter(doc)
    await hl.load()
    expect(hl.highlights).toHaveLength(1)
    expect(Array.from(doc.querySelectorAll('mark[data-zn-hl]')).map((m) => m.textContent).join('')).toBe('brown fox jumps')
    hl.remove(hl.highlights[0]!.id)
    expect(doc.querySelectorAll('mark[data-zn-hl]').length).toBe(0)
    expect(doc.body.textContent).toContain('The quick brown fox jumps over the lazy dog.')
  })

  it('takes keys only while on, and Esc turns it off', async () => {
    const dom = setup('https://hl.test/keys')
    const doc = dom.window.document
    const hl = new Highlighter(doc)
    await hl.load()
    hl.setActive(true)
    expect(doc.querySelector('[data-zn-clipper-ui]')).not.toBeNull()
    select(dom, 'lazy dog')
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    expect(hl.highlights.map((h) => h.text)).toEqual(['lazy dog'])
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'u', bubbles: true }))
    expect(hl.highlights).toHaveLength(0)
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(hl.active).toBe(false)
    expect(doc.querySelector('[data-zn-clipper-ui] .bar')).toBeNull()
  })
})

describe('highlights on a grid layout', () => {
  // zennotes.org's features grid: a drag that ended just past the lede took
  // the whitespace before the first card, and its <mark> became a grid item
  // that filled a whole cell with the highlight color.
  it('never wraps whitespace that a grid or flex box would turn into a box', async () => {
    const dom = fixtureDom('landing.html', 'https://landing.test/#features')
    ;(globalThis as unknown as { document: Document }).document = dom.window.document
    const doc = dom.window.document
    const hl = new Highlighter(doc)
    await hl.load()
    const range = doc.createRange()
    range.setStart(doc.querySelector('.section-lede')!.firstChild!, 0)
    range.setEnd(doc.querySelector('.card h4')!.firstChild!, 3)
    dom.window.getSelection()!.removeAllRanges()
    dom.window.getSelection()!.addRange(range)
    expect(hl.addSelection()).toBe(true)

    const marks = Array.from(doc.querySelectorAll('mark[data-zn-hl]'))
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.map((m) => m.textContent).join('')).toContain('One keyboard-first app')
    expect(marks.map((m) => m.textContent).join('')).toContain('Pla')
    for (const m of marks) {
      expect(m.textContent!.trim(), 'a whitespace-only mark').not.toBe('')
      const display = dom.window.getComputedStyle(m.parentElement!).display
      expect(display, `mark inside ${m.parentElement!.className}`).not.toMatch(/grid|flex/)
    }
    // The grid still has exactly its three cards as children.
    expect(Array.from(doc.querySelector('.bento')!.children).map((c) => c.tagName)).toEqual(['ARTICLE', 'ARTICLE', 'ARTICLE'])
  })

  it('keeps a space between inline words but not between blocks', () => {
    const dom = new JSDOM('<body><p><b>a</b> <i>b</i></p><div><p>x</p> <p>y</p></div></body>')
    const doc = dom.window.document
    const inlineGap = doc.querySelector('p')!.childNodes[1] as Text
    const blockGap = doc.querySelector('div')!.childNodes[1] as Text
    expect(drawable(inlineGap)).toBe(true)
    expect(drawable(blockGap)).toBe(false)
  })
})
