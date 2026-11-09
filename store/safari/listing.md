# App Store listing: ZenNotes Web Clipper (Safari)

One app record, two platforms (iOS, which covers iPhone and iPad, and macOS), sold as a universal
purchase: both builds use the bundle ID `md.zennotes.webclipper` (the extension inside is
`md.zennotes.webclipper.extension`). Team: Lumary Labs LLC, WYY7PK57DM.

In App Store Connect, the name, subtitle, category, privacy policy URL and age rating live in
App Information and are shared by both platforms. The description, keywords, promotional text,
support and marketing URLs and screenshots are set per platform, on each platform's version page,
so the two descriptions below differ where the platforms do.

Before submitting, check the ZenNotes version in the Mac description: it must be the first
ZenNotes release that reads clip links (the same one `store/listing.md` names).

## App Information (both platforms)

| Field | Value | Limit |
|---|---|---|
| Name | ZenNotes Web Clipper | 20 of 30 |
| Subtitle | Clip the web as Markdown notes | 30 of 30 |
| Primary category | Productivity | |
| Secondary category | Utilities | |
| Privacy policy URL | https://github.com/ZenNotes/web-clipper/blob/main/PRIVACY.md | |
| Content rights | Does not contain, show or access third-party content (the app ships no content; it reads the page the person is viewing, on their device) | |
| Copyright | 2026 Lumary Labs LLC | |

## Version page, both platforms

