// The clipper popup. Everything is reachable from the keyboard: Tab moves
// through the fields, Mod+Enter clips, Mod+E switches the body between
// Markdown and preview, Mod+I runs the Interpreter, Esc closes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CONTENT_SCRIPT, ext, flavor, isMac, modKey } from '../shared/ext'
import { handoff, writeClipboardInPage, type NativeClipMessage, type NativeClipReply } from '../shared/handoff'
import { BEHAVIORS, isDailyBehavior, type Behavior } from '../shared/link'
import type { CompileResponse, ContentError, ContentRequest, ContentState } from '../shared/messages'
import { answerPrompts, noteParts, permissionOrigin, resolveModel, targetFor, withParts } from '../shared/pipeline'
import { loadSettings } from '../shared/storage'
import type { Settings } from '../shared/types'
import { compileNote, noteText, type CompiledNote } from '../template/compile'
import { emptyPage } from '../template/page'
import { finalizePrompts } from '../template/render'
import { matchTemplate } from '../template/triggers'
import { Button, Field, Kbd, Select } from '../ui/controls'
import { previewHtml } from '../ui/markdown'

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'busy'; label: string }
  | { kind: 'sent'; via: string }
  | { kind: 'error'; message: string }

async function targetTabId(): Promise<number | undefined> {
  const forced = new URLSearchParams(location.search).get('tab')
  if (forced && /^\d+$/.test(forced)) return Number(forced)
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true })
  return tab?.id
}

async function injected(tabId: number): Promise<boolean> {
  try {
    const results = await ext.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] })
    return !results?.some((r) => (r as { error?: unknown }).error)
  } catch {
    return false
  }
}

function stripTags(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
}

