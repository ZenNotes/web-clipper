import type { Behavior } from './link'

export type PropertyType = 'text' | 'multitext' | 'number' | 'checkbox' | 'date' | 'datetime'

export interface TemplateProperty {
  id: string
  name: string
  value: string
  type: PropertyType
}

export interface Template {
  id: string
  name: string
  behavior: Behavior
  /** Note name, a template string. */
  noteNameFormat: string
  /** Folder inside the notes area, a template string. */
  path: string
  /** Vault name; '' uses the default vault from General settings. */
  vault: string
  properties: TemplateProperty[]
  noteContentFormat: string
  /** One rule per entry: a URL prefix, a /regex/, or schema:@Type[.key[=value]]. */
  triggers: string[]
  /** What the Interpreter reads, a template string; '' uses the default. */
  context: string
}

export interface Highlight {
  id: string
  /** Plain text of the highlight. */
  text: string
  /** HTML of the highlighted fragment. */
  html: string
  /** ISO time it was made. */
  timestamp: string
  kind: 'text' | 'element'
  /** Where it sits in the page, for drawing it again on a later visit. */
  anchor: HighlightAnchor
}

/** Character offsets into the page's text (all text nodes of <body> in
 *  document order), which wrapping highlights in <mark> never changes, plus
 *  a little text on each side for finding the spot again when the page
 *  shifts. An element highlight stores the element's src in `prefix`. */
export interface HighlightAnchor {
  start: number
  end: number
  prefix: string
  suffix: string
}

export type HighlightContentMode = 'highlight' | 'replace' | 'nothing'

export interface ProviderConfig {
  id: string
  preset: ProviderPreset
  name: string
  /** For `custom`: the full chat completions URL. For `ollama`: the server. */
  baseUrl: string
  apiKey: string
}

export type ProviderPreset = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama' | 'custom'

export interface ModelConfig {
  id: string
  providerId: string
  name: string
  modelId: string
}

export interface Settings {
  version: 1
  vaults: string[]
  /** '' is the vault open in the app. */
  defaultVault: string
  /** Write without opening the note or raising the app. */
  silent: boolean
  /** Send notes that fit inline in the link instead of on the clipboard. */
  preferInline: boolean
  /** iPhone and iPad: open ZenNotes after a clip. Off until the phone app
   *  reads clip links; until then a clip is only copied. */
  iosOpenApp: boolean
  templates: Template[]
  highlighter: {
    contentMode: HighlightContentMode
    /** Draw saved highlights again on a later visit (needs site access). */
    restoreOnVisit: boolean
    /** The offer to turn restoreOnVisit on has been shown. It is shown once,
     *  the first time a highlight is saved, and never again. */
    restoreOffered: boolean
  }
  reader: {
    font: 'sans' | 'serif' | 'mono'
    fontSize: number
    lineHeight: number
    maxWidth: number
    appearance: 'auto' | 'light' | 'dark'
    customCss: string
  }
  interpreter: {
    enabled: boolean
    providers: ProviderConfig[]
    models: ModelConfig[]
    defaultModelId: string
    defaultContext: string
    /** Longest context sent, in characters. */
    maxContextChars: number
    /** Run prompts on quick clip too (needs the provider's access granted). */
    runOnQuickClip: boolean
  }
}
