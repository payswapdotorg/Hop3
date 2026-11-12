'use client'

/**
 * Hop3 Earn — opportunity detail (Worker C).
 *
 * Shared detail body rendered in a Dialog (desktop) or Drawer (mobile).
 * The evidence panel is always visible; structured spec sections render
 * only what the source actually exposed — unstated fields say "not stated".
 */

import * as React from 'react'
import {
  AlertTriangle,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  NO_AUTO_SUBMIT_NOTICE,
  type DimensionResult,
  type OpportunityCardDTO,
  type ProfileDTO,
} from '@/lib/contracts'
import {
  apiErrorMessage,
  useCreateApplication,
  useOpportunityDetail,
  useProfile,
  useSaveToggle,
} from '@/hooks/use-earn-data'
import {
  absoluteTime,
  formatMoney,
  formatMoneyRange,
  payUnitLabel,
  relativeTime,
  sourceLabel,
} from '@/components/earn/format'
import { DataRow, QueryError, TimeHint, thinScrollbar } from '@/components/earn/common'
import { EconomicsBreakdown, EconomicsLine, PayoutUnknownNotice } from '@/components/earn/economics'
import {
  AMBER_OUTLINE,
  DimensionValueBadge,
  EMERALD_BUTTON,
  EMERALD_OUTLINE,
  FreshnessBadge,
  ProvenanceBadge,
} from '@/components/earn/badges'

// ---------------------------------------------------------------------------
// Overlay wrapper: Dialog on desktop, Drawer on mobile
// ---------------------------------------------------------------------------

export interface DetailOverlayProps {
  opportunity: OpportunityCardDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGoToApplications: () => void
}

export function DetailOverlay({
  opportunity,
  open,
  onOpenChange,
  onGoToApplications,
}: DetailOverlayProps) {
  const isMobile = useIsMobile()

  const body = opportunity ? (
    <OpportunityDetailBody
      card={opportunity}
      onCreated={() => {
        onOpenChange(false)
        onGoToApplications()
      }}
    />
  ) : null

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="border-b text-left">
            <DrawerTitle className="line-clamp-2 pr-10 text-base">
              {opportunity?.title ?? 'Opportunity'}
            </DrawerTitle>
            <DrawerDescription className="pr-10">
              {opportunity ? `${opportunity.platform} · ${sourceLabel(opportunity.sourceKey)}` : ''}
            </DrawerDescription>
            <DrawerClose
              className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Close details"
            >
              <X className="size-4" aria-hidden="true" />
            </DrawerClose>
          </DrawerHeader>
          <div className={cn('overflow-y-auto px-4 pb-8 pt-3', thinScrollbar)}>{body}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[85vh] max-w-3xl overflow-y-auto', thinScrollbar)}>
        <DialogHeader className="text-left">
          <DialogTitle className="line-clamp-2 pr-8 text-lg leading-snug">
            {opportunity?.title ?? 'Opportunity'}
          </DialogTitle>
          <DialogDescription>
            {opportunity ? `${opportunity.platform} · ${sourceLabel(opportunity.sourceKey)}` : ''}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Detail body
// ---------------------------------------------------------------------------

function skillCoverage(
  skill: string,
  profile: ProfileDTO | null | undefined
): 'covered' | 'missing' | 'unknown' {
  if (!profile) return 'unknown'
  const target = skill.trim().toLowerCase()
  if (!target) return 'unknown'
  const names = profile.skills
    .map((s) => s.name.trim().toLowerCase())
    .filter((n) => n.length > 0)
  return names.some((n) => n === target || n.includes(target) || target.includes(n))
    ? 'covered'
    : 'missing'
}

function SkillChip({ skill, profile }: { skill: string; profile: ProfileDTO | null | undefined }) {
  const coverage = skillCoverage(skill, profile)
  if (coverage === 'covered') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" tabIndex={0} className={EMERALD_OUTLINE}>{skill}</Badge>
        </TooltipTrigger>
        <TooltipContent>Covered by your profile skills</TooltipContent>
      </Tooltip>
    )
  }
  if (coverage === 'missing') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" tabIndex={0} className={AMBER_OUTLINE}>{skill}</Badge>
        </TooltipTrigger>
        <TooltipContent>Not in your profile</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0}>{skill}</Badge>
      </TooltipTrigger>
      <TooltipContent>Coverage unknown — save a profile to check</TooltipContent>
    </Tooltip>
  )
}

function CopyUrlButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)

  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label="Copy canonical URL"
      onClick={onCopy}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </Button>
  )
}

function NotStated() {
  return <span className="text-xs text-muted-foreground">not stated</span>
}

/** Wraps spec sections: skeleton while loading, honest error with retry. */
function SpecSection({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean
  error: boolean
  retry: () => void
  children: React.ReactNode
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }
  if (error) {
    return <QueryError title="Detail unavailable" message="The detail payload could not be loaded." onRetry={retry} />
  }
  return <div className="space-y-3 text-sm">{children}</div>
}

function EligibilityTable({
  dimensions,
}: {
  dimensions: Array<{ label: string; dim: DimensionResult }>
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-8 text-xs">Dimension</TableHead>
          <TableHead className="h-8 text-xs">Value</TableHead>
          <TableHead className="h-8 text-xs">Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dimensions.map(({ label, dim }) => (
          <TableRow key={label}>
            <TableCell className="py-2 text-xs font-medium">{label}</TableCell>
            <TableCell className="py-2">
              <DimensionValueBadge value={dim.value} />
            </TableCell>
            <TableCell className="py-2 text-xs text-muted-foreground">{dim.reason}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function OpportunityDetailBody({
  card,
  onCreated,
}: {
  card: OpportunityCardDTO
  onCreated: () => void
}) {
  const detailQuery = useOpportunityDetail(card.id)
  const detail = detailQuery.data
  const profileQuery = useProfile()
  const profile = profileQuery.data
  const saveToggle = useSaveToggle()
  const createApplication = useCreateApplication()

  const loading = detailQuery.isPending
  const failed = detailQuery.isError

  const requirements = detail?.requirementsSpec
  const eligibilitySpec = detail?.eligibilitySpec
  const compensation = detail?.compensationSpec
  const payout = detail?.payoutSpec
  const applicationSpec = detail?.applicationSpec
  const timeSpec = detail?.timeSpec
  const riskFlags = detail?.riskFlags ?? []

  const evidence = detail?.evidence
  const sourceStatus = detail?.sourceStatus ?? evidence?.sourceStatus ?? null
  const sourceRecordId = detail?.sourceRecordId ?? evidence?.sourceRecordId ?? null

  const eligibilityDims: Array<{ label: string; dim: DimensionResult }> = []
  if (card.eligibility) {
    const dims: Array<{ key: 'country' | 'language' | 'skills' | 'payout'; label: string }> = [
      { key: 'country', label: 'Country' },
      { key: 'language', label: 'Language' },
      { key: 'skills', label: 'Skills' },
      { key: 'payout', label: 'Payout' },
    ]
    for (const { key, label } of dims) {
      const dim = card.eligibility[key]
      if (dim) eligibilityDims.push({ label, dim })
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="space-y-2">
        {card.summary ? <p className="text-sm text-muted-foreground">{card.summary}</p> : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{card.platform}</Badge>
          <Badge variant="outline">{sourceLabel(card.sourceKey)}</Badge>
          <ProvenanceBadge provenance={card.provenance} />
          {card.opportunityType ? <Badge variant="outline">{card.opportunityType}</Badge> : null}
          {card.workMode ? <Badge variant="outline">{card.workMode}</Badge> : null}
          <FreshnessBadge status={card.status} expiresAt={card.expiresAt} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            <TimeHint label="observed" iso={card.observedAt} /> ·{' '}
            <TimeHint label="first seen" iso={card.firstSeenAt} /> ·{' '}
            <TimeHint label="last seen" iso={card.lastSeenAt} />
          </span>
        </div>
        <EconomicsLine economics={card.economics} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild className="h-11 sm:h-9">
          <a href={card.canonicalUrl} target="_blank" rel="noopener noreferrer">
            Open provider page
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
        <Button
          variant="outline"
          className="h-11 sm:h-9"
          disabled={saveToggle.isPending}
          onClick={() => saveToggle.mutate({ id: card.id, saved: !card.saved })}
          aria-label={card.saved ? 'Remove from saved' : 'Save opportunity'}
        >
          <Bookmark className={cn(card.saved && 'fill-current')} aria-hidden="true" />
          {card.saved ? 'Unsave' : 'Save'}
        </Button>
        {card.applicationStatus ? (
          <Button variant="outline" className="h-11 sm:h-9" onClick={onCreated}>
            View in Applications
          </Button>
        ) : (
          <Button
            variant="outline"
            className={cn('h-11 sm:h-9', EMERALD_BUTTON)}
            disabled={createApplication.isPending}
            onClick={() => createApplication.mutate(card.id, { onSuccess: onCreated })}
          >
            {createApplication.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            Prepare application
          </Button>
        )}
      </div>

      {/* Evidence panel — always visible, never collapsed */}
      <section className="rounded-lg border">
        <header className="border-b px-3 py-2 text-xs font-medium">Source evidence</header>
        <dl className="px-3 py-1">
          <DataRow label="Platform">{card.platform}</DataRow>
          <DataRow label="Source">{sourceLabel(card.sourceKey)}</DataRow>
          <DataRow label="Listing link">
            <a
              href={card.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-700 underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-emerald-400"
              aria-label="Open source listing"
            >
              Open source listing
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </DataRow>
          <DataRow label="Canonical URL">
            <div className="flex min-w-0 items-center gap-1">
              <code className="block truncate font-mono text-[11px]">{card.canonicalUrl}</code>
              <CopyUrlButton text={card.canonicalUrl} />
            </div>
          </DataRow>
          {sourceRecordId ? (
            <DataRow label="Source record ID">
              <code className="font-mono text-[11px]">{sourceRecordId}</code>
            </DataRow>
          ) : null}
          <DataRow label="Observed at">
            {absoluteTime(card.observedAt)}{' '}
            <span className="text-xs text-muted-foreground">({relativeTime(card.observedAt)})</span>
          </DataRow>
          <DataRow label="First seen">{absoluteTime(card.firstSeenAt)}</DataRow>
          <DataRow label="Last seen">{absoluteTime(card.lastSeenAt)}</DataRow>
          <DataRow label="Source status">{sourceStatus ?? 'not reported'}</DataRow>
          <DataRow label="Provenance">
            <ProvenanceBadge provenance={card.provenance} />
          </DataRow>
          {riskFlags.length > 0 ? (
            <DataRow label="Risk flags">
              <div className="flex flex-wrap gap-1.5">
                {riskFlags.map((flag, i) => (
                  <Badge key={i} variant="outline" className="border-destructive/40 text-destructive">
                    {flag}
                  </Badge>
                ))}
              </div>
            </DataRow>
          ) : null}
        </dl>
      </section>

      {/* Structured sections */}
      <Accordion type="multiple" defaultValue={['requirements', 'eligibility']}>
        <AccordionItem value="requirements">
          <AccordionTrigger className="text-sm">Requirements</AccordionTrigger>
          <AccordionContent>
            <SpecSection loading={loading} error={failed} retry={() => detailQuery.refetch()}>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Skills</p>
                {requirements?.skills && requirements.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {requirements.skills.map((skill, i) => (
                      <SkillChip key={`${skill}-${i}`} skill={skill} profile={profile} />
                    ))}
                  </div>
                ) : (
                  <NotStated />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Experience</p>
                <p>{requirements?.experience ?? 'not stated'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Equipment</p>
                {requirements?.equipment && requirements.equipment.length > 0 ? (
                  <ul className="list-disc pl-4 text-xs">
                    {requirements.equipment.map((eq, i) => (
                      <li key={i}>{eq}</li>
                    ))}
                  </ul>
                ) : (
                  <NotStated />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Schedule</p>
                <p>{requirements?.schedule ?? 'not stated'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Languages (requirements)</p>
                {requirements?.languages && requirements.languages.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {requirements.languages.map((lang, i) => (
                      <Badge key={i} variant="outline">{lang}</Badge>
                    ))}
                  </div>
                ) : (
                  <NotStated />
                )}
              </div>
            </SpecSection>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="eligibility">
          <AccordionTrigger className="text-sm">Eligibility</AccordionTrigger>
          <AccordionContent>
            <SpecSection loading={loading} error={failed} retry={() => detailQuery.refetch()}>
              {eligibilityDims.length > 0 ? (
                <EligibilityTable dimensions={eligibilityDims} />
              ) : (
                <NotStated />
              )}
              {card.eligibility?.unknowns && card.eligibility.unknowns.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Unknowns</p>
                  <ul className="list-disc pl-4 text-xs text-muted-foreground">
                    {card.eligibility.unknowns.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {card.eligibility?.nextSteps && card.eligibility.nextSteps.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Next steps</p>
                  <ul className="space-y-1">
                    {card.eligibility.nextSteps.map((step, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2
                          className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {eligibilitySpec?.notes ? (
                <p className="text-xs text-muted-foreground">Source notes: {eligibilitySpec.notes}</p>
              ) : null}
            </SpecSection>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="application">
          <AccordionTrigger className="text-sm">Application</AccordionTrigger>
          <AccordionContent>
            <SpecSection loading={loading} error={failed} retry={() => detailQuery.refetch()}>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Steps</p>
                {applicationSpec?.steps && applicationSpec.steps.length > 0 ? (
                  <ol className="list-decimal space-y-0.5 pl-4 text-xs">
                    {applicationSpec.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                ) : (
                  <NotStated />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span>
                  <span className="text-muted-foreground">Closing date: </span>
                  {applicationSpec?.closingDate ? absoluteTime(applicationSpec.closingDate) : 'not stated'}
                </span>
                {applicationSpec?.qualificationTest ? (
                  <Badge variant="outline" className={AMBER_OUTLINE}>Qualification test required</Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span>
                  <span className="text-muted-foreground">Application cost: </span>
                  {applicationSpec?.applicationCost?.amount != null
                    ? formatMoney(applicationSpec.applicationCost.amount, applicationSpec.applicationCost.currency)
                    : 'not stated'}
                  {applicationSpec?.applicationCost?.note ? ` — ${applicationSpec.applicationCost.note}` : ''}
                </span>
                {applicationSpec?.connects != null ? (
                  <span>
                    <span className="text-muted-foreground">Connects: </span>
                    {applicationSpec.connects}
                  </span>
                ) : null}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Required data</p>
                {applicationSpec?.requiredData && applicationSpec.requiredData.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {applicationSpec.requiredData.map((d, i) => (
                      <Badge key={i} variant="outline">{d}</Badge>
                    ))}
                  </div>
                ) : (
                  <NotStated />
                )}
              </div>
            </SpecSection>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="compensation">
          <AccordionTrigger className="text-sm">Compensation &amp; payout</AccordionTrigger>
          <AccordionContent>
            <SpecSection loading={loading} error={failed} retry={() => detailQuery.refetch()}>
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  gross{' '}
                  {formatMoneyRange(
                    compensation?.grossMin ?? card.economics.grossMin,
                    compensation?.grossMax ?? card.economics.grossMax,
                    compensation?.currency ?? card.economics.currency
                  )}{' '}
                  {payUnitLabel(compensation?.payUnit ?? card.economics.payUnit)}
                </span>
                <CompensationBasisBadge basis={compensation?.fixedOrEstimated} />
              </div>
              {compensation?.conditions ? (
                <p className="text-xs text-muted-foreground">Conditions: {compensation.conditions}</p>
              ) : null}

              <div className="space-y-1.5">
                <p className="text-xs font-medium">Payout</p>
                {payout?.methodKnown ? (
                  <div className="space-y-1 text-xs">
                    <p>
                      <span className="text-muted-foreground">Methods: </span>
                      {payout.methods && payout.methods.length > 0 ? payout.methods.join(', ') : 'not stated'}
                    </p>
                    {payout.threshold ? (
                      <p>
                        <span className="text-muted-foreground">Threshold: </span>
                        {formatMoney(payout.threshold.amount, payout.threshold.currency)}
                      </p>
                    ) : null}
                    {payout.fees ? (
                      <p>
                        <span className="text-muted-foreground">Fees: </span>
                        {payout.fees}
                      </p>
                    ) : null}
                    {payout.cadence ? (
                      <p>
                        <span className="text-muted-foreground">Cadence: </span>
                        {payout.cadence}
                      </p>
                    ) : null}
                    {payout.evidenceUrl ? (
                      <a
                        href={payout.evidenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                      >
                        Payout evidence
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <PayoutUnknownNotice />
                )}
              </div>

              <EconomicsBreakdown economics={card.economics} />
            </SpecSection>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="time">
          <AccordionTrigger className="text-sm">Time</AccordionTrigger>
          <AccordionContent>
            <SpecSection loading={loading} error={failed} retry={() => detailQuery.refetch()}>
              <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Hours: </span>
                  {timeSpec?.hoursMin != null || timeSpec?.hoursMax != null
                    ? timeSpec.hoursMin != null && timeSpec.hoursMax != null
                      ? `${timeSpec.hoursMin}–${timeSpec.hoursMax}`
                      : timeSpec.hoursMin != null
                        ? `from ${timeSpec.hoursMin}`
                        : `up to ${timeSpec.hoursMax}`
                    : 'not stated'}
                </p>
                <p>
                  <span className="text-muted-foreground">Deadline: </span>
                  {timeSpec?.deadline ? absoluteTime(timeSpec.deadline) : 'not stated'}
                </p>
                <p>
                  <span className="text-muted-foreground">Duration: </span>
                  {timeSpec?.duration ?? 'not stated'}
                </p>
                <p>
                  <span className="text-muted-foreground">Shifts: </span>
                  {timeSpec?.shifts ?? 'not stated'}
                </p>
                <p>
                  <span className="text-muted-foreground">Timezone: </span>
                  {timeSpec?.timezone ?? 'not stated'}
                </p>
              </div>
            </SpecSection>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {failed && !loading ? (
        <QueryError
          title="Detail request failed"
          message={apiErrorMessage(detailQuery.error)}
          onRetry={() => detailQuery.refetch()}
        />
      ) : null}

      <Alert className="border-amber-600/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-500">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>No automatic submission</AlertTitle>
        <AlertDescription>
          <p>{NO_AUTO_SUBMIT_NOTICE}</p>
        </AlertDescription>
      </Alert>
    </div>
  )
}

function CompensationBasisBadge({ basis }: { basis?: 'fixed' | 'estimated' | 'unknown' }) {
  switch (basis) {
    case 'fixed':
      return <Badge variant="outline" className={EMERALD_OUTLINE}>fixed</Badge>
    case 'estimated':
      return <Badge variant="outline" className={AMBER_OUTLINE}>estimated</Badge>
    default:
      return <Badge variant="outline">unknown basis</Badge>
  }
}
