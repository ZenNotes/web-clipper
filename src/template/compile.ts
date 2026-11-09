// Turns a template and a page into the parts of a note: name, folder,
// properties and body, each still able to hold prompt tags until the
// Interpreter answers them. noteText() joins the parts into the text that
// goes to the app.

import type { Behavior } from '../shared/link'
import type { Settings, Template } from '../shared/types'
import type { FilterEnv } from './filters'
import { frontmatter, type RenderedProperty } from './frontmatter'
import type { PageData } from './page'
import { renderTemplate, type PromptRef, type RenderEnv } from './render'

export interface CompiledNote {
  templateId: string
  name: string
  folder: string
  vault: string
  behavior: Behavior
  properties: RenderedProperty[]
  body: string
  prompts: PromptRef[]
  /** What the Interpreter reads, rendered. */
  context: string
  errors: string[]
}

export interface CompileOptions {
  doc: Document | null
  now?: Date
  toMarkdown: FilterEnv['toMarkdown']
  extra?: Record<string, unknown>
  defaultContext: string
  maxContextChars: number
}

function safeRender(src: string, env: RenderEnv, errors: string[], label: string): string {
  try {
    return renderTemplate(src, env)
  } catch (err) {
    errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
    return src
  }
}

/** Collapses a rendered location into `a/b` form. Validation happens when
 *  the link is built, so the popup can show what the template produced. */
export function cleanFolder(folder: string): string {
  return folder
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('/')
}

export function compileNote(template: Template, page: PageData, opts: CompileOptions): CompiledNote {
  const prompts: PromptRef[] = []
  const errors: string[] = []
  const env: RenderEnv = {
    page,
    doc: opts.doc,
    url: page.url,
    now: opts.now ?? new Date(),
    toMarkdown: opts.toMarkdown,
    extra: { ...opts.extra },
    prompts
  }
  const name = safeRender(template.noteNameFormat || '{{title}}', env, errors, 'Note name')
    .replace(/\s+/g, ' ')
    .trim()
  env.extra = { ...env.extra, noteName: name }
  const folder = cleanFolder(safeRender(template.path, env, errors, 'Location'))
  const properties = template.properties.map((p) => ({
    name: p.name.trim(),
    type: p.type,
    value: safeRender(p.value, env, errors, `Property ${p.name}`)
  }))
  const body = safeRender(template.noteContentFormat, env, errors, 'Note content')

  const contextEnv: RenderEnv = { ...env, prompts: [] }
  const contextSrc = template.context.trim() || opts.defaultContext
  const context = safeRender(contextSrc, contextEnv, errors, 'Interpreter context').slice(0, opts.maxContextChars)

  return {
    templateId: template.id,
    name,
    folder,
    vault: template.vault,
    behavior: template.behavior,
    properties: properties.filter((p) => p.name),
    body,
    prompts,
    context,
    errors
  }
}

/** The note text sent to the app. Frontmatter only starts a new note: added
 *  to an existing or daily note it would land mid-file. */
export function noteText(note: Pick<CompiledNote, 'behavior' | 'properties' | 'body'>): string {
  const body = note.body.replace(/^\s*\n/, '').replace(/\s+$/, '')
  if (note.behavior !== 'new') return body ? body + '\n' : ''
  const fm = frontmatter(note.properties)
  if (!fm) return body ? body + '\n' : ''
  return body ? `${fm}\n${body}\n` : fm
}

export function templateById(settings: Settings, id: string | undefined): Template | undefined {
  return id ? settings.templates.find((t) => t.id === id) : undefined
}
