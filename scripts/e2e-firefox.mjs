// End-to-end check in Firefox: starts Firefox through web-ext run (headless,
// throwaway profile) with dist/firefox-e2e, serves the fixture pages on
// 127.0.0.1, and drives the browser over WebDriver BiDi: clips a page from
// the popup (Mod+Enter) and by quick clip, and compares each link's hash
// with the clipboard.
//
// It never opens a zennotes:// link: tabs.update is replaced in the popup
// and the background page before a clip, and the profile tells Firefox not
// to hand the scheme to the system.
//
//   npm run build -- --e2e && FIREFOX_PATH=/path/to/firefox node scripts/e2e-firefox.mjs [--out <dir>]
//
// On macOS, FIREFOX_APP=/path/to/Firefox.app starts Firefox through Launch
// Services instead. Use it when Firefox quits at once with "Could not find
// profile folder": that happens when its parent process runs in a sandbox
// (an IDE or agent terminal), and a Launch Services start has no parent.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import webExt from 'web-ext'
import { GECKO_ID } from './manifest.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outArg = process.argv.indexOf('--out')
const outDir = outArg > 0 ? resolve(process.argv[outArg + 1]) : mkdtempSync(join(tmpdir(), 'zn-clipper-ff-out-'))
mkdirSync(outDir, { recursive: true })
const BIDI_PORT = 9335 + Math.floor(Math.random() * 500)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
  if (!ok) failures++
}

