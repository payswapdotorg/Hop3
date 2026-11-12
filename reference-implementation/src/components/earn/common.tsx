'use client'

/**
 * Hop3 Earn — small shared presentational primitives (Worker C).
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Inbox } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { absoluteTime, relativeTime } from '@/components/earn/format'

/** Thin styled scrollbar for long scrollable regions. */
export const thinScrollbar =
  '[scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border'

/** Subtle fade/slide used on tab panel switches only. */
export function FadeIn({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/** Honest error state with a retry action. */
export function QueryError({
  title = 'Could not load data',
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry: () => void
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/** Honest empty state — never implies fabricated content. */
export function EmptyState({
  title,
  hint,
}: {
  title: string
  hint?: string
}) {
  return (
    <Card className="items-center gap-3 border-dashed p-8 text-center">
      <Inbox className="size-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-md text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  )
}

/** "observed {relative}" with the absolute timestamp in a tooltip. */
export function TimeHint({
  label,
  iso,
}: {
  label: string
  iso?: string | null
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2">
          {label} {relativeTime(iso)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{absoluteTime(iso)}</TooltipContent>
    </Tooltip>
  )
}

/** Small labelled value row used in evidence panels. */
export function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-0.5 py-1 text-sm sm:grid-cols-[140px_1fr]">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

export function CardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-6 w-24 rounded-md" />
            <Skeleton className="h-6 w-32 rounded-md" />
          </div>
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
      ))}
    </div>
  )
}
