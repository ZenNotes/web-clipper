import DOMPurify from 'dompurify'
import { marked } from 'marked'

/** Preview HTML for a note body. Page-derived text is untrusted, so the
 *  output is sanitized before it reaches an extension page. */
export function previewHtml(markdown: string): string {
  const withMarks = markdown.replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
  const html = marked.parse(withMarks, { async: false, gfm: true, breaks: false }) as string
  return DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input', 'iframe'], FORBID_ATTR: ['style'] })
}
