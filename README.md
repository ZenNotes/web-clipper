# ZenNotes Web Clipper

A browser extension that turns web pages into Markdown notes in [ZenNotes](https://zennotes.org).
It reads the page, fills a template, puts the note on the clipboard and opens a `zennotes://`
link; the ZenNotes app on your computer or phone writes the file. No server and no account.

Chrome, Edge, Brave, Arc, Firefox (desktop and Android) and Safari (Mac, iPhone, iPad) all run
the same source; each gets its own manifest.

> **Status: in development, not released.** The ZenNotes desktop app learns these links in an
> upcoming release, with the phone apps and Safari after it. Until then you can load the
> extension unpacked (below), but a released ZenNotes will not act on its links yet.

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

Safari has its own path when the app's native handler is present: the extension sends
`{ type: 'clip', vault, file, text, behavior, silent }` with `runtime.sendNativeMessage`, then
opens `zennotes://open` to wake the app. Without the handler it uses the clipboard path above.

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
  `{% set %}`, `??` fallbacks, and 51 chainable filters. Import and export as JSON, including
  template files from Obsidian's clipper.
- **Highlighter**: highlights are saved per page and drawn again on a later visit. When you clip,
  they can be marked in the content (`==text==`), replace it, or be ignored.
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
highlights it. In reader view: `-` and `=` change the text size, `O` jumps to the outline,
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

**Safari**: wrap the build in an Xcode project, then run the app target once:

```bash
xcrun safari-web-extension-converter dist/safari --project-location build/safari --no-open
```

In Safari, turn on Settings, Advanced, Show features for web developers, then Develop, Allow
Unsigned Extensions, and enable the extension in Settings, Extensions. The real Safari
container (with the native clip handler) ships inside the ZenNotes app.

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
also exercise the highlighter and reader view and save screenshots. They replace
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
scripts          build, manifests, zips, fixture sync, end-to-end runs
test             vitest suites and fixture pages
```

## License

MIT. See [LICENSE](LICENSE).
