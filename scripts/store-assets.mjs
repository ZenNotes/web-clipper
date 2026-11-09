// Renders the store images with the real extension in Chrome for Testing:
// four 1280x800 screenshots on an original article page
// (store/source/article.html), the 440x280 promo tile and the 300x300 logo.
// Extension pages use the dark ZenNotes theme. No zennotes:// link is opened
// (nothing here clips), and the profile is a throwaway one.
//
//   npm run build:e2e && node scripts/store-assets.mjs

import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// The article is served from 127.0.0.1 but shown under a reserved name, so
// the reader and the note show a site, not a test address.
const HOST = 'margin-notes.example'
const store = resolve(root, 'store')
mkdirSync(join(store, 'screenshots'), { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const base = join(homedir(), 'Library/Caches/ms-playwright')
  const dirs = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : []
  for (const d of dirs) {
    const p = join(base, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
    if (existsSync(p)) return p
  }
  throw new Error('Chrome for Testing not found; set CHROME_PATH')
}

const source = resolve(store, 'source')
const server = createServer((req, res) => {
  const name = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'article.html'
  const file = join(source, name)
  if (!file.startsWith(source) || !existsSync(file)) return void res.writeHead(404).end()
  res.writeHead(200, { 'content-type': name.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' }).end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://${HOST}`

const profile = mkdtempSync(join(tmpdir(), 'zn-clipper-store-'))
const extDir = join(profile, 'extension')
cpSync(resolve(root, 'dist/chrome-e2e'), extDir, { recursive: true })
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'))
manifest.host_permissions = [`http://${HOST}/*`]
writeFileSync(join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
mkdirSync(join(profile, 'Default'), { recursive: true })
writeFileSync(join(profile, 'Default/Preferences'), JSON.stringify({ protocol_handler: { excluded_schemes: { zennotes: true } } }))
const chrome = spawn(
  findChrome(),
  [
    '--headless=new',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    `--load-extension=${extDir}`,
    `--disable-extensions-except=${extDir}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--host-resolver-rules=MAP ${HOST} 127.0.0.1:${server.address().port}`,
    '--window-size=1280,800',
    'about:blank'
  ],
  { stdio: 'ignore' }
)

let port = null
for (let i = 0; i < 100 && !port; i++) {
  const f = join(profile, 'DevToolsActivePort')
  if (existsSync(f)) port = readFileSync(f, 'utf8').trim().split('\n')
  else await sleep(100)
}
const ws = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`)
await new Promise((r) => (ws.onopen = r))
let nextId = 1
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(m.error.message)) : res(m.result)
  }
}
const cdp = (method, params = {}, sessionId) => {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  return new Promise((res, rej) => pending.set(id, { res, rej }))
}
async function evaluate(s, expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s)
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
async function open(url, width, height, dark = true) {
  const { targetId } = await cdp('Target.createTarget', { url })
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  await cdp('Runtime.enable', {}, sessionId)
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId)
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] }, sessionId)
  return { targetId, s: sessionId }
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
async function shot(s, file) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, s)
  writeFileSync(file, Buffer.from(data, 'base64'))
  console.log(file.replace(root + '/', ''))
  return data
}
const key = async (s, k, code, vk, text) => {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) }, s)
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }, s)
}
const selectText = (s, text) =>
  evaluate(
    s,
    `(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const flat = n.data.replace(/\\s+/g, ' ')
        if (!flat.includes(${JSON.stringify(text)})) continue
        const start = n.data.search(${JSON.stringify(text.split(' ')[0])})
        const r = document.createRange(); r.setStart(n, start)
        let end = start, seen = 0
        while (seen < ${text.length} && end < n.data.length) { if (!/\\s/.test(n.data[end]) || !/\\s/.test(n.data[end - 1] ?? '')) seen++; end++ }
        r.setEnd(n, end)
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
        return true
      }
      return false
    })()`
  )

try {
  let sw = null
  await waitFor(async () => {
    const { targetInfos } = await cdp('Target.getTargets')
    for (const t of targetInfos.filter((x) => x.type === 'service_worker' && x.url.startsWith('chrome-extension://'))) {
      const { sessionId } = await cdp('Target.attachToTarget', { targetId: t.targetId, flatten: true })
      if ((await evaluate(sessionId, 'chrome.runtime.getManifest().name').catch(() => '')) === 'ZenNotes Web Clipper') {
        sw = { s: sessionId, ext: new URL(t.url).host }
        return true
      }
    }
    return false
  }, 'the extension')
  const ext = `chrome-extension://${sw.ext}`

  const page = await open(`${origin}/article.html`, 1280, 800, true)
  await waitFor(() => evaluate(page.s, 'document.readyState === "complete"'), 'the article')
  await sleep(400)
  const tabId = await waitFor(
    () => evaluate(sw.s, `chrome.tabs.query({}).then(ts => ts.find(t => (t.url || '').startsWith('${origin}/article'))?.id)`),
    'the tab'
  )
  await evaluate(sw.s, `chrome.scripting.executeScript({ target: { tabId: ${tabId} }, files: ['/content.js'] }).then(() => true)`)

  // 02: the highlighter with two highlights and its toolbar.
  await evaluate(sw.s, `chrome.tabs.sendMessage(${tabId}, { type: 'zn:highlighter', action: 'on' })`)
  await selectText(page.s, 'Plain text is that format.')
  await key(page.s, 'h', 'KeyH', 72, 'h')
  await waitFor(() => evaluate(page.s, `!!document.querySelector('[data-zn-offer]')`), 'the one-time offer')
  await key(page.s, 'Escape', 'Escape', 27)
  await selectText(page.s, 'Jot the idea, the quote, the link you meant to read, and give it a name.')
  await key(page.s, 'h', 'KeyH', 72, 'h')
  await waitFor(() => evaluate(page.s, `document.querySelectorAll('mark[data-zn-hl]').length >= 2`), 'two highlights')
  await evaluate(page.s, 'window.scrollTo(0, 70), true')
  await sleep(300)
  await shot(page.s, join(store, 'screenshots/02-highlighter.png'))
  await evaluate(sw.s, `chrome.tabs.sendMessage(${tabId}, { type: 'zn:highlighter', action: 'off' })`)

  // 01: the popup with the Markdown preview, over the article.
  await evaluate(page.s, 'window.scrollTo(0, 0), true')
  await sleep(300)
  const bg = (await cdp('Page.captureScreenshot', { format: 'png' }, page.s)).data
  const popup = await open(`${ext}/popup/popup.html?tab=${tabId}`, 440, 600, true)
  await evaluate(popup.s, 'window.close = () => {}; true')
  await waitFor(() => evaluate(popup.s, `document.querySelector('#zn-name')?.value`), 'the popup')
  await evaluate(popup.s, `[...document.querySelectorAll('button')].find(b => b.textContent === 'Preview').click(), true`)
  await sleep(400)
  // The real popup is as tall as its content.
  const popupHeight = Math.ceil(await evaluate(popup.s, `document.querySelector('#root > div').getBoundingClientRect().height`))
  await cdp('Emulation.setDeviceMetricsOverride', { width: 440, height: popupHeight, deviceScaleFactor: 1, mobile: false }, popup.s)
  await sleep(300)
  const fg = (await cdp('Page.captureScreenshot', { format: 'png' }, popup.s)).data
  const compose = await open('about:blank', 1280, 800, true)
  await evaluate(
    compose.s,
    `(() => {
      document.body.style.cssText = 'margin:0;width:1280px;height:800px;overflow:hidden'
      document.body.innerHTML = '<img src="data:image/png;base64,${bg}" style="position:absolute;inset:0;width:1280px;height:800px">'
        + '<div style="position:absolute;inset:0;background:rgb(20 18 16 / 0.18)"></div>'
        + '<img src="data:image/png;base64,${fg}" style="position:absolute;top:28px;right:44px;width:440px;height:${popupHeight}px;border-radius:12px;box-shadow:0 0 0 1px rgb(255 255 255 / 0.08),0 28px 70px -18px rgb(0 0 0 / 0.6)">'
      return true
    })()`
  )
  await sleep(300)
  await shot(compose.s, join(store, 'screenshots/01-popup.png'))

  // 03: reader view.
  await evaluate(sw.s, `chrome.tabs.sendMessage(${tabId}, { type: 'zn:reader', action: 'toggle' })`)
  await sleep(500)
  await shot(page.s, join(store, 'screenshots/03-reader.png'))

  // 04: template settings.
  const settings = await open(`${ext}/settings/settings.html#templates`, 1280, 800, true)
  await waitFor(() => evaluate(settings.s, `document.querySelector('#t-content')?.value`), 'the settings page')
  await sleep(300)
  await shot(settings.s, join(store, 'screenshots/04-templates.png'))

  // The promo tile and the Edge logo, from the app icon on the ZenNotes dark background.
  const icon = readFileSync(join(source, 'icon-512.png')).toString('base64')
  const tile = await open('about:blank', 440, 280, true)
  await evaluate(
    tile.s,
    `(() => {
      document.body.style.cssText = 'margin:0;width:440px;height:280px;overflow:hidden'
      document.body.innerHTML = '<div style="width:440px;height:280px;display:flex;align-items:center;gap:22px;padding:0 34px;box-sizing:border-box;background:radial-gradient(120% 140% at 0% 0%, rgb(60 44 30) 0%, rgb(29 32 33) 55%);font-family:-apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif">'
        + '<img src="data:image/png;base64,${icon}" style="width:118px;height:118px;flex:none">'
        + '<div><div style="font-size:15px;letter-spacing:0.14em;text-transform:uppercase;color:rgb(231 138 78);font-weight:600">ZenNotes</div>'
        + '<div style="font-size:32px;line-height:1.1;font-weight:700;color:rgb(235 219 178);margin-top:6px">Web Clipper</div>'
        + '<div style="font-size:14px;line-height:1.4;color:rgb(168 153 132);margin-top:10px;white-space:nowrap">Any page, a clean Markdown note.</div></div></div>'
      return true
    })()`
  )
  await sleep(300)
  await shot(tile.s, join(store, 'promo-440x280.png'))
  const logo = await open('about:blank', 300, 300, true)
  await evaluate(
    logo.s,
    `(() => {
      document.body.style.cssText = 'margin:0;width:300px;height:300px;overflow:hidden'
      document.body.innerHTML = '<div style="width:300px;height:300px;display:flex;align-items:center;justify-content:center;background:rgb(29 32 33)"><img src="data:image/png;base64,${icon}" style="width:268px;height:268px"></div>'
      return true
    })()`
  )
  await sleep(300)
  await shot(logo.s, join(store, 'logo-300.png'))
} finally {
  ws.close()
  chrome.kill()
  server.close()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
}
