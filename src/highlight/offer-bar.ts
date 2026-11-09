// The one-time offer, shown in the page right after the first highlight is
// saved. It takes focus so Enter accepts and Esc dismisses, and gives focus
// back when it closes. Left alone it goes away after a while, which counts
// as Not now.

import { UI_ATTR } from '../shared/ui-attr'

export const OFFER_ATTR = 'data-zn-offer'
const TIMEOUT_MS = 30_000

export type OfferAnswer = 'accept' | 'dismiss'

export function offerBarOpen(doc: Document = document): boolean {
  return !!doc.querySelector(`[${OFFER_ATTR}]`)
}

export function showOfferBar(doc: Document = document, timeoutMs = TIMEOUT_MS): Promise<OfferAnswer> {
  doc.querySelectorAll(`[${OFFER_ATTR}]`).forEach((el) => el.remove())
  const before = doc.activeElement as HTMLElement | null
  const host = doc.createElement('div')
  host.setAttribute(UI_ATTR, '')
  host.setAttribute(OFFER_ATTR, '')
  host.style.cssText = 'position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:2147483647;'
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      .bar { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:10px;
        font:13px -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif;
        background: rgb(29 32 33); color: rgb(212 190 152); box-shadow: 0 20px 60px -20px rgb(0 0 0 / .5); }
      button { font: inherit; color: inherit; background: rgb(60 56 54); border: 0; border-radius: 6px; padding: 3px 8px; cursor: pointer; }
      button.primary { background: rgb(231 138 78); color: rgb(29 32 33); font-weight: 600; }
      button:focus-visible { outline: 2px solid rgb(231 138 78); outline-offset: 2px; }
      kbd { font: 11px "JetBrains Mono","SF Mono",Menlo,monospace; border:1px solid rgb(80 73 69); border-radius:4px; padding:0 4px; }
    </style>
    <div class="bar" role="dialog" aria-label="Show highlights on return">
      <span>Highlights are saved. Show them when you come back?</span>
      <button type="button" class="primary" data-act="accept">Show them <kbd>Enter</kbd></button>
      <button type="button" data-act="dismiss">Not now <kbd>Esc</kbd></button>
    </div>`
  doc.documentElement.appendChild(host)

  return new Promise<OfferAnswer>((resolve) => {
    let done = false
    const finish = (answer: OfferAnswer) => {
      if (done) return
      done = true
      clearTimeout(timer)
      host.remove()
      if (before && before !== doc.body && doc.contains(before)) before.focus?.()
      resolve(answer)
    }
    const timer = setTimeout(() => finish('dismiss'), timeoutMs)
    root.querySelector('[data-act="accept"]')!.addEventListener('click', () => finish('accept'))
    root.querySelector('[data-act="dismiss"]')!.addEventListener('click', () => finish('dismiss'))
    root.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent
      if (ev.key === 'Enter') finish(ev.target instanceof Element && ev.target.getAttribute('data-act') === 'dismiss' ? 'dismiss' : 'accept')
      else if (ev.key === 'Escape') finish('dismiss')
      else return
      ev.preventDefault()
      ev.stopPropagation()
    })
    ;(root.querySelector('[data-act="accept"]') as HTMLElement).focus()
  })
}
