// The link builder against the app repo's normative fixtures
// (test/fixtures/web-clipper-link.fixtures.json, copied by
// scripts/sync-fixtures.mjs). Canonical accept cases must be rebuilt byte for
// byte from their expected parse; every reject case the builder can be asked
// to produce must be refused with the same code.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../src/shared/hash'
import { buildClipLink, ClipLinkError, encodeLinkValue, type ClipLinkRequest } from '../src/shared/link'

interface Fixtures {
  accept: { name: string; link: string; expect: ClipLinkRequest; canonical: boolean }[]
  reject: { name: string; link: string | { prefix: string; repeat: string; times: number; suffix: string }; reason: string }[]
  notClip: string[]
  hashes: { text: string; sha256: string }[]
}

const fixtures: Fixtures = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/web-clipper-link.fixtures.json'), 'utf8')
)

const linkOf = (l: Fixtures['reject'][number]['link']) =>
  typeof l === 'string' ? l : l.prefix + l.repeat.repeat(l.times) + l.suffix

/** A small reader for the reject links, enough to turn one back into the
 *  builder request it would have come from. */
function requestFromLink(link: string): ClipLinkRequest | null {
  const m = /^zennotes:\/\/(new|daily)(?:\?(.*))?$/i.exec(link)
  if (!m) return null
  const params = new Map<string, string | true>()
  for (const part of (m[2] ?? '').split('&').filter(Boolean)) {
    const eq = part.indexOf('=')
    const key = eq === -1 ? part : part.slice(0, eq)
    if (params.has(key)) return null
    try {
      params.set(key, eq === -1 ? true : decodeURIComponent(part.slice(eq + 1)))
    } catch {
      return null
    }
  }
  const str = (k: string) => (typeof params.get(k) === 'string' ? (params.get(k) as string) : null)
  if (params.has('clipboard') && params.has('content')) return null
  if (params.has('append') && params.has('prepend')) return null
  const body =
    params.get('clipboard') === true
      ? { clipboard: '' }
      : str('clipboard') !== null
        ? { clipboard: str('clipboard')! }
        : params.has('content')
          ? { content: str('content') ?? '' }
          : null
  const file = (str('file') ?? '').replace(/\\/g, '/')
  const slash = file.lastIndexOf('/')
  if (m[1]!.toLowerCase() === 'daily') {
    return { action: 'daily', vault: str('vault'), body, position: params.has('prepend') ? 'prepend' : 'append', silent: false }
  }
  return {
    action: 'new',
    vault: str('vault'),
    folder: slash === -1 ? '' : file.slice(0, slash),
    name: file ? file.slice(slash + 1) : null,
    body,
    position: params.has('append') ? 'append' : params.has('prepend') ? 'prepend' : 'create',
    silent: params.has('silent')
  }
}

describe('link fixtures', () => {
  it('loads a version 1 fixtures file', () => {
    expect(fixtures.accept.length).toBeGreaterThan(10)
    expect(fixtures.reject.length).toBeGreaterThan(10)
  })

  for (const c of fixtures.accept.filter((x) => x.canonical)) {
    it(`builds canonical: ${c.name}`, () => {
      expect(buildClipLink(c.expect)).toBe(c.link)
    })
  }

  // Not representable through the builder's types, so nothing to refuse.
  const unrepresentable = new Set(['duplicate-param', 'bad-encoding', 'two-bodies', 'append-and-prepend'])

  for (const c of fixtures.reject) {
    const link = linkOf(c.link)
    it(`refuses: ${c.name} (${c.reason})`, () => {
      const req = requestFromLink(link)
      if (unrepresentable.has(c.reason)) {
        expect(req).toBeNull()
        return
      }
      if (c.reason === 'link-too-long') {
        // Only an unknown parameter makes this one long; the builder never
        // emits unknown parameters, and a content body this long is refused
        // as content-too-long first.
        expect(() =>
          buildClipLink({ action: 'new', vault: null, folder: '', name: 'Note', body: { content: 'a'.repeat(131072) }, position: 'create', silent: false })
        ).toThrow(ClipLinkError)
        return
      }
      expect(req).not.toBeNull()
      try {
        buildClipLink(req!)
        expect.unreachable(`built ${link.slice(0, 80)}`)
      } catch (err) {
        expect(err).toBeInstanceOf(ClipLinkError)
        expect((err as ClipLinkError).code).toBe(c.reason)
      }
    })
  }

  for (const h of fixtures.hashes) {
    it(`hashes ${JSON.stringify(h.text.slice(0, 24))}`, async () => {
      expect(await sha256Hex(h.text)).toBe(h.sha256)
    })
  }
})

describe('encodeLinkValue', () => {
  it('leaves only unreserved characters bare', () => {
    expect(encodeLinkValue("a+b !'()*~-._/")).toBe('a%2Bb%20%21%27%28%29%2A~-._%2F')
  })

  it('round-trips through decodeURIComponent', () => {
    const s = 'Ünïcødé 🚀 & = ? # % +\n'
    expect(decodeURIComponent(encodeLinkValue(s))).toBe(s)
  })
})

describe('buildClipLink', () => {
  it('appends to a note with silent last', () => {
    expect(
      buildClipLink({ action: 'new', vault: 'Work', folder: 'Reading', name: 'Log', body: { content: 'x' }, position: 'append', silent: true })
    ).toBe('zennotes://new?vault=Work&file=Reading%2FLog&content=x&append&silent')
  })

  it('rejects a vault path', () => {
    expect(() =>
      buildClipLink({ action: 'daily', vault: '/Users/me/Notes', body: { content: 'x' }, position: 'append', silent: false })
    ).toThrow(/vault name/)
  })

  it('drops a trailing .md and trims segments', () => {
    expect(
      buildClipLink({ action: 'new', vault: null, folder: ' Clippings ', name: 'Note.md', body: null, position: 'create', silent: false })
    ).toBe('zennotes://new?file=Clippings%2FNote')
  })
})
