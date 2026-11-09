import type { ReactNode } from 'react'
import type { Settings } from '../shared/types'

export type Update = (fn: (s: Settings) => Settings) => void

export interface SectionProps {
  settings: Settings
  update: Update
}

export function SectionTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-ink-800">{title}</h2>
      {children && <p className="mt-1 text-sm text-ink-500">{children}</p>}
    </div>
  )
}

/** Saves `text` as a file the user picked to export. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
