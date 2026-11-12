/**
 * Hop3 Earn — opportunity inbox section (Stage 1 UI port).
 *
 * Filters (source / eligibility / status / debounced search) are user-chosen
 * only; results keep provider order where policy requires it. Counts in the
 * sync hint row come straight from the queries — no invented numbers.
 */

import * as React from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { SourceKey } from "@zcode/shared";

import { CardSkeletonGrid, EmptyState, QueryError } from "./common.js";
import { OpportunityCard } from "./OpportunityCard.js";
import { OpportunityDetailOverlay } from "./OpportunityDetail.js";
import { toDate } from "./format.js";
import {
  useEarnApplications,
  useEarnOpportunities,
  useEarnSources,
  type OpportunityCardWithNotes,
} from "./useEarnData.js";
import { useFormat } from "./useFormat.js";
import type { IEarnService } from "./contract.js";

const SOURCE_FILTER_OPTIONS: Array<{ value: SourceKey | "all"; key: string }> = [
  { value: "all", key: "earn.inbox.filter.source.all" },
  { value: "oneforma", key: "earn.inbox.filter.source.oneforma" },
  { value: "upwork_mcp", key: "earn.inbox.filter.source.upwork" },
  { value: "fiverr_mcp", key: "earn.inbox.filter.source.fiverr" },
  { value: "url_intake", key: "earn.inbox.filter.source.urlIntake" },
];

const ELIGIBILITY_FILTER_OPTIONS = [
  { value: "all", key: "earn.inbox.filter.eligibility.all" },
  { value: "eligible", key: "earn.inbox.filter.eligibility.eligible" },
  { value: "ineligible", key: "earn.inbox.filter.eligibility.ineligible" },
  { value: "unknown", key: "earn.inbox.filter.eligibility.unknown" },
  { value: "needs_user_input", key: "earn.inbox.filter.eligibility.needsInput" },
] as const;

const STATUS_FILTER_OPTIONS = [
  { value: "all", key: "earn.inbox.filter.status.all" },
  { value: "active", key: "earn.inbox.filter.status.active" },
  { value: "stale", key: "earn.inbox.filter.status.stale" },
  { value: "expired", key: "earn.inbox.filter.status.expired" },
] as const;

export function InboxSection({
  service,
  onGoToApplications,
}: {
  service: IEarnService | null;
  onGoToApplications: () => void;
}) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const [source, setSource] = React.useState("all");
  const [eligibility, setEligibility] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");

  const [selected, setSelected] = React.useState<OpportunityCardWithNotes | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const filters = { source, eligibility, status, q: debouncedQ };
  const query = useEarnOpportunities(service, filters);
  const allQuery = useEarnOpportunities(service, {});
  const applicationsQuery = useEarnApplications(service);
  const sourcesQuery = useEarnSources(service);

  const opportunities = query.data ?? [];
  const total = allQuery.data?.length ?? null;
  const savedCount = (allQuery.data ?? []).filter((o) => o.saved).length;
  const appCount = applicationsQuery.data?.length ?? null;

  let lastSync: Date | null = null;
  for (const s of sourcesQuery.data ?? []) {
    const d = toDate(s.lastSyncAt ?? null);
    if (d && (!lastSync || d > lastSync)) lastSync = d;
  }

  const openDetail = (opportunity: OpportunityCardWithNotes) => {
    setSelected(opportunity);
    setDetailOpen(true);
  };

  return (
    <section
      className="space-y-4"
      aria-label={intl.formatMessage({ id: "earn.tab.inbox" })}
    >
      {/* Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="w-full sm:w-[170px]">
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-full" aria-label={intl.formatMessage({ id: "earn.inbox.filter.source.label" })}>
              <SelectValue placeholder={intl.formatMessage({ id: "earn.inbox.filter.source.label" })} />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {intl.formatMessage({ id: option.key })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-[170px]">
          <Select value={eligibility} onValueChange={setEligibility}>
            <SelectTrigger className="w-full" aria-label={intl.formatMessage({ id: "earn.inbox.filter.eligibility.label" })}>
              <SelectValue placeholder={intl.formatMessage({ id: "earn.inbox.filter.eligibility.label" })} />
            </SelectTrigger>
            <SelectContent>
              {ELIGIBILITY_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {intl.formatMessage({ id: option.key })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-[150px]">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full" aria-label={intl.formatMessage({ id: "earn.inbox.filter.status.label" })}>
              <SelectValue placeholder={intl.formatMessage({ id: "earn.inbox.filter.status.label" })} />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {intl.formatMessage({ id: option.key })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={intl.formatMessage({ id: "earn.inbox.search.placeholder" })}
            aria-label={intl.formatMessage({ id: "earn.inbox.search.label" })}
            inputMode="search"
            className="pl-9"
          />
        </div>
      </div>

      {/* Sync hint / counts row */}
      <p className="flex flex-wrap gap-x-2 gap-y-1 text-ui-xs text-foreground-subtle">
        {query.isPending ? (
          <span>{intl.formatMessage({ id: "earn.inbox.counts.loading" })}</span>
        ) : (
          <span>
            {intl.formatMessage({ id: "earn.inbox.counts.shown" }, { shown: opportunities.length })}
            {total != null ? ` · ${intl.formatMessage({ id: "earn.inbox.counts.ofTotal" }, { total })}` : ""}
            {savedCount > 0
              ? ` · ${intl.formatMessage({ id: "earn.inbox.counts.saved" }, { count: savedCount })}`
              : ""}
            {appCount != null
              ? ` · ${intl.formatMessage({ id: "earn.inbox.counts.applications" }, { count: appCount })}`
              : ""}
            {` · ${intl.formatMessage(
              { id: "earn.inbox.counts.lastSync" },
              {
                when: lastSync
                  ? format.relativeTime(lastSync.toISOString())
                  : intl.formatMessage({ id: "earn.time.never" }),
              },
            )}`}
          </span>
        )}
      </p>

      {/* Results — order is exactly what the service returned; never re-ranked. */}
      {query.isPending ? (
        <CardSkeletonGrid
          count={4}
          label={intl.formatMessage({ id: "earn.inbox.counts.loading" })}
        />
      ) : query.isError ? (
        <QueryError
          title={intl.formatMessage({ id: "earn.inbox.error.title" })}
          message={
            query.error ?? intl.formatMessage({ id: "earn.common.unknownError" })
          }
          onRetry={() => void query.refetch()}
        />
      ) : opportunities.length === 0 ? (
        <EmptyState
          title={intl.formatMessage({ id: "earn.inbox.empty.title" })}
          hint={intl.formatMessage({ id: "earn.inbox.empty.hint" })}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {opportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              service={service}
              opportunity={opportunity}
              onOpen={openDetail}
              onGoToApplications={onGoToApplications}
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
