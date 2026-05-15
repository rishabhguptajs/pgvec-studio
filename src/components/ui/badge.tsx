import * as React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'muted'

const styles: Record<BadgeVariant, string> = {
  default:
    'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30',
  success: 'bg-green-500/10 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  destructive: 'bg-red-500/10 text-red-400 border-red-500/30',
  muted:
    'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border)]',
}

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono',
        styles[variant],
        className,
      )}
      {...props}
    />
  )
}
