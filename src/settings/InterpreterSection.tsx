import { useState } from 'react'
import { newId, newProvider, PROVIDER_PRESETS } from '../shared/defaults'
import { ext } from '../shared/ext'
import { permissionOrigin } from '../interpreter/interpreter'
import type { ModelConfig, ProviderConfig, ProviderPreset, Settings } from '../shared/types'
import { Button, Field, Select, Toggle } from '../ui/controls'
import { SectionTitle, type SectionProps } from './common'

const PRESETS = Object.entries(PROVIDER_PRESETS) as [ProviderPreset, (typeof PROVIDER_PRESETS)[ProviderPreset]][]

export function InterpreterSection({ settings, update }: SectionProps) {
  const it = settings.interpreter
  const [preset, setPreset] = useState<ProviderPreset>('anthropic')
  const set = (p: Partial<Settings['interpreter']>) => update((s) => ({ ...s, interpreter: { ...s.interpreter, ...p } }))
  const setProvider = (id: string, p: Partial<ProviderConfig>) =>
    set({ providers: it.providers.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const setModel = (id: string, p: Partial<ModelConfig>) =>
    set({ models: it.models.map((x) => (x.id === id ? { ...x, ...p } : x)) })

  const addProvider = () => {
    const prov = newProvider(preset)
    const models = PROVIDER_PRESETS[preset].models.map((m) => ({ id: newId(), providerId: prov.id, ...m }))
    set({
      providers: [...it.providers, prov],
      models: [...it.models, ...models],
      defaultModelId: it.defaultModelId || models[0]?.id || ''
    })
  }

  return (
    <div className="flex max-w-dialog-lg flex-col gap-8">
      <section className="flex flex-col gap-3">
        <SectionTitle title="Interpreter">
          Fills prompt variables like <code>{'{{"a summary of the page"}}'}</code> with a model you choose. Requests go
          straight from your browser to the provider with your key.
        </SectionTitle>
        <Toggle id="it-on" label="Turn on the Interpreter" checked={it.enabled} onChange={(v) => set({ enabled: v })} />
        <Toggle
          id="it-quick"
          label="Run it on quick clip"
          hint="Uses the default model. The provider must have been allowed once from the popup."
          checked={it.runOnQuickClip}
          onChange={(v) => set({ runOnQuickClip: v })}
        />
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold text-ink-800">Providers</h3>
        <div className="flex flex-col gap-3">
          {it.providers.map((p) => {
            const info = PROVIDER_PRESETS[p.preset]
            return (
              <div key={p.id} className="rounded-md border border-paper-300 bg-paper-50 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name" htmlFor={`pn-${p.id}`}>
                    <input id={`pn-${p.id}`} className="zn-input" value={p.name} onChange={(e) => setProvider(p.id, { name: e.target.value })} />
                  </Field>
                  <Field
                    label={p.preset === 'custom' ? 'Chat completions URL' : 'Base URL'}
                    htmlFor={`pu-${p.id}`}
                    hint={p.preset === 'custom' ? 'Usually ends in /chat/completions.' : undefined}
                  >
                    <input
                      id={`pu-${p.id}`}
                      className="zn-input font-mono text-xs"
                      value={p.baseUrl}
                      placeholder={info.baseUrl}
                      onChange={(e) => setProvider(p.id, { baseUrl: e.target.value })}
                      spellCheck={false}
                    />
                  </Field>
                  {p.preset !== 'ollama' && (
                    <Field
                      label="API key"
                      htmlFor={`pk-${p.id}`}
                      hint={
                        info.keyUrl ? (
                          <a className="text-accent underline" href={info.keyUrl} target="_blank" rel="noreferrer">
                            Get a key
                          </a>
                        ) : undefined
                      }
                    >
                      <input
                        id={`pk-${p.id}`}
                        type="password"
                        autoComplete="off"
                        className="zn-input font-mono text-xs"
                        value={p.apiKey}
                        onChange={(e) => setProvider(p.id, { apiKey: e.target.value })}
                      />
                    </Field>
                  )}
                </div>
                {p.preset === 'ollama' && (
                  <p className="mt-2 text-xs text-ink-500">
                    Start Ollama with extensions allowed:{' '}
                    <code className="rounded bg-paper-200 px-1">
                      OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*,safari-web-extension://* ollama serve
                    </code>
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex-1 text-2xs text-ink-400">{permissionOrigin(p) ?? ''}</span>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      const origin = permissionOrigin(p)
                      if (origin) void ext.permissions.remove({ origins: [origin] }).catch(() => undefined)
                      const models = it.models.filter((m) => m.providerId !== p.id)
                      set({
                        providers: it.providers.filter((x) => x.id !== p.id),
                        models,
                        defaultModelId: models.some((m) => m.id === it.defaultModelId) ? it.defaultModelId : models[0]?.id ?? ''
                      })
                    }}
                  >
                    Remove provider
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <Select aria-label="Provider to add" value={preset} onChange={(e) => setPreset(e.target.value as ProviderPreset)} className="w-48">
            {PRESETS.map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Button onClick={addProvider}>Add provider</Button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold text-ink-800">Models</h3>
        {it.models.length === 0 && <p className="text-sm text-ink-500">Add a provider first.</p>}
        <div className="flex flex-col gap-1.5">
          {it.models.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="default-model"
                aria-label={`Use ${m.name} by default`}
                className="accent-accent"
                checked={it.defaultModelId === m.id}
                onChange={() => set({ defaultModelId: m.id })}
              />
              <Select aria-label="Provider" className="w-36 shrink-0 text-xs" value={m.providerId} onChange={(e) => setModel(m.id, { providerId: e.target.value })}>
                {it.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <input className="zn-input w-40 shrink-0 text-xs" aria-label="Display name" value={m.name} onChange={(e) => setModel(m.id, { name: e.target.value })} />
              <input
                className="zn-input min-w-0 flex-1 font-mono text-xs"
                aria-label="Model ID"
                value={m.modelId}
                placeholder="model id"
                onChange={(e) => setModel(m.id, { modelId: e.target.value })}
                spellCheck={false}
              />
              <Button size="sm" variant="danger" aria-label={`Remove ${m.name}`} onClick={() => set({ models: it.models.filter((x) => x.id !== m.id) })}>
                Remove
              </Button>
            </div>
          ))}
        </div>
        {it.providers.length > 0 && (
          <Button
            className="mt-2"
            size="sm"
            onClick={() => set({ models: [...it.models, { id: newId(), providerId: it.providers[0]!.id, name: 'New model', modelId: '' }] })}
          >
            Add model
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-ink-800">Context</h3>
        <Field
          label="Default context"
          htmlFor="it-context"
          hint="What the model reads, a template. Smaller is faster and cheaper; {{fullHtml}} sends the whole page."
        >
          <textarea
            id="it-context"
            className="zn-input min-h-16 font-mono text-xs"
            value={it.defaultContext}
            onChange={(e) => set({ defaultContext: e.target.value })}
            spellCheck={false}
          />
        </Field>
        <Field label="Longest context, characters" htmlFor="it-max">
          <input
            id="it-max"
            type="number"
            min={1000}
            step={1000}
            className="zn-input w-40"
            value={it.maxContextChars}
            onChange={(e) => set({ maxContextChars: Math.max(1000, Number(e.target.value) || 60000) })}
          />
        </Field>
      </section>
    </div>
  )
}
