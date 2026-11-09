// Copies the link contract's fixtures from the app repo, the single source
// of truth, into test/fixtures/. Pass the app checkout as the first argument
// or set ZENNOTES_REPO; the default is the web-clipper worktree.

import { copyFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo =
  process.argv[2] ??
  process.env.ZENNOTES_REPO ??
  resolve(homedir(), 'Developer/opensource/zennotes-worktrees/web-clipper')
const from = resolve(repo, 'docs/web-clipper-link.fixtures.json')
const to = resolve(root, 'test/fixtures/web-clipper-link.fixtures.json')

const data = JSON.parse(await readFile(from, 'utf8'))
if (data.version !== 1 || !Array.isArray(data.accept) || !Array.isArray(data.reject)) {
  throw new Error(`${from} is not a version 1 fixtures file`)
}
await copyFile(from, to)
console.log(`Copied ${data.accept.length} accept and ${data.reject.length} reject cases from ${from}`)
