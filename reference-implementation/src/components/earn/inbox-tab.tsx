'use client'

/**
 * Hop3 Earn — opportunity inbox (Worker C).
 *
 * Filters (source / eligibility / status / debounced search) are user-chosen
 * only; results keep provider order where policy requires it. Counts in the
 * sync hint row come straight from the queries — no invented numbers.
 */

import * as React from 'react'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { OpportunityCardDTO } from '@/lib/contracts'
import {
  useApplications,
  useOpportunities,
  useSources,
} from '@/hooks/use-earn-data'
import { relativeTime, toDate } from '@/components/earn/format'
import { CardSkeletonGrid, EmptyState, QueryError } from '@/components/earn/common'
import { OpportunityCard } from '@/components/earn/opportunity-card'
import { DetailOverlay } from '@/components/earn/opportunity-detail'

export function InboxTab({ onGoToApplications }: { onGoToApplications: () => void }) {
  const [source, setSource] = React.useState('all')
  const [eligibility, setEligibility] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [search, setSearch] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')

  const [selected, setSelected] = React.useState<OpportunityCardDTO | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(search.trim()), 350)
    return () => window.clearTimeout(t)
  }, [search])

  const filters = { source, eligibility, status, q: debouncedQ }
  const query = useOpportunities(filters)
  const allQuery = useOpportunities({})
  const applicationsQuery = useApplications()
  const sourcesQuery = useSources()

  const opportunities = query.data ?? []
  const total = allQuery.data?.length ?? null
  const savedCount = (allQuery.data ?? []).filter((o) => o.saved).length
  const appCount = applicationsQuery.data?.length ?? null

  let lastSync: Date | null = null
  for (const s of sourcesQuery.data ?? []) {
    const d = toDate(s.lastSyncAt ?? null)
    if (d && (!lastSync || d > lastSync)) lastSync = d
  }

  const openDetail = (opportunity: OpportunityCardDTO) => {
    setSelected(opportunity)
    setDetailOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="w-full sm:w-[170px]">
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-11 w-full sm:h-9" aria-label="Filter by source">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="oneforma">OneForma</SelectItem>
              <SelectItem value="upwork_mcp">Upwork</SelectItem>
              <SelectItem value="fiverr_mcp">Fiverr</SelectItem>
              <SelectItem value="url_intake">Submitted link</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-[170px]">
          <Select value={eligibility} onValueChange={setEligibility}>
            <SelectTrigger className="h-11 w-full sm:h-9" aria-label="Filter by eligibility">
              <SelectValue placeholder="Eligibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All eligibility</SelectItem>
              <SelectItem value="eligible">Eligible</SelectItem>
              <SelectItem value="ineligible">Ineligible</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
              <SelectItem value="needs_user_input">Needs input</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-[150px]">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-11 w-full sm:h-9" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="stale">Stale</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search opportunities…"
            aria-label="Search opportunities"
            inputMode="search"
            className="h-11 pl-9 sm:h-9"
          />
        </div>
      </div>

      {/* Sync hint / counts row */}
      <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {query.isPending ? (
          <span>Loading opportunities…</span>
        ) : (
          <span>
            {opportunities.length} shown{total != null ? ` of ${total}` : ''}
            {savedCount > 0 ? ` · ${savedCount} saved` : ''}
            {appCount != null ? ` · ${appCount} application${appCount === 1 ? '' : 's'} tracked` : ''}
            {` · last source sync ${lastSync ? relativeTime(lastSync.toISOString()) : 'never'}`}
          </span>
        )}
      </p>

      {/* Results */}
      {query.isPending ? (
        <CardSkeletonGrid count={4} />
      ) : query.isError ? (
        <QueryError
          title="Opportunities could not be loaded"
          message="The source data is unavailable right now — this is a loading failure, not proof that no opportunities exist."
          onRetry={() => query.refetch()}
        />
      ) : opportunities.length === 0 ? (
        <EmptyState
          title="No opportunities yet."
          hint="Sync a source in the Sources tab. A source with no matching results is a valid outcome — Hop3 never fabricates listings."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              onOpen={openDetail}
              onGoToApplications={onGoToApplications}
            />
          ))}
        </div>
      )}

      <DetailOverlay
        opportunity={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onGoToApplications={onGoToApplications}
      />
    </div>
  )
}
