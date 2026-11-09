// The background worker: shortcuts, context menus, quick clip, the Safari
// native handoff, and the restore script registration. A service worker on
// Chromium (clipboard writes go through an offscreen document), an event
// page on Firefox and Safari (which can write the clipboard themselves).

import { CONTENT_SCRIPT, ext, flavor, iosClipMessage, platformOs } from '../shared/ext'
import {
  copyWithExecCommand,
  handoff,
  type HandoffDeps,
  type NativeClipMessage,
  type NativeClipReply
} from '../shared/handoff'
import type { BackgroundRequest, CompileResponse, ContentError, ContentRequest } from '../shared/messages'
import { answerPrompts, noteParts, permissionOrigin, resolveModel, targetFor, withParts } from '../shared/pipeline'
import { decideOffer, PAGE_ORIGINS, restoreMatches } from '../highlight/offer'
import { interpreterAccess } from '../interpreter/access'
import { loadSettings, onSettingsChanged, saveSettings } from '../shared/storage'
import type { Settings } from '../shared/types'
import { noteText } from '../template/compile'

const RESTORE_ID = 'zn-restore-highlights'
/** Safari ignores the application id; other browsers never take this path. */
const NATIVE_APP_ID = 'org.zennotes.app'

async function ensureContent(tabId: number): Promise<boolean> {
  try {
    const pong = (await ext.tabs.sendMessage(tabId, { type: 'zn:ping' } satisfies ContentRequest)) as
      | { ok?: boolean }
      | undefined
    if (pong?.ok) return true
  } catch {
    /* not injected yet */
  }
  try {
    const results = await ext.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] })
    return !results?.some((r) => (r as { error?: unknown }).error)
  } catch {
    return false
  }
}

function send<T>(tabId: number, msg: ContentRequest): Promise<T> {
  return ext.tabs.sendMessage(tabId, msg) as Promise<T>
}

async function flashBadge(text: string, title: string): Promise<void> {
  try {
    await ext.action.setBadgeBackgroundColor({ color: '#c14a4a' })
    await ext.action.setBadgeText({ text })
    await ext.action.setTitle({ title })
    setTimeout(() => {
      void ext.action.setBadgeText({ text: '' })
      void ext.action.setTitle({ title: 'ZenNotes Web Clipper' })
    }, 4000)
  } catch {
    /* no action badge on this browser */
  }
}

let offscreenReady: Promise<void> | null = null

async function ensureOffscreen(): Promise<void> {
  const off = (chrome as typeof chrome & { offscreen?: typeof chrome.offscreen }).offscreen
  if (!off) throw new Error('no offscreen')
  if (!offscreenReady) {
    offscreenReady = (async () => {
      const has = await (off as unknown as { hasDocument?: () => Promise<boolean> }).hasDocument?.()
      if (!has) {
        await off.createDocument({
          url: 'offscreen/offscreen.html',
          reasons: [chrome.offscreen.Reason.CLIPBOARD],
          justification: 'Write the clipped note to the clipboard for ZenNotes to read.'
        })
      }
    })().catch((err) => {
      offscreenReady = null
      throw err
    })
  }
  await offscreenReady
}

