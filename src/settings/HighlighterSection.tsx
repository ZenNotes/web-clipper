import { useEffect, useState } from 'react'
import { ext } from '../shared/ext'
import { allHighlights, clearAllHighlights, removePageHighlights, type PageHighlights } from '../shared/storage'
import type { HighlightContentMode } from '../shared/types'
import { Button, Toggle } from '../ui/controls'
import { download, SectionTitle, type SectionProps } from './common'

const MODES: { id: HighlightContentMode; label: string; hint: string }[] = [
  { id: 'highlight', label: 'Mark them in the content', hint: 'Highlights appear as ==text== in the article.' },
  { id: 'replace', label: 'Clip only the highlights', hint: 'The content is the highlights, without the rest.' },
  { id: 'nothing', label: 'Ignore them', hint: 'The content is the article as it is.' }
]

const PAGE_ORIGINS = ['http://*/*', 'https://*/*']

export function HighlighterSection({ settings, update }: SectionProps) {
  const [pages, setPages] = useState<PageHighlights[]>([])
  const [query, setQuery] = useState('')
  const refresh = () => void allHighlights().then(setPages)
  useEffect(refresh, [])

  const shown = pages.filter((p) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      p.title.toLowerCase().includes(q) ||
      p.url.toLowerCase().includes(q) ||
      p.highlights.some((h) => h.text.toLowerCase().includes(q))
    )
  })

  return (
    <div className="flex max-w-dialog-lg flex-col gap-8">
      <section className="flex flex-col gap-3">
        <SectionTitle title="Highlighter">
          Turn it on from the popup or with its shortcut, select text, then press H.
        </SectionTitle>
        <fieldset className="flex flex-col gap-2">
          <legend className="zn-label">When you clip a page with highlights</legend>
          {MODES.map((m) => (
            <label key={m.id} className="flex items-start gap-3">
              <input
                type="radio"
                name="hl-mode"
                className="mt-1 accent-accent"
                checked={settings.highlighter.contentMode === m.id}
                onChange={() => update((s) => ({ ...s, highlighter: { ...s.highlighter, contentMode: m.id } }))}
              />
              <span>
                <span className="block text-sm text-ink-800">{m.label}</span>
                <span className="block text-2xs text-ink-500">{m.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Toggle
          id="hl-restore"
          label="Show highlights when you return to a page"
          hint="Needs access to the sites you visit, asked for when you turn this on."
          checked={settings.highlighter.restoreOnVisit}
          onChange={(v) => {
            // Choosing here answers the one-time offer too.
            const apply = () =>
              update((s) => ({ ...s, highlighter: { ...s.highlighter, restoreOnVisit: v, restoreOffered: true } }))
            if (!v) {
              apply()
              return
            }
            void ext.permissions
              .request({ origins: PAGE_ORIGINS })
              .then((ok) => {
                if (ok) apply()
              })
              .catch(() => undefined)
          }}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex-1 text-base font-semibold text-ink-800">Saved highlights</h3>
          <Button size="sm" disabled={!pages.length} onClick={() => download('zennotes-highlights.json', JSON.stringify(pages, null, 2))}>
            Export
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!pages.length}
            onClick={() => {
              if (confirm('Delete every saved highlight?')) void clearAllHighlights().then(refresh)
            }}
          >
            Delete all
          </Button>
        </div>
        <input
          className="zn-input mb-3"
          placeholder="Search highlights"
          aria-label="Search highlights"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {shown.length === 0 && <p className="text-sm text-ink-500">No highlights yet.</p>}
        <ul className="flex flex-col gap-3">
          {shown.map((p) => (
            <li key={p.url} className="rounded-md border border-paper-300 bg-paper-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <a className="min-w-0 flex-1 truncate text-sm font-medium text-accent" href={p.url} target="_blank" rel="noreferrer">
                  {p.title || p.url}
                </a>
                <Button size="sm" variant="danger" onClick={() => void removePageHighlights(p.url).then(refresh)}>
                  Delete
                </Button>
              </div>
              <ul className="mt-1 flex flex-col gap-1">
                {p.highlights.map((h) => (
                  <li key={h.id} className="border-l-2 border-warning pl-2 text-xs text-ink-700">
                    {h.kind === 'element' ? `Image ${h.text || ''}` : h.text}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
