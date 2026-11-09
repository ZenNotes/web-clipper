# Submitting to the stores

The ZenNotes Web Clipper ships to three stores from one build: the Chrome Web Store (Chrome,
Brave, Arc and other Chromium browsers), Microsoft Edge Add-ons and Firefox Add-ons (desktop and
Android). Safari is not on this list: it ships inside the ZenNotes Mac and iPhone apps.

Text to paste lives next to this file: `listing.md` (name, summary, description, links,
category) and `privacy-form.md` (single purpose, permission reasons, data answers, reviewer
notes). The privacy policy is `../PRIVACY.md`.

The extension needs a ZenNotes release that reads clip links. Time the public launch to that
release: Chrome and Edge can approve the item and wait (unlisted, hidden or deferred), Firefox
lists it as soon as it is approved, so submit Firefox closest to the release.

## 1. Accounts (once)

| Store | Where | Cost | Notes |
|---|---|---|---|
| Chrome Web Store | https://chrome.google.com/webstore/devconsole | One-time registration fee | The account's email cannot be changed later, so register with the account that should own ZenNotes listings. A new publisher can have two published items. |
| Edge Add-ons | https://partner.microsoft.com/dashboard/microsoftedge/overview | Free | Needs a personal Microsoft account. Individual accounts verify quickly; company accounts take days to weeks and cannot be switched back. |
| Firefox Add-ons | https://addons.mozilla.org/developers/ | Free | Needs a Mozilla account. |

## 2. Build the packages (every version)

```bash
npm ci
npm run build
npm run zip
git archive --format=zip -o "dist/zennotes-web-clipper-$(node -p "require('./package.json').version")-source.zip" HEAD
```

This gives, in `dist/`:

- `zennotes-web-clipper-<version>-chrome.zip`: Chrome Web Store and Edge
- `zennotes-web-clipper-<version>-firefox.zip`: Firefox Add-ons
- `zennotes-web-clipper-<version>-source.zip`: the source Firefox reviewers rebuild from

Every upload needs a higher version than the last. The version comes from `package.json`.

## 3. Chrome Web Store

1. Developer Dashboard, **New item**, upload the `-chrome.zip`.
2. **Store listing**: paste the description, pick the category and language, upload the 128x128
   store icon, the screenshots (1280x800, at least one) and, optionally, the 440x280 promo tile.
   Add the homepage and support links.
3. **Privacy practices**: paste the single purpose, one justification per permission, answer
   "No" to remote code, tick Website content under data usage, tick the three certifications, and
   enter the privacy policy URL.
4. **Distribution**: visibility Public, Unlisted (installs only by link) or Private (testers);
   all regions.
5. **Submit for review**. Tick the option to publish manually after approval if it should wait
   for the ZenNotes release; an approved item must be published within 30 days.
6. Review usually takes a few days and can take a few weeks.

## 4. Microsoft Edge Add-ons

1. Partner Center, Microsoft Edge, **Create new extension**, upload the same `-chrome.zip`.
2. **Availability**: Public, or Hidden (installs only by its listing link); all markets.
3. **Properties**: category Productivity, the privacy policy URL (required, since the clipper
   reads page content), website and support links.
4. **Store listings**: description (at least 250 characters; `listing.md` is longer), the
   300x300 logo, screenshots (optional, up to six) and the optional promo tile.
5. Paste the reviewer notes from `privacy-form.md`, then **Publish**. Certification can take up
   to seven business days.

## 5. Firefox Add-ons

1. Developer Hub, **Submit a New Add-on**, choose **On this site** (listed), upload the
   `-firefox.zip` and let the validator finish. It must report no errors.
2. When asked whether source code is needed, answer **Yes**: the code is bundled and minified.
   Upload the `-source.zip`, and in the reviewer notes paste the build steps from the README's
   "Building from source" section plus the reviewer notes from `privacy-form.md`.
3. Leave **Firefox for Android** off for now: the ZenNotes Android app does not read clip links
   yet. Turn it on in a later version, once it does.
4. Listing: summary, description, up to two categories each for Firefox and Android, support
   website (the issues link), license MIT, and tick that the add-on can transmit data, linking the
   privacy policy.
5. Submit. It is listed as soon as it is approved.

## 6. After approval

- When the ZenNotes release that reads clip links ships: publish the Chrome item (or switch it to
  Public), switch Edge to Public, and submit or release Firefox.
- Put the three store links on zennotes.org and in the ZenNotes in-app help.

## 7. Updates

Bump `version` in `package.json`, rebuild and zip as in step 2, then upload the new package as a
new version in each store (with a fresh source zip for Firefox). The listing text and privacy
answers carry over; change them only when the extension's behavior or permissions change.
