// Settings and highlights live in extension-local storage (never sync:
// templates and saved highlights outgrow sync's per-item limit, and API keys
// should not travel). Settings are merged over the defaults on every read,
// so a newer version's fields appear without a migration.

import { defaultSettings } from './defaults'
import { ext } from './ext'
import type { Highlight, Settings, Template } from './types'

const SETTINGS_KEY = 'settings'
const HL_PREFIX = 'hl:'

export async function loadSettings(): Promise<Settings> {
  const got = await ext.storage.local.get(SETTINGS_KEY)
  return mergeSettings(got[SETTINGS_KEY])
}

export function mergeSettings(raw: unknown): Settings {
  const d = defaultSettings()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<Settings>
  return {
    ...d,
    ...r,
    version: 1,
    templates: Array.isArray(r.templates) && r.templates.length ? r.templates.map(dropOldDefaultTag) : d.templates,
    highlighter: { ...d.highlighter, ...(r.highlighter ?? {}) },
    reader: { ...d.reader, ...(r.reader ?? {}) },
    interpreter: { ...d.interpreter, ...(r.interpreter ?? {}) }
  }
}

/** The first builds' default template tagged every clip `clippings`. Clips
 *  already sit in a Clippings folder, so that property is dropped from the
 *  default template when it is still exactly as shipped. */
function dropOldDefaultTag(t: Template): Template {
  if (t.id !== 'default') return t
  const properties = t.properties.filter(
    (p) => !(p.id === 'p-tags' && p.name === 'tags' && p.value === 'clippings' && p.type === 'multitext')
  )
  return properties.length === t.properties.length ? t : { ...t, properties }
}

export async function saveSettings(s: Settings): Promise<void> {
  await ext.storage.local.set({ [SETTINGS_KEY]: s })
}

export function onSettingsChanged(fn: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[SETTINGS_KEY]) fn(mergeSettings(changes[SETTINGS_KEY].newValue))
  }
  ext.storage.onChanged.addListener(listener)
  return () => ext.storage.onChanged.removeListener(listener)
}

/** Highlights belong to a page: its URL without the fragment and without
 *  tracking parameters, so a shared link with utm_ tags finds them too. */
export function pageKey(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$)/i.test(k)) u.searchParams.delete(k)
    }
    return u.toString()
  } catch {
    return url
  }
}

export interface PageHighlights {
  url: string
  title: string
  updatedAt: string
  highlights: Highlight[]
}

export async function loadHighlights(url: string): Promise<Highlight[]> {
  const key = HL_PREFIX + pageKey(url)
  const got = await ext.storage.local.get(key)
  const v = got[key] as PageHighlights | undefined
  return Array.isArray(v?.highlights) ? v!.highlights : []
}

export async function saveHighlights(url: string, title: string, highlights: Highlight[]): Promise<void> {
  const key = HL_PREFIX + pageKey(url)
  if (!highlights.length) {
    await ext.storage.local.remove(key)
    return
  }
  const value: PageHighlights = { url: pageKey(url), title, updatedAt: new Date().toISOString(), highlights }
  await ext.storage.local.set({ [key]: value })
}

export async function allHighlights(): Promise<PageHighlights[]> {
  const all = await ext.storage.local.get(null)
  return Object.entries(all)
    .filter(([k]) => k.startsWith(HL_PREFIX))
    .map(([, v]) => v as PageHighlights)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function removePageHighlights(url: string): Promise<void> {
  await ext.storage.local.remove(HL_PREFIX + pageKey(url))
}

export async function clearAllHighlights(): Promise<void> {
  const all = await ext.storage.local.get(null)
  await ext.storage.local.remove(Object.keys(all).filter((k) => k.startsWith(HL_PREFIX)))
}
