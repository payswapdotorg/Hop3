'use client'

/**
 * Hop3 Earn — opportunity inbox card (Worker C).
 *
 * Every card renders provenance, source link, observation times, freshness,
 * eligibility (with reasons on demand), honest economics, and the
 * policy-required caveats. Nothing is fabricated; missing stays missing.
 */

import * as React from 'react'
import { Bookmark, ExternalLink, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { OpportunityCardDTO } from '@/lib/contracts'
import { useCreateApplication, useSaveToggle } from '@/hooks/use-earn-data'
import { eventLabel, sourceLabel } from '@/components/earn/format'
import { TimeHint } from '@/components/earn/common'
import {
  EconomicsLine,
} from '@/components/earn/economics'
import {
  EligibilityBadge,
  EMERALD_BUTTON,
  FreshnessBadge,
  ProvenanceBadge,
} from '@/components/earn/badges'

interface OpportunityCardProps {
  opportunity: OpportunityCardDTO
  onOpen: (opportunity: OpportunityCardDTO) => void
  onGoToApplications: () => void
}

export function OpportunityCard({ opportunity, onOpen, onGoToApplications }: OpportunityCardProps) {
  const saveToggle = useSaveToggle()
  const createApplication = useCreateApplication()

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  const isFiverr = opportunity.sourceKey === 'fiverr_mcp'

  return (
    <Card
      className="group gap-4 p-4 transition-colors hover:border-foreground/25"
      onClick={() => onOpen(opportunity)}
    >
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
          onClick={(e) => e.stopPropagation()}
          aria-label="Open source listing"
          className="mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:size-9"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </div>

      {opportunity.summary ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{opportunity.summary}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span>
          <TimeHint label="observed" iso={opportunity.observedAt} /> ·{' '}
          <TimeHint label="first seen" iso={opportunity.firstSeenAt} />
        </span>
        <FreshnessBadge status={opportunity.status} expiresAt={opportunity.expiresAt} />
        <EligibilityBadge assessment={opportunity.eligibility} />
      </div>

      <EconomicsLine economics={opportunity.economics} />

      {opportunity.duplicateCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          +{opportunity.duplicateCount} similar listing(s) grouped (not merged)
        </p>
      ) : null}

      {opportunity.rankingPolicy === 'provider-order-only' ? (
        <p className="text-xs text-muted-foreground">
          Provider order preserved — Hop3 does not rank these results
        </p>
      ) : null}

      {isFiverr ? (
        <p className="text-xs text-muted-foreground">
          Buyer-side talent discovery — not a seller job feed
        </p>
      ) : null}

      {opportunity.applicationStatus ? (
        <Badge variant="secondary">Application: {eventLabel(opportunity.applicationStatus)}</Badge>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 sm:size-9"
          aria-label={opportunity.saved ? 'Remove from saved' : 'Save opportunity'}
          disabled={saveToggle.isPending}
          onClick={stop(() =>
            saveToggle.mutate({ id: opportunity.id, saved: !opportunity.saved })
          )}
        >
          <Bookmark
            className={cn(opportunity.saved && 'fill-current')}
            aria-hidden="true"
          />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-11 sm:h-9"
          onClick={stop(() => onOpen(opportunity))}
        >
          Details
        </Button>

        {opportunity.applicationStatus ? (
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-9"
            onClick={stop(onGoToApplications)}
          >
            View in Applications
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className={cn('h-11 sm:h-9', EMERALD_BUTTON)}
            disabled={createApplication.isPending}
            onClick={stop(() =>
              createApplication.mutate(opportunity.id, { onSuccess: onGoToApplications })
            )}
          >
            {createApplication.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            Prepare application
          </Button>
        )}
      </div>
    </Card>
  )
}
