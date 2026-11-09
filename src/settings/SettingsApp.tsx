// The settings page. Sections are tabs (arrow keys move between them);
// every change saves on its own after a short pause.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ext } from '../shared/ext'
import { loadSettings, saveSettings } from '../shared/storage'
import type { Settings } from '../shared/types'
import type { Update } from './common'
import { GeneralSection } from './GeneralSection'
import { HighlighterSection } from './HighlighterSection'
import { InterpreterSection } from './InterpreterSection'
import { ReaderSection } from './ReaderSection'
import { TemplatesSection } from './TemplatesSection'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'templates', label: 'Templates' },
  { id: 'highlighter', label: 'Highlighter' },
  { id: 'reader', label: 'Reader' },
  { id: 'interpreter', label: 'Interpreter' }
] as const

type TabId = (typeof TABS)[number]['id']

export function SettingsApp() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tab, setTab] = useState<TabId>(() => {
    const h = location.hash.slice(1)
    return (TABS.find((t) => t.id === h)?.id ?? 'general') as TabId
  })
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])

  const update: Update = (fn) => {
    setSettings((prev) => {
      if (!prev) return prev
      const next = fn(prev)
      setSaved('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void saveSettings(next).then(() => setSaved('saved'))
      }, 300)
      return next
    })
  }

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.id === tab)
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1
    const next = TABS[(i + step + TABS.length) % TABS.length]!.id
    setTab(next)
    location.hash = next
    tabRefs.current[next]?.focus()
  }

  if (!settings) return <div className="p-6 text-ink-500">Loading…</div>

  return (
    <div className="mx-auto flex min-h-screen max-w-dialog-xl gap-8 px-6 py-8">
      <nav className="w-44 shrink-0">
        <h1 className="mb-4 text-base font-semibold text-ink-800">Web Clipper</h1>
        <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-0.5" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => {
                setTab(t.id)
                location.hash = t.id
              }}
              className={`rounded-md px-3 py-1.5 text-left text-sm ${
                tab === t.id ? 'bg-paper-300 font-medium text-ink-800' : 'text-ink-600 hover:bg-paper-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-6 text-2xs text-ink-400" aria-live="polite">
          {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : ''}
        </p>
        <p className="mt-2 text-2xs text-ink-400">Version {ext.runtime.getManifest().version}</p>
      </nav>
      <main
        className="min-w-0 flex-1"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'general' && <GeneralSection settings={settings} update={update} />}
        {tab === 'templates' && <TemplatesSection settings={settings} update={update} />}
        {tab === 'highlighter' && <HighlighterSection settings={settings} update={update} />}
        {tab === 'reader' && <ReaderSection settings={settings} update={update} />}
        {tab === 'interpreter' && <InterpreterSection settings={settings} update={update} />}
      </main>
    </div>
  )
}
