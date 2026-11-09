import type { ProviderConfig, ProviderPreset, Settings, Template } from './types'

export const DEFAULT_LOCATION = 'Clippings'

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** No default tag: clips already sit in a Clippings folder, and ZenNotes
 *  keeps tags for what a folder does not say. Empty properties are left out
 *  of the note, so author and published appear only when the page has them. */
export function defaultTemplate(): Template {
  return {
    id: 'default',
    name: 'Default',
    behavior: 'new',
    noteNameFormat: '{{title|safe_name}}',
    path: DEFAULT_LOCATION,
    vault: '',
    properties: [
      { id: 'p-source', name: 'source', value: '{{url}}', type: 'text' },
      { id: 'p-author', name: 'author', value: '{{author|split:", "|wikilink|join:", "}}', type: 'multitext' },
      { id: 'p-published', name: 'published', value: '{{published|date:"YYYY-MM-DD"}}', type: 'date' },
      { id: 'p-created', name: 'created', value: '{{date}}', type: 'date' },
      { id: 'p-description', name: 'description', value: '{{description}}', type: 'text' }
    ],
    noteContentFormat: '{{content}}',
    triggers: [],
    context: ''
  }
}

export const PROVIDER_PRESETS: Record<
  ProviderPreset,
  { name: string; baseUrl: string; needsKey: boolean; keyUrl?: string; models: { name: string; modelId: string }[] }
> = {
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [{ name: 'Claude Haiku 5.5', modelId: 'claude-haiku-5-5' }]
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [{ name: 'GPT-5 mini', modelId: 'gpt-5-mini' }]
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [{ name: 'Gemini Flash', modelId: 'gemini-2.5-flash' }]
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    models: [{ name: 'Claude Haiku (OpenRouter)', modelId: 'anthropic/claude-haiku-4.5' }]
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434',
    needsKey: false,
    models: [{ name: 'Llama 3.2', modelId: 'llama3.2' }]
  },
  custom: {
    name: 'Custom',
    baseUrl: '',
    needsKey: false,
    models: []
  }
}

export function newProvider(preset: ProviderPreset): ProviderConfig {
  const p = PROVIDER_PRESETS[preset]
  return { id: newId(), preset, name: p.name, baseUrl: p.baseUrl, apiKey: '' }
}

export function defaultSettings(): Settings {
  return {
    version: 1,
    vaults: [],
    defaultVault: '',
    silent: false,
    preferInline: false,
    templates: [defaultTemplate()],
    highlighter: { contentMode: 'highlight', restoreOnVisit: false, restoreOffered: false },
    reader: { font: 'serif', fontSize: 19, lineHeight: 1.6, maxWidth: 680, appearance: 'auto', customCss: '' },
    interpreter: {
      enabled: false,
      providers: [],
      models: [],
      defaultModelId: '',
      defaultContext: '{{content}}',
      maxContextChars: 60000,
      runOnQuickClip: false
    }
  }
}
