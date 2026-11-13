'use client'

/**
 * Hop3 Earn — data layer (Worker C).
 *
 * Every fetch targets the frozen Stage 1 API surface with relative paths.
 * Hooks wrap @tanstack/react-query; mutations invalidate the relevant
 * queries and surface honest toast feedback via the existing use-toast hook.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import {
  type ApplicationDraftContent,
  type ApplicationDTO,
  type ApplicationSpec,
  type CompensationSpec,
  type EligibilitySpec,
  type IngestResult,
  type OpportunityCardDTO,
  type ProfileDTO,
  type PayoutSpec,
  type RequirementsSpec,
  type SourceConnectionDTO,
  type SourceKey,
  type TimeSpec,
} from '@/lib/contracts'

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError('Network request failed — the API did not respond.', 0, null)
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    let body: unknown = null
    try {
      body = await res.json()
      const err = (body as { error?: unknown } | null)?.error
      if (typeof err === 'string' && err.trim().length > 0) message = err
    } catch {
      // no JSON body — keep the generic status message
    }
    throw new ApiError(message, res.status, body)
  }

  return (await res.json()) as T
}

export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.message) return err.message
  return 'Something went wrong'
}

// ---------------------------------------------------------------------------
// Detail shape — card fields plus the normalized spec/evidence payloads.
// Spec fields are optional: missing values stay missing (never guessed).
// ---------------------------------------------------------------------------

export interface OpportunityEvidenceDTO {
  platform?: string | null
  canonicalUrl?: string | null
  sourceName?: string | null
  sourceRecordId?: string | null
  sourceStatus?: string | null
  observedAt?: string | null
  firstSeenAt?: string | null
  lastSeenAt?: string | null
}

export interface OpportunityDetailDTO extends OpportunityCardDTO {
  eligibilitySpec?: EligibilitySpec
  requirementsSpec?: RequirementsSpec
  compensationSpec?: CompensationSpec
  payoutSpec?: PayoutSpec
  applicationSpec?: ApplicationSpec
  timeSpec?: TimeSpec
  riskFlags?: string[]
  raw?: unknown
  evidence?: OpportunityEvidenceDTO
  savedNotes?: string | null
  sourceStatus?: string | null
  sourceRecordId?: string | null
}

/** Cards may also carry saved notes for the Saved tab. */
export type OpportunityCardWithNotes = OpportunityCardDTO & { savedNotes?: string | null }

// ---------------------------------------------------------------------------
// Filter / mutation payload types
// ---------------------------------------------------------------------------

export interface OpportunityFilters {
  source?: string
  eligibility?: string
  status?: string
  q?: string
}

/** PUT /api/profile body — editable profile fields only. */
export type ProfileInput = Omit<ProfileDTO, 'id' | 'schemaVersion' | 'updatedAt'>

export interface RecordEventInput {
  eventType: string
  evidenceType?: 'user-reported' | 'provider-confirmed' | 'payment-confirmed'
  evidenceUrl?: string
  note?: string
  channel?: string
  amountPaid?: number
  paidCurrency?: string
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const data = await api<{ profile: ProfileDTO | null }>('/api/profile')
      return data.profile
    },
  })
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: async () => {
      const data = await api<{ sources: SourceConnectionDTO[] }>('/api/sources')
      return data.sources
    },
  })
}

function opportunityParams(filters: OpportunityFilters): string {
  const params = new URLSearchParams()
  if (filters.source && filters.source !== 'all') params.set('source', filters.source)
  if (filters.eligibility && filters.eligibility !== 'all')
    params.set('eligibility', filters.eligibility)
  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters.q && filters.q.trim()) params.set('q', filters.q.trim())
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function useOpportunities(filters: OpportunityFilters = {}) {
  return useQuery({
    queryKey: ['opportunities', filters],
    queryFn: async () => {
      const data = await api<{ opportunities: OpportunityCardDTO[] }>(
        `/api/opportunities${opportunityParams(filters)}`
      )
      return data.opportunities
    },
  })
}

export function useOpportunityDetail(id: string | null) {
  return useQuery({
    queryKey: ['opportunity', id],
    queryFn: async () => {
      const data = await api<{ opportunity: OpportunityDetailDTO }>(`/api/opportunities/${id}`)
      return data.opportunity
    },
    enabled: Boolean(id),
  })
}

export function useApplications() {
  return useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const data = await api<{ applications: ApplicationDTO[] }>('/api/applications')
      return data.applications
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function describeIngest(result: IngestResult): string {
  return `status ${result.status} · fetched ${result.fetched} · new ${result.inserted} · updated ${result.updated} · duplicates ${result.duplicates}${
    result.message ? ` — ${result.message}` : ''
  }`
}

export function useSyncSource() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { key: SourceKey; mode: 'live' | 'sandbox'; displayName: string }) => {
      const data = await api<{ result: IngestResult }>(`/api/sources/${vars.key}/sync`, {
        method: 'POST',
        body: JSON.stringify({ mode: vars.mode }),
      })
      return { result: data.result, displayName: vars.displayName, mode: vars.mode }
    },
    onSuccess: ({ result, displayName, mode }) => {
      const ok = result.status === 'ok'
      toast({
        title: `${displayName} sync (${mode})`,
        description: describeIngest(result),
        variant: ok ? 'default' : 'destructive',
      })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['opportunity'] })
      void queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (err) => {
      toast({
        title: 'Sync failed',
        description: apiErrorMessage(err),
        variant: 'destructive',
      })
    },
  })
}

