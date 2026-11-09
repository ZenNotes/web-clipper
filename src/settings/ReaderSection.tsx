import type { Settings } from '../shared/types'
import { Field, Select } from '../ui/controls'
import { SectionTitle, type SectionProps } from './common'

export function ReaderSection({ settings, update }: SectionProps) {
  const r = settings.reader
  const set = (p: Partial<Settings['reader']>) => update((s) => ({ ...s, reader: { ...s.reader, ...p } }))
  return (
    <div className="flex max-w-dialog-md flex-col gap-4">
      <SectionTitle title="Reader">
        Reader view shows the article alone. In it, <code>-</code> and <code>=</code> change the size, <code>O</code> jumps to
        the outline and <code>Esc</code> closes.
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Font" htmlFor="r-font">
          <Select id="r-font" value={r.font} onChange={(e) => set({ font: e.target.value as Settings['reader']['font'] })}>
            <option value="serif">Serif</option>
            <option value="sans">Sans</option>
            <option value="mono">Mono</option>
          </Select>
        </Field>
        <Field label="Appearance" htmlFor="r-appearance">
          <Select
            id="r-appearance"
            value={r.appearance}
            onChange={(e) => set({ appearance: e.target.value as Settings['reader']['appearance'] })}
          >
            <option value="auto">Match the system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </Field>
        <Field label={`Text size, ${r.fontSize}px`} htmlFor="r-size">
          <input id="r-size" type="range" min={12} max={32} value={r.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} className="w-full accent-accent" />
        </Field>
        <Field label={`Line height, ${r.lineHeight}`} htmlFor="r-lh">
          <input
            id="r-lh"
            type="range"
            min={1.2}
            max={2.2}
            step={0.05}
            value={r.lineHeight}
            onChange={(e) => set({ lineHeight: Number(e.target.value) })}
            className="w-full accent-accent"
          />
        </Field>
        <Field label={`Line width, ${r.maxWidth}px`} htmlFor="r-width">
          <input id="r-width" type="range" min={480} max={1100} step={10} value={r.maxWidth} onChange={(e) => set({ maxWidth: Number(e.target.value) })} className="w-full accent-accent" />
        </Field>
      </div>
      <Field label="Custom CSS" htmlFor="r-css" hint="Applies inside reader view only.">
        <textarea
          id="r-css"
          className="zn-input min-h-editor font-mono text-xs"
          value={r.customCss}
          onChange={(e) => set({ customCss: e.target.value })}
          spellCheck={false}
        />
      </Field>
    </div>
  )
}
