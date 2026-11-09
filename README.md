# ZenNotes Web Clipper

A browser extension that turns web pages into Markdown notes in [ZenNotes](https://zennotes.org).
It reads the page, fills a template, puts the note on the clipboard and opens a `zennotes://`
link; the ZenNotes app on your computer or phone writes the file. No server and no account.

Chrome, Edge, Brave, Arc, Firefox (desktop and Android) and Safari (Mac, iPhone, iPad) all run
the same source; each gets its own manifest.

> **Status: in development, not released.** The ZenNotes desktop app learns these links in an
> upcoming release, with the phone apps after it. Until then you can load the extension
> unpacked (below), but a released ZenNotes will not act on its links yet. Safari gets the
> extension as its own App Store app, built from `safari/` ([Safari app](#safari-app-mac-iphone-ipad)).

## How a clip reaches ZenNotes

```
zennotes://new?vault=<name>&file=<folder/name>&clipboard=<sha256>[&append|&prepend][&silent]
zennotes://daily?vault=<name>&clipboard=<sha256>[&append|&prepend][&silent]
```

The extension writes the exact note text to the clipboard, hashes that same string (SHA-256 of
its UTF-8 bytes, lowercase hex) and opens the link. The app files the clipboard only when its
hash matches, so a web page can never make ZenNotes file whatever you copied last. When the
clipboard write fails, a note of at most 32 KiB travels in the link instead (`content=`).

The contract is normative in the ZenNotes repo (`docs/web-clipper-link.md`), with shared cases
in `docs/web-clipper-link.fixtures.json`. `npm run sync-fixtures` copies them into
`test/fixtures/`, and the link builder's tests run every case.

Safari has room for its own path: the extension first sends
`{ type: 'clip', vault, file, text, behavior, silent }` with `runtime.sendNativeMessage`, and
when the native handler accepts it, opens `zennotes://open` to wake the app. The Safari app's
handler declines every clip for now (handing a clip straight to the ZenNotes apps needs their
side first), so Safari on the Mac uses the clipboard path above, and Safari on iPhone and iPad
only copies the note (see [Safari app](#safari-app-mac-iphone-ipad)).

## Features

- **Popup**: Markdown and preview, editable name, location (default `Clippings`), vault,
  properties as YAML frontmatter, and what to do with the note: a new note, the bottom or top
  of a note, or the bottom or top of today's daily note. A selection on the page becomes the
  content; the popup says so and can switch to the whole page.
- **Default template**: `source`, `created` and `description`, plus `author` and `published`
  when the page has them. It adds no tag, since clips already sit in `Clippings`.
- **Templates** with triggers (a URL prefix, a `/regex/`, or `schema:@Type[.key[=value]]`;
  the first match wins and the first template is the fallback), preset variables, `meta:`,
  `selector:` / `selectorHtml:`, `schema:` and prompt variables, `{% if %}`, `{% for %}` and
  `{% set %}`, `??` fallbacks, and 51 chainable filters. Import and export as JSON; template
  files from other clippers that use the same JSON format import too.
- **Highlighter**: highlights are saved per page. When you clip, they can be marked in the
  content (`==text==`), replace it, or be ignored. Drawing them again when you come back to a
  page needs access to the sites you visit, which the clipper does not ask for at install.
  Instead, the first time you save a highlight it asks once: "Highlights are saved. Show them
  when you come back?" `Enter` (or Show them) opens a small window that asks the browser for
  that access; `Esc` (or Not now, or ignoring it) is remembered, and it never asks again. The
  same choice stays in Settings, Highlighter, as "Show highlights when you return to a page".
- **Reader view** with ZenNotes typography, an outline, and adjustable size, width and theme.
- **Interpreter**: fill prompt variables such as `{{"a three bullet summary"}}` with your own
  key for Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, or any chat completions URL.
  Keys stay in extension storage; requests go straight to the provider, and access to the
  provider's address is asked for the first time you run it.

## Keyboard

| Action | Shortcut |
|---|---|
| Open the clipper | `Alt+Shift+Z` (`Option+Shift+Z` on a Mac) |
| Quick clip with the matching template | `Alt+Shift+X` |
| Highlighter on or off | `Alt+Shift+H` |
| Reader view on or off | `Alt+Shift+R` |

In the popup: `Mod+Enter` clips, `Mod+E` switches Markdown and preview, `Mod+I` runs the
Interpreter, `Esc` closes. With the highlighter on: select text and press `H` (or `Enter`),
`U` undoes, `Esc` turns it off; a click on a highlight removes it, a click on an image
highlights it. While the one-time offer to keep highlights is showing, `Enter` accepts it and
`Esc` dismisses it. In reader view: `-` and `=` change the text size, `O` jumps to the outline,
`Esc` closes. Settings tabs move with the arrow keys; templates reorder with `Alt+Up/Down`.

Shortcuts can be changed in the browser: `chrome://extensions/shortcuts` (Edge, Brave and Arc
have the same page), or in Firefox under Add-ons and themes, the gear menu, then Manage
Extension Shortcuts. Safari does not let extensions change them.

## Build

```bash
npm install
```

```bash
npm run build
```

`dist/chrome`, `dist/firefox` and `dist/safari` are the unpacked extensions. `npm run zip`
packs each into `dist/zennotes-web-clipper-<version>-<browser>.zip`. The version comes from
`package.json`.

The store screenshots, promo tile and logo in `store/` are rendered from the real extension:
`npm run build:e2e && npm run store:assets` (Chrome for Testing, an original article page in
`store/source/`).

## Building from source (for reviewers)

The extension is bundled and minified with Vite, so its store packages are built from this
source. The build is deterministic: file names are content hashes and the output holds no
timestamps or machine paths. Checked on:

- Ubuntu 24.04 ARM64
- Node 24.14.0
- npm 11.9.0

From the root of the source package:

```bash
npm ci
```

```bash
npm run build
```

`dist/firefox` is the Firefox package, byte for byte (`dist/chrome` and `dist/safari` are built
alongside it). The build needs no network access after `npm ci`. Source code of our own is in
`src/`; `node_modules` holds only the dependencies in `package-lock.json` (React, Defuddle,
day.js, marked, DOMPurify, and the build tools).

## Load it unpacked

**Chrome, Edge, Brave, Arc**: open `chrome://extensions` (`edge://extensions`,
`brave://extensions`), turn on Developer mode, choose Load unpacked, and pick `dist/chrome`.

**Firefox**: open `about:debugging`, This Firefox, Load Temporary Add-on, and pick
`dist/firefox/manifest.json`. Or let web-ext start a fresh Firefox with it:

```bash
npm run run:firefox
```

**Firefox for Android**: with a device connected over adb and USB debugging on,

```bash
npx web-ext run --source-dir dist/firefox -t firefox-android --android-device <device-id>
```

**Safari**: Safari loads extensions only from an app, so it runs from the Xcode project in
`safari/`; see [Safari app](#safari-app-mac-iphone-ipad).

## Safari app (Mac, iPhone, iPad)

Safari gets the extension inside its own app, **ZenNotes Web Clipper**, one App Store record for
macOS and iOS (universal purchase). `safari/ZenNotes Web Clipper/` is the Xcode project, made once
by `xcrun safari-web-extension-converter` and kept in git:

| Target | Bundle ID | Runs on |
|---|---|---|
| ZenNotes Web Clipper (macOS) | `md.zennotes.webclipper` | macOS 13 and later |
| ZenNotes Web Clipper (iOS) | `md.zennotes.webclipper` | iOS and iPadOS 17 and later |
| ZenNotes Web Clipper Extension (macOS and iOS) | `md.zennotes.webclipper.extension` | inside the app |

Signing is automatic, team Lumary Labs LLC (WYY7PK57DM). The app is a single page per platform
(`Shared (App)/Resources`) that says how to turn the extension on: on the Mac it shows whether
the extension is on, and Return opens Safari Settings. No account, nothing tracked.

After any change under `src/` (or a version bump in `package.json`), refresh the extension inside
the project with one command:

```bash
npm run safari:sync
```

It builds into `.safari-build/` (never touching `dist/`), replaces `Shared (Extension)/Resources`
with the Safari build, lists the new files in the project, and sets the app version to the
extension's. Commit the result with the change that caused it.

**On the Mac**: open `safari/ZenNotes Web Clipper/ZenNotes Web Clipper.xcodeproj`, pick the
`ZenNotes Web Clipper (macOS)` scheme and Run. Turn the extension on in Safari Settings,
Extensions (if a local build does not show up there, turn on Settings, Advanced, Show features
for web developers, then Develop, Allow Unsigned Extensions), and allow it on the sites you clip.

**On iPhone and iPad**: pick the `ZenNotes Web Clipper (iOS)` scheme and a simulator or device,
Run, then turn the extension on in Settings, Apps, Safari, Extensions (or in Safari: the
extensions button in the address bar, Manage Extensions) and allow it on all websites. The
popup is a sheet on iPhone and a popover on iPad.

**How a clip leaves Safari:**

- **Mac**: as in other browsers. The note goes on the clipboard and the `zennotes://` link opens
  the ZenNotes app, which files it.
- **iPhone and iPad**: the note is only copied, and the clipper says so ("Copied. Paste it into a
  note in ZenNotes."). The released ZenNotes phone app reads every `zennotes://new` link as its
  widget's "new note" action, so a clip link would open a blank note and drop the clip. Settings,
  General, "Open ZenNotes after clipping" switches to the clipboard and link path; turn it on (or
  make it the default) once a ZenNotes phone release reads clip links. **The iOS handoff depends
  on the phone app**: until it reads the links (or drains an App Group inbox that the native
  handler fills, the `sendNativeMessage` path above), copying is the honest default.

**What Safari does differently:**

- Safari manages site access itself, in its own settings. On iPhone and iPad,
  `permissions.request` answers no at once without asking, so in Safari the one-time offer to
  keep highlights is not shown (the Highlighter settings say to allow the extension on all
  websites instead) and the Interpreter does not wait for a grant: Safari's own site access
  decides whether the request goes through.
- iPhone and iPad have no extension keyboard shortcuts and no right-click menu. Highlighting is
  select, then Highlight in the bar at the bottom of the page; tapping a highlight does not
  remove it there (Clear in the same bar does).
- Key hints are hidden on touch screens.
- Shortcuts are fixed in Safari (it does not let extensions change them).

**App Store builds**: archive both platforms. With no `-archivePath`, the archives land where
Xcode's Organizer lists them, and nothing is uploaded until you choose Distribute App there:

```bash
xcodebuild archive -project "safari/ZenNotes Web Clipper/ZenNotes Web Clipper.xcodeproj" -scheme "ZenNotes Web Clipper (iOS)" -destination "generic/platform=iOS" -allowProvisioningUpdates
```

```bash
xcodebuild archive -project "safari/ZenNotes Web Clipper/ZenNotes Web Clipper.xcodeproj" -scheme "ZenNotes Web Clipper (macOS)" -destination "generic/platform=macOS" -allowProvisioningUpdates
```

Raise `CURRENT_PROJECT_VERSION` (the build number) for every upload. Listing text, App Privacy
answers and screenshots are in `store/safari/`.

## How to test locally

Unit tests run on saved pages under jsdom: extraction, templates, filters, the highlighter,
the Interpreter's requests, and the link builder against the shared fixtures.

```bash
npm run typecheck
```

```bash
npm test
```

The end-to-end runs load the extension into a real browser with a throwaway profile, serve
`test/fixtures/pages` on 127.0.0.1, clip from the popup (`Mod+Enter`) and by quick clip, and
check that each link's `clipboard=` hash is the SHA-256 of what landed on the clipboard. They
also exercise the highlighter, reader view and the one-time offer to keep highlights (accepted:
a reload draws the highlight again; dismissed: it does not come back), and save screenshots.
A script cannot click the browser's own access prompt, so there the request answers yes;
everything after it runs for real. They replace
`tabs.update` in the extension before clipping and block the scheme in the profile, so no
`zennotes://` link ever reaches an installed ZenNotes.

```bash
npm run build:e2e
```

```bash
npm run e2e:chrome
```

```bash
FIREFOX_PATH=/Applications/Firefox.app/Contents/MacOS/firefox npm run e2e:firefox
```

`e2e:chrome` finds Chrome for Testing in Playwright's cache (`npx playwright install chromium`)
or uses `CHROME_PATH`. If Firefox quits at once with "Could not find profile folder" (it does
when started from a sandboxed parent, such as some IDE terminals), pass
`FIREFOX_APP=/Applications/Firefox.app` instead and it is started through Launch Services.
The `-e2e` builds differ from the real ones only in granting 127.0.0.1 up front (and, for
Firefox, clipboard read), since a script cannot click the toolbar button that grants access.

By hand, with ZenNotes installed: load `dist/chrome`, open an article, press `Alt+Shift+Z`,
check the name, location and content, then press `Mod+Enter`. Chrome asks to open ZenNotes;
allow it and the note appears in `Clippings`. To see the link without opening the app, open
the browser's console on the popup (right-click, Inspect) before clipping.

## Layout

```
src/shared       link builder, handoff, storage, settings types, messages
src/template     template parser, evaluator, filters, triggers, frontmatter, import
src/extract      Defuddle extraction and HTML to Markdown
src/highlight    highlighter and its text anchors
src/reader       reader view
src/interpreter  provider requests and answer parsing
src/content      content script (runs the engine on the live page)
src/background   shortcuts, menus, quick clip, Safari native handoff
src/offscreen    Chromium clipboard writer for quick clip
src/popup        popup (React)
src/settings     settings page (React)
scripts          build, manifests, zips, fixture sync, end-to-end runs, Safari sync, store images
test             vitest suites and fixture pages
safari           the Safari app's Xcode project (macOS and iOS), refreshed by npm run safari:sync
store            store listings, privacy answers and images (store/safari for the App Store)
```

## License

MIT. See [LICENSE](LICENSE).
