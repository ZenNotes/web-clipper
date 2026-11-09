import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { toMarkdown } from '../src/extract/extract'
import { emptyPage, type PageData } from '../src/template/page'
import { renderTemplate, type PromptRef, type RenderEnv } from '../src/template/render'

export const NOW = new Date(2026, 10, 9, 14, 5, 9)

export function env(page: Partial<PageData> = {}, doc: Document | null = null): RenderEnv {
  const p = { ...emptyPage('https://example.com/post'), ...page }
  return { page: p, doc, url: p.url, now: NOW, toMarkdown: (h) => toMarkdown(h, p.url), prompts: [] as PromptRef[] }
}

export function render(src: string, page: Partial<PageData> = {}, doc: Document | null = null): string {
  return renderTemplate(src, env(page, doc))
}

export function fixtureDom(name: string, url: string): JSDOM {
  const html = readFileSync(resolve(__dirname, 'fixtures/pages', name), 'utf8')
  return new JSDOM(html, { url, pretendToBeVisual: true })
}
