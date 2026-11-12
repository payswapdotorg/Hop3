/**
 * Hop3 Earn — opportunity detail overlay (Stage 1 UI port).
 *
 * Shared detail body rendered in a Dialog. The evidence panel is always
 * visible; structured spec sections render only what the source actually
 * exposed. All writes (save toggle, tracker creation) stay honest and
 * evidence-first; nothing here submits anything.
 */

import * as React from "react";
import { Bookmark, ExternalLink, LoaderCircle } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion.js";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { DimensionResult, OpportunityCardDTO } from "@zcode/shared";

import { eventLabel } from "./format.js";
import { EconomicsLine } from "./economics.js";
import { EligibilityBadge, FreshnessBadge, ProvenanceBadge, SUCCESS_BUTTON } from "./badges.js";
import { QueryError, TimeHint, thinScrollbar } from "./common.js";
import {
  ApplicationSection,
  CompensationSection,
  EligibilitySection,
  EvidencePanel,
  NoAutoSubmitAlert,
  RequirementsSection,
  TimeSection,
  sectionTitleKey,
} from "./OpportunityDetailSections.js";
import {
  describeEarnError,
  useCreateApplication,
  useEarnOpportunityDetail,
  useEarnProfile,
  useSaveToggle,
  type OpportunityCardWithNotes,
} from "./useEarnData.js";
import { useFormat } from "./useFormat.js";
import type { IEarnService } from "./contract.js";

// ---------------------------------------------------------------------------
// Overlay wrapper (Dialog; drawer parity is unnecessary on desktop shells)
// ---------------------------------------------------------------------------

export interface OpportunityDetailOverlayProps {
  service: IEarnService | null;
  opportunity: OpportunityCardWithNotes | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToApplications: () => void;
}

