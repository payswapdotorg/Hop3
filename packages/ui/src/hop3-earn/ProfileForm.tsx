/**
 * Hop3 Earn — worker profile form (Stage 1 UI port).
 *
 * DOMAIN-MODEL worker capability profile: skills, languages, qualifications,
 * country, availability, equipment, income goal and payout capabilities.
 * Private by default: the data stays in the user's workspace and only ever
 * computes local eligibility/economics and truthful draft materials.
 *
 * The form initializes from the saved profile (remounted on server updatedAt
 * so saved values never clobber in-progress edits), validates client-side,
 * and the service validates again.
 */

import * as React from "react";
import { AlertTriangle, Save } from "lucide-react";

import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { EarnProfileInput, ProfileDTO } from "@zcode/shared";

import {
  EquipmentRowsEditor,
  LanguageRowsEditor,
  PayoutRowsEditor,
  QualificationRowsEditor,
  SkillRowsEditor,
  type EquipmentRow,
  type LanguageRow,
  type PayoutRow,
  type QualificationRow,
  type SkillRow,
} from "./ProfileRowSections.js";
import { describeEarnError, useSaveProfile } from "./useEarnData.js";
import type { IEarnService } from "./contract.js";

// ---------------------------------------------------------------------------
// Form state + payload
// ---------------------------------------------------------------------------

interface FormState {
  displayName: string;
  countryCode: string;
  regionNote: string;
  workMode: string;
  timezone: string;
  weeklyHours: string;
  incomeGoalAmount: string;
  incomeGoalCurrency: string;
  languages: LanguageRow[];
  skills: SkillRow[];
  qualifications: QualificationRow[];
  equipment: EquipmentRow[];
  payoutCapabilities: PayoutRow[];
  includedFamilies: string;
  excludedFamilies: string;
}

