// End-to-end check in Chrome for Testing: loads dist/chrome-e2e unpacked in
// a scratch profile, serves the fixture pages on 127.0.0.1, clips one from
// the popup (Mod+Enter) and once by quick clip, and checks each link against
// the clipboard text's SHA-256. Also turns on reader view and makes a
// highlight, and saves screenshots.
//
// It never opens a zennotes:// link: tabs.update is replaced in every
// extension context before a clip, and the profile blocks the scheme, so
// nothing can reach an installed ZenNotes app or its vault.
//
//   npm run build -- --e2e && node scripts/e2e-chrome.mjs [--headed] [--out <dir>]
//   CHROME_PATH=/path/to/chrome overrides the Chrome for Testing lookup.

import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// ZN_DIST points at another build folder, as in scripts/build.mjs.
const extDir = resolve(root, process.env.ZN_DIST ?? 'dist', 'chrome-e2e')
const headed = process.argv.includes('--headed')
const outArg = process.argv.indexOf('--out')
const outDir = outArg > 0 ? resolve(process.argv[outArg + 1]) : mkdtempSync(join(tmpdir(), 'zn-clipper-e2e-out-'))
mkdirSync(outDir, { recursive: true })

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const base = join(homedir(), 'Library/Caches/ms-playwright')
  const dirs = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : []
  for (const d of dirs) {
    for (const arch of ['chrome-mac-arm64', 'chrome-mac', 'chrome-mac-x64']) {
      const p = join(base, d, arch, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
      if (existsSync(p)) return p
    }
  }
  throw new Error('Chrome for Testing not found; set CHROME_PATH')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
  if (!ok) failures++
}

function pbpaste() {
  try {
    return execFileSync('pbpaste', { encoding: 'utf8' })
  } catch {
    return null
  }
}

// ---- fixture server ----
const pages = resolve(root, 'test/fixtures/pages')
const server = createServer((req, res) => {
  const name = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'article.html'
  const file = join(pages, name)
  if (!file.startsWith(pages) || !existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const origin = `http://127.0.0.1:${port}`

// ---- scratch profile with the zennotes scheme blocked ----
const profile = mkdtempSync(join(tmpdir(), 'zn-clipper-chrome-'))
mkdirSync(join(profile, 'Default'), { recursive: true })
writeFileSync(
  join(profile, 'Default/Preferences'),
  JSON.stringify({ protocol_handler: { excluded_schemes: { zennotes: true } } })
)

const clipboardBefore = pbpaste()
const chrome = spawn(
  findChrome(),
  [
    ...(headed ? [] : ['--headless=new']),
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    `--load-extension=${extDir}`,
    `--disable-extensions-except=${extDir}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--window-size=1280,900',
    'about:blank'
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
)
let stderr = ''
chrome.stderr.on('data', (d) => (stderr += d))

async function devtoolsUrl() {
  for (let i = 0; i < 100; i++) {
    const f = join(profile, 'DevToolsActivePort')
    if (existsSync(f)) {
      const [p, path] = readFileSync(f, 'utf8').trim().split('\n')
      return `ws://127.0.0.1:${p}${path}`
    }
    await sleep(100)
  }
  throw new Error(`Chrome did not start:\n${stderr.slice(-2000)}`)
}

// ---- minimal CDP client ----
const ws = new WebSocket(await devtoolsUrl())
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = j
})
let nextId = 1
const pending = new Map()
const listeners = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve: res, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : res(msg.result)
  } else listeners.forEach((l) => l(msg))
}
function cdp(method, params = {}, sessionId) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  return new Promise((res, reject) => pending.set(id, { resolve: res, reject }))
}
async function evaluate(sessionId, expression, opts = {}) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...opts }, sessionId)
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
async function attach(targetId) {
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  await cdp('Runtime.enable', {}, sessionId)
  return sessionId
}
async function waitFor(fn, label, ms = 15000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn().catch(() => null)
    if (v) return v
    if (Date.now() > end) throw new Error(`Timed out waiting for ${label}`)
    await sleep(150)
  }
}

const STUB_LINKS = `
  globalThis.__znLinks = globalThis.__znLinks || [];
  chrome.tabs.update = async (tabId, props) => { globalThis.__znLinks.push(props.url); return { id: tabId }; };
  true`