export function OpportunityDetailOverlay({
  service,
  opportunity,
  open,
  onOpenChange,
  onGoToApplications,
}: OpportunityDetailOverlayProps) {
  const { intl } = useZCodeIntl();
  const format = useFormat();

  const body = opportunity ? (
    <OpportunityDetailBody
      service={service}
      card={opportunity}
      onCreated={() => {
        onOpenChange(false);
        onGoToApplications();
      }}
    />
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[85vh] max-w-3xl overflow-y-auto", thinScrollbar)}>
        <DialogHeader className="text-left">
          <DialogTitle className="line-clamp-2 pr-8 text-ui-base leading-snug">
            {opportunity?.title ?? intl.formatMessage({ id: "earn.detail.untitled" })}
          </DialogTitle>
          <DialogDescription>
            {opportunity
              ? `${opportunity.platform} · ${format.sourceLabel(opportunity.sourceKey)}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Detail body
// ---------------------------------------------------------------------------

export function OpportunityDetailBody({
  service,
  card,
  onCreated,
}: {
  service: IEarnService | null;
  card: OpportunityCardDTO;
  onCreated: () => void;
}) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const detailQuery = useEarnOpportunityDetail(service, card.id);
  const detail = detailQuery.data;
  const profileQuery = useEarnProfile(service);
  const profile = profileQuery.data;
  const saveToggle = useSaveToggle(service);
  const createApplication = useCreateApplication(service);

  const loading = detailQuery.isPending;
  const failed = detailQuery.isError;

  const loadingLabel = intl.formatMessage({ id: "earn.common.loading" });

  const eligibilityDims: Array<{ label: string; dim: DimensionResult }> = [];
  if (card.eligibility) {
    const dims: Array<{ key: "country" | "language" | "skills" | "payout"; label: string }> = [
      { key: "country", label: intl.formatMessage({ id: "earn.badge.dimension.country" }) },
      { key: "language", label: intl.formatMessage({ id: "earn.badge.dimension.language" }) },
      { key: "skills", label: intl.formatMessage({ id: "earn.badge.dimension.skills" }) },
      { key: "payout", label: intl.formatMessage({ id: "earn.badge.dimension.payout" }) },
    ];
    for (const { key, label } of dims) {
      const dim = card.eligibility[key];
      if (dim) eligibilityDims.push({ label, dim });
    }
  }
  const unknowns = card.eligibility?.unknowns ?? [];
  const nextSteps = card.eligibility?.nextSteps ?? [];

  const sectionProps = {
    detail,
    loading,
    failed,
    retry: () => void detailQuery.refetch(),
    loadingLabel,
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="space-y-2">
        {card.summary ? (
          <p className="text-ui-sm text-foreground-subtle">{card.summary}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{card.platform}</Badge>
          <Badge variant="outline">{format.sourceLabel(card.sourceKey)}</Badge>
          <ProvenanceBadge provenance={card.provenance} />
          {card.opportunityType ? <Badge variant="outline">{card.opportunityType}</Badge> : null}
          {card.workMode ? <Badge variant="outline">{card.workMode}</Badge> : null}
          <FreshnessBadge status={card.status} expiresAt={card.expiresAt} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-xs text-foreground-subtle">
          <span>
            <TimeHint
              label={intl.formatMessage({ id: "earn.time.observed" })}
              iso={card.observedAt}
            />{" "}
            ·{" "}
            <TimeHint
              label={intl.formatMessage({ id: "earn.time.firstSeen" })}
              iso={card.firstSeenAt}
            />{" "}
            ·{" "}
            <TimeHint
              label={intl.formatMessage({ id: "earn.time.lastSeen" })}
              iso={card.lastSeenAt}
            />
          </span>
        </div>
        <EconomicsLine economics={card.economics} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href={card.canonicalUrl} target="_blank" rel="noopener noreferrer">
            {intl.formatMessage({ id: "earn.detail.actions.openProvider" })}
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
        <Button
          variant="outline"
          disabled={saveToggle.isPending}
          onClick={() => saveToggle.mutate({ id: card.id, saved: !card.saved })}
          aria-label={intl.formatMessage({
            id: card.saved ? "earn.card.unsaveAria" : "earn.card.saveAria",
          })}
        >
          <Bookmark className={cn(card.saved && "fill-current")} aria-hidden="true" />
          {card.saved
            ? intl.formatMessage({ id: "earn.detail.actions.unsave" })
            : intl.formatMessage({ id: "earn.detail.actions.save" })}
        </Button>
        {card.applicationStatus ? (
          <Button variant="outline" onClick={onCreated}>
            {intl.formatMessage({ id: "earn.card.viewInApplications" })}
          </Button>
        ) : (
          <Button
            variant="outline"
            className={cn(SUCCESS_BUTTON)}
            disabled={createApplication.isPending}
            onClick={() => {
              void createApplication
                .mutate(card.id)
                .then((application) => {
                  if (application) onCreated();
                })
                .catch(() => undefined);
            }}
          >
            {createApplication.isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : null}
            {intl.formatMessage({ id: "earn.card.prepare" })}
          </Button>
        )}
        <span className="text-ui-xs text-foreground-subtle">
          {card.applicationStatus
            ? intl.formatMessage(
                { id: "earn.card.application" },
                { status: eventLabel(card.applicationStatus) },
              )
            : null}
        </span>
      </div>

      {/* Evidence panel — always visible, never collapsed */}
      <EvidencePanel
        detail={detail}
        platform={card.platform}
        sourceKey={card.sourceKey}
        canonicalUrl={card.canonicalUrl}
        provenance={card.provenance}
        observedAt={card.observedAt}
        firstSeenAt={card.firstSeenAt}
        lastSeenAt={card.lastSeenAt}
      />

      {/* Structured sections */}
      <Accordion type="multiple" defaultValue={["requirements", "eligibility"]}>
        <AccordionItem value="requirements">
          <AccordionTrigger className="text-ui-sm">
            {intl.formatMessage({ id: sectionTitleKey("requirements") })}
          </AccordionTrigger>
          <AccordionContent>
            <RequirementsSection {...sectionProps} profile={profile} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="eligibility">
          <AccordionTrigger className="text-ui-sm">
            {intl.formatMessage({ id: sectionTitleKey("eligibility") })}
          </AccordionTrigger>
          <AccordionContent>
            <EligibilitySection
              {...sectionProps}
              eligibilityDims={eligibilityDims}
              unknowns={unknowns}
              nextSteps={nextSteps}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="application">
          <AccordionTrigger className="text-ui-sm">
            {intl.formatMessage({ id: sectionTitleKey("application") })}
          </AccordionTrigger>
          <AccordionContent>
            <ApplicationSection {...sectionProps} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="compensation">
          <AccordionTrigger className="text-ui-sm">
            {intl.formatMessage({ id: sectionTitleKey("compensation") })}
          </AccordionTrigger>
          <AccordionContent>
            <CompensationSection {...sectionProps} economics={card.economics} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="time">
          <AccordionTrigger className="text-ui-sm">
            {intl.formatMessage({ id: sectionTitleKey("time") })}
          </AccordionTrigger>
          <AccordionContent>
            <TimeSection {...sectionProps} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {failed && !loading ? (
        <QueryError
          title={intl.formatMessage({ id: "earn.detail.errorTitle" })}
          message={describeEarnError(detailQuery.error, intl)}
          onRetry={() => void detailQuery.refetch()}
        />
      ) : null}

      <NoAutoSubmitAlert />
    </div>
  );
}

