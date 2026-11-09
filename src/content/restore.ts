// The small script registered on every page when "Show highlights on
// return" is on: it only draws saved highlights. The full content script is
// injected later, on demand, and shares the same highlighter instance.

import { getHighlighter } from '../highlight/highlighter'

void getHighlighter().load()
