// Reads a page into PageData with Defuddle (main content, metadata,
// schema.org) and Defuddle's HTML-to-Markdown converter. Runs in the content
// script on the live document, and in tests on saved fixture pages.
//
// What `{{content}}` holds: the selection when there is one; otherwise, with
// highlights saved and the highlighter set to replace, the highlights; else
// the article, with highlights marked as ==text== when set to highlight.

import Defuddle, { createMarkdownContent } from 'defuddle/full'
import type { Highlight, HighlightContentMode } from '../shared/types'
import type { PageData } from '../template/page'

import { UI_ATTR } from '../shared/ui-attr'

export { UI_ATTR }

export interface ExtractOptions {
  url: string
  highlights: Highlight[]
  contentMode: HighlightContentMode
  /** HTML of the selection, read before the popup took focus. */
  selectionHtml?: string
}

/** Makes links and image sources absolute: a selection or highlight is a
 *  fragment of the page, and its relative URLs mean nothing in a note. */
function absolutize(html: string, url: string): string {
  if (!url || typeof DOMParser === 'undefined' || !/\s(href|src)=/i.test(html)) return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const [sel, attr] of [
    ['a[href]', 'href'],
    ['img[src]', 'src'],
    ['source[src]', 'src'],
    ['video[src]', 'src']
  ] as const) {
    doc.body.querySelectorAll(sel).forEach((el) => {
      const v = el.getAttribute(attr)!
      if (v.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(v)) return
      try {
        el.setAttribute(attr, new URL(v, url).href)
      } catch {
        /* leave it */
      }
    })
  }
  return doc.body.innerHTML
}

export function toMarkdown(html: string, url: string): string {
  if (!html.trim()) return ''
  try {
    return createMarkdownContent(absolutize(html, url), url).trim()
  } catch {
    return html.replace(/<[^>]+>/g, '').trim()
  }
}

export function selectionHtmlOf(doc: Document): string {
  const sel = doc.getSelection?.()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return ''
  const box = doc.createElement('div')
  for (let i = 0; i < sel.rangeCount; i++) {
    const range = sel.getRangeAt(i)
    const anc = range.commonAncestorContainer
    const el = anc.nodeType === 1 ? (anc as Element) : anc.parentElement
    if (el?.closest(`[${UI_ATTR}]`)) continue
    box.appendChild(range.cloneContents())
  }
  return box.textContent?.trim() ? box.innerHTML : ''
}

function jsonLd(doc: Document): unknown {
  const out: unknown[] = []
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      out.push(JSON.parse(s.textContent ?? ''))
    } catch {
      /* a broken block is skipped */
    }
  })
  return out.length === 0 ? null : out.length === 1 ? out[0] : out
}

function metaTagsOf(doc: Document): PageData['metaTags'] {
  return Array.from(doc.querySelectorAll('meta')).map((m) => ({
    name: m.getAttribute('name'),
    property: m.getAttribute('property'),
    content: m.getAttribute('content')
  }))
}

function fullHtmlOf(doc: Document): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement
  root.querySelectorAll(`[${UI_ATTR}]`).forEach((el) => el.remove())
  return root.outerHTML
}

export function extractPage(doc: Document, opts: ExtractOptions): PageData {
  let result: ReturnType<Defuddle['parse']> | null = null
  try {
    result = new Defuddle(doc, { url: opts.url, separateMarkdown: false, useAsync: false }).parse()
  } catch {
    result = null
  }
  const contentHtml = result?.content ?? doc.body?.innerHTML ?? ''
  // Highlight marks drawn on the page reach the Markdown as ==text==; the
  // caller lifts them off first when the highlighter is set to do nothing.
  const articleMarkdown = toMarkdown(contentHtml, opts.url)

  const selectionHtml = opts.selectionHtml ?? selectionHtmlOf(doc)
  const selection = selectionHtml ? toMarkdown(selectionHtml, opts.url) : ''

  let content = articleMarkdown
  if (selection) content = selection
  else if (opts.highlights.length && opts.contentMode === 'replace') {
    content = opts.highlights
      .map((h) => (h.kind === 'element' ? toMarkdown(h.html, opts.url) : toMarkdown(h.html, opts.url) || h.text))
      .filter(Boolean)
      .join('\n\n')
  }

  let domain = result?.domain ?? ''
  if (!domain) {
    try {
      domain = new URL(opts.url).hostname.replace(/^www\./, '')
    } catch {
      domain = ''
    }
  }

  return {
    url: opts.url,
    title: (result?.title || doc.title || '').trim(),
    author: result?.author ?? '',
    published: result?.published ?? '',
    description: result?.description ?? '',
    domain,
    site: result?.site ?? '',
    image: result?.image ?? '',
    favicon: result?.favicon ?? '',
    language: result?.language || doc.documentElement.lang || '',
    words: result?.wordCount ?? 0,
    content,
    contentHtml: selection ? selectionHtml : contentHtml,
    selection,
    selectionHtml,
    highlights: opts.highlights,
    fullHtml: fullHtmlOf(doc),
    metaTags: result?.metaTags?.length ? result.metaTags : metaTagsOf(doc),
    schema: result?.schemaOrgData ?? jsonLd(doc)
  }
}