export function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tabId, setTabId] = useState<number | undefined>()
  const [live, setLive] = useState(false)
  const [note, setNote] = useState<CompiledNote | null>(null)
  const [templateId, setTemplateId] = useState<string>('')
  const [vault, setVault] = useState('')
  const [preview, setPreview] = useState(false)
  const [showProps, setShowProps] = useState(false)
  const [modelId, setModelId] = useState('')
  const [interpreted, setInterpreted] = useState(false)
  const [state, setState] = useState<ContentState | null>(null)
  // A selection left on the page decides the content, so say so and offer
  // the whole page: a forgotten selection must not silently shrink a clip.
  const [selection, setSelection] = useState<'none' | 'used' | 'ignored'>('none')
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const nameRef = useRef<HTMLInputElement>(null)

  const send = useCallback(
    async <T,>(msg: ContentRequest): Promise<T> => {
      if (tabId === undefined) throw new Error('No tab')
      return (await ext.tabs.sendMessage(tabId, msg)) as T
    },
    [tabId]
  )

  const compile = useCallback(
    async (s: Settings, tab: number | undefined, isLive: boolean, id?: string, ignoreSelection = false) => {
      setInterpreted(false)
      if (isLive && tab !== undefined) {
        const res = (await ext.tabs.sendMessage(tab, {
          type: 'zn:compile',
          templateId: id,
          ignoreSelection
        } satisfies ContentRequest)) as CompileResponse | ContentError
        if (!res?.ok) throw new Error(res?.error ?? 'Could not read the page.')
        setSelection(res.page.hasSelection ? 'used' : res.page.selectionAvailable ? 'ignored' : 'none')
        setNote(res.note)
        setTemplateId(res.note.templateId)
        setVault(res.note.vault || s.defaultVault)
        return
      }
      // Pages the browser keeps scripts out of (store pages, settings pages)
      // still clip their title and address.
      const t = tab !== undefined ? await ext.tabs.get(tab).catch(() => undefined) : undefined
      const page = { ...emptyPage(t?.url ?? ''), title: t?.title ?? '' }
      const template = s.templates.find((x) => x.id === id) ?? matchTemplate(s.templates, page.url, null)!
      const n = compileNote(template, page, {
        doc: null,
        toMarkdown: stripTags,
        defaultContext: s.interpreter.defaultContext,
        maxContextChars: s.interpreter.maxContextChars
      })
      setNote(n)
      setTemplateId(n.templateId)
      setVault(n.vault || s.defaultVault)
    },
    []
  )

  useEffect(() => {
    void (async () => {
      try {
        const s = await loadSettings()
        setSettings(s)
        setModelId(s.interpreter.defaultModelId || s.interpreter.models[0]?.id || '')
        const tab = await targetTabId()
        setTabId(tab)
        const isLive = tab !== undefined && (await injected(tab))
        setLive(isLive)
        await compile(s, tab, isLive)
        if (isLive && tab !== undefined) {
          setState((await ext.tabs.sendMessage(tab, { type: 'zn:state' })) as ContentState)
        }
        setStatus({ kind: 'ready' })
        requestAnimationFrame(() => nameRef.current?.focus())
      } catch (err) {
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    })()
  }, [compile])

  const update = (patch: Partial<CompiledNote>) => setNote((n) => (n ? { ...n, ...patch } : n))

  const pendingPrompts = note && note.prompts.length > 0 && !interpreted
  const canInterpret = !!settings?.interpreter.enabled && !!pendingPrompts

  const runInterpreter = useCallback(async () => {
    if (!settings || !note || !note.prompts.length) return
    const resolved = resolveModel(settings, modelId)
    if (!resolved) {
      setStatus({ kind: 'error', message: 'Add a model in Settings, Interpreter.' })
      return
    }
    const origin = permissionOrigin(resolved.provider)
    // Asked for first, from the gesture itself: browsers refuse a permission
    // request that comes after an await.
    const granted = origin ? await ext.permissions.request({ origins: [origin] }).catch(() => false) : false
    if (!granted) {
      setStatus({ kind: 'error', message: `The clipper needs access to ${origin ?? 'the provider'} to run the Interpreter.` })
      return
    }
    setStatus({ kind: 'busy', label: `Asking ${resolved.model.name}` })
    try {
      const answers = await answerPrompts(note, settings, modelId)
      const parts = noteParts(note)
      let done: string[]
      if (live) {
        const res = await send<{ parts: string[] }>({
          type: 'zn:finalize',
          parts,
          prompts: note.prompts,
          answers: [...answers]
        })
        done = res.parts
      } else {
        const env = { url: '', now: new Date(), toMarkdown: stripTags }
        done = parts.map((p) => finalizePrompts(p, note.prompts, answers, env))
      }
      setNote(withParts(note, done))
      setInterpreted(true)
      setStatus({ kind: 'ready' })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [settings, note, modelId, live, send])

  const clip = useCallback(async () => {
    if (!settings || !note || tabId === undefined || status.kind === 'busy') return
    let final = note
    if (note.prompts.length && !interpreted) {
      // Unanswered prompt variables are left out of the note.
      const env = { url: '', now: new Date(), toMarkdown: stripTags }
      final = withParts(note, noteParts(note).map((p) => finalizePrompts(p, note.prompts, new Map(), env)))
    }
    const target = targetFor({ ...final, vault }, settings)
    setStatus({ kind: 'busy', label: 'Sending' })
    const native =
      flavor() === 'safari'
        ? async (message: NativeClipMessage) =>
            (await ext.runtime.sendMessage({ type: 'zn:native-clip', message })) as NativeClipReply | null
        : undefined
    const result = await handoff(
      noteText(final),
      target,
      {
        writeClipboard: writeClipboardInPage,
        openLink: async (url) => {
          await ext.tabs.update(tabId, { url })
        },
        nativeClip: native
      },
      { preferInline: settings.preferInline }
    )
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error })
      return
    }
    setStatus({ kind: 'sent', via: result.via })
    setTimeout(() => window.close(), 700)
  }, [settings, note, tabId, interpreted, vault, status.kind])

  const toggleTool = useCallback(
    async (what: 'highlighter' | 'reader') => {
      if (!live) return
      const next = await send<ContentState>(
        what === 'reader' ? { type: 'zn:reader', action: 'toggle' } : { type: 'zn:highlighter', action: 'toggle' }
      )
      setState(next)
      // The page needs focus for the highlighter's keys and the reader.
      window.close()
    },
    [live, send]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey
      if (e.key === 'Escape') {
        e.preventDefault()
        window.close()
      } else if (mod && e.key === 'Enter') {
        e.preventDefault()
        void clip()
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setPreview((p) => !p)
      } else if (mod && e.key.toLowerCase() === 'i' && canInterpret) {
        e.preventDefault()
        void runInterpreter()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clip, runInterpreter, canInterpret])

  const preview_ = useMemo(() => (preview && note ? previewHtml(note.body) : ''), [preview, note])

  if (!settings || !note) {
    return (
      <div className="w-popup p-4 text-sm text-ink-600">
        {status.kind === 'error' ? <p className="text-danger">{status.message}</p> : <p>Reading the page…</p>}
      </div>
    )
  }

  const daily = isDailyBehavior(note.behavior)
  const mk = modKey()
  const busy = status.kind === 'busy' || status.kind === 'sent'

  return (
    <div className="flex max-h-popup w-popup flex-col">
      <header className="flex items-center gap-2 border-b border-paper-300 px-3 py-2">
        <Select
          aria-label="Template"
          value={templateId}
          onChange={(e) => {
            const id = e.target.value
            setTemplateId(id)
            void compile(settings, tabId, live, id, selection === 'ignored').catch((err) =>
              setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
            )
          }}
          className="min-w-0 flex-1"
        >
          {settings.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Button
          variant={state?.highlighter ? 'primary' : 'ghost'}
          size="sm"
          disabled={!live}
          onClick={() => void toggleTool('highlighter')}
          title="Highlighter"
          aria-pressed={!!state?.highlighter}
        >
          Highlight{state?.highlightCount ? ` (${state.highlightCount})` : ''}
        </Button>
        <Button
          variant={state?.reader ? 'primary' : 'ghost'}
          size="sm"
          disabled={!live}
          onClick={() => void toggleTool('reader')}
          title="Reader view"
          aria-pressed={!!state?.reader}
        >
          Reader
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void ext.runtime.openOptionsPage()} title="Settings">
          Settings
        </Button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {selection !== 'none' && (
          <p className="flex items-center justify-between gap-2 rounded-md bg-paper-200 px-2 py-1 text-xs text-ink-600" role="status">
            <span>{selection === 'used' ? 'Clipping your selection.' : 'Clipping the whole page.'}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void compile(settings, tabId, live, templateId, selection === 'used').catch((err) =>
                  setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
                )
              }
            >
              {selection === 'used' ? 'Clip the whole page' : 'Clip the selection'}
            </Button>
          </p>
        )}
        {!live && (
          <p className="rounded-md bg-paper-200 px-2 py-1 text-xs text-ink-600">
            The browser keeps the clipper out of this page, so only its title and address are clipped.
          </p>
        )}
        {!daily && (
          <Field label={note.behavior === 'new' ? 'Note name' : 'Add to note'} htmlFor="zn-name">
            <input
              id="zn-name"
              ref={nameRef}
              className="zn-input"
              value={note.name}
              onChange={(e) => update({ name: e.target.value })}
              spellCheck={false}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2">
          {!daily && (
            <Field label="Location" htmlFor="zn-folder">
              <input
                id="zn-folder"
                className="zn-input"
                value={note.folder}
                placeholder="Top of the notes area"
                onChange={(e) => update({ folder: e.target.value })}
                spellCheck={false}
              />
            </Field>
          )}
          <Field label="Vault" htmlFor="zn-vault">
            <Select id="zn-vault" value={vault} onChange={(e) => setVault(e.target.value)}>
              <option value="">Open vault</option>
              {[...new Set([...settings.vaults, vault].filter(Boolean))].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Add as" htmlFor="zn-behavior">
            <Select
              id="zn-behavior"
              value={note.behavior}
              onChange={(e) => update({ behavior: e.target.value as Behavior })}
            >
              {BEHAVIORS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {note.behavior === 'new' && note.properties.length > 0 && (
          <section>
            <button
              type="button"
              className="zn-label flex items-center gap-1 hover:text-ink-700"
              aria-expanded={showProps}
              onClick={() => setShowProps((v) => !v)}
            >
              <span aria-hidden>{showProps ? '▾' : '▸'}</span> Properties ({note.properties.length})
            </button>
            {showProps && (
              <div className="mt-1 flex flex-col gap-1.5">
                {note.properties.map((p, i) => (
                  <div key={i} className="grid grid-cols-3 items-center gap-2">
                    <label htmlFor={`zn-prop-${i}`} className="truncate text-xs text-ink-600" title={p.type}>
                      {p.name}
                    </label>
                    <input
                      id={`zn-prop-${i}`}
                      className="zn-input col-span-2 text-xs"
                      value={p.value}
                      onChange={(e) => {
                        const properties = note.properties.map((q, j) => (j === i ? { ...q, value: e.target.value } : q))
                        update({ properties })
                      }}
                      spellCheck={false}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="flex min-h-0 flex-col">
          <div className="mb-1 flex items-center justify-between">
            <span className="zn-label mb-0">Content</span>
            <div className="flex items-center gap-1" role="tablist" aria-label="Content view">
              <Button size="sm" variant={preview ? 'ghost' : 'secondary'} role="tab" aria-selected={!preview} onClick={() => setPreview(false)}>
                Markdown
              </Button>
              <Button size="sm" variant={preview ? 'secondary' : 'ghost'} role="tab" aria-selected={preview} onClick={() => setPreview(true)}>
                Preview
              </Button>
              <span className="ml-1 text-2xs text-ink-400">
                <Kbd>{mk}E</Kbd>
              </span>
            </div>
          </div>
          {preview ? (
            <div
              className="zn-prose max-h-editor min-h-editor overflow-y-auto rounded-md border border-paper-300 bg-paper-50 px-3 py-2"
              tabIndex={0}
              aria-label="Preview"
              dangerouslySetInnerHTML={{ __html: preview_ }}
            />
          ) : (
            <textarea
              aria-label="Note content"
              className="zn-input max-h-editor min-h-editor resize-y font-mono text-xs leading-relaxed"
              value={note.body}
              onChange={(e) => update({ body: e.target.value })}
              spellCheck={false}
            />
          )}
        </section>

        {note.prompts.length > 0 && (
          <section className="rounded-md border border-paper-300 bg-paper-50 px-2 py-2">
            {settings.interpreter.enabled ? (
              <div className="flex items-center gap-2">
                <Select aria-label="Model" value={modelId} onChange={(e) => setModelId(e.target.value)} className="min-w-0 flex-1 text-xs">
                  {settings.interpreter.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
                <Button size="sm" disabled={!pendingPrompts || busy} onClick={() => void runInterpreter()}>
                  {interpreted ? 'Done' : 'Interpret'} <Kbd>{mk}I</Kbd>
                </Button>
              </div>
            ) : (
              <p className="text-xs text-ink-600">
                This template has {note.prompts.length === 1 ? 'a prompt' : `${note.prompts.length} prompts`}. Turn on the
                Interpreter in Settings to fill {note.prompts.length === 1 ? 'it' : 'them'}.
              </p>
            )}
          </section>
        )}

        {note.errors.length > 0 && (
          <ul className="text-xs text-warning">
            {note.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </main>

      <footer className="flex items-center gap-2 border-t border-paper-300 px-3 py-2">
        <div className="min-w-0 flex-1 truncate text-xs" role="status" aria-live="polite">
          {status.kind === 'error' && <span className="text-danger">{status.message}</span>}
          {status.kind === 'busy' && <span className="text-ink-600">{status.label}…</span>}
          {status.kind === 'sent' && <span className="text-success">Sent to ZenNotes</span>}
          {(status.kind === 'ready' || status.kind === 'loading') && (
            <span className="text-ink-400">
              <Kbd>Esc</Kbd> close
            </span>
          )}
        </div>
        <Button variant="primary" disabled={busy} onClick={() => void clip()}>
          Add to ZenNotes <Kbd>{mk}↵</Kbd>
        </Button>
      </footer>
    </div>
  )
}
