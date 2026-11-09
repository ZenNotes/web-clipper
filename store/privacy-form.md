# Privacy form answers

Answers for the Privacy practices tab of the Chrome Web Store, the matching fields in Microsoft
Edge Partner Center, and Firefox's data declaration. Keep them in step with `PRIVACY.md` and with
the permissions in `scripts/manifest.mjs`: the stores reject a listing whose answers disagree
with the code.

## Single purpose

Save the web page you are viewing into the ZenNotes notes app as a Markdown note, optionally with
your highlights.

## Permission justifications

| Permission | Justification |
|---|---|
| `activeTab` | Reads the page you are on when you open the clipper, use its shortcut or its right-click menu, so it can be turned into a note. No access to other tabs. |
| `scripting` | Runs the clipper's page reader, highlighter and reader view in the current tab when you ask for them. |
| `storage` | Keeps your settings, templates and saved highlights in your browser. |
| `clipboardWrite` | Puts the finished note on the clipboard, where the ZenNotes app picks it up when the clipper opens its zennotes:// link. |
| `contextMenus` | Adds Clip to ZenNotes, Highlight selection, Toggle highlighter and Toggle reader view to the right-click menu. |
| `offscreen` (Chrome only) | Chrome's background service worker cannot use the clipboard, so the quick-clip shortcut writes the note to the clipboard from an offscreen document. |
| Host permissions (`http://*/*`, `https://*/*`, optional) | Never requested at install. Asked for only if you choose to see saved highlights again when you return to a page (offered once, after your first saved highlight, or from the settings), and, for the optional Interpreter, for the one AI provider address you set up, the first time you use it. |

## Remote code

No, I am not using remote code. All code ships in the package; the Interpreter sends requests to
an AI provider's API and runs nothing it returns.

## Data usage (Chrome and Edge)

Data types to check:

- **Website content**: the page being clipped is read to make the note, and, only when you run
  the optional Interpreter, the parts a template asks for are sent to the AI provider you
  configured, with your own key.

- **Authentication information**: the API key you enter for the optional Interpreter is stored
  in the browser's local extension storage and sent only to the provider it belongs to, in the
  request that uses it.

Nothing else is collected: no personal information, browsing history, location or activity
tracking. Settings, templates and highlights stay in the browser's local extension storage.

Certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
  (Sending content to the AI provider the user configured is the user-requested feature.)
- I do not use or transfer user data for purposes unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: https://github.com/ZenNotes/web-clipper/blob/main/PRIVACY.md

## Firefox data declaration

In the Firefox manifest, `browser_specific_settings.gecko.data_collection_permissions` is
`required: ["none"]` and `optional: ["websiteContent"]`. Firefox asks for website content consent
the first time the Interpreter is used; without it the Interpreter does not run. In the AMO form,
tick that the add-on can transmit data and link the privacy policy above.

## Notes for reviewers (all stores)

The extension needs the ZenNotes app (https://zennotes.org) to save notes. Without it, clipping
still works up to the point where the browser asks to open a zennotes:// link; the note is on the
clipboard and can be pasted anywhere. To try it: open any article, press Alt+Shift+Z, then
Ctrl+Enter (Cmd+Enter on a Mac). The highlighter is Alt+Shift+H and the reader view Alt+Shift+R.
No account or test login is needed.
