// The content script, injected on demand (popup, shortcuts, menus). It owns
// everything that needs the live page: extraction, template rendering (so
// selector variables see the page as it is), the highlighter and the reader.
// Injection can repeat, so it registers once per page.

import { extractPage, toMarkdown } from '../extract/extract'
import { getHighlighter } from '../highlight/highlighter'
import { getReader } from '../reader/reader'
import { ext } from '../shared/ext'
import type { ContentError, ContentRequest, CompileResponse, ContentState } from '../shared/messages'
import { resolveModel } from '../shared/pipeline'
import { loadSettings } from '../shared/storage'
import { compileNote, templateById } from '../template/compile'
import { finalizePrompts } from '../template/render'
import { matchTemplate } from '../template/triggers'
import { showToast } from './toast'

const FLAG = '__zennotesClipperContent'

async function compile(req: Extract<ContentRequest, { type: 'zn:compile' }>): Promise<CompileResponse | ContentError> {
  const settings = await loadSettings()
  const hl = getHighlighter()
  await hl.load()
  const url = location.href
  const mode = settings.highlighter.contentMode
  const run = () =>
    extractPage(document, {
      url,
      highlights: hl.highlights,
      contentMode: mode,
      selectionHtml: req.selectionHtml
    })
  const page = mode === 'nothing' ? hl.withoutMarks(run) : run()
  const matched = matchTemplate(settings.templates, url, page.schema)
  const template = templateById(settings, req.templateId) ?? matched
  if (!template) return { ok: false, error: 'There is no template.' }
  const model = resolveModel(settings)
  const note = compileNote(template, page, {
    doc: document,
    extra: model
      ? { model: model.model.name, modelId: model.model.modelId, modelProvider: model.provider.name }
      : { model: '', modelId: '', modelProvider: '' },
    toMarkdown: (html) => toMarkdown(html, url),
    defaultContext: settings.interpreter.defaultContext,
    maxContextChars: settings.interpreter.maxContextChars
  })
  return {
    ok: true,
    note,
    matchedTemplateId: matched?.id ?? template.id,
    page: { title: page.title, url, hasSelection: !!page.selection, highlightCount: hl.highlights.length }
  }
}

async function handle(msg: ContentRequest): Promise<unknown> {
  switch (msg.type) {
    case 'zn:ping':
      return { ok: true }
    case 'zn:compile':
      return compile(msg)
    case 'zn:finalize': {
      const answers = new Map(msg.answers)
      const env = { url: location.href, now: new Date(), toMarkdown: (h: string) => toMarkdown(h, location.href) }
      return { ok: true, parts: msg.parts.map((p) => finalizePrompts(p, msg.prompts, answers, env)) }
    }
    case 'zn:highlighter': {
      const hl = getHighlighter()
      await hl.load()
      if (msg.action === 'toggle') hl.toggle()
      else if (msg.action === 'on') hl.setActive(true)
      else if (msg.action === 'off') hl.setActive(false)
      else if (msg.action === 'clear') hl.clear()
      else hl.addSelection()
      return state()
    }
    case 'zn:reader': {
      const reader = getReader()
      if (!reader.active) getHighlighter().setActive(false)
      reader.toggle(await loadSettings())
      return state()
    }
    case 'zn:state':
      await getHighlighter().load()
      return state()
    case 'zn:toast':
      showToast(msg.text, msg.tone)
      return { ok: true }
  }
}

function state(): ContentState {
  const hl = getHighlighter()
  return { highlighter: hl.active, reader: getReader().active, highlightCount: hl.highlights.length }
}

const g = globalThis as unknown as Record<string, boolean | undefined>
if (!g[FLAG]) {
  g[FLAG] = true
  ext.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string' || !msg.type.startsWith('zn:')) return
    handle(msg).then(sendResponse, (err: unknown) =>
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) })
    )
    return true
  })
  // Saved highlights are drawn as soon as the script runs on a page.
  void getHighlighter().load()
}
