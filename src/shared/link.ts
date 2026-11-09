// Builds the zennotes://new and zennotes://daily links. The contract is
// normative in the app repo (docs/web-clipper-link.md) and every case in
// test/fixtures/web-clipper-link.fixtures.json is checked against this
// builder, so the extension and the app parser cannot drift.
//
// The builder refuses what the app would refuse instead of producing a link
// that fails on the other side: a refused link means the clip silently does
// not arrive, which is worse than an error in the popup.

export const LINK_SCHEME = 'zennotes'

/** Most note text a link may carry inline (`content=`), in UTF-8 bytes. */
export const MAX_CONTENT_BYTES = 32_768
/** Most note text the app files from the clipboard, in UTF-8 bytes. */
export const MAX_NOTE_BYTES = 8 * 1024 * 1024
/** Longest link the app accepts, in UTF-16 code units. */
export const MAX_LINK_CHARS = 131_072
export const MAX_VAULT_CHARS = 256
export const MAX_FILE_CHARS = 1024

export type ClipBody = { clipboard: string } | { content: string }

export interface NewLinkRequest {
  action: 'new'
  vault: string | null
  /** Folder inside the notes area, `/`-separated; '' is its top level. */
  folder: string
  /** Note name without `.md`; null lets the app name it from the first line. */
  name: string | null
  body: ClipBody | null
  position: 'create' | 'append' | 'prepend'
  silent: boolean
}

export interface DailyLinkRequest {
  action: 'daily'
  vault: string | null
  body: ClipBody | null
  position: 'append' | 'prepend'
  silent: boolean
}

export type ClipLinkRequest = NewLinkRequest | DailyLinkRequest

export type LinkError =
  | 'link-too-long'
  | 'bad-vault'
  | 'bad-file'
  | 'bad-hash'
  | 'empty-body'
  | 'content-too-long'
  | 'missing-file'
  | 'nothing-to-insert'

export class ClipLinkError extends Error {
  constructor(
    readonly code: LinkError,
    message: string
  ) {
    super(message)
    this.name = 'ClipLinkError'
  }
}

/** Percent-encodes everything except RFC 3986's unreserved characters. A
 *  bare `+` must never reach the app, which reads it as a plus sign, and
 *  `!'()*` are left bare by encodeURIComponent although they are reserved. */
export function encodeLinkValue(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  )
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}