function stateFromProfile(profile: ProfileDTO | null): FormState {
  return {
    displayName: profile?.displayName ?? "",
    countryCode: profile?.countryCode ?? "",
    regionNote: profile?.regionNote ?? "",
    workMode: profile?.workMode ?? "any",
    timezone: profile?.timezone ?? "",
    weeklyHours: profile ? String(profile.weeklyHours ?? 0) : "",
    incomeGoalAmount: profile?.incomeGoalAmount != null ? String(profile.incomeGoalAmount) : "",
    incomeGoalCurrency: profile?.incomeGoalCurrency ?? "USD",
    languages: (profile?.languages ?? []).map((l) => ({
      code: l.code,
      proficiency: l.proficiency,
      note: l.note ?? "",
    })),
    skills: (profile?.skills ?? []).map((s) => ({
      name: s.name,
      experienceBand: s.experienceBand,
      evidenceNote: s.evidenceNote ?? "",
    })),
    qualifications: (profile?.qualifications ?? []).map((q) => ({
      type: q.type,
      issuer: q.issuer ?? "",
      year: q.year ?? "",
      verificationState: q.verificationState,
    })),
    equipment: (profile?.equipment ?? []).map((e) => ({ kind: e.kind, note: e.note ?? "" })),
    payoutCapabilities: (profile?.payoutCapabilities ?? []).map((p) => ({
      rail: p.rail,
      status: p.status,
      note: p.note ?? "",
    })),
    includedFamilies: (profile?.preferences.includedFamilies ?? []).join(", "),
    excludedFamilies: (profile?.preferences.excludedFamilies ?? []).join(", "),
  };
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(entry))
    .slice(0, 50);
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export function ProfileForm({
  service,
  profile,
}: {
  service: IEarnService | null;
  profile: ProfileDTO | null;
}) {
  const { intl } = useZCodeIntl();
  const [form, setForm] = React.useState<FormState>(() => stateFromProfile(profile));
  const saveProfile = useSaveProfile(service);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = () => {
    setValidationError(null);

    const country = form.countryCode.trim().toUpperCase();
    if (country !== "" && !/^[A-Z]{2}$/.test(country)) {
      setValidationError(intl.formatMessage({ id: "earn.profile.validation.country" }));
      return;
    }
    const currency = form.incomeGoalCurrency.trim().toUpperCase();
    if (currency !== "" && !/^[A-Z]{3}$/.test(currency)) {
      setValidationError(intl.formatMessage({ id: "earn.profile.validation.currency" }));
      return;
    }
    const weekly = Number.parseInt(form.weeklyHours.trim() === "" ? "0" : form.weeklyHours.trim(), 10);
    if (!Number.isInteger(weekly) || weekly < 0 || weekly > 80) {
      setValidationError(intl.formatMessage({ id: "earn.profile.validation.weeklyHours" }));
      return;
    }
    const goal = form.incomeGoalAmount.trim();
    const goalNumber = goal === "" ? null : Number(goal);
    if (goalNumber !== null && (!Number.isFinite(goalNumber) || goalNumber < 0)) {
      setValidationError(intl.formatMessage({ id: "earn.profile.validation.incomeGoal" }));
      return;
    }

    const payload: EarnProfileInput = {
      displayName: form.displayName.trim() || undefined,
      countryCode: country || undefined,
      regionNote: form.regionNote.trim() || undefined,
      workMode: form.workMode,
      languages: form.languages
        .filter((l) => l.code.trim() !== "")
        .map((l) => ({
          code: l.code.trim().toLowerCase(),
          proficiency: l.proficiency,
          note: l.note.trim() || undefined,
        })),
      skills: form.skills
        .filter((s) => s.name.trim() !== "")
        .map((s) => ({
          name: s.name.trim(),
          experienceBand: s.experienceBand,
          evidenceNote: s.evidenceNote.trim() || undefined,
        })),
      qualifications: form.qualifications
        .filter((q) => q.type.trim() !== "")
        .map((q) => ({
          type: q.type.trim(),
          issuer: q.issuer.trim() || undefined,
          year: /^\d{4}$/.test(q.year.trim()) ? q.year.trim() : undefined,
          verificationState: q.verificationState,
        })),
      equipment: form.equipment
        .filter((e) => e.kind.trim() !== "")
        .map((e) => ({ kind: e.kind.trim(), note: e.note.trim() || undefined })),
      payoutCapabilities: form.payoutCapabilities
        .filter((p) => p.rail.trim() !== "")
        .map((p) => ({
          rail: p.rail.trim(),
          status: p.status as "available" | "unavailable" | "unknown",
          note: p.note.trim() || undefined,
        })),
      preferences: {
        includedFamilies: parseCsv(form.includedFamilies),
        excludedFamilies: parseCsv(form.excludedFamilies),
      },
      weeklyHours: weekly,
      timezone: form.timezone.trim() || undefined,
      incomeGoalAmount: goalNumber,
      incomeGoalCurrency: currency || "USD",
    };

    void saveProfile.mutate(payload);
  };

  const dirty = saveProfile.isPending;

  return (
    <div className="space-y-4">
      {validationError || (saveProfile.isError && saveProfile.error) ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive-surface px-3 py-2 text-ui-xs text-foreground"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">{intl.formatMessage({ id: "earn.profile.couldNotSave" })}</p>
            <p className="text-foreground-subtle">
              {validationError ??
                describeEarnError(saveProfile.error, intl)}
            </p>
          </div>
        </div>
      ) : null}

      {/* Basics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-ui-base">
            {intl.formatMessage({ id: "earn.profile.basics.title" })}
          </CardTitle>
          <CardDescription>
            {intl.formatMessage({ id: "earn.profile.basics.hint" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pf-name">
                {intl.formatMessage({ id: "earn.profile.displayName" })}
              </Label>
              <Input
                id="pf-name"
                value={form.displayName}
                onChange={(event) => set({ displayName: event.target.value })}
                placeholder={intl.formatMessage({ id: "earn.profile.displayName.placeholder" })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-country">
                {intl.formatMessage({ id: "earn.profile.country" })}
              </Label>
              <Input
                id="pf-country"
                value={form.countryCode}
                onChange={(event) =>
                  set({ countryCode: event.target.value.toUpperCase().slice(0, 2) })
                }
                placeholder="GH"
                inputMode="text"
                aria-describedby="pf-country-hint"
              />
              <p id="pf-country-hint" className="text-ui-xs text-foreground-subtle">
                {intl.formatMessage({ id: "earn.profile.country.hint" })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-region">
                {intl.formatMessage({ id: "earn.profile.region" })}
              </Label>
              <Input
                id="pf-region"
                value={form.regionNote}
                onChange={(event) => set({ regionNote: event.target.value })}
                placeholder={intl.formatMessage({ id: "earn.profile.region.placeholder" })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-tz">
                {intl.formatMessage({ id: "earn.profile.timezone" })}
              </Label>
              <Input
                id="pf-tz"
                value={form.timezone}
                onChange={(event) => set({ timezone: event.target.value })}
                placeholder={intl.formatMessage({ id: "earn.profile.timezone.placeholder" })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-workmode">
                {intl.formatMessage({ id: "earn.profile.workMode" })}
              </Label>
              <Select value={form.workMode} onValueChange={(value) => set({ workMode: value })}>
                <SelectTrigger id="pf-workmode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["any", "remote", "local", "hybrid"].map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {intl.formatMessage({ id: `earn.profile.workMode.${mode}` })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-hours">
                {intl.formatMessage({ id: "earn.profile.weeklyHours" })}
              </Label>
              <Input
                id="pf-hours"
                value={form.weeklyHours}
                onChange={(event) =>
                  set({ weeklyHours: event.target.value.replace(/[^\d]/g, "").slice(0, 2) })
                }
                placeholder="0–80"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-goal">
                {intl.formatMessage({ id: "earn.profile.incomeGoal" })}
              </Label>
              <Input
                id="pf-goal"
                value={form.incomeGoalAmount}
                onChange={(event) =>
                  set({ incomeGoalAmount: event.target.value.replace(/[^\d.]/g, "") })
                }
                placeholder={intl.formatMessage({ id: "earn.profile.incomeGoal.placeholder" })}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-goal-cur">
                {intl.formatMessage({ id: "earn.profile.incomeGoal.currency" })}
              </Label>
              <Input
                id="pf-goal-cur"
                value={form.incomeGoalCurrency}
                onChange={(event) =>
                  set({ incomeGoalCurrency: event.target.value.toUpperCase().slice(0, 3) })
                }
                placeholder="USD"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Languages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-ui-base">
            {intl.formatMessage({ id: "earn.profile.languages.title" })}
          </CardTitle>
          <CardDescription>
            {intl.formatMessage({ id: "earn.profile.languages.hint" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <LanguageRowsEditor rows={form.languages} onChange={(languages) => set({ languages })} />
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader>
          <CardTitle className="text-ui-base">
            {intl.formatMessage({ id: "earn.profile.skills.title" })}
          </CardTitle>
          <CardDescription>
            {intl.formatMessage({ id: "earn.profile.skills.hint" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SkillRowsEditor rows={form.skills} onChange={(skills) => set({ skills })} />
        </CardContent>
      </Card>

      {/* Qualifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-ui-base">
            {intl.formatMessage({ id: "earn.profile.qualifications.title" })}
          </CardTitle>
          <CardDescription>
            {intl.formatMessage({ id: "earn.profile.qualifications.hint" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <QualificationRowsEditor
            rows={form.qualifications}
            onChange={(qualifications) => set({ qualifications })}
          />
        </CardContent>
      </Card>

      {/* Equipment + payout capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-ui-base">
            {intl.formatMessage({ id: "earn.profile.equipmentPayout.title" })}
          </CardTitle>
          <CardDescription>
            {intl.formatMessage({ id: "earn.profile.equipmentPayout.hint" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <EquipmentRowsEditor rows={form.equipment} onChange={(equipment) => set({ equipment })} />
          <div className="space-y-2 pt-2">
            <PayoutRowsEditor
              rows={form.payoutCapabilities}
              onChange={(payoutCapabilities) => set({ payoutCapabilities })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-ui-base">
            {intl.formatMessage({ id: "earn.profile.preferences.title" })}
          </CardTitle>
          <CardDescription>
            {intl.formatMessage({ id: "earn.profile.preferences.hint" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pf-inc">
                {intl.formatMessage({ id: "earn.profile.included" })}
              </Label>
              <Input
                id="pf-inc"
                value={form.includedFamilies}
                onChange={(event) => set({ includedFamilies: event.target.value })}
                placeholder={intl.formatMessage({ id: "earn.profile.included.placeholder" })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-exc">
                {intl.formatMessage({ id: "earn.profile.excluded" })}
              </Label>
              <Input
                id="pf-exc"
                value={form.excludedFamilies}
                onChange={(event) => set({ excludedFamilies: event.target.value })}
                placeholder={intl.formatMessage({ id: "earn.profile.excluded.placeholder" })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={dirty} onClick={submit}>
          <Save aria-hidden="true" />
          {dirty
            ? intl.formatMessage({ id: "earn.profile.saving" })
            : intl.formatMessage({ id: "earn.profile.save" })}
        </Button>
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "earn.profile.privateNote" })}
        </p>
      </div>
    </div>
  );
}
