/**
 * Hop3 Earn — data layer over `IEarnService` (Stage 1 UI port).
 *
 * Re-expression of the reference `hooks/use-earn-data.ts` on top of the frozen
 * 15-method service surface (no HTTP, no react-query — a module-scoped
 * invalidation registry keeps queries fresh after mutations).
 *
 * Honesty rules preserved from the reference port:
 *  - never fabricate data: loading/error/empty are distinct states;
 *  - mutation failures return their honest reason (no raw error across the
 *    channel: `ApplicationMutationResult.ok:false` and rejected promises
 *    both surface as inline/toast text, never hidden);
 *  - recordEvent / saveDraft / saveProfile errors surface INLINE (the
 *    Applications tab / Profile form render them), not as toasts;
 *  - list order is exactly what the service returned (firstSeenAt asc /
 *    provider order) — this layer performs no ranking or reordering.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/components/ui/toast.js";
import type { IntlInstance } from "@/i18n/IntlProvider.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type {
  ApplicationDTO,
  ApplicationDraftContent,
  EarnProfileInput,
  IngestResult,
  IntakeResult,
  OpportunityCardDTO,
  OpportunityDetail,
  OpportunityFilters,
  ProfileDTO,
  RecordEventInput,
  SourceConnectionDTO,
  SourceKey,
} from "@zcode/shared";

import type { IEarnService } from "./contract.js";
import { serializeApplicationDraft } from "./format.js";

// ---------------------------------------------------------------------------
// Resource invalidation registry (module scope; queries subscribe by key)
// ---------------------------------------------------------------------------

type EarnResourceKey = "profile" | "sources" | "opportunities" | "applications";

const invalidationListeners: Record<EarnResourceKey, Set<() => void>> = {
  profile: new Set(),
  sources: new Set(),
  opportunities: new Set(),
  applications: new Set(),
};

/** Fire every listener registered for the given resources (mutation side). */
export function invalidateEarn(resources: readonly EarnResourceKey[]): void {
  for (const key of resources) {
    for (const listener of invalidationListeners[key]) {
      listener();
    }
  }
}

// ---------------------------------------------------------------------------
// Shared state shapes
// ---------------------------------------------------------------------------

export type OpportunityCardWithNotes = OpportunityCardDTO & { savedNotes?: string | null };

export interface EarnQueryResult<T> {
  data: T | null;
  isPending: boolean;
  isError: boolean;
  error: string | null;
  refetch: () => void;
}

export interface EarnMutationState {
  isPending: boolean;
  isError: boolean;
  error: string | null;
}

/** Honest error text: service messages stay verbatim; only the fallback is i18n. */
export function describeEarnError(error: unknown, intl: IntlInstance): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return intl.formatMessage({ id: "earn.common.unknownError" });
}

function useInvalidationVersion(key: EarnResourceKey): [number, () => void] {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    invalidationListeners[key].add(listener);
    return () => {
      invalidationListeners[key].delete(listener);
    };
  }, [key]);
  const refetch = useCallback(() => setVersion((v) => v + 1), []);
  return [version, refetch];
}

