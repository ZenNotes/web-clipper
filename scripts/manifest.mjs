// One manifest per browser from a shared base. Shortcuts use Alt+Shift
// (Option+Shift on a Mac) with letters no major browser binds there.

const ICONS = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' }

export const GECKO_ID = 'web-clipper@zennotes.org'

export function manifestFor(browser, version, { e2eHosts = [], e2ePermissions = [] } = {}) {
  const base = {
    manifest_version: 3,
    name: 'ZenNotes Web Clipper',
    short_name: 'ZenNotes Clipper',
    description: 'Clip web pages into ZenNotes as Markdown notes.',
    version,
    homepage_url: 'https://zennotes.org',
    icons: ICONS,
    action: {
      default_title: 'ZenNotes Web Clipper',
      default_popup: 'popup/popup.html',
      default_icon: { 16: ICONS[16], 32: ICONS[32] }
    },
    options_ui: { page: 'settings/settings.html', open_in_tab: true },
    permissions: ['activeTab', 'scripting', 'storage', 'clipboardWrite', 'contextMenus'],
    // Page access for drawing highlights on return, and provider origins for
    // the Interpreter; each is asked for when the feature is first used.
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+Z' },
        description: 'Open the clipper'
      },
      'quick-clip': {
        suggested_key: { default: 'Alt+Shift+X' },
        description: 'Clip this page with its template'
      },
      'toggle-highlighter': {
        suggested_key: { default: 'Alt+Shift+H' },
        description: 'Turn the highlighter on or off'
      },
      'toggle-reader': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Turn reader view on or off'
      }
    }
  }
  if (e2eHosts.length) base.host_permissions = e2eHosts
  if (e2ePermissions.length) base.permissions = [...base.permissions, ...e2ePermissions]

  switch (browser) {
    case 'chrome':
      return {
        ...base,
        minimum_chrome_version: '116',
        permissions: [...base.permissions, 'offscreen'],
        background: { service_worker: 'background.js' }
      }
    case 'firefox':
      return {
        ...base,
        background: { scripts: ['background.js'] },
        browser_specific_settings: {
          gecko: {
            id: GECKO_ID,
            strict_min_version: '128.0',
            data_collection_permissions: { required: ['none'] }
          },
          gecko_android: { strict_min_version: '128.0' }
        }
      }
    case 'safari':
      // `persistent: false` is what iOS and iPadOS need (left out, the
      // converter reads the page as persistent); Safari on the Mac ignores
      // it. Safari has no `open_in_tab`.
      return {
        ...base,
        options_ui: { page: base.options_ui.page },
        permissions: [...base.permissions, 'nativeMessaging'],
        background: { scripts: ['background.js'], persistent: false }
      }
    default:
      throw new Error(`Unknown browser ${browser}`)
  }
}
