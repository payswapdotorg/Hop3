'use client'

/**
 * Hop3 Earn — worker profile (Worker C).
 *
 * DOMAIN-MODEL 1.1 worker capability profile: skills, languages,
 * qualifications, country, availability, equipment, income goal and payout
 * capabilities. Private by default: the data stays in the user's workspace
 * and only ever computes local eligibility/economics and truthful draft
 * materials.
 *
 * The form initializes from the saved profile (remounted on server
 * updatedAt so saved values never clobber in-progress edits), validates
 * client-side, and the API validates again with zod.
 */

import * as React from 'react'

import { Plus, Save, Trash2 } from 'lucide-react'

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
import type { ProfileDTO } from '@/lib/contracts'
import { useProfile, useSaveProfile } from '@/hooks/use-earn-data'
import { QueryError } from '@/components/earn/common'

// ---------------------------------------------------------------------------
// Form state + payload
// ---------------------------------------------------------------------------

interface LanguageRow { code: string; proficiency: string; note: string }
interface SkillRow { name: string; experienceBand: string; evidenceNote: string }
interface QualificationRow { type: string; issuer: string; year: string; verificationState: string }
interface EquipmentRow { kind: string; note: string }
interface PayoutRow { rail: string; status: string; note: string }

interface FormState {
  displayName: string
  countryCode: string
  regionNote: string
  workMode: string
  timezone: string
  weeklyHours: string
  incomeGoalAmount: string
  incomeGoalCurrency: string
  languages: LanguageRow[]
  skills: SkillRow[]
  qualifications: QualificationRow[]
  equipment: EquipmentRow[]
  payoutCapabilities: PayoutRow[]
  includedFamilies: string
  excludedFamilies: string
}

function stateFromProfile(profile: ProfileDTO | null): FormState {
  return {
    displayName: profile?.displayName ?? '',
    countryCode: profile?.countryCode ?? '',
    regionNote: profile?.regionNote ?? '',
    workMode: profile?.workMode ?? 'any',
    timezone: profile?.timezone ?? '',
    weeklyHours: profile ? String(profile.weeklyHours ?? 0) : '',
    incomeGoalAmount: profile?.incomeGoalAmount != null ? String(profile.incomeGoalAmount) : '',
    incomeGoalCurrency: profile?.incomeGoalCurrency ?? 'USD',
    languages: (profile?.languages ?? []).map((l) => ({
      code: l.code,
      proficiency: l.proficiency,
      note: l.note ?? '',
    })),
    skills: (profile?.skills ?? []).map((s) => ({
      name: s.name,
      experienceBand: s.experienceBand,
      evidenceNote: s.evidenceNote ?? '',
    })),
    qualifications: (profile?.qualifications ?? []).map((q) => ({
      type: q.type,
      issuer: q.issuer ?? '',
      year: q.year ?? '',
      verificationState: q.verificationState,
    })),
    equipment: (profile?.equipment ?? []).map((e) => ({ kind: e.kind, note: e.note ?? '' })),
    payoutCapabilities: (profile?.payoutCapabilities ?? []).map((p) => ({
      rail: p.rail,
      status: p.status,
      note: p.note ?? '',
    })),
    includedFamilies: (profile?.preferences.includedFamilies ?? []).join(', '),
    excludedFamilies: (profile?.preferences.excludedFamilies ?? []).join(', '),
  }
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(entry))
    .slice(0, 50)
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

const SECTION_CLASS = 'grid gap-4'

