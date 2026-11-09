// Chromium's service worker has no DOM, so quick clip writes the clipboard
// here. The async clipboard API needs a focused document, which an
// offscreen one never is; execCommand on a textarea does not.

import { copyWithExecCommand } from '../shared/handoff'
import type { OffscreenCopy } from '../shared/messages'

chrome.runtime.onMessage.addListener((msg: OffscreenCopy, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'copy') return
  sendResponse({ ok: copyWithExecCommand(msg.text) })
})
