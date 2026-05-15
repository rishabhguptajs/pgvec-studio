'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variants: Record<Variant, string> = {
  default:
    'bg-[var(--accent)] text-black hover:bg-[var(--accent)]/90 font-medium',
  secondary:
    'bg-[var(--bg-hover)] text-[var(--text)] hover:bg-[var(--bg-hover)]/80 border border-[var(--border)]',
  ghost: 'bg-transparent text-[var(--text)] hover:bg-[var(--bg-hover)]',
  destructive:
    'bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90',
  outline:
    'border border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--bg-hover)]',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
  icon: 'h-9 w-9',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