async function writeClipboard(text: string): Promise<boolean> {
  if (flavor() === 'chrome' && typeof document === 'undefined') {
    try {
      await ensureOffscreen()
      const reply = (await ext.runtime.sendMessage({ target: 'offscreen', type: 'copy', text })) as
        | { ok?: boolean }
        | undefined
      return !!reply?.ok
    } catch {
      return false
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return typeof document !== 'undefined' && copyWithExecCommand(text)
  }
}

function nativeAvailable(): boolean {
  return flavor() === 'safari' && typeof ext.runtime.sendNativeMessage === 'function'
}

async function nativeClip(message: NativeClipMessage): Promise<NativeClipReply | null> {
  if (!nativeAvailable()) return null
  try {
    const reply = (await ext.runtime.sendNativeMessage(NATIVE_APP_ID, message)) as NativeClipReply | undefined
    return reply && typeof reply === 'object' ? reply : null
  } catch {
    return null
  }
}

function handoffDeps(tabId: number): HandoffDeps {
  return {
    writeClipboard,
    openLink: async (url) => {
      await ext.tabs.update(tabId, { url })
    },
    nativeClip: nativeAvailable() ? nativeClip : undefined
  }
}

async function quickClip(tab: chrome.tabs.Tab | undefined): Promise<void> {
  const tabId = tab?.id
  if (tabId === undefined) return
  if (!(await ensureContent(tabId))) {
    await flashBadge('!', 'This page cannot be clipped.')
    return
  }
  const settings = await loadSettings()
  const res = await send<CompileResponse | ContentError>(tabId, { type: 'zn:compile' })
  if (!res?.ok) {
    await send(tabId, { type: 'zn:toast', text: res?.error ?? 'Could not read the page.', tone: 'error' })
    return
  }
  let note = res.note
  if (note.prompts.length) {
    let answers: [string, unknown][] = []
    if (settings.interpreter.enabled && settings.interpreter.runOnQuickClip && (await providerAllowed(settings))) {
      try {
        answers = [...(await answerPrompts(note, settings))]
      } catch (err) {
        await send(tabId, {
          type: 'zn:toast',
          text: `Interpreter: ${err instanceof Error ? err.message : String(err)}`,
          tone: 'error'
        })
        return
      }
    }
    const fin = await send<{ ok: boolean; parts: string[] }>(tabId, {
      type: 'zn:finalize',
      parts: noteParts(note),
      prompts: note.prompts,
      answers
    })
    note = withParts(note, fin.parts)
  }
  const ios = (await platformOs()) === 'ios'
  const result = await handoff(noteText(note), targetFor(note, settings), handoffDeps(tabId), {
    preferInline: settings.preferInline,
    copyOnly: ios && !settings.iosOpenApp
  })
  await send(tabId, {
    type: 'zn:toast',
    text: !result.ok ? result.error : ios ? iosClipMessage(result.via) : `Sent to ZenNotes: ${note.name || 'note'}`,
    tone: result.ok ? 'ok' : 'error'
  }).catch(() => undefined)
}

async function providerAllowed(settings: Settings): Promise<boolean> {
  const resolved = resolveModel(settings)
  const origin = resolved ? permissionOrigin(resolved.provider) : null
  if (!origin) return false
  // Safari decides site access itself; the request is simply tried.
  if (flavor() === 'safari') return true
  try {
    // On Firefox the data consent must have been given too; quick clip has
    // no gesture to ask with, so it only uses what the popup was granted.
    return await ext.permissions.contains(interpreterAccess(origin, flavor()) as chrome.permissions.Permissions)
  } catch {
    return false
  }
}

async function toggle(tab: chrome.tabs.Tab | undefined, what: 'highlighter' | 'reader'): Promise<void> {
  const tabId = tab?.id
  if (tabId === undefined) return
  if (!(await ensureContent(tabId))) {
    await flashBadge('!', 'This page cannot be changed.')
    return
  }
  await send(
    tabId,
    what === 'reader' ? { type: 'zn:reader', action: 'toggle' } : { type: 'zn:highlighter', action: 'toggle' }
  )
}

async function syncRestoreScript(settings?: Settings): Promise<void> {
  const s = settings ?? (await loadSettings())
  const scripting = ext.scripting as typeof chrome.scripting | undefined
  if (!scripting?.registerContentScripts) return
  let granted: string[] = []
  try {
    granted = (await ext.permissions.getAll()).origins ?? []
  } catch {
    granted = []
  }
  const matches = s.highlighter.restoreOnVisit ? restoreMatches(granted) : []
  const existing = await scripting.getRegisteredContentScripts({ ids: [RESTORE_ID] }).catch(() => [])
  const same =
    existing.length > 0 && JSON.stringify([...(existing[0]!.matches ?? [])].sort()) === JSON.stringify([...matches].sort())
  if (same || (existing.length === 0 && matches.length === 0)) return
  if (existing.length > 0) await scripting.unregisterContentScripts({ ids: [RESTORE_ID] }).catch(() => undefined)
  if (matches.length > 0) {
    await scripting
      .registerContentScripts([
        { id: RESTORE_ID, matches, js: ['restore.js'], runAt: 'document_idle', persistAcrossSessions: true }
      ])
      .catch(() => undefined)
  }
}

/** Shows the offer once, the first time a highlight is saved while
 *  highlights are not drawn on return and the extension has no site access. */
async function offerCheck(): Promise<boolean> {
  // Safari keeps site access in its own settings and answers a request with
  // no; the Highlighter settings say where to allow it instead.
  if (flavor() === 'safari') return false
  const s = await loadSettings()
  let granted = false
  try {
    granted = await ext.permissions.contains({ origins: PAGE_ORIGINS })
  } catch {
    granted = false
  }
  const d = decideOffer(s, granted)
  if (d.next) await saveSettings(d.next)
  return d.offer
}

/** The access request has to come from a click or key in an extension page;
 *  a content script cannot make it. A small window holds that one question
 *  in Chrome and Firefox alike (a tab where there are no windows). */
async function openOffer(tabId: number | undefined): Promise<void> {
  const url = ext.runtime.getURL(`offer/offer.html${tabId !== undefined ? `?tab=${tabId}` : ''}`)
  try {
    await ext.windows.create({ url, type: 'popup', width: 460, height: 200, focused: true })
  } catch {
    await ext.tabs.create({ url })
  }
}

/** Registers the restore script and draws saved highlights in `tabId` now,
 *  so accepting the offer needs no reload. */
async function restoreNow(tabId: number | undefined): Promise<void> {
  await syncRestoreScript()
  if (tabId === undefined) return
  await ext.scripting.executeScript({ target: { tabId }, files: ['/restore.js'] }).catch(() => undefined)
}

function createMenus(): void {
  const menus = ext.contextMenus as typeof chrome.contextMenus | undefined
  if (!menus?.create) return
  menus.removeAll(() => {
    menus.create({ id: 'zn-clip', title: 'Clip to ZenNotes', contexts: ['page', 'selection', 'link', 'image'] })
    menus.create({ id: 'zn-highlight', title: 'Highlight selection', contexts: ['selection'] })
    menus.create({ id: 'zn-highlighter', title: 'Toggle highlighter', contexts: ['page'] })
    menus.create({ id: 'zn-reader', title: 'Toggle reader view', contexts: ['page'] })
  })
}

ext.runtime.onInstalled.addListener(() => {
  createMenus()
  void syncRestoreScript()
})

ext.runtime.onStartup?.addListener(() => {
  void syncRestoreScript()
})

ext.contextMenus?.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'zn-clip':
      void quickClip(tab)
      break
    case 'zn-highlight':
      if (tab?.id !== undefined) {
        void ensureContent(tab.id).then(
          (ok) => ok && send(tab.id!, { type: 'zn:highlighter', action: 'add-selection' })
        )
      }
      break
    case 'zn-highlighter':
      void toggle(tab, 'highlighter')
      break
    case 'zn-reader':
      void toggle(tab, 'reader')
      break
  }
})

