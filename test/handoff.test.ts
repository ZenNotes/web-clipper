import { describe, expect, it } from 'vitest'
import { handoff, NATIVE_WAKE_LINK, type HandoffDeps } from '../src/shared/handoff'
import { sha256Hex } from '../src/shared/hash'
import type { ClipTarget } from '../src/shared/link'

const target: ClipTarget = { vault: 'Work', folder: 'Clippings', name: 'My Article', behavior: 'new', silent: false }

function deps(clipboardWorks = true) {
  const opened: string[] = []
  let clipboard: string | null = null
  const d: HandoffDeps = {
    writeClipboard: async (t) => {
      if (!clipboardWorks) return false
      clipboard = t
      return true
    },
    openLink: async (u) => {
      opened.push(u)
    }
  }
  return { d, opened, clipboard: () => clipboard }
}

describe('handoff', () => {
  it('writes the exact text to the clipboard and links its hash', async () => {
    const text = '---\nsource: "https://example.com/post"\ncreated: 2026-11-09\n---\n\n# A Post\n\nBody with a+b and #hash & more.\n'
    const { d, opened, clipboard } = deps()
    const res = await handoff(text, target, d)
    expect(res.ok && res.via).toBe('clipboard')
    expect(clipboard()).toBe(text)
    // The hash of this text is pinned in the app repo's fixtures.
    expect(await sha256Hex(clipboard()!)).toBe('ee091955394fab0e886571acb8f9cec6e61b24e066b74e262ac5b2254a17ff6a')
    expect(opened).toEqual([
      'zennotes://new?vault=Work&file=Clippings%2FMy%20Article&clipboard=ee091955394fab0e886571acb8f9cec6e61b24e066b74e262ac5b2254a17ff6a'
    ])
  })

  it('sends a short note inline when the clipboard fails', async () => {
    const { d, opened } = deps(false)
    const res = await handoff('a+b = c 🚀\n#tag & more (yes)', { ...target, vault: null, name: 'Inline' }, d)
    expect(res.ok && res.via).toBe('inline')
    expect(opened[0]).toBe('zennotes://new?file=Clippings%2FInline&content=a%2Bb%20%3D%20c%20%F0%9F%9A%80%0A%23tag%20%26%20more%20%28yes%29')
  })

  it('fails clearly when the clipboard fails and the note is long', async () => {
    const { d, opened } = deps(false)
    const res = await handoff('x'.repeat(40000), target, d)
    expect(res.ok).toBe(false)
    expect(opened).toEqual([])
  })

  it('prefers inline when asked and the note fits', async () => {
    const { d, opened, clipboard } = deps()
    const res = await handoff('short', target, d, { preferInline: true })
    expect(res.ok && res.via).toBe('inline')
    expect(clipboard()).toBeNull()
    expect(opened[0]).toContain('content=short')
  })

  it('refuses notes over 8 MiB and empty notes', async () => {
    const { d } = deps()
    expect((await handoff('', target, d)).ok).toBe(false)
    expect((await handoff('a'.repeat(8 * 1024 * 1024 + 1), target, d)).ok).toBe(false)
  })

  it('routes daily behaviors to the daily link', async () => {
    const { d, opened } = deps()
    await handoff('Quoted line from a page\n', { ...target, vault: null, behavior: 'daily-append' }, d)
    expect(opened[0]).toBe('zennotes://daily?clipboard=ba89f351828c1613368c42ff5c973db8dc69592b985caad55cc0e70f49ed1146&append')
  })

  it('reports a bad location instead of opening a link', async () => {
    const { d, opened } = deps()
    const res = await handoff('x', { ...target, folder: '../secret' }, d)
    expect(res.ok).toBe(false)
    expect(opened).toEqual([])
  })

  it('uses the Safari handler when it answers, then wakes the app', async () => {
    const { d, opened, clipboard } = deps()
    const seen: unknown[] = []
    d.nativeClip = async (m) => {
      seen.push(m)
      return { ok: true }
    }
    const res = await handoff('Body\n', target, d)
    expect(res.ok && res.via).toBe('native')
    expect(seen).toEqual([{ type: 'clip', vault: 'Work', file: 'Clippings/My Article', text: 'Body\n', behavior: 'new', silent: false }])
    expect(opened).toEqual([NATIVE_WAKE_LINK])
    expect(clipboard()).toBeNull()
  })

  it('falls back to the clipboard when the Safari handler is missing', async () => {
    const { d, opened } = deps()
    d.nativeClip = async () => null
    const res = await handoff('Body\n', target, d)
    expect(res.ok && res.via).toBe('clipboard')
    expect(opened[0]).toMatch(/^zennotes:\/\/new\?vault=Work&file=Clippings%2FMy%20Article&clipboard=[0-9a-f]{64}$/)
  })
})

describe('copy only (iPhone and iPad)', () => {
  it('copies the note and opens no link', async () => {
    const { d, opened, clipboard } = deps()
    const res = await handoff('Body\n', target, d, { copyOnly: true })
    expect(res).toEqual({ ok: true, via: 'copied', link: '' })
    expect(clipboard()).toBe('Body\n')
    expect(opened).toEqual([])
  })

  it('reports a failed copy instead of sending the note in a link', async () => {
    const { d, opened } = deps(false)
    const res = await handoff('Body\n', target, d, { copyOnly: true })
    expect(res.ok).toBe(false)
    expect(opened).toEqual([])
  })
})
