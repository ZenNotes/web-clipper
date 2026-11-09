import './fake-ext'
import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { acceptOffer, decideOffer, PAGE_ORIGINS, restoreMatches } from '../src/highlight/offer'
import { offerBarOpen, showOfferBar } from '../src/highlight/offer-bar'
import { Highlighter } from '../src/highlight/highlighter'
import { defaultSettings } from '../src/shared/defaults'
import { mergeSettings } from '../src/shared/storage'

describe('the one-time offer', () => {
  it('is offered the first time, and recording that ends it', () => {
    const first = decideOffer(defaultSettings(), false)
    expect(first.offer).toBe(true)
    expect(first.next!.highlighter.restoreOffered).toBe(true)
    expect(first.next!.highlighter.restoreOnVisit).toBe(false)
    // Not now, or no answer at all, leaves exactly that saved state.
    const second = decideOffer(first.next!, false)
    expect(second).toEqual({ offer: false, next: null })
  })

  it('is not offered when highlights already show or access is granted', () => {
    const on = defaultSettings()
    on.highlighter.restoreOnVisit = true
    expect(decideOffer(on, false).offer).toBe(false)
    expect(decideOffer(defaultSettings(), true).offer).toBe(false)
  })

  it('turns the setting on when accepted', () => {
    const s = acceptOffer(defaultSettings())
    expect(s.highlighter).toMatchObject({ restoreOnVisit: true, restoreOffered: true })
  })

  it('is still owed to people whose settings predate it', () => {
    const s = mergeSettings({ highlighter: { contentMode: 'highlight', restoreOnVisit: false } })
    expect(s.highlighter.restoreOffered).toBe(false)
    expect(decideOffer(s, false).offer).toBe(true)
  })

  it('draws on every site once broad access is granted, else on the sites granted', () => {
    expect(restoreMatches([...PAGE_ORIGINS, 'https://api.anthropic.com/*'])).toEqual(PAGE_ORIGINS)
    expect(restoreMatches(['<all_urls>'])).toEqual(PAGE_ORIGINS)
    expect(restoreMatches(['http://127.0.0.1/*', 'chrome://favicon/*'])).toEqual(['http://127.0.0.1/*'])
    expect(restoreMatches([])).toEqual([])
  })
})

describe('the offer bar', () => {
  function page() {
    const dom = new JSDOM('<body><p>Some text to highlight in a page.</p><input id="i"></body>', {
      url: 'https://offer.test/a',
      pretendToBeVisual: true
    })
    ;(globalThis as unknown as { document: Document }).document = dom.window.document
    return dom
  }
  const bar = (doc: Document) => doc.querySelector('[data-zn-offer]')!.shadowRoot!

  it('takes focus; Enter accepts and gives focus back', async () => {
    const dom = page()
    const doc = dom.window.document
    const input = doc.getElementById('i') as HTMLInputElement
    input.focus()
    const answer = showOfferBar(doc)
    expect(offerBarOpen(doc)).toBe(true)
    const accept = bar(doc).querySelector('[data-act="accept"]') as HTMLElement
    expect(bar(doc).activeElement).toBe(accept)
    accept.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }))
    expect(await answer).toBe('accept')
    expect(offerBarOpen(doc)).toBe(false)
    expect(doc.activeElement).toBe(input)
  })

  it('Esc dismisses, and so does leaving it alone', async () => {
    const dom = page()
    const doc = dom.window.document
    const answer = showOfferBar(doc)
    bar(doc).querySelector('[data-act="accept"]')!.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })
    )
    expect(await answer).toBe('dismiss')
    expect(await showOfferBar(doc, 10)).toBe('dismiss')
    expect(offerBarOpen(doc)).toBe(false)
  })

  it("owns Enter and Esc while open, so the highlighter's keys do not fire", async () => {
    const dom = page()
    const doc = dom.window.document
    const hl = new Highlighter(doc)
    await hl.load()
    hl.setActive(true)
    const answer = showOfferBar(doc)
    const accept = bar(doc).querySelector('[data-act="accept"]')!
    accept.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }))
    expect(await answer).toBe('dismiss')
    expect(hl.active).toBe(true)
    hl.setActive(false)
  })

  it('reports each added highlight once to its listener', async () => {
    const dom = page()
    const doc = dom.window.document
    const hl = new Highlighter(doc)
    await hl.load()
    let calls = 0
    hl.onAdded = () => calls++
    const range = doc.createRange()
    range.selectNodeContents(doc.querySelector('p')!)
    dom.window.getSelection()!.addRange(range)
    expect(hl.addSelection()).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toBe(1)
  })
})
