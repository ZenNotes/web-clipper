// Extraction with Defuddle on saved pages, then the default template over
// the result: the note a first-time user gets.

import { describe, expect, it } from 'vitest'
import { defaultSettings, defaultTemplate } from '../src/shared/defaults'
import { extractPage, toMarkdown } from '../src/extract/extract'
import { compileNote, noteText } from '../src/template/compile'
import { importTemplates, exportTemplate } from '../src/template/import'
import { matchTemplate, ruleMatches } from '../src/template/triggers'
import type { Highlight, Template } from '../src/shared/types'
import { fixtureDom, NOW } from './helpers'

const ARTICLE_URL = 'https://quietdesk.example/posts/plain-text?utm_source=feed'

function article() {
  const dom = fixtureDom('article.html', ARTICLE_URL)
  return { dom, doc: dom.window.document }
}

describe('extractPage', () => {
  it('reads the article, metadata and schema', () => {
    const { doc } = article()
    const page = extractPage(doc, { url: ARTICLE_URL, highlights: [], contentMode: 'highlight' })
    expect(page.title).toBe('Plain Text Notes Last Forever')
    expect(page.author).toContain('Mira Okafor')
    expect(page.description).toBe('Why notes stored as Markdown files outlive the apps that wrote them.')
    expect(page.site).toBe('The Quiet Desk')
    expect(page.domain).toBe('quietdesk.example')
    expect(page.image).toBe('https://quietdesk.example/img/cover.jpg')
    expect(page.published).toContain('2026-03-14')
    expect(page.language).toBe('en')
    expect(page.words).toBeGreaterThan(60)
    // The article, not the chrome around it.
    expect(page.content).toContain('## Files outlive formats')
    expect(page.content).toContain('**plain Markdown files**')
    expect(page.content).toContain('a+b still means a+b')
    expect(page.content).toContain('```bash')
    expect(page.content).toContain('![A tidy desk](https://quietdesk.example/img/desk.jpg)')
    expect(page.content).toMatch(/> \[!tip\]/)
    expect(page.content).not.toContain('Related posts')
    expect(page.content).not.toContain('Copyright The Quiet Desk')
    expect(page.metaTags.some((m) => m.property === 'og:title')).toBe(true)
    expect(JSON.stringify(page.schema)).toContain('BlogPosting')
  })

  it('uses the selection when there is one', () => {
    const { doc, dom } = article()
    const p = doc.querySelectorAll('article p')[1]!
    const range = doc.createRange()
    range.selectNodeContents(p)
    dom.window.getSelection()!.addRange(range)
    const page = extractPage(doc, { url: ARTICLE_URL, highlights: [], contentMode: 'highlight' })
    expect(page.selection).toContain('Every note app eventually goes away.')
    expect(page.content).toBe(page.selection)
    expect(page.content).not.toContain('Files outlive formats')
  })

  it('clips the whole page when asked to leave the selection out', () => {
    const { doc, dom } = article()
    const range = doc.createRange()
    range.selectNodeContents(doc.querySelectorAll('article p')[1]!)
    dom.window.getSelection()!.addRange(range)
    const page = extractPage(doc, { url: ARTICLE_URL, highlights: [], contentMode: 'highlight', selectionHtml: '' })
    expect(page.selection).toBe('')
    expect(page.content).toContain('## Files outlive formats')
  })

  it('clips only the highlights when set to replace', () => {
    const { doc } = article()
    const h: Highlight = {
      id: 'h1',
      text: 'A folder of text files ties it to nothing at all.',
      html: 'A folder of text files ties it to <em>nothing</em> at all.',
      timestamp: '2026-11-09T10:00:00Z',
      kind: 'text',
      anchor: { start: 0, end: 0, prefix: '', suffix: '' }
    }
    const page = extractPage(doc, { url: ARTICLE_URL, highlights: [h], contentMode: 'replace' })
    expect(page.content).toBe('A folder of text files ties it to *nothing* at all.')
  })

  it('turns drawn highlights into ==marks==', () => {
    const { doc } = article()
    const strong = doc.querySelector('article strong')!
    const mark = doc.createElement('mark')
    mark.setAttribute('data-zn-hl', 'x')
    strong.parentNode!.insertBefore(mark, strong)
    mark.appendChild(strong)
    const page = extractPage(doc, { url: ARTICLE_URL, highlights: [], contentMode: 'highlight' })
    expect(page.content).toContain('==**plain Markdown files**==')
  })

  it('converts HTML to Markdown on its own', () => {
    expect(toMarkdown('<p>a <a href="/x">link</a></p>', 'https://ex.test/p')).toBe('a [link](https://ex.test/x)')
  })
})

describe('the default template', () => {
  it('produces a note with frontmatter and the article', () => {
    const { doc } = article()
    const page = extractPage(doc, { url: ARTICLE_URL, highlights: [], contentMode: 'highlight' })
    const s = defaultSettings()
    const note = compileNote(defaultTemplate(), page, {
      doc,
      now: NOW,
      toMarkdown: (h) => toMarkdown(h, ARTICLE_URL),
      defaultContext: s.interpreter.defaultContext,
      maxContextChars: s.interpreter.maxContextChars
    })
    expect(note.errors).toEqual([])
    expect(note.name).toBe('Plain Text Notes Last Forever')
    expect(note.folder).toBe('Clippings')
    expect(note.behavior).toBe('new')
    const text = noteText(note)
    const [fm, body] = text.split('\n---\n\n')
    expect(fm).toContain(`source: "${ARTICLE_URL}"`)
    expect(fm).toContain('published: 2026-03-14')
    expect(fm).toContain('created: 2026-11-09')
    expect(fm).not.toContain('tags')
    expect(fm).toContain('description: "Why notes stored as Markdown files outlive the apps that wrote them."')
    expect(fm).toMatch(/author:\n {2}- "\[\[Mira Okafor\]\]"/)
    expect(fm!.startsWith('---\n')).toBe(true)
    expect(body).toContain('## Files outlive formats')
    expect(text.endsWith('\n')).toBe(true)
    expect(note.context).toBe(page.content.slice(0, s.interpreter.maxContextChars))
  })

  it('leaves frontmatter out when adding to a note', () => {
    const text = noteText({
      behavior: 'daily-append',
      properties: [{ name: 'source', type: 'text', value: 'x' }],
      body: '\n\nQuote\n\n'
    })
    expect(text).toBe('Quote\n')
  })
})

