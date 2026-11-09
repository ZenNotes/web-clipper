import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-paper-50 hover:bg-accent/90 disabled:bg-accent/50',
  secondary: 'bg-paper-200 text-ink-800 hover:bg-paper-300 disabled:text-ink-400',
  ghost: 'bg-transparent text-ink-700 hover:bg-paper-200 disabled:text-ink-400',
  danger: 'bg-transparent text-danger hover:bg-danger/10'
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }
>(function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }, ref) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm'
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${pad} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
})

export function Field({
  label,
  hint,
  children,
  htmlFor
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="min-w-0">
      <label className="zn-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-2xs text-ink-500">{hint}</p>}
    </div>
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`zn-input ${props.className ?? ''}`} />
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  id
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  id: string
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-accent"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="min-w-0">
        <span className="block text-sm text-ink-800">{label}</span>
        {hint && <span className="block text-2xs text-ink-500">{hint}</span>}
      </label>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="zn-kbd">{children}</kbd>
}