function ProfileForm({ profile }: { profile: ProfileDTO | null }) {
  const [form, setForm] = React.useState<FormState>(() => stateFromProfile(profile))
  const saveProfile = useSaveProfile()
  const [validationError, setValidationError] = React.useState<string | null>(null)

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }))

  const submit = () => {
    setValidationError(null)

    const country = form.countryCode.trim().toUpperCase()
    if (country !== '' && !/^[A-Z]{2}$/.test(country)) {
      setValidationError('Country must be a 2-letter ISO code (for example GH, NG, KE) — or leave it empty.')
      return
    }
    const currency = form.incomeGoalCurrency.trim().toUpperCase()
    if (currency !== '' && !/^[A-Z]{3}$/.test(currency)) {
      setValidationError('Income goal currency must be a 3-letter ISO code (for example USD, GHS, EUR).')
      return
    }
    const weekly = Number.parseInt(form.weeklyHours.trim() === '' ? '0' : form.weeklyHours.trim(), 10)
    if (!Number.isInteger(weekly) || weekly < 0 || weekly > 80) {
      setValidationError('Weekly hours must be a whole number between 0 and 80.')
      return
    }
    const goal = form.incomeGoalAmount.trim()
    const goalNumber = goal === '' ? null : Number(goal)
    if (goalNumber !== null && (!Number.isFinite(goalNumber) || goalNumber < 0)) {
      setValidationError('Income goal must be a non-negative number — or leave it empty.')
      return
    }

    const payload = {
      displayName: form.displayName.trim() || undefined,
      countryCode: country || undefined,
      regionNote: form.regionNote.trim() || undefined,
      workMode: form.workMode as 'remote' | 'local' | 'hybrid' | 'any',
      languages: form.languages
        .filter((l) => l.code.trim() !== '')
        .map((l) => ({
          code: l.code.trim().toLowerCase(),
          proficiency: l.proficiency,
          note: l.note.trim() || undefined,
        })),
      skills: form.skills
        .filter((s) => s.name.trim() !== '')
        .map((s) => ({
          name: s.name.trim(),
          experienceBand: s.experienceBand as 'beginner' | 'intermediate' | 'advanced' | 'expert',
          evidenceNote: s.evidenceNote.trim() || undefined,
        })),
      qualifications: form.qualifications
        .filter((q) => q.type.trim() !== '')
        .map((q) => ({
          type: q.type.trim(),
          issuer: q.issuer.trim() || undefined,
          year: /^\d{4}$/.test(q.year.trim()) ? q.year.trim() : undefined,
          verificationState: q.verificationState as 'unverified' | 'user-attested' | 'verified',
        })),
      equipment: form.equipment
        .filter((e) => e.kind.trim() !== '')
        .map((e) => ({ kind: e.kind.trim(), note: e.note.trim() || undefined })),
      payoutCapabilities: form.payoutCapabilities
        .filter((p) => p.rail.trim() !== '')
        .map((p) => ({
          rail: p.rail.trim(),
          status: p.status as 'available' | 'unavailable' | 'unknown',
          note: p.note.trim() || undefined,
        })),
      preferences: {
        includedFamilies: parseCsv(form.includedFamilies),
        excludedFamilies: parseCsv(form.excludedFamilies),
      },
      weeklyHours: weekly,
      timezone: form.timezone.trim() || undefined,
      incomeGoalAmount: goalNumber,
      incomeGoalCurrency: currency || 'USD',
    }

    saveProfile.mutate(payload)
  }

  const dirty = saveProfile.isPending

  return (
    <div className="space-y-4">
      {validationError || saveProfile.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>
            <p>{validationError ?? (saveProfile.error instanceof Error ? saveProfile.error.message : 'Unknown error')}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Basics */}
      <Card className={SECTION_CLASS + ' p-4 sm:p-6'}>
        <CardHeader className="px-0">
          <CardTitle className="text-base">Basics</CardTitle>
          <p className="text-xs text-muted-foreground">
            Your country drives country-eligibility checks. Everything here stays private in this workspace.
          </p>
        </CardHeader>
        <CardContent className={SECTION_CLASS + ' px-0'}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pf-name">Display name</Label>
              <Input
                id="pf-name"
                value={form.displayName}
                onChange={(e) => set({ displayName: e.target.value })}
                placeholder="How providers should address you"
                className="h-11 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-country">Country (ISO 2-letter)</Label>
              <Input
                id="pf-country"
                value={form.countryCode}
                onChange={(e) => set({ countryCode: e.target.value.toUpperCase().slice(0, 2) })}
                placeholder="GH"
                inputMode="text"
                aria-describedby="pf-country-hint"
                className="h-11 sm:h-9"
              />
              <p id="pf-country-hint" className="text-xs text-muted-foreground">
                Used to check listing availability — never shared.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-region">Region / city note</Label>
              <Input
                id="pf-region"
                value={form.regionNote}
                onChange={(e) => set({ regionNote: e.target.value })}
                placeholder="e.g. Greater Accra"
                className="h-11 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-tz">Timezone</Label>
              <Input
                id="pf-tz"
                value={form.timezone}
                onChange={(e) => set({ timezone: e.target.value })}
                placeholder="e.g. Africa/Accra"
                className="h-11 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-workmode">Preferred work mode</Label>
              <Select value={form.workMode} onValueChange={(value) => set({ workMode: value })}>
                <SelectTrigger id="pf-workmode" className="h-11 w-full sm:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-hours">Weekly hours available</Label>
              <Input
                id="pf-hours"
                value={form.weeklyHours}
                onChange={(e) => set({ weeklyHours: e.target.value.replace(/[^\d]/g, '').slice(0, 2) })}
                placeholder="0–80"
                inputMode="numeric"
                className="h-11 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-goal">Income goal (amount)</Label>
              <Input
                id="pf-goal"
                value={form.incomeGoalAmount}
                onChange={(e) => set({ incomeGoalAmount: e.target.value.replace(/[^\d.]/g, '') })}
                placeholder="e.g. 300"
                inputMode="decimal"
                className="h-11 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-goal-cur">Income goal currency</Label>
              <Input
                id="pf-goal-cur"
                value={form.incomeGoalCurrency}
                onChange={(e) => set({ incomeGoalCurrency: e.target.value.toUpperCase().slice(0, 3) })}
                placeholder="USD"
                className="h-11 sm:h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Languages */}
      <Card className={SECTION_CLASS + ' p-4 sm:p-6'}>
        <CardHeader className="px-0">
          <CardTitle className="text-base">Languages</CardTitle>
          <p className="text-xs text-muted-foreground">
            Only claim levels you genuinely have — drafts quote exactly what is written here.
          </p>
        </CardHeader>
        <CardContent className={SECTION_CLASS + ' px-0'}>
          <div className="space-y-2">
            {form.languages.map((row, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_1.6fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`lang-code-${index}`} className="sr-only">Language code</Label>
                  <Input
                    id={`lang-code-${index}`}
                    value={row.code}
                    onChange={(e) => {
                      const next = [...form.languages]
                      next[index] = { ...row, code: e.target.value.toLowerCase().slice(0, 8) }
                      set({ languages: next })
                    }}
                    placeholder="en"
                    className="h-11 sm:h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`lang-prof-${index}`} className="sr-only">Proficiency</Label>
                  <Select
                    value={row.proficiency || 'intermediate'}
                    onValueChange={(value) => {
                      const next = [...form.languages]
                      next[index] = { ...row, proficiency: value }
                      set({ languages: next })
                    }}
                  >
                    <SelectTrigger id={`lang-prof-${index}`} className="h-11 w-full sm:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['beginner', 'intermediate', 'advanced', 'fluent', 'native', 'professional'].map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`lang-note-${index}`} className="sr-only">Note</Label>
                  <Input
                    id={`lang-note-${index}`}
                    value={row.note}
                    onChange={(e) => {
                      const next = [...form.languages]
                      next[index] = { ...row, note: e.target.value }
                      set({ languages: next })
                    }}
                    placeholder="Optional note (e.g. written vs spoken)"
                    className="h-11 sm:h-9"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-9"
                  aria-label={`Remove language row ${index + 1}`}
                  onClick={() => set({ languages: form.languages.filter((_, i) => i !== index) })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-9"
              onClick={() =>
                set({ languages: [...form.languages, { code: '', proficiency: 'intermediate', note: '' }] })
              }
            >
              <Plus aria-hidden="true" /> Add language
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Skills */}
      <Card className={SECTION_CLASS + ' p-4 sm:p-6'}>
        <CardHeader className="px-0">
          <CardTitle className="text-base">Skills</CardTitle>
          <p className="text-xs text-muted-foreground">
            Skills you actually have — gaps are never hidden from listings.
          </p>
        </CardHeader>
        <CardContent className={SECTION_CLASS + ' px-0'}>
          <div className="space-y-2">
            {form.skills.map((row, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1.6fr_1fr_1.6fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`skill-name-${index}`} className="sr-only">Skill</Label>
                  <Input
                    id={`skill-name-${index}`}
                    value={row.name}
                    onChange={(e) => {
                      const next = [...form.skills]
                      next[index] = { ...row, name: e.target.value }
                      set({ skills: next })
                    }}
                    placeholder="e.g. Excel, Proofreading"
                    className="h-11 sm:h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`skill-band-${index}`} className="sr-only">Experience band</Label>
                  <Select
                    value={row.experienceBand || 'intermediate'}
                    onValueChange={(value) => {
                      const next = [...form.skills]
                      next[index] = { ...row, experienceBand: value }
                      set({ skills: next })
                    }}
                  >
                    <SelectTrigger id={`skill-band-${index}`} className="h-11 w-full sm:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['beginner', 'intermediate', 'advanced', 'expert'].map((band) => (
                        <SelectItem key={band} value={band}>
                          {band}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`skill-ev-${index}`} className="sr-only">Evidence note</Label>
                  <Input
                    id={`skill-ev-${index}`}
                    value={row.evidenceNote}
                    onChange={(e) => {
                      const next = [...form.skills]
                      next[index] = { ...row, evidenceNote: e.target.value }
                      set({ skills: next })
                    }}
                    placeholder="Optional: where this experience comes from"
                    className="h-11 sm:h-9"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-9"
                  aria-label={`Remove skill row ${index + 1}`}
                  onClick={() => set({ skills: form.skills.filter((_, i) => i !== index) })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-9"
              onClick={() =>
                set({ skills: [...form.skills, { name: '', experienceBand: 'intermediate', evidenceNote: '' }] })
              }
            >
              <Plus aria-hidden="true" /> Add skill
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Qualifications */}
      <Card className={SECTION_CLASS + ' p-4 sm:p-6'}>
        <CardHeader className="px-0">
          <CardTitle className="text-base">Qualifications</CardTitle>
          <p className="text-xs text-muted-foreground">
            Verification states are kept honest: unverified is the default, and drafts show the state.
          </p>
        </CardHeader>
        <CardContent className={SECTION_CLASS + ' px-0'}>
          <div className="space-y-2">
            {form.qualifications.map((row, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1.4fr_1.2fr_0.8fr_1.2fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`qual-type-${index}`} className="sr-only">Title</Label>
                  <Input
                    id={`qual-type-${index}`}
                    value={row.type}
                    onChange={(e) => {
                      const next = [...form.qualifications]
                      next[index] = { ...row, type: e.target.value }
                      set({ qualifications: next })
                    }}
                    placeholder="e.g. Diploma, certificate"
                    className="h-11 sm:h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`qual-issuer-${index}`} className="sr-only">Issuer</Label>
                  <Input
                    id={`qual-issuer-${index}`}
                    value={row.issuer}
                    onChange={(e) => {
                      const next = [...form.qualifications]
                      next[index] = { ...row, issuer: e.target.value }
                      set({ qualifications: next })
                    }}
                    placeholder="Issuer"
                    className="h-11 sm:h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`qual-year-${index}`} className="sr-only">Year</Label>
                  <Input
                    id={`qual-year-${index}`}
                    value={row.year}
                    onChange={(e) => {
                      const next = [...form.qualifications]
                      next[index] = { ...row, year: e.target.value.replace(/[^\d]/g, '').slice(0, 4) }
                      set({ qualifications: next })
                    }}
                    placeholder="2023"
                    inputMode="numeric"
                    className="h-11 sm:h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`qual-state-${index}`} className="sr-only">Verification state</Label>
                  <Select
                    value={row.verificationState || 'unverified'}
                    onValueChange={(value) => {
                      const next = [...form.qualifications]
                      next[index] = { ...row, verificationState: value }
                      set({ qualifications: next })
                    }}
                  >
                    <SelectTrigger id={`qual-state-${index}`} className="h-11 w-full sm:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unverified">unverified</SelectItem>
                      <SelectItem value="user-attested">user-attested</SelectItem>
                      <SelectItem value="verified">verified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-9"
                  aria-label={`Remove qualification row ${index + 1}`}
                  onClick={() => set({ qualifications: form.qualifications.filter((_, i) => i !== index) })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-9"
              onClick={() =>
                set({
                  qualifications: [
                    ...form.qualifications,
                    { type: '', issuer: '', year: '', verificationState: 'unverified' },
                  ],
                })
              }
            >
              <Plus aria-hidden="true" /> Add qualification
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Equipment + payout capabilities */}
      <Card className={SECTION_CLASS + ' p-4 sm:p-6'}>
        <CardHeader className="px-0">
          <CardTitle className="text-base">Equipment & payout capabilities</CardTitle>
          <p className="text-xs text-muted-foreground">
            Payout rails you can actually receive money through. A rail marked available here is
            your own claim — it is never treated as proof a source pays into it.
          </p>
        </CardHeader>
        <CardContent className={SECTION_CLASS + ' px-0'}>
          <div className="space-y-2">
            {form.equipment.map((row, index) => (
              <div key={`eq-${index}`} className="grid gap-2 sm:grid-cols-[1.4fr_1.8fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`eq-kind-${index}`} className="sr-only">Equipment</Label>
                  <Input
                    id={`eq-kind-${index}`}
                    value={row.kind}
                    onChange={(e) => {
                      const next = [...form.equipment]
                      next[index] = { ...row, kind: e.target.value }
                      set({ equipment: next })
                    }}
                    placeholder="e.g. Laptop, headset"
                    className="h-11 sm:h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`eq-note-${index}`} className="sr-only">Note</Label>
                  <Input
                    id={`eq-note-${index}`}
                    value={row.note}
                    onChange={(e) => {
                      const next = [...form.equipment]
                      next[index] = { ...row, note: e.target.value }
                      set({ equipment: next })
                    }}
                    placeholder="Optional note"
                    className="h-11 sm:h-9"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-9"
                  aria-label={`Remove equipment row ${index + 1}`}
                  onClick={() => set({ equipment: form.equipment.filter((_, i) => i !== index) })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-9"
              onClick={() => set({ equipment: [...form.equipment, { kind: '', note: '' }] })}
            >
              <Plus aria-hidden="true" /> Add equipment
            </Button>
          </div>

          <div className="space-y-2 pt-2">
            {form.payoutCapabilities.map((row, index) => (
              <div key={`pay-${index}`} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1.8fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`pay-rail-${index}`} className="sr-only">Payout rail</Label>
                  <Input
                    id={`pay-rail-${index}`}
                    value={row.rail}
                    onChange={(e) => {
                      const next = [...form.payoutCapabilities]
                      next[index] = { ...row, rail: e.target.value }
                      set({ payoutCapabilities: next })
                    }}
                    placeholder="e.g. PayPal, mobile money"
                    className="h-11 sm:h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`pay-status-${index}`} className="sr-only">Status</Label>
                  <Select
                    value={row.status || 'unknown'}
                    onValueChange={(value) => {
                      const next = [...form.payoutCapabilities]
                      next[index] = { ...row, status: value }
                      set({ payoutCapabilities: next })
                    }}
                  >
                    <SelectTrigger id={`pay-status-${index}`} className="h-11 w-full sm:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">available</SelectItem>
                      <SelectItem value="unavailable">unavailable</SelectItem>
                      <SelectItem value="unknown">unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`pay-note-${index}`} className="sr-only">Note</Label>
                  <Input
                    id={`pay-note-${index}`}
                    value={row.note}
                    onChange={(e) => {
                      const next = [...form.payoutCapabilities]
                      next[index] = { ...row, note: e.target.value }
                      set({ payoutCapabilities: next })
                    }}
                    placeholder="Optional note"
                    className="h-11 sm:h-9"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-9"
                  aria-label={`Remove payout row ${index + 1}`}
                  onClick={() => set({ payoutCapabilities: form.payoutCapabilities.filter((_, i) => i !== index) })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-9"
              onClick={() =>
                set({ payoutCapabilities: [...form.payoutCapabilities, { rail: '', status: 'unknown', note: '' }] })
              }
            >
              <Plus aria-hidden="true" /> Add payout capability
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card className={SECTION_CLASS + ' p-4 sm:p-6'}>
        <CardHeader className="px-0">
          <CardTitle className="text-base">Opportunity family preferences</CardTitle>
          <p className="text-xs text-muted-foreground">
            Optional include/exclude slugs (comma-separated). Sources that offer a family list can
            honour these; nothing is filtered behind your back.
          </p>
        </CardHeader>
        <CardContent className={SECTION_CLASS + ' px-0'}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pf-inc">Included families</Label>
              <Input
                id="pf-inc"
                value={form.includedFamilies}
                onChange={(e) => set({ includedFamilies: e.target.value })}
                placeholder="e.g. annotation, translation"
                className="h-11 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-exc">Excluded families</Label>
              <Input
                id="pf-exc"
                value={form.excludedFamilies}
                onChange={(e) => set({ excludedFamilies: e.target.value })}
                placeholder="e.g. sales-calls"
                className="h-11 sm:h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button className="h-11 px-6 sm:h-9" disabled={dirty} onClick={submit}>
          <Save aria-hidden="true" />
          {dirty ? 'Saving…' : 'Save profile'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Private by default — it only ever stays in this workspace and computes your local
          eligibility checks.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab wrapper (loading / error / empty states + remount-on-save)
// ---------------------------------------------------------------------------

export function ProfileTab() {
  const { data, isPending, isError, error, refetch } = useProfile()
  const profile = data ?? null

  return (
    <div className="space-y-4">
      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <QueryError
          title="Profile could not be loaded"
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {profile ? (
              <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">
                Profile saved · updated{' '}
                {profile.updatedAt ? new Date(profile.updatedAt).toLocaleString() : 'unknown'}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-800 dark:text-amber-400">
                No profile yet — nothing is assumed about you
              </Badge>
            )}
          </div>
          {/* Remount on server-side updatedAt so a completed save is reflected
              without clobbering in-progress edits. */}
          <ProfileForm key={profile?.updatedAt ?? 'empty'} profile={profile} />
        </>
      )}
    </div>
  )
}
