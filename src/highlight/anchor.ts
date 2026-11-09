// Highlight anchors are character offsets into the page's text: every text
// node under <body> in document order, skipping scripts, styles and the
// clipper's own UI. Wrapping text in <mark> keeps that text the same, so an
// anchor taken with highlights drawn still lines up after they are removed.

import type { HighlightAnchor } from '../shared/types'
import { UI_ATTR } from '../shared/ui-attr'

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA'])
const CONTEXT = 32

export function textNodes(root: Node): Text[] {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      for (let p = n.parentElement; p; p = p.parentElement) {
        if (SKIP.has(p.tagName) || p.hasAttribute(UI_ATTR)) return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })
  const out: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text)
  return out
}

interface TextIndex {
  nodes: Text[]
  starts: number[]
  text: string
}

export function indexText(root: Node): TextIndex {
  const nodes = textNodes(root)
  const starts: number[] = []
  let text = ''
  for (const n of nodes) {
    starts.push(text.length)
    text += n.data
  }
  return { nodes, starts, text }
}

function offsetOf(index: TextIndex, node: Node, offset: number): number | null {
  if (node.nodeType === 3) {
    const i = index.nodes.indexOf(node as Text)
    return i === -1 ? null : index.starts[i]! + offset
  }
  // An element boundary: the first text node at or after it.
  const doc = node.ownerDocument ?? (node as Document)
  const point = doc.createRange()
  point.setStart(node, offset)
  point.collapse(true)
  for (let i = 0; i < index.nodes.length; i++) {
    if (point.comparePoint(index.nodes[i]!, 0) >= 0) return index.starts[i]!
  }
  return index.text.length
}

export function anchorFromRange(root: Node, range: Range): HighlightAnchor | null {
  const index = indexText(root)
  const start = offsetOf(index, range.startContainer, range.startOffset)
  const end = offsetOf(index, range.endContainer, range.endOffset)
  if (start === null || end === null || end <= start) return null
  return {
    start,
    end,
    prefix: index.text.slice(Math.max(0, start - CONTEXT), start),
    suffix: index.text.slice(end, end + CONTEXT)
  }
}

/** Finds the anchor's span in the page text now: at its offsets when the
 *  text there still matches, else the occurrence whose surroundings match
 *  best. */
export function locate(root: Node, anchor: HighlightAnchor, text: string): { start: number; end: number } | null {
  const index = indexText(root)
  const at = index.text.slice(anchor.start, anchor.end)
  if (at === text) return { start: anchor.start, end: anchor.end }
  let best: { start: number; score: number } | null = null
  for (let i = index.text.indexOf(text); i !== -1; i = index.text.indexOf(text, i + 1)) {
    let score = 0
    const before = index.text.slice(Math.max(0, i - anchor.prefix.length), i)
    const after = index.text.slice(i + text.length, i + text.length + anchor.suffix.length)
    for (let k = 1; k <= Math.min(before.length, anchor.prefix.length); k++) {
      if (before[before.length - k] === anchor.prefix[anchor.prefix.length - k]) score++
      else break
    }
    for (let k = 0; k < Math.min(after.length, anchor.suffix.length); k++) {
      if (after[k] === anchor.suffix[k]) score++
      else break
    }
    score -= Math.abs(i - anchor.start) / 1e6
    if (!best || score > best.score) best = { start: i, score }
  }
  return best ? { start: best.start, end: best.start + text.length } : null
}

/** The text nodes covering [start, end), split so each piece lies wholly
 *  inside the span. */
export function splitForSpan(root: Node, start: number, end: number): Text[] {
  const index = indexText(root)
  const out: Text[] = []
  for (let i = 0; i < index.nodes.length; i++) {
    let node = index.nodes[i]!
    const nStart = index.starts[i]!
    const nEnd = nStart + node.data.length
    if (nEnd <= start || nStart >= end) continue
    const from = Math.max(start, nStart) - nStart
    const to = Math.min(end, nEnd) - nStart
    if (to < node.data.length) node.splitText(to)
    if (from > 0) node = node.splitText(from)
    out.push(node)
  }
  return out
}