| Field | Value |
|---|---|
| Version | 0.1.0 (the extension's version; `npm run safari:sync` writes it into the project). Change `version` in package.json and sync again if the App Store release should read 1.0. |
| Build | 1 (`CURRENT_PROJECT_VERSION`; raise it for every upload) |
| Support URL | https://github.com/ZenNotes/web-clipper/issues |
| Marketing URL | https://zennotes.org |
| Keywords | see below, the same for both platforms |

### Keywords (99 of 100 characters)

```
markdown,notes,highlight,highlighter,reader,read later,save page,article,clip,plain text,quotes
```

The words of the name (ZenNotes, Web, Clipper) are already indexed, so they are not repeated, and
no other company's name or trademark is used.

### Promotional text (155 of 170 characters, can change without a new version)

```
Clip any page, a selection or your highlights into ZenNotes as a clean Markdown note. No account, nothing tracked, and your notes stay plain files you own.
```

## Description: macOS

```
Save what you read in Safari into ZenNotes as clean, plain Markdown notes.

Open the clipper on any page and it turns the article into a tidy note: the title, a link back to the page, the author and date when the page has them, and the text itself, without the menus, ads and clutter around it. Edit the note's name, pick a folder (Clippings by default) and choose where it goes: a new note, the top or bottom of a note you already have, or today's daily note. Press Command-Return and it is in your vault.

Everything happens on your Mac. The clipper hands the note to the ZenNotes app, which saves it as an ordinary .md file. There is no account and no server in between. The note is also on your clipboard, so you can paste it anywhere.

What you get:

- Clip a whole page, or just the text you selected.
- Highlighter: mark the passages that matter while you read. Highlights are saved per page and go into your clip.
- Reader view: read any page in a calm, distraction-free layout.
- Templates: different note layouts for different sites, chosen automatically by address or page type, with variables and filters for titles, dates, authors and more. Templates can be exported and imported as JSON.
- Interpreter (optional): fill parts of a template with an AI model you choose, using your own API key, or a model running on your own Mac.
- Keyboard-first: Option-Shift-Z opens the clipper, Option-Shift-X clips with the matching template, Option-Shift-H turns the highlighter on or off and Option-Shift-R the reader view. The clipper is also in the page's right-click menu.

After installing, open ZenNotes Web Clipper once, then turn the extension on in Safari Settings, Extensions.

Works best with the ZenNotes app for Mac, version 2.85 or later, free at https://zennotes.org.

Open source (MIT): https://github.com/ZenNotes/web-clipper
```

## Description: iOS (iPhone and iPad)

```
Save what you read in Safari into ZenNotes as clean, plain Markdown notes.

Open the clipper on any page and it turns the article into a tidy note: the title, a link back to the page, the author and date when the page has them, and the text itself, without the menus, ads and clutter around it. Edit the note's name, pick a folder and tap Add to ZenNotes. The note is copied, ready to paste into a note in ZenNotes or anywhere else.

Everything happens on your device. There is no account and no server in between.

What you get:

- Clip a whole page, or just the text you selected.
- Highlighter: select the passages that matter and tap Highlight. Highlights are saved per page and go into your clip.
- Reader view: read any page in a calm, distraction-free layout.
- Templates: different note layouts for different sites, chosen automatically by address or page type, with variables and filters for titles, dates, authors and more.
- Interpreter (optional): fill parts of a template with an AI model you choose, using your own API key.

After installing, open ZenNotes Web Clipper once, then turn the extension on in Settings, Apps, Safari, Extensions (or from the extensions button in Safari's address bar).

ZenNotes for iPhone and iPad is on the App Store. Learn more at https://zennotes.org.

Open source (MIT): https://github.com/ZenNotes/web-clipper
```

## App Review information

Sign-in required: No. Contact: Adib's name, phone and email (filled in App Store Connect).

Notes (paste into both platforms, keeping the part for the platform under review):

```
ZenNotes Web Clipper is a Safari web extension. The app itself only explains how to turn the extension on; the extension does the work in Safari. No account or login is needed.

To try it:
1. Open the app once, then turn on ZenNotes Web Clipper in Safari (Mac: Safari Settings, Extensions; iPhone and iPad: Settings, Apps, Safari, Extensions) and allow it on all websites, or on the site you test with.
2. Open any article in Safari.
3. Mac: press Option-Shift-Z (or click the extension's toolbar button), then Command-Return. iPhone and iPad: tap the extensions button in the address bar, then ZenNotes Web Clipper, then Add to ZenNotes.

The finished note is always copied to the clipboard, so it can be pasted into any app (for example Notes) to check the result. On the Mac, the extension also opens a zennotes:// link so the free ZenNotes app (https://zennotes.org) saves the note as a Markdown file; without that app installed, the note is still on the clipboard. On iPhone and iPad, the note is only copied.

The highlighter: Mac, Option-Shift-H, then select text. iPhone and iPad: the Highlight button in the clipper, then select text and tap Highlight in the bar at the bottom of the page. Reader view: the Reader button in the clipper.

The optional Interpreter is off until the person adds their own AI provider and API key in the extension's settings; it sends page content only to the provider they chose. Nothing is sent to us.
```

## Screenshots

All of them show the real extension on an original article page (`store/source/article.html`):

- iPhone and iPad: taken in the iOS Simulator (iPhone 17 Pro Max, iPad Pro 13 inch, iOS 27) in
  Safari, with the status bar set to 9:41, by driving the built app and extension by hand.
- Mac: Safari on this Mac could not be automated, so these are rendered by
  `node scripts/store-assets.mjs --mac` from the same extension code in Chrome for Testing at 2x,
  with no browser frame, plus the Safari app's own page. Before submitting, consider replacing
  them with captures from Safari itself (Command-Shift-5, a 1440x900 or 2880x1800 window).

| Display | Folder | Size | Files |
|---|---|---|---|
| Mac | `screenshots/mac` | 2560x1600 | 01-popup, 02-highlighter, 03-reader, 04-templates, 05-app |
| iPhone 6.3 inch (required) | `screenshots/iphone-6.3` | 1206x2622 | 01-popup, 02-highlighter, 03-reader |
| iPhone 6.9 inch (optional) | `screenshots/iphone-6.9` | 1320x2868 | 01-popup, 02-highlighter, 03-reader |
| iPad 13 inch (required) | `screenshots/ipad-13` | 2064x2752 | 01-popup, 02-highlighter, 03-reader, 04-app |

App Store Connect (November 2026) requires the "iPhone with Dynamic Island (medium display)" size,
6.1 or 6.3 inch, and the 13 inch iPad; the 6.9 inch iPhone slot is optional, and each required set
is scaled down for smaller devices. The 6.3 inch set is the 6.9 inch captures scaled to 1206x2622
(the proportions differ by under 0.1%). Screenshots must have no alpha channel, so every PNG here is
plain RGB. The iPhone capture of the app's own page came out blank and was left out; recapture it
on an iPhone 17 Pro simulator if the listing should show it.
