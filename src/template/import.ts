// Template files in and out. Our own export carries a `format` marker; the
// importer also reads template JSON files from Obsidian's clipper (the data
// format only: field names and behavior values), so people switching can
// bring their templates. Their syntax is the same as ours, so content,
// properties and triggers carry over as written.

import type { Behavior } from '../shared/link'
import { DEFAULT_LOCATION, newId } from '../shared/defaults'
import type { PropertyType, Template, TemplateProperty } from '../shared/types'

export const EXPORT_FORMAT = 'zennotes-web-clipper-template'

const BEHAVIOR_FROM_OBSIDIAN: Record<string, Behavior> = {
  create: 'new',
  'append-specific': 'append',
  'prepend-specific': 'prepend',
  'append-daily': 'daily-append',
  'prepend-daily': 'daily-prepend',
  // There is no overwrite: a clip never replaces a note.
  overwrite: 'new'
}

const BEHAVIORS: Behavior[] = ['new', 'append', 'prepend', 'daily-append', 'daily-prepend']
const TYPES: PropertyType[] = ['text', 'multitext', 'number', 'checkbox', 'date', 'datetime']

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

function property(raw: unknown): TemplateProperty | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = str(r.name).trim()
  if (!name) return null
  const t = str(r.type, 'text') as PropertyType
  return { id: newId(), name, value: str(r.value), type: TYPES.includes(t) ? t : 'text' }
}

function fromAny(raw: Record<string, unknown>): Template {
  const isOurs = raw.format === EXPORT_FORMAT
  const behaviorRaw = str(raw.behavior, isOurs ? 'new' : 'create')
  const behavior = isOurs
    ? BEHAVIORS.includes(behaviorRaw as Behavior)
      ? (behaviorRaw as Behavior)
      : 'new'
    : (BEHAVIOR_FROM_OBSIDIAN[behaviorRaw] ?? 'new')
  const triggers = Array.isArray(raw.triggers)
    ? raw.triggers.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    : []
  return {
    id: newId(),
    name: str(raw.name, 'Imported').trim() || 'Imported',
    behavior,
    noteNameFormat: str(raw.noteNameFormat, '{{title}}'),
    path: str(raw.path, DEFAULT_LOCATION),
    vault: str(raw.vault),
    properties: (Array.isArray(raw.properties) ? raw.properties : [])
      .map(property)
      .filter((p): p is TemplateProperty => p !== null),
    noteContentFormat: str(raw.noteContentFormat, '{{content}}'),
    triggers,
    context: str(raw.context)
  }
}

function looksLikeTemplate(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const r = v as Record<string, unknown>
  return typeof r.noteContentFormat === 'string' || typeof r.noteNameFormat === 'string'
}

/** Reads one template, an array of templates, or our `{ templates: [...] }`
 *  bundle. Throws with a short reason when nothing in it is a template. */
export function importTemplates(json: string): Template[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('That file is not JSON.')
  }
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).templates)
      ? ((data as Record<string, unknown>).templates as unknown[])
      : [data]
  const templates = list.filter(looksLikeTemplate).map(fromAny)
  if (!templates.length) throw new Error('No templates found in that file.')
  return templates
}

export function exportTemplate(t: Template): string {
  const { id: _id, ...rest } = t
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: 1,
      ...rest,
      properties: t.properties.map(({ id: _pid, ...p }) => p)
    },
    null,
    2
  )
}

export function exportTemplates(ts: Template[]): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: 1,
      templates: ts.map((t) => ({ format: EXPORT_FORMAT, ...JSON.parse(exportTemplate(t)) }))
    },
    null,
    2
  )
}
