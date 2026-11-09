import type { Highlight } from '../shared/types'

/** Everything a template can read about a page. Built in the content script
 *  from the live document, or in tests from a saved fixture page. */
export interface PageData {
  url: string
  title: string
  author: string
  published: string
  description: string
  domain: string
  site: string
  image: string
  favicon: string
  language: string
  words: number
  /** Markdown of the main content, or of the selection / highlights, by the
   *  rules in extract.ts. */
  content: string
  contentHtml: string
  selection: string
  selectionHtml: string
  highlights: Highlight[]
  fullHtml: string
  metaTags: { name?: string | null; property?: string | null; content: string | null }[]
  /** Raw schema.org JSON-LD: an object, an array, or null. */
  schema: unknown
}

export function emptyPage(url = ''): PageData {
  let domain = ''
  try {
    domain = url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    domain = ''
  }
  return {
    url,
    title: '',
    author: '',
    published: '',
    description: '',
    domain,
    site: '',
    image: '',
    favicon: '',
    language: '',
    words: 0,
    content: '',
    contentHtml: '',
    selection: '',
    selectionHtml: '',
    highlights: [],
    fullHtml: '',
    metaTags: [],
    schema: null
  }
}
