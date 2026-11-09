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

/** The browser's own idea of the platform: 'ios' for Safari on iPhone and
 *  iPad, 'mac', 'win', 'linux', 'android'. */
export async function platformOs(): Promise<string> {
  try {
    return (await ext.runtime.getPlatformInfo()).os
  } catch {
    return /iPhone|iPad/.test(navigator.userAgent) ? 'ios' : ''
  }
}

/** What a clip ends with on iPhone and iPad, where it may only be copied. */
export function iosClipMessage(via: string): string {
  return via === 'copied'
    ? 'Copied. Paste it into a note in ZenNotes.'
    : 'Sent. If ZenNotes did not open, the note is on your clipboard.'
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

/** "Cmd" on Apple systems, "Ctrl" elsewhere, for key hints. */
export function modKey(): string {
  return isMac() ? '⌘' : 'Ctrl'
}
