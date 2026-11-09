import { useEffect, useState } from 'react'
import { ext, flavor, platformOs } from '../shared/ext'
import type { Settings } from '../shared/types'
import { Button, Field, Kbd, Select, Toggle } from '../ui/controls'
import { SectionTitle, type Update } from './common'

export function GeneralSection({ settings, update }: { settings: Settings; update: Update }) {
  const [draft, setDraft] = useState('')
  const [commands, setCommands] = useState<chrome.commands.Command[]>([])
  const [os, setOs] = useState('')

  useEffect(() => {
    void ext.commands?.getAll?.().then(setCommands).catch(() => setCommands([]))
    void platformOs().then(setOs)
  }, [])

  const addVault = () => {
    const name = draft.trim()
    if (!name || settings.vaults.includes(name)) return
    update((s) => ({ ...s, vaults: [...s.vaults, name] }))
    setDraft('')
  }

  const f = flavor()

  return (
    <div className="flex max-w-dialog-md flex-col gap-8">
      <section>
        <SectionTitle title="Vaults">
          Vault names as ZenNotes shows them. Leave the list empty to always clip into the vault that is open.
        </SectionTitle>
        <ul className="mb-2 flex flex-col gap-1">
          {settings.vaults.map((v) => (
            <li key={v} className="flex items-center justify-between rounded-md bg-paper-200 px-3 py-1.5">
              <span className="text-sm">{v}</span>
              <Button
                variant="danger"
                size="sm"
                aria-label={`Remove ${v}`}
                onClick={() =>
                  update((s) => ({
                    ...s,
                    vaults: s.vaults.filter((x) => x !== v),
                    defaultVault: s.defaultVault === v ? '' : s.defaultVault
                  }))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="zn-input"
            placeholder="Vault name"
            aria-label="New vault name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addVault()
            }}
          />
          <Button onClick={addVault}>Add</Button>
        </div>
        <div className="mt-4">
          <Field label="Default vault" htmlFor="default-vault" hint="Templates without their own vault clip here.">
            <Select
              id="default-vault"
              value={settings.defaultVault}
              onChange={(e) => update((s) => ({ ...s, defaultVault: e.target.value }))}
            >
              <option value="">The open vault</option>
              {settings.vaults.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle title="Clipping" />
        <Toggle
          id="silent"
          label="Clip in the background"
          hint="ZenNotes writes the note without opening it or coming to the front."
          checked={settings.silent}
          onChange={(v) => update((s) => ({ ...s, silent: v }))}
        />
        <Toggle
          id="inline"
          label="Send short notes in the link"
          hint="Notes up to 32 KiB skip the clipboard. Try this if ZenNotes opens but the note is empty."
          checked={settings.preferInline}
          onChange={(v) => update((s) => ({ ...s, preferInline: v }))}
        />
        {os === 'ios' && (
          <Toggle
            id="ios-open"
            label="Open ZenNotes after clipping"
            hint="Needs a ZenNotes version that reads clips. Off: each clip is copied, ready to paste."
            checked={settings.iosOpenApp}
            onChange={(v) => update((s) => ({ ...s, iosOpenApp: v }))}
          />
        )}
      </section>

      <section>
        <SectionTitle title="Shortcuts" />
        <table className="w-full text-sm">
          <tbody>
            {commands.map((c) => (
              <tr key={c.name} className="border-b border-paper-300">
                <td className="py-1.5 pr-4 text-ink-700">
                  {c.name === '_execute_action' ? 'Open the clipper' : c.description}
                </td>
                <td className="py-1.5 text-right">{c.shortcut ? <Kbd>{c.shortcut}</Kbd> : <span className="text-ink-400">Not set</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-500">
          In the popup: <Kbd>Mod</Kbd>+<Kbd>Enter</Kbd> clips, <Kbd>Mod</Kbd>+<Kbd>E</Kbd> previews, <Kbd>Esc</Kbd> closes.
        </p>
        {f === 'chrome' && (
          <Button className="mt-3" onClick={() => void ext.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
            Change shortcuts
          </Button>
        )}
        {f === 'firefox' && (
          <p className="mt-3 text-xs text-ink-500">
            To change them, open Add-ons and themes, the gear menu, then Manage Extension Shortcuts.
          </p>
        )}
        {f === 'safari' && <p className="mt-3 text-xs text-ink-500">Safari does not let extensions change shortcuts.</p>}
      </section>
    </div>
  )
}