export function useIntake() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { url: string; context?: string }) => {
      return api<{ opportunityId: string }>('/api/intake', {
        method: 'POST',
        body: JSON.stringify({ url: vars.url, context: vars.context }),
      })
    },
    onSuccess: () => {
      toast({
        title: 'Link added',
        description: 'Added — labelled user-submitted until verified.',
      })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (err) => {
      toast({
        title: 'Could not add link',
        description: apiErrorMessage(err),
        variant: 'destructive',
      })
    },
  })
}

export function useSaveToggle() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { id: string; saved: boolean }) => {
      return api<{ ok: true }>(`/api/opportunities/${vars.id}/save`, {
        method: 'POST',
        body: JSON.stringify({ saved: vars.saved }),
      })
    },
    onSuccess: (_data, vars) => {
      toast({
        title: vars.saved ? 'Saved' : 'Removed from saved',
        description: vars.saved
          ? 'Kept in the Saved tab with your notes.'
          : 'No longer in your Saved list.',
      })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['opportunity', vars.id] })
    },
    onError: (err) => {
      toast({ title: 'Could not update saved state', description: apiErrorMessage(err), variant: 'destructive' })
    },
  })
}

export function useSavedNotes() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { id: string; notes: string }) => {
      return api<{ ok: true }>(`/api/opportunities/${vars.id}/saved-notes`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: vars.notes }),
      })
    },
    onSuccess: () => {
      toast({ title: 'Notes saved' })
    },
    onError: (err) => {
      toast({ title: 'Could not save notes', description: apiErrorMessage(err), variant: 'destructive' })
    },
  })
}

export function useCreateApplication() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (opportunityId: string) => {
      const data = await api<{ application: ApplicationDTO }>(
        `/api/opportunities/${opportunityId}/applications`,
        { method: 'POST' }
      )
      return data.application
    },
    onSuccess: (application) => {
      toast({
        title: 'Application tracker created',
        description: 'Prepare materials in the Applications tab — nothing is ever submitted for you.',
      })
      void queryClient.invalidateQueries({ queryKey: ['applications'] })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['opportunity', application.opportunityId] })
    },
    onError: (err) => {
      toast({
        title: 'Could not create application',
        description: apiErrorMessage(err),
        variant: 'destructive',
      })
    },
  })
}

export function usePrepareDraft() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await api<{ application: ApplicationDTO }>(`/api/applications/${id}/prepare`, {
        method: 'POST',
      })
      return data.application
    },
    onSuccess: () => {
      toast({
        title: 'Draft prepared',
        description: 'Review every claim before use — drafts are never submitted automatically.',
      })
      void queryClient.invalidateQueries({ queryKey: ['applications'] })
    },
    onError: (err) => {
      toast({
        title: 'Draft generation failed',
        description: apiErrorMessage(err),
        variant: 'destructive',
      })
    },
  })
}

export function useSaveDraft() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { id: string; draft: ApplicationDraftContent }) => {
      const data = await api<{ application: ApplicationDTO }>(`/api/applications/${vars.id}/draft`, {
        method: 'PUT',
        body: JSON.stringify({ draft: vars.draft }),
      })
      return data.application
    },
    onSuccess: () => {
      toast({ title: 'Draft saved', description: 'Your edits are stored locally in your workspace.' })
      void queryClient.invalidateQueries({ queryKey: ['applications'] })
    },
    onError: (err) => {
      toast({ title: 'Could not save draft', description: apiErrorMessage(err), variant: 'destructive' })
    },
  })
}

export function useRecordEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { id: string } & RecordEventInput) => {
      const { id, ...payload } = vars
      const data = await api<{ application: ApplicationDTO }>(`/api/applications/${id}/events`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return data.application
    },
    onSuccess: (application) => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['opportunity', application.opportunityId] })
    },
    // Errors (including 400 guard responses) are surfaced inline by the
    // Applications tab as destructive Alerts — the API is the source of truth.
  })
}

export function useMarkPrepared() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await api<{ application: ApplicationDTO }>(`/api/applications/${id}/prepared`, {
        method: 'POST',
      })
      return data.application
    },
    onSuccess: () => {
      toast({
        title: 'Marked reviewed',
        description: 'You submit it yourself on the provider platform, then record what happened.',
      })
      void queryClient.invalidateQueries({ queryKey: ['applications'] })
    },
    onError: (err) => {
      toast({
        title: 'Could not mark reviewed',
        description: apiErrorMessage(err),
        variant: 'destructive',
      })
    },
  })
}

export function useSaveProfile() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ProfileInput) => {
      const data = await api<{ profile: ProfileDTO }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(input),
      })
      return data.profile
    },
    onSuccess: () => {
      toast({ title: 'Profile saved', description: 'Private by default — it stays in your workspace.' })
      void queryClient.invalidateQueries({ queryKey: ['profile'] })
      // Eligibility assessments depend on the profile — refresh them too.
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['opportunity'] })
    },
    onError: (err) => {
      toast({ title: 'Could not save profile', description: apiErrorMessage(err), variant: 'destructive' })
    },
  })
}