/** Sequence-guarded query over one resource; disabled queries stay idle. */
function useEarnResource<T>(
  service: IEarnService | null,
  key: EarnResourceKey,
  fetcher: (service: IEarnService) => Promise<T>,
  enabled: boolean,
): EarnQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { intl } = useZCodeIntl();
  const [version, refetch] = useInvalidationVersion(key);
  const sequenceRef = useRef(0);
  const [pending, setPending] = useState(enabled);

  useEffect(() => {
    if (!service || !enabled) {
      if (!enabled) setPending(false);
      return;
    }
    const sequence = ++sequenceRef.current;
    setPending(true);
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetcher(service);
        if (cancelled || sequence !== sequenceRef.current) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (cancelled || sequence !== sequenceRef.current) return;
        setData(null);
        setError(describeEarnError(err, intl));
      } finally {
        if (!cancelled && sequence === sequenceRef.current) {
          setPending(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // fetcher is a stable useCallback from each public hook below.
  }, [service, key, version, fetcher, enabled, intl]);

  return { data, isPending: pending, isError: error != null, error, refetch };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useEarnProfile(service: IEarnService | null): EarnQueryResult<ProfileDTO | null> {
  const fetcher = useCallback((svc: IEarnService) => svc.getProfile(), []);
  return useEarnResource(service, "profile", fetcher, true);
}

export function useEarnSources(
  service: IEarnService | null,
): EarnQueryResult<SourceConnectionDTO[]> {
  const fetcher = useCallback((svc: IEarnService) => svc.listSources(), []);
  return useEarnResource(service, "sources", fetcher, true);
}

/** Filters are user-chosen only; "all"/empty values are stripped before the call. */
function normalizeFilters(filters: OpportunityFilters): OpportunityFilters {
  const normalized: OpportunityFilters = {};
  if (filters.source && filters.source !== "all") normalized.source = filters.source;
  if (filters.eligibility && filters.eligibility !== "all")
    normalized.eligibility = filters.eligibility;
  if (filters.status && filters.status !== "all") normalized.status = filters.status;
  if (filters.q && filters.q.trim()) normalized.q = filters.q.trim();
  return normalized;
}

export function useEarnOpportunities(
  service: IEarnService | null,
  filters: OpportunityFilters = {},
): EarnQueryResult<OpportunityCardWithNotes[]> {
  const { source, eligibility, status, q } = filters;
  const fetcher = useCallback(
    (svc: IEarnService) =>
      svc.listOpportunities(normalizeFilters({ source, eligibility, status, q })),
    [source, eligibility, status, q],
  );
  return useEarnResource(service, "opportunities", fetcher, true);
}

export function useEarnOpportunityDetail(
  service: IEarnService | null,
  id: string | null,
): EarnQueryResult<OpportunityDetail | null> {
  const fetcher = useCallback(
    (svc: IEarnService) => svc.getOpportunityDetail(id ?? ""),
    [id],
  );
  return useEarnResource(service, "opportunities", fetcher, Boolean(id));
}

export function useEarnApplications(
  service: IEarnService | null,
): EarnQueryResult<ApplicationDTO[]> {
  const fetcher = useCallback((svc: IEarnService) => svc.listApplications(), []);
  return useEarnResource(service, "applications", fetcher, true);
}

// ---------------------------------------------------------------------------
// Mutations — sources
// ---------------------------------------------------------------------------

export interface SyncSourceVars {
  key: SourceKey;
  mode: "live" | "sandbox";
  displayName: string;
}

export function useSyncSource(service: IEarnService | null) {
  const { intl } = useZCodeIntl();
  const [isPending, setIsPending] = useState(false);
  const mutate = useCallback(
    async (vars: SyncSourceVars): Promise<IngestResult | null> => {
      if (!service || isPending) return null;
      setIsPending(true);
      try {
        const result = await service.syncSource(vars.key, vars.mode);
        invalidateEarn(["opportunities", "sources"]);
        const summary = intl.formatMessage(
          { id: "earn.toast.syncDescribe" },
          {
            status: result.status,
            fetched: result.fetched,
            inserted: result.inserted,
            updated: result.updated,
            duplicates: result.duplicates,
          },
        );
        const title = intl.formatMessage(
          { id: "earn.toast.sync" },
          { name: vars.displayName, mode: vars.mode },
        );
        toast(`${title} — ${summary}${result.message ? ` — ${result.message}` : ""}`, {
          variant: result.status === "ok" ? "success" : "warning",
        });
        return result;
      } catch (err) {
        const message = describeEarnError(err, intl);
        toast(`${intl.formatMessage({ id: "earn.toast.syncFailed" })} — ${message}`, {
          variant: "warning",
        });
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [service, isPending, intl],
  );
  return { mutate, isPending };
}

export interface IntakeVars {
  url: string;
  context?: string;
}

export function useIntake(service: IEarnService | null) {
  const { intl } = useZCodeIntl();
  const [isPending, setIsPending] = useState(false);
  const mutate = useCallback(
    async (vars: IntakeVars): Promise<IntakeResult | null> => {
      if (!service || isPending) return null;
      setIsPending(true);
      try {
        const result = await service.recordIntake(vars.url, vars.context);
        invalidateEarn(["opportunities", "sources"]);
        toast(
          `${intl.formatMessage({ id: "earn.toast.linkAdded" })} — ${intl.formatMessage({ id: "earn.toast.linkAddedDesc" })}`,
          { variant: "success" },
        );
        return result;
      } catch (err) {
        toast(
          `${intl.formatMessage({ id: "earn.toast.linkFailed" })} — ${describeEarnError(err, intl)}`,
          { variant: "warning" },
        );
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [service, isPending, intl],
  );
  return { mutate, isPending };
}

// ---------------------------------------------------------------------------
// Mutations — opportunities
// ---------------------------------------------------------------------------

export interface SaveToggleVars {
  id: string;
  saved: boolean;
}

export function useSaveToggle(service: IEarnService | null) {
  const { intl } = useZCodeIntl();
  const [isPending, setIsPending] = useState(false);
  const mutate = useCallback(
    async (vars: SaveToggleVars): Promise<boolean> => {
      if (!service || isPending) return false;
      setIsPending(true);
      try {
        const ok = await service.toggleSaved(vars.id, vars.saved);
        invalidateEarn(["opportunities"]);
        if (ok) {
          toast(
            vars.saved
              ? intl.formatMessage({ id: "earn.toast.saved" })
              : intl.formatMessage({ id: "earn.toast.removedFromSaved" }),
            { variant: "success" },
          );
        } else {
          toast(
            `${intl.formatMessage({ id: "earn.toast.saveStateFailed" })} — ${intl.formatMessage({ id: "earn.toast.saveStateRejected" })}`,
            { variant: "warning" },
          );
        }
        return ok;
      } catch (err) {
        toast(
          `${intl.formatMessage({ id: "earn.toast.saveStateFailed" })} — ${describeEarnError(err, intl)}`,
          { variant: "warning" },
        );
        return false;
      } finally {
        setIsPending(false);
      }
    },
    [service, isPending, intl],
  );
  return { mutate, isPending };
}

export function useSavedNotes(service: IEarnService | null) {
  const { intl } = useZCodeIntl();
  const [isPending, setIsPending] = useState(false);
  const mutate = useCallback(
    async (vars: { id: string; notes: string }): Promise<boolean> => {
      if (!service || isPending) return false;
      setIsPending(true);
      try {
        const ok = await service.setSavedNotes(vars.id, vars.notes);
        if (ok) {
          toast(intl.formatMessage({ id: "earn.toast.notesSaved" }), { variant: "success" });
        } else {
          toast(
            `${intl.formatMessage({ id: "earn.toast.notesFailed" })} — ${intl.formatMessage({ id: "earn.toast.saveStateRejected" })}`,
            { variant: "warning" },
          );
        }
        invalidateEarn(["opportunities"]);
        return ok;
      } catch (err) {
        toast(
          `${intl.formatMessage({ id: "earn.toast.notesFailed" })} — ${describeEarnError(err, intl)}`,
          { variant: "warning" },
        );
        return false;
      } finally {
        setIsPending(false);
      }
    },
    [service, isPending, intl],
  );
  return { mutate, isPending };
}

// ---------------------------------------------------------------------------
// Mutations — applications (evidence-gated lifecycle)
// ---------------------------------------------------------------------------

export function useCreateApplication(service: IEarnService | null) {
  const { intl } = useZCodeIntl();
  const [isPending, setIsPending] = useState(false);
  const mutate = useCallback(
    async (opportunityId: string): Promise<ApplicationDTO | null> => {
      if (!service || isPending) return null;
      setIsPending(true);
      try {
        const result = await service.createApplication(opportunityId);
        if (!result.ok) {
          toast(
            `${intl.formatMessage({ id: "earn.toast.appCreateFailed" })} — ${result.error}`,
            { variant: "warning" },
          );
          return null;
        }
        invalidateEarn(["applications", "opportunities"]);
        toast(
          `${intl.formatMessage({ id: "earn.toast.appCreated" })} — ${intl.formatMessage({ id: "earn.toast.appCreatedDesc" })}`,
          { variant: "success" },
        );
        return result.application;
      } catch (err) {
        toast(
          `${intl.formatMessage({ id: "earn.toast.appCreateFailed" })} — ${describeEarnError(err, intl)}`,
          { variant: "warning" },
        );
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [service, isPending, intl],
  );
  return { mutate, isPending };
}

export function usePrepareDraft(service: IEarnService | null) {
  const { intl } = useZCodeIntl();
  const [isPending, setIsPending] = useState(false);
  const mutate = useCallback(
    async (id: string): Promise<ApplicationDTO | null> => {
      if (!service || isPending) return null;
      setIsPending(true);
      try {
        const result = await service.prepareDraft(id);
        if (!result.ok) {
          toast(
            `${intl.formatMessage({ id: "earn.toast.draftFailed" })} — ${result.error}`,
            { variant: "warning" },
          );
          return null;
        }
        invalidateEarn(["applications"]);
        toast(
          `${intl.formatMessage({ id: "earn.toast.draftPrepared" })} — ${intl.formatMessage({ id: "earn.toast.draftPreparedDesc" })}`,
          { variant: "success" },
        );
        return result.application;
      } catch (err) {
        toast(
          `${intl.formatMessage({ id: "earn.toast.draftFailed" })} — ${describeEarnError(err, intl)}`,
          { variant: "warning" },
        );
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [service, isPending, intl],
  );
  return { mutate, isPending };
}

export function useSaveDraft(service: IEarnService | null) {
  const { intl } = useZCodeIntl();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutate = useCallback(
    async (vars: { id: string; draft: ApplicationDraftContent }): Promise<boolean> => {
      if (!service || isPending) return false;
      setIsPending(true);
      setError(null);
      try {
        const result = await service.saveDraft(vars.id, serializeApplicationDraft(vars.draft));
        if (!result.ok) {
          setError(result.error);
          return false;
        }
        invalidateEarn(["applications"]);
        toast(
          `${intl.formatMessage({ id: "earn.toast.draftSaved" })} — ${intl.formatMessage({ id: "earn.toast.draftSavedDesc" })}`,
          { variant: "success" },
        );
        return true;
      } catch (err) {
        const message = describeEarnError(err, intl);
        setError(message);
        return false;
      } finally {
        setIsPending(false);
      }
    },
    [service, isPending, intl],
  );
  return { mutate, isPending, isError: error != null, error };
}

export interface RecordEventVars {
  id: string;
  input: RecordEventInput;
}

/** Errors surface INLINE in the Applications tab (the API is the source of truth). */
export function useRecordEvent(service: IEarnService | null) {
  const { intl } = useZCodeIntl();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutate = useCallback(
    async (vars: RecordEventVars): Promise<ApplicationDTO | null> => {
      if (!service || isPending) return null;
      setIsPending(true);
      setError(null);
      try {
        const result = await service.recordEvent(vars.id, vars.input);
        if (!result.ok) {
          setError(result.error);
          return null;
        }
        invalidateEarn(["applications", "opportunities"]);
        return result.application;
      } catch (err) {
        setError(describeEarnError(err, intl));
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [service, isPending, intl],
  );
  return { mutate, isPending, isError: error != null, error };
}

export function useMarkPrepared(service: IEarnService | null) {
  const { intl } = useZCodeIntl();
  const [isPending, setIsPending] = useState(false);
  const mutate = useCallback(
    async (id: string): Promise<boolean> => {
      if (!service || isPending) return false;
      setIsPending(true);
      try {
        const result = await service.markPrepared(id);
        if (!result.ok) {
          toast(
            `${intl.formatMessage({ id: "earn.toast.markFailed" })} — ${result.error}`,
            { variant: "warning" },
          );
          return false;
        }
        invalidateEarn(["applications", "opportunities"]);
        toast(
          `${intl.formatMessage({ id: "earn.toast.markedPrepared" })} — ${intl.formatMessage({ id: "earn.toast.markedPreparedDesc" })}`,
          { variant: "success" },
        );
        return true;
      } catch (err) {
        toast(
          `${intl.formatMessage({ id: "earn.toast.markFailed" })} — ${describeEarnError(err, intl)}`,
          { variant: "warning" },
        );
        return false;
      } finally {
        setIsPending(false);
      }
    },
    [service, isPending, intl],
  );
  return { mutate, isPending };
}

// ---------------------------------------------------------------------------
// Mutations — profile
// ---------------------------------------------------------------------------

export function useSaveProfile(service: IEarnService | null) {
  const { intl } = useZCodeIntl();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutate = useCallback(
    async (input: EarnProfileInput): Promise<ProfileDTO | null> => {
      if (!service || isPending) return null;
      setIsPending(true);
      setError(null);
      try {
        const profile = await service.upsertProfile(input);
        // Eligibility assessments depend on the profile — refresh them too.
        invalidateEarn(["profile", "opportunities"]);
        toast(
          `${intl.formatMessage({ id: "earn.toast.profileSaved" })} — ${intl.formatMessage({ id: "earn.toast.profileSavedDesc" })}`,
          { variant: "success" },
        );
        return profile;
      } catch (err) {
        const message = describeEarnError(err, intl);
        setError(message);
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [service, isPending, intl],
  );
  return { mutate, isPending, isError: error != null, error };
}
