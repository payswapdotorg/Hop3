'use client'

/**
 * Hop3 Earn — source connections (Worker C).
 *
 * Policy-first rendering: access mode, auth, per-operation capability,
 * ranking-policy notes, payout caveats and honest run summaries.
 * Blocked sources show their exact handoff message; nothing is scraped.
 */

import * as React from 'react'
import { AlertTriangle, Loader2, Plus } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { SourceConnectionDTO, SourceKey } from '@/lib/contracts'
import { useIntake, useSources, useSyncSource } from '@/hooks/use-earn-data'
import { relativeTime } from '@/components/earn/format'
import { EmptyState, QueryError } from '@/components/earn/common'
import { SourceModeBadge } from '@/components/earn/badges'

const OPERATIONS = ['search', 'read', 'draft', 'submit', 'message', 'hire', 'pay'] as const

const POLICY_NOTES: Partial<Record<SourceKey, string>> = {
  upwork_mcp:
    'Upwork policy: Hop3 must not rank or select jobs; provider order preserved; read-only.',
  fiverr_mcp:
    'Buyer-side talent discovery only — not a seller job feed; ordering/payment stay on Fiverr.',
  oneforma: 'Public project board, read-only, robots.txt-permitted.',
  url_intake:
    'Links you add yourself — processed only when the page is public or you are authorized to provide it.',
}

function OperationChips({ operations }: { operations: SourceConnectionDTO['operations'] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {OPERATIONS.map((op) => {
        const cap = operations?.[op]
        if (cap?.allowed) {
          return (
            <Badge key={op} variant="outline" className="text-[10px]">
              {op}: allowed
            </Badge>
          )
        }
        return (
          <Badge key={op} variant="secondary" className="line-through opacity-60 text-[10px]">
            {op}: not allowed
          </Badge>
        )
      })}
    </div>
  )
}

