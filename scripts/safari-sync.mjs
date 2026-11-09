// Updates the Safari app (safari/) to the current extension: builds it into
// .safari-build/ (never dist/, which may be mid-upload), replaces the
// extension's web resources in the Xcode project, keeps the project's list
// of top-level resources in step with the build, and sets the app version
// from package.json.
//
//   npm run safari:sync

import { execFileSync } from 'node:child_process'
import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = resolve(root, 'safari/ZenNotes Web Clipper')
const resources = join(project, 'Shared (Extension)/Resources')
const xcproj = join(project, 'ZenNotes Web Clipper.xcodeproj/project.xcproj')
const built = resolve(root, '.safari-build/dist/safari')

execFileSync(process.execPath, [resolve(root, 'scripts/build.mjs')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ZN_BUILD: '.safari-build/build', ZN_DIST: '.safari-build/dist' }
})

await rm(resources, { recursive: true, force: true })
await cp(built, resources, { recursive: true })

// The Resources group lists each top-level file and folder (folders are
// copied whole, so hashed asset names inside them need no listing).
const entries = (await readdir(built)).filter((n) => !n.startsWith('.')).sort()
const members = `"target-membership": [
                "ZenNotes Web Clipper Extension (iOS)/resources",
                "ZenNotes Web Clipper Extension (macOS)/resources",
              ],`
const children = entries
  .map((n) => `{\n              "path": "Resources/${n}",\n              ${members}\n            }`)
  .join(', ')
let text = await readFile(xcproj, 'utf8')
const groupStart = text.indexOf('"path": "<PROJECT>/Shared (Extension)"')
const open = text.indexOf('"children": [', groupStart)
const close = text.indexOf('\n          ],', open)
if (groupStart < 0 || open < 0 || close < 0) throw new Error('Could not find the extension Resources group in project.xcproj')
text = `${text.slice(0, open)}"children": [\n            ${children},${text.slice(close)}`

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
text = text.replace(/"MARKETING_VERSION": "[^"]*"/g, `"MARKETING_VERSION": "${pkg.version}"`)
await writeFile(xcproj, text)
console.log(`Safari app: ${entries.length} resources from ${pkg.version} in ${resources.replace(root + '/', '')}`)
