'use client'

/**
 * Hop3 Earn — applications & outcomes (Worker C).
 *
 * DOMAIN-MODEL 1.6 rendered honestly:
 *  - a status stepper shows the frozen lifecycle order (no skipping);
 *  - drafts are generated from truthful profile facts, edited by the user,
 *    and marked "prepared" only when a draft exists (reviewed);
 *  - outcome recording is evidence-gated: the form asks exactly for what the
 *    domain guard requires (URL/notes for "applied", an evidence type for
 *    "accepted", amount + evidence for "paid") and the API is the source of
 *    truth — guard failures are shown inline, never hidden;
 *  - the payments summary counts only user-recorded paid amounts, labelled as
 *    such (Hop3 never fabricates income).
 */

import * as React from 'react'

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
} from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  APPLICATION_STATUS_ORDER,
  NO_AUTO_SUBMIT_NOTICE,
  type ApplicationDTO,
  type ApplicationStatus,
} from '@/lib/contracts'
import { TERMINAL_APPLICATION_STATUSES } from '@/lib/domain/lifecycle'
import {
  apiErrorMessage,
  useApplications,
  usePrepareDraft,
  useRecordEvent,
  useSaveDraft,
  useMarkPrepared,
} from '@/hooks/use-earn-data'
import { eventLabel, formatMoney, parseApplicationDraft, shortAbsoluteTime } from '@/components/earn/format'
import { EmptyState, QueryError, thinScrollbar } from '@/components/earn/common'
import { EMERALD_OUTLINE, EvidenceLevelBadge } from '@/components/earn/badges'

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

const STATUS_DESCRIPTIONS: Record<string, string> = {
  draft: 'Draft tracker created',
  prepared: 'Materials reviewed by you',
  applied: 'You submitted it yourself',
  qualification_pending: 'Test or screening in progress',
  accepted: 'Provider accepted you',
  in_progress: 'Work has started',
  submitted: 'Work delivered by you',
  approved: 'Provider approved the work',
  payment_pending: 'Approved; payout pending',
  paid: 'Payment received and recorded',
}

function isTerminal(status: string): boolean {
  return TERMINAL_APPLICATION_STATUSES.includes(status as never)
}

function statusIndex(status: string): number {
  return APPLICATION_STATUS_ORDER.indexOf(status as ApplicationStatus)
}

