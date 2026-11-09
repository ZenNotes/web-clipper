# App Privacy answers (App Store Connect)

For the App Privacy section of the ZenNotes Web Clipper app record. The answers cover the whole
app, so they apply to both the iOS and the macOS build. Keep them in step with `PRIVACY.md`, with
`store/privacy-form.md` and with the code.

## Data collection: "No, we do not collect data from this app"

Apple counts data as collected when it is transmitted off the device in a way that lets the
developer, or third-party partners whose code is in the app, access it for longer than it takes
to serve the request in real time. Under that definition the clipper collects nothing:

- **No analytics, crash reporting, ads or third-party SDKs** are in the app or the extension.
- **Nothing reaches Lumary Labs or ZenNotes.** The app and its extension make no network requests
  of their own. Settings, templates and highlights stay in Safari's extension storage on the
  device.
- **The clip stays on the device.** The extension reads the page the person is viewing (when they
  ask for a clip) to build the note, then copies it to the clipboard and, on the Mac, opens a
  `zennotes://` link so the ZenNotes app on the same Mac saves it. The native part of the
  extension (`SafariWebExtensionHandler.swift`) receives no clip data today: it answers every
  message with "no native handoff".

So in App Store Connect: Get Started, choose **No, we do not collect data from this app**, save,
and publish. The product page then shows **Data Not Collected**.

## The optional Interpreter

The one feature that sends anything off the device is the Interpreter, and the answer above still
holds for it. Here is why, and what to do if Apple asks.

What it does: when the person has set it up and runs it, the parts of the page their template asks
for (by default the main text, at most 60,000 characters) and the template's prompts go from
Safari straight to the AI provider the person chose (Anthropic, OpenAI, Google Gemini, OpenRouter,
a model on their own machine through Ollama, or any address they enter), with the API key they
entered. The answer comes back into the note.

Why it is not "collected" data:

- It is off until the person adds a provider and their own key in the extension's settings. There
  is no default provider and no key of ours.
- The request goes to a service the person picked and signed up for, under their own account, the
  same way Safari sends a page request to a site the person visits. Lumary Labs never receives the
  content, has no agreement with these providers about it, and cannot access what is sent.
- No provider's code (SDK) is in the app: the extension makes a plain HTTPS request.

How to describe it:

- The privacy policy already says this in "Where it goes"
  (https://github.com/ZenNotes/web-clipper/blob/main/PRIVACY.md).
- The App Review notes in `listing.md` mention it in one paragraph, so the reviewer reads it
  before they find it.

If App Review disagrees and asks for a declaration, the narrowest accurate one is:

| Question | Answer |
|---|---|
| Data type | User Content, Other User Content |
| Linked to the user's identity? | No |
| Used for tracking? | No |
| Purpose | App Functionality |

The product page would then show "Data Not Linked to You: User Content". Nothing else would change.

## Other App Store Connect answers that touch privacy

- **Tracking (App Tracking Transparency):** the app does not track, and asks for no tracking
  permission.
- **Privacy manifest:** the app uses no required-reason APIs (no UserDefaults, file timestamps,
  disk space or system boot time calls) and no third-party SDKs, so it ships without a
  `PrivacyInfo.xcprivacy`. If a later version adds one of those APIs, add the manifest then.
- **Export compliance:** both apps set `ITSAppUsesNonExemptEncryption` to NO in Info.plist (the
  only encryption is the HTTPS that Safari performs), so App Store Connect does not ask per build.
- **Age rating:** answer None or No to every question, including Unrestricted Web Access (the app
  has no browser of its own; the extension works inside Safari). That gives 4+.