ext.commands?.onCommand.addListener((command, tab) => {
  const run = async () => {
    const t = tab ?? (await ext.tabs.query({ active: true, currentWindow: true }))[0]
    if (command === 'quick-clip') await quickClip(t)
    else if (command === 'toggle-highlighter') await toggle(t, 'highlighter')
    else if (command === 'toggle-reader') await toggle(t, 'reader')
  }
  void run()
})

ext.runtime.onMessage.addListener((msg: BackgroundRequest | { target?: string }, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || (msg as { target?: string }).target === 'offscreen') return
  const m = msg as BackgroundRequest
  if (m.type === 'zn:native-available') {
    sendResponse({ ok: nativeAvailable() })
    return
  }
  if (m.type === 'zn:native-clip') {
    nativeClip(m.message).then(sendResponse, () => sendResponse(null))
    return true
  }
  if (m.type === 'zn:quick-clip') {
    // From the extension's own pages only: runtime messages never come
    // from web pages, which have no externally_connectable entry.
    ext.tabs
      .get(m.tabId)
      .then((tab) => quickClip(tab))
      .then(
        () => sendResponse({ ok: true }),
        (err: unknown) => sendResponse({ ok: false, error: String(err) })
      )
    return true
  }
  if (m.type === 'zn:offer-check') {
    offerCheck().then(
      (offer) => sendResponse({ offer }),
      () => sendResponse({ offer: false })
    )
    return true
  }
  if (m.type === 'zn:offer-open') {
    openOffer(sender.tab?.id).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false })
    )
    return true
  }
  if (m.type === 'zn:restore-now') {
    restoreNow(m.tabId).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false })
    )
    return true
  }
  if (m.type === 'zn:restore-sync') {
    syncRestoreScript().then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false })
    )
    return true
  }
})

ext.permissions?.onAdded?.addListener(() => void syncRestoreScript())
ext.permissions?.onRemoved?.addListener(() => void syncRestoreScript())
onSettingsChanged((s) => void syncRestoreScript(s))
