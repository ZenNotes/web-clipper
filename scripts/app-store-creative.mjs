// Renders the App Store creative assets for the Safari app from the pages in
// store/safari/creative: the product page header (3840x1646, 21:9) and the
// search results image (3840x2560, 3:2). Both are built from the Mac
// screenshots in store/safari/screenshots/mac, so render those first.
//
//   node scripts/app-store-creative.mjs
//
// App Store Connect refuses an alpha channel, so each PNG is flattened to RGB
// with ImageMagick (`magick`) after Chrome for Testing takes it.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = resolve(root, 'store/safari/creative')

const ASSETS = [
  { page: 'header.html', out: 'header-3840x1646.png', width: 3840, height: 1646 },
  { page: 'search-results.html', out: 'search-results-3840x2560.png', width: 3840, height: 2560 }
]

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

const chrome = findChrome()
for (const a of ASSETS) {
  const out = join(dir, a.out)
  const run = spawnSync(
    chrome,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--allow-file-access-from-files',
      `--window-size=${a.width},${a.height}`,
      '--virtual-time-budget=3000',
      `--screenshot=${out}`,
      pathToFileURL(join(dir, a.page)).href
    ],
    { stdio: 'pipe', encoding: 'utf8' }
  )
  if (run.status !== 0 || !existsSync(out)) throw new Error(`Chrome failed on ${a.page}: ${run.stderr}`)
  const flat = spawnSync('magick', [out, '-alpha', 'off', out], { stdio: 'inherit' })
  if (flat.status !== 0) throw new Error(`magick could not flatten ${a.out}`)
  const size = spawnSync('magick', ['identify', '-format', '%wx%h %[channels]', out], { encoding: 'utf8' }).stdout
  console.log(`${a.out}: ${size}`)
}
