# ZenNotes Web Clipper privacy policy

Last updated: 2026-11-09

The ZenNotes Web Clipper turns the web page you are viewing into a Markdown note and hands it to
the ZenNotes app on your computer or phone. It is built so that your pages and notes stay with you.

## What it reads

- **The page you clip.** When you open the clipper, use its keyboard shortcut or its right-click
  menu, it reads that page (its text, title, address and details such as the author) to make the
  note. It reads no other tabs.
- **Your highlights.** Highlights you make are saved in your browser and go into your clips.
  If you turn on "Show highlights when you return to a page" (in the settings, or when the
  highlighter offers it after your first highlight), a small script runs on the pages you visit
  to look up highlights saved for that page's address and draw them again. It reads only what it
  needs to place them and sends nothing anywhere. With that setting off, nothing runs on a page
  until you use the clipper there.

## Where it goes

- **To the ZenNotes app on your device.** The note is put on your clipboard and the ZenNotes app,
  opened through a `zennotes://` link, saves it in your vault. Nothing passes through a ZenNotes
  server.
- **Kept in your browser:** your settings, templates and saved highlights are stored in the
  browser's own extension storage on your device. They are not synced by the extension. You can
  export or delete all saved highlights from the extension's settings, and removing the
  extension deletes everything it stored.
- **To an AI provider, only if you use the Interpreter.** The Interpreter is an optional feature
  that fills parts of a template with an AI model you choose (Anthropic, OpenAI, Google Gemini,
  OpenRouter, a model running on your own machine through Ollama, or any address you enter).
  When it runs, the page content the template asks for (by default the main text of the page, up
  to 60,000 characters) and the template's prompts are sent directly from your browser to that
  provider, using the API key you entered. That provider's own privacy policy applies to what you
  send. The Interpreter is off until you set it up, and your keys stay in the browser's extension
  storage. It runs when you ask it to in the clipper, or on every quick clip if you turn on its
  "run on quick clip" setting, which is off by default. On Firefox, it also asks for your consent
  to send page content before its first use.

## What it does not do

- It does not collect analytics, usage statistics or crash reports.
- It does not send anything to ZenNotes or to its developers.
- It does not sell, share or use your data for advertising, and does not use it for any purpose
  other than making your notes.

## Permissions

The extension asks only for what clipping needs: the current tab when you clip, storage for your
settings, writing the note to the clipboard, and a right-click menu. Access to every site is
optional: it is requested only if you choose to see your highlights again when you return to a
page (the highlighter offers this once, after your first highlight), and the address of an AI
provider is requested only the first time you use the Interpreter with it.

## Contact

Questions or concerns: open an issue at https://github.com/ZenNotes/web-clipper/issues or visit
https://zennotes.org.
