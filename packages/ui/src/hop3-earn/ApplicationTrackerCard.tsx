/**
 * Hop3 Earn — one application tracker card (Stage 1 UI port).
 *
 * Renders the frozen lifecycle stepper (no skipping), the draft materials,
 * the evidence-gated record form and the evidence timeline. The composer
 * handoff button PREFILLS a workspace draft only — there is no send path
 * anywhere in this card.
 */

import { Check, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";

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
import { APPLICATION_STATUS_ORDER, type ApplicationDTO } from "@zcode/shared";

import { eventLabel, parseApplicationDraft } from "./format.js";
import { SUCCESS_BUTTON, EvidenceLevelBadge } from "./badges.js";
import { ChipRow, thinScrollbar } from "./common.js";
import { isTerminal, statusDescriptionKey, statusIndex } from "./applicationLifecycle.js";
import { ApplicationDraftEditor } from "./ApplicationDraftEditor.js";
import { ApplicationRecordOutcome } from "./ApplicationRecordOutcome.js";
import { useMarkPrepared, usePrepareDraft } from "./useEarnData.js";
import { useFormat } from "./useFormat.js";
import { useEarnComposerHandoff } from "./useEarnComposerHandoff.js";
import type { IEarnService } from "./contract.js";

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function StatusStepper({ status }: { status: string }) {
  const { intl } = useZCodeIntl();
  if (isTerminal(status)) {
    return (
      <ChipRow className="gap-2">
        <Badge variant="destructive">{status}</Badge>
        <span className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "earn.app.status.terminal" })}
        </span>
      </ChipRow>
    );
  }

  const current = statusIndex(status);
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      aria-label={intl.formatMessage({ id: "earn.app.stepper.aria" })}
    >
      {APPLICATION_STATUS_ORDER.map((step, index) => {
        const done = index < current;
        const isCurrent = index === current;
        return (
          <span
            key={step}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-ui-xs leading-5",
              done && "border-success/50 text-success",
              isCurrent && "border-transparent bg-foreground text-background",
              !done && !isCurrent && "border-dashed text-foreground-subtlest",
            )}
            title={intl.formatMessage({ id: statusDescriptionKey(step) })}
          >
            {done ? <Check className="size-3" aria-hidden="true" /> : null}
            {eventLabel(step)}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function EventTimeline({ application }: { application: ApplicationDTO }) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  if (application.events.length === 0) {
    return (
      <p className="text-ui-xs text-foreground-subtle">
        {intl.formatMessage({ id: "earn.app.timeline.empty" })}
      </p>
    );
  }
  return (
    <div className={cn("max-h-72 space-y-2 overflow-y-auto pr-2", thinScrollbar)}>
      {application.events.map((event) => (
        <div key={event.id} className="rounded-md border border-border px-3 py-2">
          <ChipRow className="text-ui-xs">
            <span className="font-medium">{eventLabel(event.eventType)}</span>
            <EvidenceLevelBadge level={event.evidenceType} />
            <span className="text-foreground-subtle">
              {format.shortAbsoluteTime(event.createdAt)}
            </span>
            {event.evidenceUrl ? (
              <a
                href={event.evidenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-success underline underline-offset-2"
              >
                {intl.formatMessage({ id: "earn.app.timeline.evidence" })}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : null}
          </ChipRow>
          {event.note ? (
            <p className="mt-1 text-ui-xs text-foreground-subtle">{event.note}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One tracker card
// ---------------------------------------------------------------------------

export function ApplicationTrackerCard({
  service,
  application,
}: {
  service: IEarnService | null;
  application: ApplicationDTO;
}) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const prepareDraft = usePrepareDraft(service);
  const markPrepared = useMarkPrepared(service);
  const composerHandoff = useEarnComposerHandoff();
  const hasDraft = Boolean(application.draft && application.draft.trim() !== "");
  const status = application.status;

  const openListingLabel = intl.formatMessage({ id: "earn.app.openListingAria" });

  return (
    <Card size="sm">
      <CardHeader className="gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="line-clamp-2 text-ui-sm leading-snug">
              {application.opportunityTitle}
            </CardTitle>
            <ChipRow className="text-ui-xs text-foreground-subtle">
              <Badge variant="secondary">{application.platform}</Badge>
              <span>
                {intl.formatMessage(
                  { id: "earn.app.trackedSince" },
                  { when: format.shortAbsoluteTime(application.createdAt) },
                )}
              </span>
            </ChipRow>
          </div>
          <a
            href={application.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={openListingLabel}
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground-subtle outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <StatusStepper status={status} />

        {/* Paid summary line */}
        {application.paidAt ? (
          <p className="text-ui-sm font-medium">
            {intl.formatMessage({ id: "earn.app.paidSummary" }, {
              amount: format.formatMoney(application.amountPaid, application.paidCurrency),
            })}
            {application.paymentEvidence
              ? ` ${intl.formatMessage({ id: "earn.app.paidWithEvidence" })}`
              : ""}
            {` ${intl.formatMessage(
              { id: "earn.app.paidOn" },
              { when: format.shortAbsoluteTime(application.paidAt) },
            )}`}
          </p>
        ) : null}

        {/* Draft section */}
        <div className="space-y-3">
          <ChipRow className="gap-2">
            <p className="text-ui-xs font-medium">
              {intl.formatMessage({ id: "earn.app.materials" })}
            </p>
            {status === "draft" ? (
              <Badge variant="secondary">
                {intl.formatMessage({ id: "earn.app.notSubmitted" })}
              </Badge>
            ) : null}
          </ChipRow>

          {hasDraft ? (
            <ApplicationDraftEditor service={service} application={application} />
          ) : (
            <div className="space-y-2">
              <p className="text-ui-xs text-foreground-subtle">
                {intl.formatMessage({ id: "earn.app.draft.noDraft" })}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={prepareDraft.isPending}
                onClick={() => void prepareDraft.mutate(application.id)}
              >
                {prepareDraft.isPending ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                {prepareDraft.isPending
                  ? intl.formatMessage({ id: "earn.app.draft.generating" })
                  : intl.formatMessage({ id: "earn.app.draft.generate" })}
              </Button>
            </div>
          )}

          {hasDraft ? (
            <ChipRow>
              <Button
                variant="outline"
                size="sm"
                disabled={prepareDraft.isPending}
                onClick={() => void prepareDraft.mutate(application.id)}
                title={intl.formatMessage({ id: "earn.app.draft.regenerateTitle" })}
              >
                {prepareDraft.isPending ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                {intl.formatMessage({ id: "earn.app.draft.regenerate" })}
              </Button>
              {status === "draft" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(SUCCESS_BUTTON)}
                  disabled={markPrepared.isPending}
                  onClick={() => void markPrepared.mutate(application.id)}
                >
                  {markPrepared.isPending ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : null}
                  {intl.formatMessage({ id: "earn.app.draft.markPrepared" })}
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  composerHandoff.handoffDraftToComposer(
                    application,
                    parseApplicationDraft(application.draft)?.messageDraft ?? "",
                  )
                }
                disabled={!composerHandoff.available}
                title={intl.formatMessage({ id: "earn.app.composer.hint" })}
              >
                {intl.formatMessage({ id: "earn.app.composer.open" })}
              </Button>
            </ChipRow>
          ) : null}
        </div>

        {/* Record outcome */}
        <ApplicationRecordOutcome service={service} application={application} />

        {/* Timeline */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-ui-xs font-medium">
            {intl.formatMessage({ id: "earn.app.timeline" })}
          </p>
          <EventTimeline application={application} />
        </div>
      </CardContent>
    </Card>
  );
}

