// Templates: the list on the left (arrow keys move, Alt+Arrow reorders,
// first is the fallback), the editor on the right. Import takes our own
// export or template files from Obsidian's clipper; JSON files can also be
// dropped anywhere on the section.

import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { defaultTemplate, DEFAULT_LOCATION, newId } from '../shared/defaults'
import { BEHAVIORS, type Behavior } from '../shared/link'
import type { PropertyType, Template } from '../shared/types'
import { exportTemplate, exportTemplates, importTemplates } from '../template/import'
import { Button, Field, Select } from '../ui/controls'
import { download, SectionTitle, type SectionProps } from './common'

const TYPES: { id: PropertyType; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'multitext', label: 'List' },
  { id: 'number', label: 'Number' },
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'date', label: 'Date' },
  { id: 'datetime', label: 'Date and time' }
]

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template'

export function TemplatesSection({ settings, update }: SectionProps) {
  const [selected, setSelected] = useState(settings.templates[0]?.id ?? '')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const templates = settings.templates
  const current = templates.find((t) => t.id === selected) ?? templates[0]

  const setTemplates = (fn: (ts: Template[]) => Template[]) => update((s) => ({ ...s, templates: fn(s.templates) }))
  const patch = (id: string, p: Partial<Template>) =>
    setTemplates((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)))

  const move = (id: string, dir: -1 | 1) =>
    setTemplates((ts) => {
      const i = ts.findIndex((t) => t.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= ts.length) return ts
      const next = [...ts]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })

  const add = (t: Template) => {
    setTemplates((ts) => [...ts, t])
    setSelected(t.id)
  }

  const importText = (text: string) => {
    try {
      const got = importTemplates(text)
      setTemplates((ts) => [...ts, ...got])
      setSelected(got[0]!.id)
      setMessage({ tone: 'ok', text: got.length === 1 ? `Imported ${got[0]!.name}.` : `Imported ${got.length} templates.` })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  const onFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) importText(await f.text())
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    void onFiles(e.dataTransfer.files)
  }

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (!current) return
    const i = templates.findIndex((t) => t.id === current.id)
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const dir = e.key === 'ArrowDown' ? 1 : -1
    if (e.altKey) {
      move(current.id, dir)
      return
    }
    const next = templates[i + dir]
    if (next) {
      setSelected(next.id)
      requestAnimationFrame(() =>
        (listRef.current?.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus()
      )
    }
  }

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <SectionTitle title="Templates">
        The first template whose trigger matches the page is used; the first one is the fallback.
      </SectionTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          onClick={() =>
            add({ ...defaultTemplate(), id: newId(), name: 'New template', path: DEFAULT_LOCATION, triggers: [] })
          }
        >
          New
        </Button>
        {current && (
          <Button onClick={() => add({ ...current, id: newId(), name: `${current.name} copy`, properties: current.properties.map((p) => ({ ...p, id: newId() })) })}>
            Duplicate
          </Button>
        )}
        <Button onClick={() => fileRef.current?.click()}>Import</Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          multiple
          className="hidden"
          onChange={(e) => {
            void onFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {current && <Button onClick={() => download(`${slug(current.name)}.json`, exportTemplate(current))}>Export</Button>}
        <Button onClick={() => download('zennotes-clipper-templates.json', exportTemplates(templates))}>Export all</Button>
      </div>
      {message && (
        <p className={`mb-3 text-sm ${message.tone === 'error' ? 'text-danger' : 'text-success'}`} role="status">
          {message.text}
        </p>
      )}

      <div className="flex gap-6">
        <ul
          ref={listRef}
          className="flex w-52 shrink-0 flex-col gap-0.5"
          role="listbox"
          aria-label="Templates"
          onKeyDown={onListKey}
        >
          {templates.map((t, i) => (
            <li
              key={t.id}
              data-id={t.id}
              role="option"
              aria-selected={t.id === current?.id}
              tabIndex={t.id === current?.id ? 0 : -1}
              onClick={() => setSelected(t.id)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm ${
                t.id === current?.id ? 'bg-paper-300 text-ink-800' : 'text-ink-600 hover:bg-paper-200'
              }`}
            >
              <span className="block truncate">{t.name}</span>
              {i === 0 && <span className="text-2xs text-ink-400">Fallback</span>}
            </li>
          ))}
          <li className="mt-2 px-1 text-2xs text-ink-400">Alt+Up/Down reorders</li>
        </ul>

        {current && (
          <TemplateEditor
            key={current.id}
            template={current}
            canDelete={templates.length > 1}
            onChange={(p) => patch(current.id, p)}
            onMove={(dir) => move(current.id, dir)}
            onDelete={() => {
              const i = templates.findIndex((t) => t.id === current.id)
              setTemplates((ts) => ts.filter((t) => t.id !== current.id))
              setSelected(templates[i === 0 ? 1 : i - 1]?.id ?? '')
            }}
            vaults={settings.vaults}
          />
        )}
      </div>
    </div>
  )
}

function TemplateEditor({
  template: t,
  onChange,
  onDelete,
  onMove,
  canDelete,
  vaults
}: {
  template: Template
  onChange: (p: Partial<Template>) => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  canDelete: boolean
  vaults: string[]
}) {
  const setProp = (id: string, p: Partial<Template['properties'][number]>) =>
    onChange({ properties: t.properties.map((x) => (x.id === id ? { ...x, ...p } : x)) })

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" htmlFor="t-name">
          <input id="t-name" className="zn-input" value={t.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="Add as" htmlFor="t-behavior">
          <Select id="t-behavior" value={t.behavior} onChange={(e) => onChange({ behavior: e.target.value as Behavior })}>
            {BEHAVIORS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note name" htmlFor="t-notename" hint="For adding to a note, this names the note.">
          <input
            id="t-notename"
            className="zn-input font-mono text-xs"
            value={t.noteNameFormat}
            onChange={(e) => onChange({ noteNameFormat: e.target.value })}
            spellCheck={false}
          />
        </Field>
        <Field label="Location" htmlFor="t-path" hint="A folder inside your notes. Variables work here.">
          <input
            id="t-path"
            className="zn-input font-mono text-xs"
            value={t.path}
            onChange={(e) => onChange({ path: e.target.value })}
            spellCheck={false}
          />
        </Field>
        <Field label="Vault" htmlFor="t-vault">
          <Select id="t-vault" value={t.vault} onChange={(e) => onChange({ vault: e.target.value })}>
            <option value="">Default vault</option>
            {[...new Set([...vaults, t.vault].filter(Boolean))].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Triggers"
        htmlFor="t-triggers"
        hint={
          <>
            One per line: a URL prefix, a <code>/regex/</code>, or <code>schema:@Recipe</code>.
          </>
        }
      >
        <textarea
          id="t-triggers"
          className="zn-input min-h-16 font-mono text-xs"
          value={t.triggers.join('\n')}
          onChange={(e) => onChange({ triggers: e.target.value.split('\n') })}
          onBlur={(e) => onChange({ triggers: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
          spellCheck={false}
        />
      </Field>

      <div>
        <span className="zn-label">Properties</span>
        <div className="flex flex-col gap-1.5">
          {t.properties.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <input
                className="zn-input w-32 shrink-0 text-xs"
                aria-label="Property name"
                value={p.name}
                onChange={(e) => setProp(p.id, { name: e.target.value })}
                spellCheck={false}
              />
              <Select
                aria-label="Property type"
                className="w-28 shrink-0 text-xs"
                value={p.type}
                onChange={(e) => setProp(p.id, { type: e.target.value as PropertyType })}
              >
                {TYPES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </Select>
              <input
                className="zn-input min-w-0 flex-1 font-mono text-xs"
                aria-label={`${p.name} value`}
                value={p.value}
                onChange={(e) => setProp(p.id, { value: e.target.value })}
                spellCheck={false}
              />
              <Button
                variant="danger"
                size="sm"
                aria-label={`Remove ${p.name}`}
                onClick={() => onChange({ properties: t.properties.filter((x) => x.id !== p.id) })}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button
          className="mt-2"
          size="sm"
          onClick={() => onChange({ properties: [...t.properties, { id: newId(), name: '', value: '', type: 'text' }] })}
        >
          Add property
        </Button>
      </div>

      <Field label="Note content" htmlFor="t-content">
        <textarea
          id="t-content"
          className="zn-input min-h-editor font-mono text-xs leading-relaxed"
          value={t.noteContentFormat}
          onChange={(e) => onChange({ noteContentFormat: e.target.value })}
          spellCheck={false}
        />
      </Field>

      <Field
        label="Interpreter context"
        htmlFor="t-context"
        hint="What the Interpreter reads for this template. Empty uses the default from Interpreter settings."
      >
        <textarea
          id="t-context"
          className="zn-input min-h-16 font-mono text-xs"
          value={t.context}
          onChange={(e) => onChange({ context: e.target.value })}
          spellCheck={false}
        />
      </Field>

      <div className="flex gap-2 border-t border-paper-300 pt-3">
        <Button size="sm" onClick={() => onMove(-1)}>
          Move up
        </Button>
        <Button size="sm" onClick={() => onMove(1)}>
          Move down
        </Button>
        <span className="flex-1" />
        <Button variant="danger" size="sm" disabled={!canDelete} onClick={onDelete}>
          Delete template
        </Button>
      </div>
    </div>
  )
}
