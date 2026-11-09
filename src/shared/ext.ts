// One handle on the extension API. Firefox and Safari expose a promise-based
// `browser`; Chromium's `chrome` returns promises in Manifest V3 too, so the
// code is written once against chrome's types.

export const ext: typeof chrome =
  (globalThis as unknown as { browser?: typeof chrome }).browser ?? globalThis.chrome

/** Root-absolute: Firefox resolves a relative script path against the
 *  calling page (settings/content.js from the settings page), Chromium
 *  against the extension root. */
export const CONTENT_SCRIPT = '/content.js'

export type Flavor = 'chrome' | 'firefox' | 'safari'

export function flavor(): Flavor {
  const base = ext?.runtime?.getURL?.('') ?? ''
  if (base.startsWith('moz-extension:')) return 'firefox'
  if (base.startsWith('safari-web-extension:')) return 'safari'
  return 'chrome'
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

/** "Cmd" on Apple systems, "Ctrl" elsewhere, for key hints. */
export function modKey(): string {
  return isMac() ? '⌘' : 'Ctrl'
}