// Windows refuses these in a folder name, and vaults sync between systems.
const WINDOWS_FOLDER_CHARS = /[<>:"|?*]/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** Checks a `folder/name` path the way the app does and returns it
 *  normalized (forward slashes, no empty segments, no trailing `.md`). */
export function normalizeFilePath(folder: string, name: string): string {
  const segments = `${folder}/${name}`
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
  if (folder.replace(/\\/g, '/').trim().startsWith('/')) {
    throw new ClipLinkError('bad-file', 'The location cannot start with a slash.')
  }
  const kept = segments.filter((s) => s.length > 0)
  if (kept.length === 0) throw new ClipLinkError('bad-file', 'The note needs a name.')
  const last = segments[segments.length - 1]
  if (!last) throw new ClipLinkError('bad-file', 'The note needs a name.')
  kept[kept.length - 1] = kept[kept.length - 1]!.replace(/\.md$/i, '')
  if (!kept[kept.length - 1]) throw new ClipLinkError('bad-file', 'The note needs a name.')
  for (let i = 0; i < kept.length; i++) {
    const seg = kept[i]!
    if (seg === '..' || seg.startsWith('.')) {
      throw new ClipLinkError('bad-file', 'Folder and note names cannot start with a dot.')
    }
    if (i === 0 && /^[a-zA-Z]:$/.test(seg)) {
      throw new ClipLinkError('bad-file', 'The location cannot name a drive.')
    }
    if (CONTROL_CHARS.test(seg)) {
      throw new ClipLinkError('bad-file', 'The location has a control character.')
    }
    if (i < kept.length - 1 && WINDOWS_FOLDER_CHARS.test(seg)) {
      throw new ClipLinkError('bad-file', `The folder "${seg}" has a character Windows refuses.`)
    }
  }
  const path = kept.join('/')
  if (path.length > MAX_FILE_CHARS) throw new ClipLinkError('bad-file', 'The location is too long.')
  return path
}

function checkVault(vault: string | null): string | null {
  if (vault === null) return null
  const trimmed = vault.trim()
  if (!trimmed) return null
  if (CONTROL_CHARS.test(trimmed) || trimmed.length > MAX_VAULT_CHARS) {
    throw new ClipLinkError('bad-vault', 'The vault name is not valid.')
  }
  if (/[/\\]/.test(trimmed)) {
    throw new ClipLinkError('bad-vault', 'Use the vault name, not its path.')
  }
  return trimmed
}

function bodyParam(body: ClipBody): string {
  if ('clipboard' in body) {
    const hash = body.clipboard.toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new ClipLinkError('bad-hash', 'The clip hash is not valid.')
    return `clipboard=${hash}`
  }
  if (!body.content) throw new ClipLinkError('empty-body', 'There is nothing to clip.')
  if (utf8Length(body.content) > MAX_CONTENT_BYTES) {
    throw new ClipLinkError('content-too-long', 'The note is too long to send in the link.')
  }
  return `content=${encodeLinkValue(body.content)}`
}

/** The canonical link for a request: parameters in the order vault, file,
 *  body, position, silent. */
export function buildClipLink(req: ClipLinkRequest): string {
  const params: string[] = []
  const vault = checkVault(req.vault)
  if (vault) params.push(`vault=${encodeLinkValue(vault)}`)

  if (req.action === 'new') {
    const inserting = req.position !== 'create'
    if (req.name !== null && req.name.trim() !== '') {
      params.push(`file=${encodeLinkValue(normalizeFilePath(req.folder, req.name))}`)
    } else if (inserting) {
      throw new ClipLinkError('missing-file', 'Adding to a note needs the note name.')
    } else if (req.folder.trim()) {
      throw new ClipLinkError('bad-file', 'The note needs a name.')
    }
    if (req.body) params.push(bodyParam(req.body))
    else if (inserting) throw new ClipLinkError('nothing-to-insert', 'There is nothing to add.')
    if (inserting) params.push(req.position)
  } else {
    if (req.body) {
      params.push(bodyParam(req.body))
      params.push(req.position)
    } else if (req.position === 'prepend') {
      throw new ClipLinkError('nothing-to-insert', 'There is nothing to add.')
    }
  }
  if (req.silent) params.push('silent')

  const link = `${LINK_SCHEME}://${req.action}${params.length ? '?' + params.join('&') : ''}`
  if (link.length > MAX_LINK_CHARS) throw new ClipLinkError('link-too-long', 'The link is too long.')
  return link
}

/** What a clip does with its note. */
export type Behavior = 'new' | 'append' | 'prepend' | 'daily-append' | 'daily-prepend'

export const BEHAVIORS: { id: Behavior; label: string }[] = [
  { id: 'new', label: 'New note' },
  { id: 'append', label: 'Add to note, bottom' },
  { id: 'prepend', label: 'Add to note, top' },
  { id: 'daily-append', label: 'Daily note, bottom' },
  { id: 'daily-prepend', label: 'Daily note, top' }
]

export function isDailyBehavior(b: Behavior): boolean {
  return b === 'daily-append' || b === 'daily-prepend'
}

export interface ClipTarget {
  vault: string | null
  folder: string
  name: string
  behavior: Behavior
  silent: boolean
}

export function requestFor(target: ClipTarget, body: ClipBody | null): ClipLinkRequest {
  switch (target.behavior) {
    case 'daily-append':
    case 'daily-prepend':
      return {
        action: 'daily',
        vault: target.vault,
        body,
        position: target.behavior === 'daily-prepend' ? 'prepend' : 'append',
        silent: target.silent
      }
    default:
      return {
        action: 'new',
        vault: target.vault,
        folder: target.folder,
        name: target.name,
        body,
        position:
          target.behavior === 'append' ? 'append' : target.behavior === 'prepend' ? 'prepend' : 'create',
        silent: target.silent
      }
  }
}