function SourceCard({ source }: { source: SourceConnectionDTO }) {
  const [mode, setMode] = React.useState<'live' | 'sandbox'>(
    source.mode === 'live' ? 'live' : 'sandbox'
  )
  const sync = useSyncSource()

  React.useEffect(() => {
    setMode(source.mode === 'live' ? 'live' : 'sandbox')
  }, [source.mode])

  const blocked = source.mode === 'blocked'
  const policyNote = POLICY_NOTES[source.key]

  return (
    <Card className="gap-4 p-4">
      <CardHeader className="gap-1.5 px-0">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{source.displayName}</CardTitle>
          <SourceModeBadge mode={source.mode} />
        </div>
        <p className="text-xs text-muted-foreground">
          access: {source.accessMode} · kind: {source.sourceKind} · actors:{' '}
          {source.actorModes?.join(', ') || 'unknown'}
          {source.termsUrl ? (
            <>
              {' · '}
              <a
                href={source.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
              >
                terms
              </a>
            </>
          ) : null}
        </p>
      </CardHeader>

      <CardContent className="space-y-4 px-0">
        {/* Policy */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Operations</p>
          <OperationChips operations={source.operations} />
          {policyNote ? (
            <p className="text-xs text-muted-foreground">{policyNote}</p>
          ) : null}
        </div>

        {/* Payout */}
        <div className="space-y-1">
          <p className="text-xs font-medium">Payout (global notes)</p>
          {source.payout?.methodKnown ? (
            <div className="space-y-0.5 text-xs text-muted-foreground">
              {source.payout.methods && source.payout.methods.length > 0 ? (
                <p>Methods: {source.payout.methods.join(', ')}</p>
              ) : null}
              {source.payout.threshold ? <p>Threshold: {source.payout.threshold}</p> : null}
              {source.payout.fees ? <p>Fees: {source.payout.fees}</p> : null}
              {source.payout.cadence ? <p>Cadence: {source.payout.cadence}</p> : null}
              {source.payout.evidenceUrl ? (
                <a
                  href={source.payout.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                >
                  Payout evidence
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Payout methods unknown for this source.
            </p>
          )}
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Global payment-method list is not proof of availability in your country.
          </p>
        </div>

        {/* Blocked handoff */}
        {blocked && source.statusMessage ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Source blocked</AlertTitle>
            <AlertDescription>
              <p>{source.statusMessage}</p>
            </AlertDescription>
          </Alert>
        ) : null}
        {!blocked && source.statusMessage ? (
          <p className="text-xs text-muted-foreground">{source.statusMessage}</p>
        ) : null}

        {/* Run */}
        <div className="space-y-2">
          <p className="text-xs font-medium">Run a sync</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[150px]">
              <Select value={mode} onValueChange={(v) => setMode(v as 'live' | 'sandbox')}>
                <SelectTrigger className="h-11 w-full sm:h-9" aria-label={`Sync mode for ${source.displayName}`}>
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (fixtures)</SelectItem>
                  <SelectItem value="live" disabled={blocked}>
                    Live {blocked ? '(blocked)' : ''}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="h-11 sm:h-9"
              disabled={sync.isPending}
              onClick={() => sync.mutate({ key: source.key, mode, displayName: source.displayName })}
            >
              {sync.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {sync.isPending ? 'Syncing…' : 'Sync now'}
            </Button>
          </div>
          {source.key === 'upwork_mcp' && mode === 'live' ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Upwork live runs require the official MCP connection. If it is unavailable the run is
              reported blocked — Hop3 does not fall back to scraping.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {source.lastRun
              ? `Last run: ${source.lastRun.status} · ${source.lastRun.mode} · ${relativeTime(
                  source.lastRun.startedAt
                )} · fetched ${source.lastRun.fetched} · new ${source.lastRun.inserted} · updated ${
                  source.lastRun.updated
                } · duplicates ${source.lastRun.duplicates}${
                  source.lastRun.message ? ` — ${source.lastRun.message}` : ''
                }`
              : 'No runs recorded yet.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function IntakeCard() {
  const [url, setUrl] = React.useState('')
  const [context, setContext] = React.useState('')
  const intake = useIntake()

  const trimmed = url.trim()
  const valid = /^https?:\/\/.+/i.test(trimmed)

  const submit = () => {
    if (!valid) return
    intake.mutate(
      { url: trimmed, context: context.trim() || undefined },
      {
        onSuccess: () => {
          setUrl('')
          setContext('')
        },
      }
    )
  }

  return (
    <Card className="gap-4 border-dashed p-4">
      <CardHeader className="gap-1.5 px-0">
        <CardTitle className="text-base">Add an opportunity link</CardTitle>
        <p className="text-xs text-muted-foreground">
          Paste a link you are authorized to access. Blocked/private pages are recorded as
          unverified, not bypassed.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-0">
        <div className="space-y-1.5">
          <Label htmlFor="intake-url">URL</Label>
          <Input
            id="intake-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/listing"
            inputMode="url"
            className="h-11 sm:h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="intake-context">Context (optional)</Label>
          <Input
            id="intake-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Where this link came from, why it interests you"
            className="h-11 sm:h-9"
          />
        </div>
        <Button
          className="h-11 sm:h-9"
          disabled={!valid || intake.isPending}
          onClick={submit}
        >
          {intake.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
          Add opportunity link
        </Button>
      </CardContent>
    </Card>
  )
}

export function SourcesTab() {
  const { data, isPending, isError, error, refetch } = useSources()
  const sources = data ?? []

  return (
    <div className="space-y-4">
      {isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-xl border p-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-5 w-20 rounded-md" />
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
              <Skeleton className="h-9 w-48" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <QueryError
          title="Sources could not be loaded"
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => refetch()}
        />
      ) : sources.length === 0 ? (
        <EmptyState
          title="No sources registered."
          hint="The source registry is empty — nothing can be synced or fabricated in its place."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sources.map((source) => (
            <SourceCard key={source.key} source={source} />
          ))}
        </div>
      )}

      <IntakeCard />
    </div>
  )
}
