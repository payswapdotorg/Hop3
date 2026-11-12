/**
 * Hop3 Earn — saved opportunities section (Stage 1 UI port).
 *
 * Slimmer cards with private notes. Notes auto-save on blur; the "Saved"
 * toast confirms the write. Unsave removes the item from this list.
 */

import * as React from "react";
import { Bookmark, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { Label } from "@/components/ui/label.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

import { CardSkeletonGrid, ChipRow, EmptyState, QueryError, TimeHint } from "./common.js";
import { EconomicsLine } from "./economics.js";
import { EligibilityBadge, FreshnessBadge, ProvenanceBadge } from "./badges.js";
import { OpportunityDetailOverlay } from "./OpportunityDetail.js";
import {
  useEarnOpportunities,
  useSaveToggle,
  useSavedNotes,
  type OpportunityCardWithNotes,
} from "./useEarnData.js";
import { useFormat } from "./useFormat.js";
import type { IEarnService } from "./contract.js";

function SavedCard({
  service,
  opportunity,
  onOpen,
}: {
  service: IEarnService | null;
  opportunity: OpportunityCardWithNotes;
  onOpen: (opportunity: OpportunityCardWithNotes) => void;
}) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const savedNotes = opportunity.savedNotes ?? "";
  const [notes, setNotes] = React.useState(savedNotes);

  React.useEffect(() => {
    setNotes(opportunity.savedNotes ?? "");
  }, [opportunity.savedNotes]);

  const saveNotes = useSavedNotes(service);
  const saveToggle = useSaveToggle(service);

  const onNotesBlur = () => {
    if (notes !== (opportunity.savedNotes ?? "")) {
      saveNotes.mutate({ id: opportunity.id, notes });
    }
  };

  const openListingLabel = intl.formatMessage({ id: "earn.common.openSourceListing" });

  return (
    <Card size="sm">
      <CardHeader className="gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="line-clamp-2 text-ui-sm leading-snug">
              {opportunity.title}
            </CardTitle>
            <ChipRow>
              <Badge variant="secondary">{opportunity.platform}</Badge>
              <Badge variant="outline">{format.sourceLabel(opportunity.sourceKey)}</Badge>
              <ProvenanceBadge provenance={opportunity.provenance} />
            </ChipRow>
          </div>
          <a
            href={opportunity.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={openListingLabel}
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground-subtle outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
        <ChipRow className="gap-x-3 gap-y-1.5 text-ui-xs text-foreground-subtle">
          <TimeHint
            label={intl.formatMessage({ id: "earn.time.observed" })}
            iso={opportunity.observedAt}
          />
          <FreshnessBadge status={opportunity.status} expiresAt={opportunity.expiresAt} />
          <EligibilityBadge assessment={opportunity.eligibility} />
        </ChipRow>
        <EconomicsLine economics={opportunity.economics} />
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`notes-${opportunity.id}`} className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage({ id: "earn.saved.notes.label" })}
          </Label>
          <Textarea
            id={`notes-${opportunity.id}`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={onNotesBlur}
            rows={3}
            placeholder={intl.formatMessage({ id: "earn.saved.notes.placeholder" })}
            className="text-ui-sm"
          />
        </div>

        <ChipRow>
          <Button
            variant="ghost"
            size="icon"
            aria-label={intl.formatMessage({ id: "earn.saved.removeAria" })}
            disabled={saveToggle.isPending}
            onClick={() => saveToggle.mutate({ id: opportunity.id, saved: false })}
          >
            <Bookmark className="fill-current" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpen(opportunity)}>
            {intl.formatMessage({ id: "earn.card.details" })}
          </Button>
        </ChipRow>
      </CardContent>
    </Card>
  );
}

export function SavedSection({
  service,
  onGoToApplications,
}: {
  service: IEarnService | null;
  onGoToApplications: () => void;
}) {
  const { intl } = useZCodeIntl();
  const { data, isPending, isError, error, refetch } = useEarnOpportunities(service, {});
  const [selected, setSelected] = React.useState<OpportunityCardWithNotes | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const saved = (data ?? []).filter((o) => o.saved);

  const openDetail = (opportunity: OpportunityCardWithNotes) => {
    setSelected(opportunity);
    setDetailOpen(true);
  };

  return (
    <section className="space-y-4" aria-label={intl.formatMessage({ id: "earn.tab.saved" })}>
      {isPending ? (
        <CardSkeletonGrid
          count={2}
          label={intl.formatMessage({ id: "earn.common.loading" })}
        />
      ) : isError ? (
        <QueryError
          title={intl.formatMessage({ id: "earn.saved.error.title" })}
          message={error ?? intl.formatMessage({ id: "earn.common.unknownError" })}
          onRetry={() => void refetch()}
        />
      ) : saved.length === 0 ? (
        <EmptyState
          title={intl.formatMessage({ id: "earn.saved.empty.title" })}
          hint={intl.formatMessage({ id: "earn.saved.empty.hint" })}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {saved.map((opportunity) => (
            <SavedCard
              key={opportunity.id}
              service={service}
              opportunity={opportunity}
              onOpen={openDetail}
            />
          ))}
        </div>
      )}

      <OpportunityDetailOverlay
        service={service}
        opportunity={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onGoToApplications={onGoToApplications}
      />
    </section>
  );
}