function nextStatus(status: string): ApplicationStatus | null {
  const index = statusIndex(status)
  if (index < 0 || index + 1 >= APPLICATION_STATUS_ORDER.length) return null
  return APPLICATION_STATUS_ORDER[index + 1]
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function StatusStepper({ status }: { status: string }) {
  if (isTerminal(status)) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">{status}</Badge>
        <span className="text-xs text-muted-foreground">
          Terminal outcome recorded — create a new tracker from the Inbox to re-apply.
        </span>
      </div>
    )
  }

  const current = statusIndex(status)
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Application lifecycle progress">
      {APPLICATION_STATUS_ORDER.map((step, index) => {
        const done = index < current
        const isCurrent = index === current
        return (
          <span
            key={step}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] leading-5',
              done && 'border-emerald-600/50 text-emerald-700 dark:border-emerald-500/50 dark:text-emerald-400',
              isCurrent && 'border-transparent bg-foreground text-background',
              !done && !isCurrent && 'border-dashed text-muted-foreground/70',
            )}
            title={STATUS_DESCRIPTIONS[step] ?? step}
          >
            {done ? <Check className="size-3" aria-hidden="true" /> : null}
            {eventLabel(step)}
          </span>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Draft editor
// ---------------------------------------------------------------------------

function DraftEditor({ application }: { application: ApplicationDTO }) {
  const draft = parseApplicationDraft(application.draft)
  const [text, setText] = React.useState(draft?.messageDraft ?? '')
  const saveDraft = useSaveDraft()

  // Re-sync when the server draft changes (regeneration or refetch).
  React.useEffect(() => {
    setText(parseApplicationDraft(application.draft)?.messageDraft ?? '')
  }, [application.draft])

  const dirty = text !== (draft?.messageDraft ?? '')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {application.draftEditedByUser ? (
          <Badge variant="outline" className={EMERALD_OUTLINE}>draft edited by you</Badge>
        ) : (
          <Badge variant="outline" className="text-amber-800 dark:text-amber-400">
            generated — review every claim
          </Badge>
        )}
        {application.draftModel ? (
          <Badge variant="secondary">template: {application.draftModel}</Badge>
        ) : null}
        {application.draftGeneratedAt ? (
          <span className="text-xs text-muted-foreground">
            generated {shortAbsoluteTime(application.draftGeneratedAt)}
          </span>
        ) : null}
      </div>

      {draft && draft.checklist.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium">Checklist (from the listing + your profile)</p>
          <ul className="space-y-1">
            {draft.checklist.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`draft-${application.id}`} className="text-xs">
          Application message (edit until every claim is exactly true)
        </Label>
        <Textarea
          id={`draft-${application.id}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.min(20, Math.max(8, Math.ceil(text.length / 90)))}
          className="text-sm leading-relaxed"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-11 sm:h-9"
          disabled={!dirty || saveDraft.isPending}
          onClick={() =>
            saveDraft.mutate({
              id: application.id,
              draft: {
                checklist: draft?.checklist ?? [],
                messageDraft: text,
                notice: draft?.notice ?? NO_AUTO_SUBMIT_NOTICE,
              },
            })
          }
        >
          {saveDraft.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Pencil aria-hidden="true" />}
          {saveDraft.isPending ? 'Saving…' : 'Save draft edits'}
        </Button>
        <span className="text-xs text-muted-foreground">{draft?.notice ?? NO_AUTO_SUBMIT_NOTICE}</span>
      </div>
      {saveDraft.isError ? (
        <p className="text-xs text-destructive">{apiErrorMessage(saveDraft.error)}</p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Record outcome form
// ---------------------------------------------------------------------------

const EVIDENCE_TYPES = ['user-reported', 'provider-confirmed', 'payment-confirmed'] as const
const CHANNELS = ['oneforma-dashboard', 'upwork-web', 'fiverr-web', 'other'] as const

interface OutcomeFormState {
  eventType: string
  evidenceType: string
  evidenceUrl: string
  note: string
  channel: string
  amountPaid: string
  paidCurrency: string
}

function RecordOutcome({ application }: { application: ApplicationDTO }) {
  const recordEvent = useRecordEvent()
  const [form, setForm] = React.useState<OutcomeFormState>({
    eventType: '',
    evidenceType: 'user-reported',
    evidenceUrl: '',
    note: '',
    channel: 'other',
    amountPaid: '',
    paidCurrency: 'USD',
  })

  const status = application.status
  if (isTerminal(status)) return null

  const next = nextStatus(status)
  const options: Array<{ value: string; label: string }> = []
  if (next) {
    options.push({
      value: next,
      label: `${eventLabel(next)} — ${STATUS_DESCRIPTIONS[next] ?? next}`,
    })
  }
  for (const terminal of TERMINAL_APPLICATION_STATUSES) {
    options.push({ value: terminal, label: `${eventLabel(terminal)} — terminal outcome` })
  }
  options.push({ value: 'note', label: 'Note only — add information without a state change' })

  const target = form.eventType
  const isPaid = target === 'paid'
  const isApplied = target === 'applied'
  const isAcceptedOrApproved = target === 'accepted' || target === 'approved'
  const isTerminalTarget = target !== '' && isTerminal(target)
  const isNoteEvent = target === 'note'

  // Evidence requirements (mirroring the domain guard in domain/lifecycle):
  //  - applied / paid / terminal / note: a URL or note must be present
  //  - terminal targets and pure notes: the note itself is required
  //  - paid: a positive amount and a 3-letter currency
  //  - accepted / approved / paid: an evidence level is selected (defaulted)
  const needsUrlOrNote = isPaid || isApplied || isTerminalTarget || isNoteEvent
  const noteRequired = isTerminalTarget || isNoteEvent
  const urlOrNotePresent = form.evidenceUrl.trim() !== '' || form.note.trim() !== ''
  const amountValid = !isPaid || (Number(form.amountPaid) > 0 && /^[\d.]+$/.test(form.amountPaid.trim()))
  const currencyValid = !isPaid || /^[A-Za-z]{3}$/.test(form.paidCurrency.trim())
  const canSubmit =
    target !== '' &&
    amountValid &&
    currencyValid &&
    (!needsUrlOrNote || urlOrNotePresent) &&
    (!noteRequired || form.note.trim() !== '')

  const submit = () => {
    recordEvent.mutate({
      id: application.id,
      eventType: target,
      evidenceType:
        isPaid || isAcceptedOrApproved
          ? (form.evidenceType as 'user-reported' | 'provider-confirmed' | 'payment-confirmed')
          : undefined,
      evidenceUrl: form.evidenceUrl.trim() || undefined,
      note: form.note.trim() || undefined,
      channel: isApplied ? form.channel : undefined,
      amountPaid: isPaid ? Number(form.amountPaid) : undefined,
      paidCurrency: isPaid ? form.paidCurrency.trim().toUpperCase() : undefined,
    })
    setForm((prev) => ({ ...prev, eventType: '', evidenceUrl: '', note: '', amountPaid: '' }))
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs font-medium">Record what happened (evidence-gated)</p>
      {recordEvent.isError ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Not recorded</AlertTitle>
          <AlertDescription>
            <p>{apiErrorMessage(recordEvent.error)}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`ev-type-${application.id}`}>Event</Label>
          <Select
            value={form.eventType}
            onValueChange={(value) => setForm((prev) => ({ ...prev, eventType: value }))}
          >
            <SelectTrigger id={`ev-type-${application.id}`} className="h-11 w-full sm:h-9">
              <SelectValue placeholder="Choose the next honest step" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Lifecycle states are recorded in order, each with its own evidence — skipping is
            refused by the domain guard.
          </p>
        </div>

        {(isPaid || isAcceptedOrApproved) ? (
          <div className="space-y-1.5">
            <Label htmlFor={`ev-elevel-${application.id}`}>Evidence level</Label>
            <Select
              value={form.evidenceType}
              onValueChange={(value) => setForm((prev) => ({ ...prev, evidenceType: value }))}
            >
              <SelectTrigger id={`ev-elevel-${application.id}`} className="h-11 w-full sm:h-9">
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
            <p className="text-xs text-muted-foreground">
              For “paid”, user-reported or payment-confirmed is required.
            </p>
          </div>
        ) : null}

        {isApplied ? (
          <div className="space-y-1.5">
            <Label htmlFor={`ev-channel-${application.id}`}>Submitted via</Label>
            <Select
              value={form.channel}
              onValueChange={(value) => setForm((prev) => ({ ...prev, channel: value }))}
            >
              <SelectTrigger id={`ev-channel-${application.id}`} className="h-11 w-full sm:h-9">
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
              <Label htmlFor={`ev-amount-${application.id}`}>Amount received</Label>
              <Input
                id={`ev-amount-${application.id}`}
                value={form.amountPaid}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, amountPaid: e.target.value.replace(/[^\d.]/g, '') }))
                }
                placeholder="e.g. 42.50"
                inputMode="decimal"
                className="h-11 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ev-curr-${application.id}`}>Currency</Label>
              <Input
                id={`ev-curr-${application.id}`}
                value={form.paidCurrency}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    paidCurrency: e.target.value.toUpperCase().slice(0, 3),
                  }))
                }
                placeholder="USD"
                className="h-11 sm:h-9"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`ev-url-${application.id}`}>Evidence URL (optional)</Label>
        <Input
          id={`ev-url-${application.id}`}
          value={form.evidenceUrl}
          onChange={(e) => setForm((prev) => ({ ...prev, evidenceUrl: e.target.value }))}
          placeholder="e.g. platform message, payout statement link"
          inputMode="url"
          className="h-11 sm:h-9"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`ev-note-${application.id}`}>
          Note {isTerminalTarget ? '(required — explain the outcome)' : '(required for applied/paid evidence when no URL)'}
        </Label>
        <Textarea
          id={`ev-note-${application.id}`}
          value={form.note}
          onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
          rows={2}
          placeholder="What you actually did, saw or received — this is the evidence trail."
          className="text-sm"
        />
      </div>

      <Button
        size="sm"
        className="h-11 sm:h-9"
        disabled={!canSubmit || recordEvent.isPending}
        onClick={submit}
      >
        {recordEvent.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {recordEvent.isPending ? 'Recording…' : 'Record event'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function EventTimeline({ application }: { application: ApplicationDTO }) {
  if (application.events.length === 0) {
    return <p className="text-xs text-muted-foreground">No events recorded yet.</p>
  }
  return (
    <div className={cn('max-h-72 space-y-2 overflow-y-auto pr-2', thinScrollbar)}>
      {application.events.map((event) => (
        <div key={event.id} className="rounded-md border px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{eventLabel(event.eventType)}</span>
            <EvidenceLevelBadge level={event.evidenceType} />
            <span className="text-muted-foreground">{shortAbsoluteTime(event.createdAt)}</span>
            {event.evidenceUrl ? (
              <a
                href={event.evidenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
              >
                evidence <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          {event.note ? (
            <p className="mt-1 text-xs text-muted-foreground">{event.note}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// One tracker card
// ---------------------------------------------------------------------------

function ApplicationTrackerCard({ application }: { application: ApplicationDTO }) {
  const prepareDraft = usePrepareDraft()
  const markPrepared = useMarkPrepared()
  const hasDraft = Boolean(application.draft && application.draft.trim() !== '')
  const status = application.status

  return (
    <Card className="gap-4 p-4">
      <CardHeader className="gap-1.5 px-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="line-clamp-2 font-medium leading-snug">{application.opportunityTitle}</h3>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary">{application.platform}</Badge>
              <span>tracked since {shortAbsoluteTime(application.createdAt)}</span>
            </div>
          </div>
          <a
            href={application.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the original listing"
            className="mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:size-9"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-0">
        <StatusStepper status={status} />

        {/* Paid summary line */}
        {application.paidAt ? (
          <p className="text-sm font-medium">
            Paid {formatMoney(application.amountPaid, application.paidCurrency)} — recorded by you
            {application.paymentEvidence ? ' with evidence' : ''}
            {shortAbsoluteTime(application.paidAt) ? ` on ${shortAbsoluteTime(application.paidAt)}` : ''}.
          </p>
        ) : null}

        {/* Draft section */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium">Application materials</p>
            {status === 'draft' ? (
              <Badge variant="secondary">not submitted anywhere</Badge>
            ) : null}
          </div>

          {hasDraft ? (
            <DraftEditor application={application} />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                No draft yet. Generate one from your profile facts and the listing — then edit every
                claim yourself. Nothing is ever submitted automatically.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-11 sm:h-9"
                disabled={prepareDraft.isPending}
                onClick={() => prepareDraft.mutate(application.id)}
              >
                {prepareDraft.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                {prepareDraft.isPending ? 'Generating…' : 'Generate draft from my profile'}
              </Button>
              {prepareDraft.isError ? (
                <p className="text-xs text-destructive">{apiErrorMessage(prepareDraft.error)}</p>
              ) : null}
            </div>
          )}

          {hasDraft ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-11 sm:h-9"
                disabled={prepareDraft.isPending}
                onClick={() => prepareDraft.mutate(application.id)}
                title="Overwrites the current draft text with a fresh template"
              >
                {prepareDraft.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                Regenerate
              </Button>
              {status === 'draft' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 border-emerald-600/50 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-800 sm:h-9 dark:border-emerald-500/50 dark:text-emerald-300"
                  disabled={markPrepared.isPending}
                  onClick={() => markPrepared.mutate(application.id)}
                >
                  {markPrepared.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  Mark reviewed (prepared)
                </Button>
              ) : null}
              {markPrepared.isError ? (
                <p className="text-xs text-destructive">{apiErrorMessage(markPrepared.error)}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Record outcome */}
        <RecordOutcome application={application} />

        {/* Timeline */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Evidence timeline</p>
          <EventTimeline application={application} />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export function ApplicationsTab() {
  const { data, isPending, isError, error, refetch } = useApplications()
  const applications = data ?? []

  const paid = applications.filter((app) => app.paidAt != null && (app.amountPaid ?? 0) > 0)
  const paidTotal = paid.reduce((sum, app) => sum + (app.amountPaid ?? 0), 0)
  const paidCurrencies = [...new Set(paid.map((app) => app.paidCurrency ?? 'USD'))]
  const activeCount = applications.filter((app) => !isTerminal(app.status)).length

  return (
    <div className="space-y-4">
      {/* Honest summary */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {applications.length} tracker{applications.length === 1 ? '' : 's'} · {activeCount} in
          progress · {applications.length - activeCount} closed
        </span>
        {paid.length > 0 ? (
          <span className="text-emerald-700 dark:text-emerald-400">
            · paid {formatMoney(paidTotal, paidCurrencies[0])} across {paid.length} — amounts you
            recorded with evidence
          </span>
        ) : (
          <span>· nothing recorded as paid — income is never fabricated</span>
        )}
      </div>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <QueryError
          title="Applications could not be loaded"
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => refetch()}
        />
      ) : applications.length === 0 ? (
        <EmptyState
          title="No applications tracked yet."
          hint="Open an opportunity in the Inbox and choose “Prepare application”. Hop3 prepares materials for your review — you submit on the platform yourself and record what happened here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {applications.map((application) => (
            <ApplicationTrackerCard key={application.id} application={application} />
          ))}
        </div>
      )}
    </div>
  )
}