try {
  // Our service worker, told apart from Chrome's own component extensions
  // by its manifest.
  let swSession = null
  const sw = await waitFor(async () => {
    const { targetInfos } = await cdp('Target.getTargets')
    for (const t of targetInfos.filter((x) => x.type === 'service_worker' && x.url.startsWith('chrome-extension://'))) {
      const s = await attach(t.targetId)
      const name = await evaluate(s, 'chrome.runtime.getManifest().name').catch(() => null)
      if (name === 'ZenNotes Web Clipper') {
        swSession = s
        return t
      }
      await cdp('Target.detachFromTarget', { sessionId: s })
    }
    return null
  }, 'the extension service worker')
  const extId = new URL(sw.url).host
  check('extension loaded', true, extId)
  await evaluate(swSession, STUB_LINKS)

  // The page to clip.
  const { targetId: pageTarget } = await cdp('Target.createTarget', { url: `${origin}/article.html?utm_source=e2e` })
  const pageSession = await attach(pageTarget)
  await waitFor(() => evaluate(pageSession, 'document.readyState === "complete"'), 'the fixture page')
  const tabId = await waitFor(
    () =>
      evaluate(
        swSession,
        `chrome.tabs.query({}).then(ts => ts.find(t => (t.url || t.pendingUrl || '').startsWith('${origin}/article.html'))?.id)`
      ),
    'the fixture tab',
    5000
  ).catch(async (err) => {
    console.log('     tabs:', JSON.stringify(await evaluate(swSession, 'chrome.tabs.query({})')))
    throw err
  })

  // ---- popup clip ----
  const extOrigin = `chrome-extension://${extId}`
  await cdp('Browser.grantPermissions', { origin: extOrigin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] })
  const { targetId: popupTarget } = await cdp('Target.createTarget', { url: `${extOrigin}/popup/popup.html?tab=${tabId}` })
  const popup = await attach(popupTarget)
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true }, popup)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 440, height: 600, deviceScaleFactor: 2, mobile: false }, popup)
  await evaluate(popup, STUB_LINKS + '; window.close = () => { globalThis.__znClosed = true }; true')
  const name = await waitFor(() => evaluate(popup, `document.querySelector('#zn-name')?.value`), 'the popup to read the page')
  const folder = await evaluate(popup, `document.querySelector('#zn-folder').value`)
  const body = await evaluate(popup, `document.querySelector('textarea[aria-label="Note content"]').value`)
  check('popup note name', name === 'Plain Text Notes Last Forever', name)
  check('popup location', folder === 'Clippings', folder)
  check('popup content is the article', body.includes('## Files outlive formats') && !body.includes('Related posts'))
  writeFileSync(join(outDir, 'popup.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, popup)).data, 'base64'))

  // Mod+Enter, as a trusted key event.
  const mod = process.platform === 'darwin' ? 4 : 2
  for (const type of ['keyDown', 'keyUp']) {
    await cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: mod }, popup)
  }
  const links = await waitFor(async () => {
    const l = await evaluate(popup, 'globalThis.__znLinks')
    return l?.length ? l : null
  }, 'the popup to open a link')
  const link = links[0]
  console.log(`     link: ${link}`)
  const clip = await evaluate(popup, 'navigator.clipboard.readText()')
  writeFileSync(join(outDir, 'popup-clipboard.md'), clip)
  writeFileSync(join(outDir, 'popup-link.txt'), link + '\n')
  const m = /^zennotes:\/\/new\?file=([^&]+)&clipboard=([0-9a-f]{64})$/.exec(link)
  check('popup link shape', !!m, link.slice(0, 120))
  if (m) {
    check('popup link file', decodeURIComponent(m[1]) === 'Clippings/Plain Text Notes Last Forever', decodeURIComponent(m[1]))
    check('popup clipboard hash matches the link', sha256(clip) === m[2], sha256(clip))
  }
  check('popup clipboard has frontmatter and the article', clip.startsWith('---\nsource: "') && !clip.includes('tags:') && clip.includes('## Files outlive formats'))
  check('popup closes after clipping', await waitFor(() => evaluate(popup, 'globalThis.__znClosed === true'), 'close'))

  // ---- quick clip (background, offscreen clipboard) ----
  await evaluate(popup, `navigator.clipboard.writeText('placeholder')`, { userGesture: true })
  await evaluate(popup, `chrome.runtime.sendMessage({ type: 'zn:quick-clip', tabId: ${tabId} })`)
  const qlinks = await waitFor(async () => {
    const l = await evaluate(swSession, 'globalThis.__znLinks')
    return l?.length ? l : null
  }, 'quick clip to open a link')
  const qclip = await evaluate(popup, 'navigator.clipboard.readText()')
  const qm = /clipboard=([0-9a-f]{64})/.exec(qlinks[0])
  console.log(`     link: ${qlinks[0]}`)
  check('quick clip link names the same file', qlinks[0].startsWith('zennotes://new?file=Clippings%2FPlain%20Text%20Notes%20Last%20Forever&clipboard='))
  check('quick clip clipboard hash matches the link', !!qm && sha256(qclip) === qm[1])
  check('quick clip wrote the same note as the popup', qclip === clip)
  const toast = await waitFor(
    () => evaluate(pageSession, `[...document.querySelectorAll('[data-zn-clipper-toast]')].map(h => h.shadowRoot.textContent).join('')`),
    'the toast'
  )
  check('page shows the sent toast', toast.startsWith('Sent to ZenNotes'), toast)

  // ---- highlighter ----
  await evaluate(swSession, `chrome.tabs.sendMessage(${tabId}, { type: 'zn:highlighter', action: 'on' })`)
  await evaluate(
    pageSession,
    `(() => { const p = document.querySelectorAll('article p')[2]; const r = document.createRange(); r.selectNodeContents(p.firstChild); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true })()`
  )
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'h', code: 'KeyH', text: 'h', windowsVirtualKeyCode: 72 }, pageSession)
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72 }, pageSession)
  const marks = await waitFor(() => evaluate(pageSession, `document.querySelectorAll('mark[data-zn-hl]').length`), 'a highlight mark')
  check('H turns the selection into a highlight', marks > 0, `${marks} marks`)
  writeFileSync(join(outDir, 'highlighter.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, pageSession)).data, 'base64'))
  // The first saved highlight brings the one-time offer, holding focus.
  const offerText = await waitFor(
    () => evaluate(pageSession, `document.querySelector('[data-zn-offer]')?.shadowRoot.querySelector('.bar span')?.textContent`),
    'the offer to keep highlights'
  )
  check('the first highlight offers to keep highlights visible', offerText === 'Highlights are saved. Show them when you come back?', offerText)
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, pageSession)
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, pageSession)
  const afterEsc = await evaluate(
    swSession,
    `chrome.storage.local.get('settings').then(r => r.settings.highlighter)`
  )
  const offerGone = await evaluate(pageSession, `!document.querySelector('[data-zn-offer]')`)
  check('Esc dismisses the offer and remembers it', offerGone && afterEsc.restoreOffered === true && afterEsc.restoreOnVisit === false, JSON.stringify(afterEsc))
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, pageSession)
  const saved = await evaluate(swSession, `chrome.storage.local.get(null).then(all => Object.keys(all).filter(k => k.startsWith('hl:')))`)
  check('highlight saved for the page without tracking parameters', saved.length === 1 && saved[0] === `hl:${origin}/article.html`, saved.join(','))
  const compiled = await evaluate(swSession, `chrome.tabs.sendMessage(${tabId}, { type: 'zn:compile' })`)
  check('content marks the highlight', /==[^=]+==/.test(compiled.note.body))

  // ---- reader ----
  await evaluate(swSession, `chrome.tabs.sendMessage(${tabId}, { type: 'zn:reader', action: 'toggle' })`)
  const reader = await evaluate(
    pageSession,
    `[...document.querySelectorAll('[data-zn-clipper-ui]')].some(h => h.shadowRoot && h.shadowRoot.querySelector('article h1.title'))`
  )
  check('reader view opens', reader)
  writeFileSync(join(outDir, 'reader.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, pageSession)).data, 'base64'))
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, pageSession)
  const closed = await evaluate(pageSession, `![...document.querySelectorAll('[data-zn-clipper-ui]')].some(h => h.shadowRoot && h.shadowRoot.querySelector('article h1.title'))`)
  check('Esc closes reader view', closed)

  // ---- a selection decides the content, and the popup can switch it off ----
  await evaluate(
    pageSession,
    `(() => { const r = document.createRange(); r.selectNodeContents(document.querySelectorAll('article p')[1]); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true })()`
  )
  const { targetId: popup2Target } = await cdp('Target.createTarget', { url: `${extOrigin}/popup/popup.html?tab=${tabId}` })
  const popup2 = await attach(popup2Target)
  const notice = await waitFor(() => evaluate(popup2, `document.querySelector('[role=status] span')?.textContent`), 'the selection notice')
  const selBody = await evaluate(popup2, `document.querySelector('textarea[aria-label="Note content"]').value`)
  check('popup says it clips the selection', notice === 'Clipping your selection.', notice)
  check('content is the selection', selBody.startsWith('Every note app eventually goes away.') && !selBody.includes('Files outlive formats'))
  await evaluate(popup2, `[...document.querySelectorAll('button')].find(b => b.textContent === 'Clip the whole page').click()`)
  const wholeBody = await waitFor(async () => {
    const v = await evaluate(popup2, `document.querySelector('textarea[aria-label="Note content"]').value`)
    return v.includes('## Files outlive formats') ? v : null
  }, 'the whole page')
  const notice2 = await evaluate(popup2, `document.querySelector('[role=status] span')?.textContent`)
  check('Clip the whole page switches the content', wholeBody.includes('## Files outlive formats') && notice2 === 'Clipping the whole page.', notice2)
  await cdp('Target.closeTarget', { targetId: popup2Target })
  await evaluate(pageSession, 'getSelection().removeAllRanges(), true')

  // ---- a drag past a lede into a grid of cards (zennotes.org's features) ----
  const { targetId: landingTarget } = await cdp('Target.createTarget', { url: `${origin}/landing.html` })
  const landing = await attach(landingTarget)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false }, landing)
  await waitFor(() => evaluate(landing, 'document.readyState === "complete"'), 'the landing page')
  const landingTab = await waitFor(
    () => evaluate(swSession, `chrome.tabs.query({}).then(ts => ts.find(t => (t.url || '').startsWith('${origin}/landing.html'))?.id)`),
    'the landing tab'
  )
  await evaluate(swSession, `chrome.scripting.executeScript({ target: { tabId: ${landingTab} }, files: ['/content.js'] }).then(() => true)`)
  await evaluate(swSession, `chrome.tabs.sendMessage(${landingTab}, { type: 'zn:highlighter', action: 'on' })`)
  const box = await evaluate(
    landing,
    `(() => { const r = document.querySelector('.section-lede').getBoundingClientRect(); return { x0: r.left + 2, y0: r.top + 6, x1: r.right - 2, y1: r.bottom + 30 } })()`
  )
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x0, y: box.y0, button: 'left', clickCount: 1 }, landing)
  for (let i = 1; i <= 10; i++) {
    const x = box.x0 + ((box.x1 - box.x0) * i) / 10
    const y = box.y0 + ((box.y1 - box.y0) * i) / 10
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 }, landing)
  }
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x1, y: box.y1, button: 'left', clickCount: 1 }, landing)
  const landingMarks = await waitFor(async () => {
    const m = await evaluate(
      landing,
      `[...document.querySelectorAll('mark[data-zn-hl]')].map(m => { const r = m.getBoundingClientRect(); return { text: m.textContent, w: r.width, h: r.height, parent: getComputedStyle(m.parentElement).display } })`
    )
    return m.length ? m : null
  }, 'landing highlight marks')
  writeFileSync(join(outDir, 'landing-highlight.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, landing)).data, 'base64'))
  check('the drag highlights the lede', landingMarks.map((m) => m.text).join('').includes('One keyboard-first app'))
  check('no mark wraps bare whitespace', landingMarks.every((m) => m.text.trim() !== ''), `${landingMarks.length} marks`)
  check('no mark is a grid or flex item', landingMarks.every((m) => !/grid|flex/.test(m.parent)))
  check('no mark is taller than two lines', landingMarks.every((m) => m.h <= 60), JSON.stringify(landingMarks.map((m) => Math.round(m.h))))
  const cards = await evaluate(landing, `[...document.querySelector('.bento').children].map(c => c.tagName).join(',')`)
  check('the grid keeps its three cards', cards === 'ARTICLE,ARTICLE,ARTICLE', cards)
  await sleep(1000)
  check('a dismissed offer does not come back', await evaluate(landing, `!document.querySelector('[data-zn-offer]')`))

  // ---- accepting the offer: access, the restore script, and a reload ----
  await evaluate(
    swSession,
    `chrome.storage.local.get('settings').then(r => { r.settings.highlighter.restoreOffered = false; return chrome.storage.local.set({ settings: r.settings }) }).then(() => true)`
  )
  const { targetId: recipeTarget } = await cdp('Target.createTarget', { url: `${origin}/recipe.html` })
  const recipe = await attach(recipeTarget)
  await waitFor(() => evaluate(recipe, 'document.readyState === "complete"'), 'the recipe page')
  const recipeTab = await waitFor(
    () => evaluate(swSession, `chrome.tabs.query({}).then(ts => ts.find(t => (t.url || '').startsWith('${origin}/recipe.html'))?.id)`),
    'the recipe tab'
  )
  await evaluate(swSession, `chrome.scripting.executeScript({ target: { tabId: ${recipeTab} }, files: ['/content.js'] }).then(() => true)`)
  await evaluate(swSession, `chrome.tabs.sendMessage(${recipeTab}, { type: 'zn:highlighter', action: 'on' })`)
  await evaluate(
    recipe,
    `(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('article p').firstChild); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true })()`
  )
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'h', code: 'KeyH', text: 'h', windowsVirtualKeyCode: 72 }, recipe)
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72 }, recipe)
  await waitFor(() => evaluate(recipe, `!!document.querySelector('[data-zn-offer]')`), 'the offer on a fresh page')
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, recipe)
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, recipe)
  const offerPage = await waitFor(async () => {
    const { targetInfos } = await cdp('Target.getTargets')
    return targetInfos.find((t) => t.url.startsWith(`${extOrigin}/offer/offer.html`))
  }, 'the access window')
  check('Enter opens the access window for that tab', offerPage.url.endsWith(`?tab=${recipeTab}`), offerPage.url)
  const offerSession = await attach(offerPage.targetId)
  await waitFor(() => evaluate(offerSession, `document.activeElement && document.activeElement.id === 'yes'`), 'the focused button')
  // The browser's own prompt cannot be clicked by a script: the request
  // answers yes as a person would. Everything after it is the real path.
  await evaluate(offerSession, `chrome.permissions.request = async () => true; window.close = () => { globalThis.__znClosed = true }; true`)
  writeFileSync(join(outDir, 'offer-window.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, offerSession)).data, 'base64'))
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, offerSession)
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, offerSession)
  const on = await waitFor(
    () => evaluate(swSession, `chrome.storage.local.get('settings').then(r => r.settings.highlighter.restoreOnVisit === true && r.settings.highlighter)`),
    'the setting to turn on'
  )
  check('accepting turns on Show highlights on return', on.restoreOnVisit === true && on.restoreOffered === true)
  const registered = await waitFor(
    () => evaluate(swSession, `chrome.scripting.getRegisteredContentScripts().then(r => r.find(x => x.id === 'zn-restore-highlights'))`),
    'the restore script registration'
  )
  check('the restore script is registered for the granted sites', JSON.stringify(registered.matches) === '["http://127.0.0.1/*"]', JSON.stringify(registered.matches))
  check('the access window closes itself', await waitFor(() => evaluate(offerSession, 'globalThis.__znClosed === true'), 'close'))
  await cdp('Page.reload', {}, recipe)
  await sleep(300)
  await waitFor(() => evaluate(recipe, 'document.readyState === "complete"'), 'the reload')
  const redrawn = await waitFor(
    () => evaluate(recipe, `[...document.querySelectorAll('mark[data-zn-hl]')].map(m => m.textContent).join('')`),
    'highlights after the reload'
  )
  check('after a reload the highlight is drawn again', redrawn.includes('These cookies are the reason'), redrawn.slice(0, 60))
  writeFileSync(join(outDir, 'restored-after-reload.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, recipe)).data, 'base64'))

  // ---- settings page renders ----
  const { targetId: settingsTarget } = await cdp('Target.createTarget', { url: `${extOrigin}/settings/settings.html#templates` })
  const settings = await attach(settingsTarget)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false }, settings)
  const tpl = await waitFor(() => evaluate(settings, `document.querySelector('#t-content')?.value`), 'the template editor')
  check('settings shows the default template', tpl === '{{content}}')
  writeFileSync(join(outDir, 'settings.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' }, settings)).data, 'base64'))
} catch (err) {
  failures++
  console.log(`FAIL ${err instanceof Error ? err.message : err}`)
} finally {
  ws.close()
  chrome.kill()
  server.close()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
  const after = pbpaste()
  if (clipboardBefore !== null && after !== clipboardBefore) {
    execFileSync('pbcopy', { input: clipboardBefore })
    console.log('     restored the system clipboard')
  }
  console.log(`\nScreenshots and clip text in ${outDir}`)
  console.log(failures ? `${failures} check(s) failed` : 'All checks passed')
  process.exit(failures ? 1 : 0)
}
