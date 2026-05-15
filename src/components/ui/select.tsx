'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
})
Select.displayName = 'Select'