describe('triggers', () => {
  const recipeSchema = {
    '@graph': [{ '@type': 'Recipe', name: 'Brown Butter Cookies', recipeIngredient: ['butter'] }]
  }
  it('matches URL prefixes, regexes and schema rules', () => {
    expect(ruleMatches('https://quietdesk.example/posts', ARTICLE_URL, null)).toBe(true)
    expect(ruleMatches('/quietdesk\\.example\\/posts\\/[a-z-]+/', ARTICLE_URL, null)).toBe(true)
    expect(ruleMatches('/^https:\\/\\/other/', ARTICLE_URL, null)).toBe(false)
    expect(ruleMatches('schema:@Recipe', '', recipeSchema)).toBe(true)
    expect(ruleMatches('schema:@Recipe.recipeIngredient', '', recipeSchema)).toBe(true)
    expect(ruleMatches('schema:@Recipe.name=brown butter cookies', '', recipeSchema)).toBe(true)
    expect(ruleMatches('schema:@Recipe.name=Bread', '', recipeSchema)).toBe(false)
    expect(ruleMatches('schema:@Movie', '', recipeSchema)).toBe(false)
  })

  it('picks the first match and falls back to the first template', () => {
    const t = (id: string, triggers: string[]): Template => ({ ...defaultTemplate(), id, triggers })
    const list = [t('default', []), t('recipes', ['schema:@Recipe']), t('desk', ['https://quietdesk.example'])]
    expect(matchTemplate(list, ARTICLE_URL, null)!.id).toBe('desk')
    expect(matchTemplate(list, 'https://x.test', recipeSchema)!.id).toBe('recipes')
    expect(matchTemplate(list, 'https://x.test', null)!.id).toBe('default')
  })
})

describe('template files', () => {
  it('imports an Obsidian clipper template file', () => {
    const json = JSON.stringify({
      schemaVersion: '0.1.0',
      name: 'Recipe',
      behavior: 'append-daily',
      noteContentFormat: '## {{schema:@Recipe:name}}\n{{schema:@Recipe:recipeIngredient|list}}',
      properties: [
        { name: 'title', value: '{{title}}', type: 'text' },
        { name: 'tags', value: 'recipe', type: 'multitext' },
        { name: 'bogus', value: 'x', type: 'weird' }
      ],
      triggers: ['schema:@Recipe', ''],
      noteNameFormat: '{{schema:@Recipe:name}}',
      path: 'Recipes',
      context: '{{content}}'
    })
    const [t] = importTemplates(json)
    expect(t!.name).toBe('Recipe')
    expect(t!.behavior).toBe('daily-append')
    expect(t!.path).toBe('Recipes')
    expect(t!.triggers).toEqual(['schema:@Recipe'])
    expect(t!.properties.map((p) => p.type)).toEqual(['text', 'multitext', 'text'])
    expect(t!.noteContentFormat).toContain('|list')
  })

  it('maps overwrite to a new note, never an overwrite', () => {
    const [t] = importTemplates(JSON.stringify({ name: 'O', behavior: 'overwrite', noteContentFormat: '{{content}}' }))
    expect(t!.behavior).toBe('new')
  })

  it('round-trips our own export, alone or in a bundle', () => {
    const tpl = { ...defaultTemplate(), name: 'Mine', behavior: 'prepend' as const, triggers: ['https://x.test'] }
    const [back] = importTemplates(exportTemplate(tpl))
    expect(back!.name).toBe('Mine')
    expect(back!.behavior).toBe('prepend')
    expect(back!.properties.length).toBe(tpl.properties.length)
    expect(importTemplates(JSON.stringify([JSON.parse(exportTemplate(tpl)), JSON.parse(exportTemplate(tpl))]))).toHaveLength(2)
  })

  it('refuses files that hold no template', () => {
    expect(() => importTemplates('{"hello": 1}')).toThrow(/No templates/)
    expect(() => importTemplates('not json')).toThrow(/not JSON/)
  })
})

describe('stored settings', () => {
  it('drops the untouched old default tag, and only that', async () => {
    const { mergeSettings } = await import('../src/shared/storage')
    const old = { ...defaultTemplate(), properties: [...defaultTemplate().properties, { id: 'p-tags', name: 'tags', value: 'clippings', type: 'multitext' as const }] }
    const edited = { ...old, id: 'mine' }
    const kept = { ...old, properties: old.properties.map((p) => (p.id === 'p-tags' ? { ...p, value: 'clippings, web' } : p)) }
    const s = mergeSettings({ templates: [old, edited] })
    expect(s.templates[0]!.properties.some((p) => p.name === 'tags')).toBe(false)
    expect(s.templates[1]!.properties.some((p) => p.name === 'tags')).toBe(true)
    expect(mergeSettings({ templates: [kept] }).templates[0]!.properties.some((p) => p.name === 'tags')).toBe(true)
  })
})
