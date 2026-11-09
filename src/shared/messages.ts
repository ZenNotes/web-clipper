import type { CompiledNote } from '../template/compile'
import type { PromptRef } from '../template/render'

/** Messages the popup and background send to the content script. */
export type ContentRequest =
  | { type: 'zn:ping' }
  | { type: 'zn:compile'; templateId?: string; selectionHtml?: string; ignoreSelection?: boolean }
  | { type: 'zn:finalize'; parts: string[]; prompts: PromptRef[]; answers: [string, unknown][] }
  | { type: 'zn:highlighter'; action: 'toggle' | 'on' | 'off' | 'clear' | 'add-selection' }
  | { type: 'zn:reader'; action: 'toggle' }
  | { type: 'zn:state' }
  | { type: 'zn:toast'; text: string; tone: 'ok' | 'error' }

export interface CompileResponse {
  ok: true
  note: CompiledNote
  matchedTemplateId: string
  /** hasSelection: the content is the selection. selectionAvailable: the page
   *  has one, used or not. */
  page: { title: string; url: string; hasSelection: boolean; selectionAvailable: boolean; highlightCount: number }
}

export interface ContentState {
  highlighter: boolean
  reader: boolean
  highlightCount: number
}

export type ContentError = { ok: false; error: string }

/** Messages for the background worker. */
export type BackgroundRequest =
  | { type: 'zn:native-clip'; message: import('./handoff').NativeClipMessage }
  | { type: 'zn:native-available' }
  | { type: 'zn:restore-sync' }
  | { type: 'zn:quick-clip'; tabId: number }

/** For the Chromium offscreen document, which only writes the clipboard. */
export interface OffscreenCopy {
  target: 'offscreen'
  type: 'copy'
  text: string
}
