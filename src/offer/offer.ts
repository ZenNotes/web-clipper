// The one question the in-page offer cannot ask itself: a site access
// request must come from a click or key in an extension page. Enter (or the
// button) asks, Esc closes. On a grant the setting turns on, the restore
// script registers, and the page the offer came from draws its highlights.

import '../styles/index.css'
import { acceptOffer, PAGE_ORIGINS } from '../highlight/offer'
import { ext } from '../shared/ext'
import { loadSettings, saveSettings } from '../shared/storage'

const tab = new URLSearchParams(location.search).get('tab')
const tabId = tab && /^\d+$/.test(tab) ? Number(tab) : undefined
const yes = document.getElementById('yes') as HTMLButtonElement
const no = document.getElementById('no') as HTMLButtonElement
const status = document.getElementById('status')!
let busy = false

function accept(): void {
  if (busy) return
  busy = true
  // Asked first, inside the gesture: an await before it would lose the gesture.
  const asked = ext.permissions.request({ origins: PAGE_ORIGINS })
  void (async () => {
    let granted = false
    try {
      granted = await asked
    } catch {
      granted = false
    }
    if (!granted) {
      status.textContent = 'Not turned on. It stays in Settings, Highlighter.'
      setTimeout(() => window.close(), 2500)
      return
    }
    await saveSettings(acceptOffer(await loadSettings()))
    await ext.runtime.sendMessage({ type: 'zn:restore-now', tabId }).catch(() => undefined)
    status.textContent = 'On. Highlights will show when you come back.'
    setTimeout(() => window.close(), 600)
  })()
}

yes.addEventListener('click', accept)
no.addEventListener('click', () => window.close())
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    window.close()
  } else if (e.key === 'Enter' && document.activeElement !== no) {
    e.preventDefault()
    accept()
  }
})
yes.focus()
