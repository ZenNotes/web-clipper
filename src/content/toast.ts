import { UI_ATTR } from '../shared/ui-attr'

/** A short notice in the page's corner after a quick clip. */
export function showToast(text: string, tone: 'ok' | 'error'): void {
  document.querySelectorAll('[data-zn-clipper-toast]').forEach((el) => el.remove())
  const host = document.createElement('div')
  host.setAttribute(UI_ATTR, '')
  host.setAttribute('data-zn-clipper-toast', '')
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;'
  const root = host.attachShadow({ mode: 'open' })
  const box = document.createElement('div')
  box.setAttribute('role', tone === 'error' ? 'alert' : 'status')
  box.textContent = text
  box.style.cssText = [
    'font:13px -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif',
    'padding:10px 14px',
    'border-radius:10px',
    'max-width:360px',
    'background:rgb(29 32 33)',
    `color:${tone === 'error' ? 'rgb(234 105 98)' : 'rgb(212 190 152)'}`,
    'box-shadow:0 20px 60px -20px rgb(0 0 0 / .5)'
  ].join(';')
  root.appendChild(box)
  document.documentElement.appendChild(host)
  setTimeout(() => host.remove(), tone === 'error' ? 6000 : 2600)
}