const pages = resolve(root, 'test/fixtures/pages')
const server = createServer((req, res) => {
  const name = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'article.html'
  const file = join(pages, name)
  if (!file.startsWith(pages) || !existsSync(file)) return void res.writeHead(404).end()
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1'
let firefox = process.env.FIREFOX_PATH ?? 'firefox'
if (process.env.FIREFOX_APP) {
  firefox = join(outDir, 'firefox-via-open.sh')
  writeFileSync(
    firefox,
    `#!/bin/sh\nexec open -n -W --env MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 -a ${JSON.stringify(process.env.FIREFOX_APP)} --args "$@"\n`
  )
  chmodSync(firefox, 0o755)
}

const runner = await webExt.cmd.run(
  {
    sourceDir: resolve(root, 'dist/firefox-e2e'),
    firefox,
    noReload: true,
    noInput: true,
    args: ['-headless', '--remote-debugging-port', String(BIDI_PORT), '--remote-allow-system-access'],
    pref: {
      'network.protocol-handler.external.zennotes': false,
      'extensions.originControls.grantByDefault': true,
      'extensions.webextensions.remote': false
    }
  },
  { shouldExitProgram: false }
)
check('web-ext run installed the extension', true)

// ---- minimal WebDriver BiDi client ----
async function connect() {
  for (let i = 0; i < 100; i++) {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${BIDI_PORT}/session`)
      await new Promise((r, j) => {
        ws.onopen = r
        ws.onerror = j
      })
      return ws
    } catch {
      await sleep(200)
    }
  }
  throw new Error('No BiDi connection')
}
const ws = await connect()
let nextId = 1
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.type === 'error' ? rej(new Error(`${msg.error}: ${msg.message}`)) : res(msg.result)
  }
}
const bidi = (method, params = {}) => {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((res, rej) => pending.set(id, { res, rej }))
}
/** Evaluates `expression` (an async function body returning JSON-able data). */
async function run(context, body, userActivation = false) {
  const r = await bidi('script.evaluate', {
    expression: `(async () => JSON.stringify(await (async () => { ${body} })()))()`,
    target: { context },
    awaitPromise: true,
    userActivation
  })
  if (r.type !== 'success') throw new Error(r.exceptionDetails?.text ?? 'script failed')
  return r.result.value === undefined ? undefined : JSON.parse(r.result.value)
}
async function waitFor(fn, label, ms = 15000) {
  const end = Date.now() + ms
  let last = ''
  for (;;) {
    const v = await fn().catch((err) => {
      last = err instanceof Error ? err.message : String(err)
      return null
    })
    if (v) return v
    if (Date.now() > end) throw new Error(`Timed out waiting for ${label}${last ? ` (${last})` : ''}`)
    await sleep(200)
  }
}

// Extension pages cannot be opened or scripted over BiDi, so they are
// reached from Firefox's privileged scope (allowed by
// --remote-allow-system-access), with extension pages kept in the parent
// process so that scope can see their windows.
const CHROME_HELPERS = `
  const W = Services.wm.getMostRecentWindow('navigator:browser');
  window.__zn = {
    open(url) {
      W.openTrustedLinkIn(url, 'tab');
      window.__znTab = W.gBrowser.selectedTab;
      return true;
    },
    adopt(part) {
      for (const win of Services.wm.getEnumerator('navigator:browser')) {
        for (const tab of win.gBrowser.tabs) {
          if (tab.linkedBrowser.currentURI.spec.includes(part)) {
            window.__znTab = tab;
            return tab.linkedBrowser.currentURI.spec;
          }
        }
      }
      return null;
    },
    run(code) {
      const win = window.__znTab.linkedBrowser.contentWindow;
      if (!win) throw new Error('extension page is not in this process');
      const sb = Cu.Sandbox(win, { sandboxPrototype: win.wrappedJSObject, wantXrays: false });
      return Cu.evalInSandbox('(async () => JSON.stringify(await (async () => {' + code + '})()))()', sb);
    }
  };
  return true;`

try {
  await bidi('session.new', { capabilities: {} })
  const { context: page } = await bidi('browsingContext.create', { type: 'tab' })
  await bidi('browsingContext.navigate', { context: page, url: `${origin}/article.html?utm_source=e2e`, wait: 'complete' })

  const tree = await bidi('browsingContext.getTree', { 'moz:scope': 'chrome' })
  const chromeCtx = tree.contexts[0].context
  const chromeRun = async (body) => {
    const r = await bidi('script.evaluate', {
      expression: `(async () => { ${body} })()`,
      target: { context: chromeCtx },
      awaitPromise: true,
      'moz:scope': 'chrome'
    })
    if (r.type !== 'success') throw new Error(r.exceptionDetails?.text ?? 'chrome script failed')
    return r.result.value
  }
  await chromeRun(CHROME_HELPERS)
  const inExt = async (code) => {
    const v = await chromeRun(`return await window.__zn.run(${JSON.stringify(code)})`)
    return v === undefined ? undefined : JSON.parse(v)
  }

  const host = await chromeRun(`return WebExtensionPolicy.getByID(${JSON.stringify(GECKO_ID)})?.mozExtensionHostname ?? null`)
  if (!host) throw new Error('the extension is not installed')
  const ext = `moz-extension://${host}`
  await chromeRun(`return window.__zn.open(${JSON.stringify(`${ext}/settings/settings.html`)})`)
  const tabId = await waitFor(
    () => inExt(`const ts = await browser.tabs.query({}); return ts.find(t => (t.url || '').startsWith('${origin}/article.html'))?.id`),
    'the extension page'
  )
  check('extension pages run', typeof tabId === 'number', `tab ${tabId}`)
  if (process.env.ZN_DEBUG) {
    console.log('     inject:', await inExt(`try { const r = await browser.scripting.executeScript({ target: { tabId: ${tabId} }, files: ['content.js'] }); return JSON.stringify(r) } catch (e) { return 'ERR ' + e.message }`))
    console.log('     probe:', await inExt(`try { const r = await browser.scripting.executeScript({ target: { tabId: ${tabId} }, func: () => [typeof globalThis.__zennotesClipperContent, typeof browser, typeof chrome] }); return JSON.stringify(r) } catch (e) { return 'ERR ' + e.message }`))
  }

  await chromeRun(`return window.__zn.open(${JSON.stringify(`${ext}/popup/popup.html?tab=`)} + ${tabId})`)
  const name = await waitFor(() => inExt(`return document.querySelector('#zn-name')?.value`), 'the popup to read the page').catch(
    async (err) => {
      console.log('     popup shows:', await inExt('return document.body.innerText').catch((e) => String(e)))
      throw err
    }
  )
  check('popup note name', name === 'Plain Text Notes Last Forever', name)
  const body = await inExt(`return document.querySelector('textarea[aria-label="Note content"]').value`)
  check('popup content is the article', body.includes('## Files outlive formats') && !body.includes('Related posts'))
  await inExt(
    `window.__znLinks = []; browser.tabs.update = async (id, p) => { window.__znLinks.push(p.url); return { id } }; window.close = () => { window.__znClosed = true }; return true`
  )
  await inExt(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, ctrlKey: true, bubbles: true })); return true`
  )
  const links = await waitFor(async () => {
    const l = await inExt('return window.__znLinks')
    return l?.length ? l : null
  }, 'the popup to open a link')
  console.log(`     link: ${links[0]}`)
  const clip = await inExt('return navigator.clipboard.readText()')
  writeFileSync(join(outDir, 'firefox-popup-clipboard.md'), clip)
  const m = /^zennotes:\/\/new\?file=Clippings%2FPlain%20Text%20Notes%20Last%20Forever&clipboard=([0-9a-f]{64})$/.exec(links[0])
  check('popup link names the note', !!m)
  check('popup clipboard hash matches the link', !!m && sha256(clip) === m[1], sha256(clip))
  check('popup clipboard has frontmatter and the article', clip.startsWith('---\nsource: "') && clip.includes('## Files outlive formats'))

  // Quick clip runs in the background page; stub its tabs.update there.
  await inExt(
    `const bg = await browser.runtime.getBackgroundPage(); bg.__znLinks = []; bg.browser.tabs.update = async (id, p) => { bg.__znLinks.push(p.url); return { id } }; await navigator.clipboard.writeText('placeholder'); return true`
  )
  await inExt(`return browser.runtime.sendMessage({ type: 'zn:quick-clip', tabId: ${tabId} })`)
  const qlinks = await waitFor(async () => {
    const l = await inExt('const bg = await browser.runtime.getBackgroundPage(); return [...bg.__znLinks]')
    return l?.length ? l : null
  }, 'quick clip to open a link')
  console.log(`     link: ${qlinks[0]}`)
  const qclip = await inExt('return navigator.clipboard.readText()')
  const qm = /clipboard=([0-9a-f]{64})$/.exec(qlinks[0])
  check('quick clip clipboard hash matches the link', !!qm && sha256(qclip) === qm[1])
  check('quick clip wrote the same note as the popup', qclip === clip)

  // Reader view on the page.
  await inExt(`return browser.tabs.sendMessage(${tabId}, { type: 'zn:reader', action: 'toggle' })`)
  const reader = await run(
    page,
    `return [...document.querySelectorAll('[data-zn-clipper-ui]')].some(h => h.shadowRoot && h.shadowRoot.querySelector('article h1.title'))`
  )
  check('reader view opens', reader)
  const rshot = await bidi('browsingContext.captureScreenshot', { context: page })
  writeFileSync(join(outDir, 'firefox-reader.png'), Buffer.from(rshot.data, 'base64'))

  // ---- the one-time offer to keep highlights, accepted ----
  await inExt(`return browser.tabs.sendMessage(${tabId}, { type: 'zn:reader', action: 'toggle' })`)
  await inExt(`return browser.tabs.sendMessage(${tabId}, { type: 'zn:highlighter', action: 'on' })`)
  await run(
    page,
    `const r = document.createRange(); r.selectNodeContents(document.querySelectorAll('article p')[2].firstChild); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true`
  )
  const key = (value) => bidi('input.performActions', {
    context: page,
    actions: [{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value }, { type: 'keyUp', value }] }]
  })
  await key('h')
  const offerText = await waitFor(
    () => run(page, `return document.querySelector('[data-zn-offer]')?.shadowRoot.querySelector('.bar span')?.textContent`),
    'the offer'
  )
  check('the first highlight offers to keep highlights visible', offerText === 'Highlights are saved. Show them when you come back?', offerText)
  await key('')
  const offerUrl = await waitFor(() => chromeRun(`return window.__zn.adopt('/offer/offer.html')`), 'the access window')
  check('Enter opens the access window for that tab', offerUrl.endsWith(`?tab=${tabId}`), offerUrl)
  await waitFor(() => inExt(`return document.activeElement && document.activeElement.id === 'yes'`), 'the focused button')
  // The browser's prompt cannot be clicked by a script: the request answers
  // yes as a person would. Everything after it is the real path.
  await inExt(`browser.permissions.request = async () => true; window.close = () => { window.__znClosed = true }; return true`)
  await inExt(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true`)
  const on = await waitFor(
    () => inExt(`const r = await browser.storage.local.get('settings'); return r.settings.highlighter.restoreOnVisit === true && r.settings.highlighter`),
    'the setting to turn on'
  )
  check('accepting turns on Show highlights on return', on.restoreOffered === true)
  const reg = await waitFor(
    () => inExt(`const r = await browser.scripting.getRegisteredContentScripts(); return r.find(x => x.id === 'zn-restore-highlights')?.matches`),
    'the restore registration'
  )
  check('the restore script is registered for the granted sites', JSON.stringify(reg) === '["http://127.0.0.1/*"]', JSON.stringify(reg))
  await bidi('browsingContext.reload', { context: page, wait: 'complete' })
  const redrawn = await waitFor(
    () => run(page, `const t = [...document.querySelectorAll('mark[data-zn-hl]')].map(m => m.textContent).join(''); return t.trim() ? t : null`),
    'highlights after the reload'
  )
  check('after a reload the highlight is drawn again', redrawn.includes('Proprietary databases'), JSON.stringify(redrawn.slice(0, 50)))
} catch (err) {
  failures++
  console.log(`FAIL ${err instanceof Error ? err.message : err}`)
} finally {
  await bidi('browser.close').catch(() => undefined)
  try {
    ws.close()
  } catch {
    /* already closed */
  }
  await runner.exit()
  try {
    execFileSync('pkill', ['-f', `remote-debugging-port ${BIDI_PORT}`])
  } catch {
    /* already gone */
  }
  server.close()
  console.log(`\nScreenshots and clip text in ${outDir}`)
  console.log(failures ? `${failures} check(s) failed` : 'All checks passed')
  process.exit(failures ? 1 : 0)
}
