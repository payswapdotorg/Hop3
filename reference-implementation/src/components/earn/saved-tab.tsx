'use client'

/**
 * Hop3 Earn — saved opportunities (Worker C).
 *
 * Slimmer cards with private notes. Notes auto-save on blur; the "Saved"
 * toast confirms the write. Unsave removes the item from this list.
 */

import * as React from 'react'
import { Bookmark, ExternalLink } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { OpportunityCardDTO } from '@/lib/contracts'
import { useOpportunities, useSaveToggle, useSavedNotes } from '@/hooks/use-earn-data'
import { sourceLabel } from '@/components/earn/format'
import { CardSkeletonGrid, EmptyState, QueryError, TimeHint } from '@/components/earn/common'
import { EconomicsLine } from '@/components/earn/economics'
import { EligibilityBadge, FreshnessBadge, ProvenanceBadge } from '@/components/earn/badges'
import { DetailOverlay } from '@/components/earn/opportunity-detail'

function SavedCard({
  opportunity,
  onOpen,
}: {
  opportunity: OpportunityCardDTO & { savedNotes?: string | null }
  onOpen: (opportunity: OpportunityCardDTO) => void
}) {
  const savedNotes = opportunity.savedNotes ?? ''
  const [notes, setNotes] = React.useState(savedNotes)

  React.useEffect(() => {
    setNotes(opportunity.savedNotes ?? '')
  }, [opportunity.savedNotes])

  const saveNotes = useSavedNotes()
  const saveToggle = useSaveToggle()

  const onNotesBlur = () => {
    if (notes !== (opportunity.savedNotes ?? '')) {
      saveNotes.mutate({ id: opportunity.id, notes })
    }
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <h3 className="line-clamp-2 font-medium leading-snug">{opportunity.title}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{opportunity.platform}</Badge>
            <Badge variant="outline">{sourceLabel(opportunity.sourceKey)}</Badge>
            <ProvenanceBadge provenance={opportunity.provenance} />
          </div>
        </div>
        <a
          href={opportunity.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open source listing"
          className="mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:size-9"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <TimeHint label="observed" iso={opportunity.observedAt} />
        <FreshnessBadge status={opportunity.status} expiresAt={opportunity.expiresAt} />
        <EligibilityBadge assessment={opportunity.eligibility} />
      </div>

      <EconomicsLine economics={opportunity.economics} />

      <div className="space-y-1.5">
        <Label htmlFor={`notes-${opportunity.id}`} className="text-xs text-muted-foreground">
          Your notes (auto-saved when you leave the field)
        </Label>
        <Textarea
          id={`notes-${opportunity.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={onNotesBlur}
          rows={3}
          placeholder="Why you saved this, next steps, evidence you want to check…"
          className="text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 sm:size-9"
          aria-label="Remove from saved"
          disabled={saveToggle.isPending}
          onClick={() => saveToggle.mutate({ id: opportunity.id, saved: false })}
        >
          <Bookmark className="fill-current" aria-hidden="true" />
        </Button>
        <Button variant="outline" size="sm" className="h-11 sm:h-9" onClick={() => onOpen(opportunity)}>
          Details
        </Button>
      </div>
    </Card>
  )
}

export function SavedTab({ onGoToApplications }: { onGoToApplications: () => void }) {
  const { data, isPending, isError, error, refetch } = useOpportunities({})
  const [selected, setSelected] = React.useState<OpportunityCardDTO | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  const saved = (data ?? []).filter((o) => o.saved)

  const openDetail = (opportunity: OpportunityCardDTO) => {
    setSelected(opportunity)
    setDetailOpen(true)
  }

  return (
    <div className="space-y-4">
      {isPending ? (
        <CardSkeletonGrid count={2} />
      ) : isError ? (
        <QueryError
          title="Saved items could not be loaded"
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => refetch()}
        />
      ) : saved.length === 0 ? (
        <EmptyState
          title="Nothing saved yet."
          hint="Save opportunities from the Inbox to keep them here with your private notes."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {saved.map((opportunity) => (
            <SavedCard key={opportunity.id} opportunity={opportunity} onOpen={openDetail} />
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
