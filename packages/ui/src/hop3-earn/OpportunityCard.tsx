/**
 * Hop3 Earn — opportunity inbox card (Stage 1 UI port).
 *
 * Every card renders provenance, source link, observation times, freshness,
 * eligibility (with reasons on demand), honest economics, and the
 * policy-required caveats. Nothing is fabricated; missing stays missing.
 * The whole card opens the detail overlay; inner actions stop propagation.
 */

import type { MouseEvent, KeyboardEvent } from "react";

import { Bookmark, ExternalLink, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { OpportunityCardDTO } from "@zcode/shared";

import { eventLabel } from "./format.js";
import { EconomicsLine } from "./economics.js";
import {
  EligibilityBadge,
  FreshnessBadge,
  ProvenanceBadge,
  SUCCESS_BUTTON,
} from "./badges.js";
import { ChipRow, TimeHint } from "./common.js";
import { useCreateApplication, useSaveToggle, type OpportunityCardWithNotes } from "./useEarnData.js";
import { useFormat } from "./useFormat.js";
import type { IEarnService } from "./contract.js";

interface OpportunityCardProps {
  service: IEarnService | null;
  opportunity: OpportunityCardWithNotes;
  onOpen: (opportunity: OpportunityCardWithNotes) => void;
  onGoToApplications: () => void;
}

export function OpportunityCard({
  service,
  opportunity,
  onOpen,
  onGoToApplications,
}: OpportunityCardProps) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const saveToggle = useSaveToggle(service);
  const createApplication = useCreateApplication(service);

  const stop = (fn: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    fn();
  };

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(opportunity);
    }
  };

  const isFiverr = opportunity.sourceKey === "fiverr_mcp";

  const openListingLabel = intl.formatMessage({ id: "earn.common.openSourceListing" });

  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      aria-label={intl.formatMessage(
        { id: "earn.card.openCardAria" },
        { title: opportunity.title },
      )}
      className="cursor-pointer transition-colors hover:border-border-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={() => onOpen(opportunity)}
      onKeyDown={onCardKeyDown}
    >
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
            onClick={(event) => event.stopPropagation()}
            aria-label={openListingLabel}
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground-subtle outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
        {opportunity.summary ? (
          <p className="line-clamp-2 text-ui-sm text-foreground-subtle">{opportunity.summary}</p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3">
        <ChipRow className="gap-x-3 gap-y-1.5 text-ui-xs text-foreground-subtle">
          <span>
            <TimeHint
              label={intl.formatMessage({ id: "earn.time.observed" })}
              iso={opportunity.observedAt}
            />{" "}
            ·{" "}
            <TimeHint
              label={intl.formatMessage({ id: "earn.time.firstSeen" })}
              iso={opportunity.firstSeenAt}
            />
          </span>
          <FreshnessBadge status={opportunity.status} expiresAt={opportunity.expiresAt} />
          <EligibilityBadge assessment={opportunity.eligibility} />
        </ChipRow>

        <EconomicsLine economics={opportunity.economics} />

        {opportunity.duplicateCount > 0 ? (
          <p className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage(
              { id: "earn.card.duplicates" },
              { count: opportunity.duplicateCount },
            )}
          </p>
        ) : null}

        {opportunity.rankingPolicy === "provider-order-only" ? (
          <p className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage({ id: "earn.card.providerOrder" })}
          </p>
        ) : null}

        {isFiverr ? (
          <p className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage({ id: "earn.card.buyerSide" })}
          </p>
        ) : null}

        {opportunity.applicationStatus ? (
          <Badge variant="secondary">
            {intl.formatMessage(
              { id: "earn.card.application" },
              { status: eventLabel(opportunity.applicationStatus) },
            )}
          </Badge>
        ) : null}

        <ChipRow className="pt-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={intl.formatMessage({
              id: opportunity.saved ? "earn.card.unsaveAria" : "earn.card.saveAria",
            })}
            disabled={saveToggle.isPending}
            onClick={stop(() =>
              saveToggle.mutate({ id: opportunity.id, saved: !opportunity.saved }),
            )}
          >
            <Bookmark
              className={cn(opportunity.saved && "fill-current")}
              aria-hidden="true"
            />
          </Button>

          <Button variant="outline" size="sm" onClick={stop(() => onOpen(opportunity))}>
            {intl.formatMessage({ id: "earn.card.details" })}
          </Button>

          {opportunity.applicationStatus ? (
            <Button variant="outline" size="sm" onClick={stop(onGoToApplications)}>
              {intl.formatMessage({ id: "earn.card.viewInApplications" })}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className={cn(SUCCESS_BUTTON)}
              disabled={createApplication.isPending}
              onClick={stop(() => {
                void createApplication
                  .mutate(opportunity.id)
                  .then((application) => {
                    if (application) onGoToApplications();
                  })
                  .catch(() => undefined);
              })}
            >
              {createApplication.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : null}
              {intl.formatMessage({ id: "earn.card.prepare" })}
            </Button>
          )}
        </ChipRow>
      </CardContent>
    </Card>
  );
}
