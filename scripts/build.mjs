// Builds the extension once into build/, then lays out dist/chrome,
// dist/firefox and dist/safari, each with its own manifest. Extension pages
// (popup, settings, offscreen) are ES modules; the content scripts and the
// background script are single classic files, because content scripts
// cannot be modules and Firefox and Safari load the background as a page
// script.
//
//   node scripts/build.mjs           all browsers
//   node scripts/build.mjs --e2e     also dist/chrome-e2e and dist/firefox-e2e,
//                                    with page access to 127.0.0.1 granted
//                                    up front so an automated run can clip
//                                    a local page

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { build } from 'vite'
import { manifestFor } from './manifest.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'build')
const dist = resolve(root, 'dist')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const e2e = process.argv.includes('--e2e')

const common = {
  configFile: false,
  logLevel: 'warn',
  // Chrome refuses a content script that is not valid UTF-8, and bundled
  // libraries carry lone surrogates in string literals; escaping everything
  // outside ASCII keeps every output loadable.
  esbuild: { charset: 'ascii' },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') }
}

await rm(out, { recursive: true, force: true })

await build({
  ...common,
  root: resolve(root, 'src'),
  base: '',
  plugins: [react()],
  css: { postcss: resolve(root, 'postcss.config.cjs') },
  build: {
    outDir: out,
    emptyOutDir: false,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(root, 'src/popup/popup.html'),
        settings: resolve(root, 'src/settings/settings.html'),
        offscreen: resolve(root, 'src/offscreen/offscreen.html')
      },
      output: { entryFileNames: 'assets/[name]-[hash].js', chunkFileNames: 'assets/[name]-[hash].js' }
    }
  }
})

for (const [name, entry] of [
  ['content', 'src/content/index.ts'],
  ['restore', 'src/content/restore.ts'],
  ['background', 'src/background/index.ts']
]) {
  await build({
    ...common,
    root,
    build: {
      outDir: out,
      emptyOutDir: false,
      target: 'es2022',
      minify: true,
      lib: { entry: resolve(root, entry), formats: ['iife'], name: `zn_${name}`, fileName: () => `${name}.js` },
      rollupOptions: { output: { inlineDynamicImports: true } }
    }
  })
}

await cp(resolve(root, 'public'), out, { recursive: true })
await cp(resolve(root, 'LICENSE'), resolve(out, 'LICENSE'))

const targets = ['chrome', 'firefox', 'safari']
for (const browser of targets) {
  const dir = resolve(dist, browser)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await cp(out, dir, { recursive: true })
  await writeFile(resolve(dir, 'manifest.json'), JSON.stringify(manifestFor(browser, pkg.version), null, 2) + '\n')
}
if (e2e) {
  // Firefox's variant may also read the clipboard back, so the run can
  // compare what landed there with the link's hash.
  for (const [browser, extra] of [
    ['chrome', []],
    ['firefox', ['clipboardRead']]
  ]) {
    const dir = resolve(dist, `${browser}-e2e`)
    await rm(dir, { recursive: true, force: true })
    await cp(out, dir, { recursive: true })
    const manifest = manifestFor(browser, pkg.version, { e2eHosts: ['http://127.0.0.1/*'], e2ePermissions: extra })
    await writeFile(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  }
}
console.log(`Built ${pkg.version} for ${targets.join(', ')}${e2e ? ' and the e2e variants' : ''} in dist/`)
