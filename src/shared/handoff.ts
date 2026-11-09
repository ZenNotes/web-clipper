// Hands a finished note to the app. The default path writes the exact note
// text to the clipboard, hashes that same string and opens a link carrying
// the hash; the app files the clipboard only when the hashes match. When the
// clipboard write fails, a note that fits travels inline (`content=`).
//
// Safari has its own path: the extension's native handler (built in the app
// repos) drops the clip into the app's inbox, then a link wakes the app. It
// sits behind feature detection, and any failure falls back to the
// clipboard path, so a Safari build without the handler still clips.

import { sha256Hex } from './hash'
import {
  buildClipLink,
  ClipLinkError,
  MAX_CONTENT_BYTES,
  MAX_NOTE_BYTES,
  requestFor,
  utf8Length,
  type Behavior,
  type ClipTarget
} from './link'

export interface HandoffDeps {
  writeClipboard(text: string): Promise<boolean>
  openLink(url: string): Promise<void>
  /** Safari only. Resolves to the reply, or null when there is no handler. */
  nativeClip?: (message: NativeClipMessage) => Promise<NativeClipReply | null>
}

export interface NativeClipMessage {
  type: 'clip'
  vault: string | null
  file: string | null
  text: string
  behavior: Behavior
  silent: boolean
}

export interface NativeClipReply {
  ok: boolean
  /** A link the handler wants opened to wake the app; defaults below. */
  wake?: string
}

/** Opened after a native clip. It names no file and carries no body, so the
 *  app has nothing to create from it: a body-less `new?file=` would make an
 *  empty note beside the one the handler filed. */
export const NATIVE_WAKE_LINK = 'zennotes://open'

export type HandoffResult =
  | { ok: true; via: 'clipboard' | 'inline' | 'native' | 'copied'; link: string }
  | { ok: false; error: string }

export interface HandoffOptions {
  /** Send notes that fit in the link inline instead of on the clipboard
   *  (for systems where the app cannot read the clipboard while unfocused). */
  preferInline?: boolean
  /** Only copy the note; open no link. For iPhone and iPad, where the
   *  ZenNotes app does not read clip links yet: its widget link
   *  `zennotes://new` would make a blank note instead. */
  copyOnly?: boolean
}

export async function handoff(
  text: string,
  target: ClipTarget,
  deps: HandoffDeps,
  options: HandoffOptions = {}
): Promise<HandoffResult> {
  const bytes = utf8Length(text)
  if (bytes === 0) return { ok: false, error: 'There is nothing to clip.' }
  if (bytes > MAX_NOTE_BYTES) return { ok: false, error: 'The note is over 8 MiB.' }

  if (options.copyOnly) {
    return (await deps.writeClipboard(text).catch(() => false))
      ? { ok: true, via: 'copied', link: '' }
      : { ok: false, error: 'Could not copy the note.' }
  }

  try {
    if (deps.nativeClip) {
      const file =
        target.behavior === 'daily-append' || target.behavior === 'daily-prepend'
          ? null
          : [target.folder, target.name].filter(Boolean).join('/')
      const reply = await deps.nativeClip({
        type: 'clip',
        vault: target.vault,
        file,
        text,
        behavior: target.behavior,
        silent: target.silent
      }).catch(() => null)
      if (reply?.ok) {
        const wake = reply.wake && /^zennotes:/i.test(reply.wake) ? reply.wake : NATIVE_WAKE_LINK
        if (!target.silent) await deps.openLink(wake)
        return { ok: true, via: 'native', link: wake }
      }
    }

    const fits = bytes <= MAX_CONTENT_BYTES
    if (options.preferInline && fits) {
      const link = buildClipLink(requestFor(target, { content: text }))
      await deps.openLink(link)
      return { ok: true, via: 'inline', link }
    }

    if (await deps.writeClipboard(text).catch(() => false)) {
      const link = buildClipLink(requestFor(target, { clipboard: await sha256Hex(text) }))
      await deps.openLink(link)
      return { ok: true, via: 'clipboard', link }
    }

    if (fits) {
      const link = buildClipLink(requestFor(target, { content: text }))
      await deps.openLink(link)
      return { ok: true, via: 'inline', link }
    }
    return { ok: false, error: 'Could not write to the clipboard, and the note is too long for the link.' }
  } catch (err) {
    if (err instanceof ClipLinkError) return { ok: false, error: err.message }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Clipboard write for a page with user activation (popup, options page).
 *  execCommand is the fallback for pages where the async API is refused. */
export async function writeClipboardInPage(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyWithExecCommand(text)
  }
}

export function copyWithExecCommand(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}
