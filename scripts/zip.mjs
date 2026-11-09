// Zips each dist/<browser> into dist/zennotes-web-clipper-<version>-<browser>.zip,
// with manifest.json at the archive root as the stores expect.

import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))

async function walk(dir) {
  const out = []
  for (const name of await readdir(dir)) {
    const p = join(dir, name)
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

for (const browser of ['chrome', 'firefox', 'safari']) {
  const dir = resolve(root, 'dist', browser)
  const files = {}
  for (const f of await walk(dir)) files[relative(dir, f).split('\\').join('/')] = new Uint8Array(await readFile(f))
  const zip = zipSync(files, { level: 9, mtime: new Date('2026-01-01T00:00:00Z') })
  const target = resolve(root, 'dist', `zennotes-web-clipper-${pkg.version}-${browser}.zip`)
  await writeFile(target, zip)
  console.log(relative(root, target), `${(zip.length / 1024).toFixed(0)} KiB`)
}
