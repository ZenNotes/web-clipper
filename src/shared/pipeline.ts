// Steps shared by the popup and quick clip: answering prompts, turning a
// compiled note into its text and link target.

import { interpret, permissionOrigin } from '../interpreter/interpreter'
import type { CompiledNote } from '../template/compile'
import type { ClipTarget } from './link'
import type { ModelConfig, ProviderConfig, Settings } from './types'

/** Every string of a note that can hold prompt tags, in a fixed order. */
export function noteParts(note: CompiledNote): string[] {
  return [note.name, note.folder, ...note.properties.map((p) => p.value), note.body]
}

export function withParts(note: CompiledNote, parts: string[]): CompiledNote {
  const props = note.properties.map((p, i) => ({ ...p, value: parts[2 + i] ?? p.value }))
  return {
    ...note,
    name: parts[0] ?? note.name,
    folder: parts[1] ?? note.folder,
    properties: props,
    body: parts[2 + props.length] ?? note.body
  }
}

export function targetFor(
  note: Pick<CompiledNote, 'vault' | 'folder' | 'name' | 'behavior'>,
  settings: Settings
): ClipTarget {
  const vault = note.vault.trim() || settings.defaultVault.trim()
  return {
    vault: vault || null,
    folder: note.folder,
    name: note.name,
    behavior: note.behavior,
    silent: settings.silent
  }
}

export function resolveModel(
  settings: Settings,
  modelId?: string
): { model: ModelConfig; provider: ProviderConfig } | null {
  const models = settings.interpreter.models
  const model = models.find((m) => m.id === modelId) ?? models.find((m) => m.id === settings.interpreter.defaultModelId) ?? models[0]
  if (!model) return null
  const provider = settings.interpreter.providers.find((p) => p.id === model.providerId)
  return provider ? { model, provider } : null
}

export async function answerPrompts(
  note: CompiledNote,
  settings: Settings,
  modelId?: string
): Promise<Map<string, unknown>> {
  const resolved = resolveModel(settings, modelId)
  if (!resolved) throw new Error('Add a model in Settings, Interpreter.')
  return interpret({
    provider: resolved.provider,
    model: resolved.model,
    context: note.context,
    prompts: [...new Set(note.prompts.map((p) => p.prompt))]
  })
}

export { permissionOrigin }
