/**
 * Hop3 Earn — record-outcome form (Stage 1 UI port).
 *
 * Outcome recording is evidence-gated: the form asks exactly for what the
 * domain guard requires (URL/notes for "applied", an evidence level for
 * "accepted"/"approved", amount + evidence for "paid") and the service is
 * the source of truth — guard failures are shown inline, never hidden.
 */

import * as React from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { ApplicationDTO } from "@zcode/shared";

import { eventLabel } from "./format.js";
import {
  CHANNELS,
  EVIDENCE_TYPES,
  isTerminal,
  nextStatus,
  statusDescriptionKey,
} from "./applicationLifecycle.js";
import { describeEarnError, useRecordEvent } from "./useEarnData.js";
import type { IEarnService } from "./contract.js";

interface OutcomeFormState {
  eventType: string;
  evidenceType: string;
  evidenceUrl: string;
  note: string;
  channel: string;
  amountPaid: string;
  paidCurrency: string;
}

export function ApplicationRecordOutcome({
  service,
  application,
}: {
  service: IEarnService | null;
  application: ApplicationDTO;
}) {
  const { intl } = useZCodeIntl();
  const recordEvent = useRecordEvent(service);
  const [form, setForm] = React.useState<OutcomeFormState>({
    eventType: "",
    evidenceType: "user-reported",
    evidenceUrl: "",
    note: "",
    channel: "other",
    amountPaid: "",
    paidCurrency: "USD",
  });

  const status = application.status;
  if (isTerminal(status)) return null;

  const next = nextStatus(status);
  const options: Array<{ value: string; label: string }> = [];
  if (next) {
    options.push({
      value: next,
      label: `${eventLabel(next)} — ${intl.formatMessage({ id: statusDescriptionKey(next) })}`,
    });
  }
  for (const terminal of ["rejected", "withdrawn", "expired", "blocked"] as const) {
    options.push({
      value: terminal,
      label: `${eventLabel(terminal)} — ${intl.formatMessage({ id: "earn.app.record.terminalOption" })}`,
    });
  }
  options.push({
    value: "note",
    label: intl.formatMessage({ id: "earn.app.record.noteOption" }),
  });

  const target = form.eventType;
  const isPaid = target === "paid";
  const isApplied = target === "applied";
  const isAcceptedOrApproved = target === "accepted" || target === "approved";
  const isTerminalTarget = target !== "" && isTerminal(target);
  const isNoteEvent = target === "note";

  // Evidence requirements (mirroring the domain guard in the reference):
  //  - applied / paid / terminal / note: a URL or note must be present
  //  - terminal targets and pure notes: the note itself is required
  //  - paid: a positive amount and a 3-letter currency
  //  - accepted / approved / paid: an evidence level is selected (defaulted)
  const needsUrlOrNote = isPaid || isApplied || isTerminalTarget || isNoteEvent;
  const noteRequired = isTerminalTarget || isNoteEvent;
  const urlOrNotePresent = form.evidenceUrl.trim() !== "" || form.note.trim() !== "";
  const amountValid =
    !isPaid || (Number(form.amountPaid) > 0 && /^[\d.]+$/.test(form.amountPaid.trim()));
  const currencyValid = !isPaid || /^[A-Za-z]{3}$/.test(form.paidCurrency.trim());
  const canSubmit =
    target !== "" &&
    amountValid &&
    currencyValid &&
    (!needsUrlOrNote || urlOrNotePresent) &&
    (!noteRequired || form.note.trim() !== "");

  const submit = () => {
    if (!canSubmit) return;
    void recordEvent
      .mutate({
        id: application.id,
        input: {
          eventType: target,
          evidenceType:
            isPaid || isAcceptedOrApproved
              ? (form.evidenceType as
                  | "user-reported"
                  | "provider-confirmed"
                  | "payment-confirmed")
              : undefined,
          evidenceUrl: form.evidenceUrl.trim() || undefined,
          note: form.note.trim() || undefined,
          channel: isApplied ? form.channel : undefined,
          amountPaid: isPaid ? Number(form.amountPaid) : undefined,
          paidCurrency: isPaid ? form.paidCurrency.trim().toUpperCase() : undefined,
        },
      })
      .then(() => {
        setForm((prev) => ({
          ...prev,
          eventType: "",
          evidenceUrl: "",
          note: "",
          amountPaid: "",
        }));
      });
  };

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-ui-xs font-medium">
        {intl.formatMessage({ id: "earn.app.record.title" })}
      </p>
      {recordEvent.isError && recordEvent.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive-surface px-3 py-2 text-ui-xs text-foreground"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">{intl.formatMessage({ id: "earn.app.record.notRecorded" })}</p>
            <p className="text-foreground-subtle">
              {describeEarnError(recordEvent.error, intl)}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`ev-type-${application.id}`}>
            {intl.formatMessage({ id: "earn.app.record.event" })}
          </Label>
          <Select
            value={form.eventType}
            onValueChange={(value) => setForm((prev) => ({ ...prev, eventType: value }))}
          >
            <SelectTrigger id={`ev-type-${application.id}`} className="w-full">
              <SelectValue placeholder={intl.formatMessage({ id: "earn.app.record.eventPlaceholder" })} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage({ id: "earn.app.record.orderNote" })}
          </p>
        </div>

        {isPaid || isAcceptedOrApproved ? (
          <div className="space-y-1.5">
            <Label htmlFor={`ev-elevel-${application.id}`}>
              {intl.formatMessage({ id: "earn.app.record.evidenceLevel" })}
            </Label>
            <Select
              value={form.evidenceType}
              onValueChange={(value) => setForm((prev) => ({ ...prev, evidenceType: value }))}
            >
              <SelectTrigger id={`ev-elevel-${application.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVIDENCE_TYPES.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-ui-xs text-foreground-subtle">
              {intl.formatMessage({ id: "earn.app.record.evidenceNote" })}
            </p>
          </div>
        ) : null}

        {isApplied ? (
          <div className="space-y-1.5">
            <Label htmlFor={`ev-channel-${application.id}`}>
              {intl.formatMessage({ id: "earn.app.record.channel" })}
            </Label>
            <Select
              value={form.channel}
              onValueChange={(value) => setForm((prev) => ({ ...prev, channel: value }))}
            >
              <SelectTrigger id={`ev-channel-${application.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((channel) => (
                  <SelectItem key={channel} value={channel}>
                    {channel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {isPaid ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`ev-amount-${application.id}`}>
                {intl.formatMessage({ id: "earn.app.record.amount" })}
              </Label>
              <Input
                id={`ev-amount-${application.id}`}
                value={form.amountPaid}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    amountPaid: event.target.value.replace(/[^\d.]/g, ""),
                  }))
                }
                placeholder="e.g. 42.50"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ev-curr-${application.id}`}>
                {intl.formatMessage({ id: "earn.app.record.currency" })}
              </Label>
              <Input
                id={`ev-curr-${application.id}`}
                value={form.paidCurrency}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    paidCurrency: event.target.value.toUpperCase().slice(0, 3),
                  }))
                }
                placeholder="USD"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`ev-url-${application.id}`}>
          {intl.formatMessage({ id: "earn.app.record.url" })}
        </Label>
        <Input
          id={`ev-url-${application.id}`}
          value={form.evidenceUrl}
          onChange={(event) => setForm((prev) => ({ ...prev, evidenceUrl: event.target.value }))}
          placeholder={intl.formatMessage({ id: "earn.app.record.urlPlaceholder" })}
          inputMode="url"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`ev-note-${application.id}`}>
          {isTerminalTarget
            ? intl.formatMessage({ id: "earn.app.record.noteRequired" })
            : intl.formatMessage({ id: "earn.app.record.noteOptional" })}
        </Label>
        <Textarea
          id={`ev-note-${application.id}`}
          value={form.note}
          onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
          rows={2}
          placeholder={intl.formatMessage({ id: "earn.app.record.notePlaceholder" })}
          className="text-ui-sm"
        />
      </div>

      <Button size="sm" disabled={!canSubmit || recordEvent.isPending} onClick={submit}>
        {recordEvent.isPending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : null}
        {recordEvent.isPending
          ? intl.formatMessage({ id: "earn.app.record.recording" })
          : intl.formatMessage({ id: "earn.app.record.submit" })}
      </Button>
    </div>
  );
}
