/**
 * Hop3 Earn — profile row editors (Stage 1 UI port).
 *
 * Repeated list-row editors for languages / skills / qualifications /
 * equipment / payout capabilities. Only rows the user fills are kept; empty
 * rows are filtered at submit time (ProfileForm). Verification states and
 * proficiency bands stay honest labels — never auto-upgraded.
 */

import { Plus, Trash2 } from "lucide-react";

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
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export interface LanguageRow {
  code: string;
  proficiency: string;
  note: string;
}
export interface SkillRow {
  name: string;
  experienceBand: string;
  evidenceNote: string;
}
export interface QualificationRow {
  type: string;
  issuer: string;
  year: string;
  verificationState: string;
}
export interface EquipmentRow {
  kind: string;
  note: string;
}
export interface PayoutRow {
  rail: string;
  status: string;
  note: string;
}

const LANGUAGE_PROFICIENCIES = [
  "beginner",
  "intermediate",
  "advanced",
  "fluent",
  "native",
  "professional",
] as const;

const SKILL_BANDS = ["beginner", "intermediate", "advanced", "expert"] as const;

const VERIFICATION_STATES = ["unverified", "user-attested", "verified"] as const;

const PAYOUT_STATUSES = ["available", "unavailable", "unknown"] as const;

function RemoveRowButton({ ariaLabel, onClick }: { ariaLabel: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={ariaLabel} className="self-start" onClick={onClick}>
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus aria-hidden="true" />
      {label}
    </Button>
  );
}

export function LanguageRowsEditor({
  rows,
  onChange,
}: {
  rows: LanguageRow[];
  onChange: (rows: LanguageRow[]) => void;
}) {
  const { intl } = useZCodeIntl();
  const update = (index: number, patch: Partial<LanguageRow>) => {
    const next = [...rows];
    next[index] = { ...rows[index]!, ...patch };
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_1.6fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor={`lang-code-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.languages.code" })}
            </Label>
            <Input
              id={`lang-code-${index}`}
              value={row.code}
              onChange={(event) =>
                update(index, { code: event.target.value.toLowerCase().slice(0, 8) })
              }
              placeholder="en"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`lang-prof-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.languages.proficiency" })}
            </Label>
            <Select
              value={row.proficiency || "intermediate"}
              onValueChange={(value) => update(index, { proficiency: value })}
            >
              <SelectTrigger id={`lang-prof-${index}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_PROFICIENCIES.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`lang-note-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.languages.note" })}
            </Label>
            <Input
              id={`lang-note-${index}`}
              value={row.note}
              onChange={(event) => update(index, { note: event.target.value })}
              placeholder={intl.formatMessage({ id: "earn.profile.languages.notePlaceholder" })}
            />
          </div>
          <RemoveRowButton
            ariaLabel={intl.formatMessage(
              { id: "earn.profile.removeRow" },
              {
                what: intl.formatMessage({ id: "earn.profile.removeRow.language" }),
                index: index + 1,
              },
            )}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <AddRowButton
        label={intl.formatMessage({ id: "earn.profile.languages.add" })}
        onClick={() =>
          onChange([...rows, { code: "", proficiency: "intermediate", note: "" }])
        }
      />
    </div>
  );
}

export function SkillRowsEditor({
  rows,
  onChange,
}: {
  rows: SkillRow[];
  onChange: (rows: SkillRow[]) => void;
}) {
  const { intl } = useZCodeIntl();
  const update = (index: number, patch: Partial<SkillRow>) => {
    const next = [...rows];
    next[index] = { ...rows[index]!, ...patch };
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1.6fr_1fr_1.6fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor={`skill-name-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.skills.name" })}
            </Label>
            <Input
              id={`skill-name-${index}`}
              value={row.name}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder={intl.formatMessage({ id: "earn.profile.skills.namePlaceholder" })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`skill-band-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.skills.band" })}
            </Label>
            <Select
              value={row.experienceBand || "intermediate"}
              onValueChange={(value) => update(index, { experienceBand: value })}
            >
              <SelectTrigger id={`skill-band-${index}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKILL_BANDS.map((band) => (
                  <SelectItem key={band} value={band}>
                    {band}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`skill-ev-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.skills.evidence" })}
            </Label>
            <Input
              id={`skill-ev-${index}`}
              value={row.evidenceNote}
              onChange={(event) => update(index, { evidenceNote: event.target.value })}
              placeholder={intl.formatMessage({ id: "earn.profile.skills.evidencePlaceholder" })}
            />
          </div>
          <RemoveRowButton
            ariaLabel={intl.formatMessage(
              { id: "earn.profile.removeRow" },
              {
                what: intl.formatMessage({ id: "earn.profile.removeRow.skill" }),
                index: index + 1,
              },
            )}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <AddRowButton
        label={intl.formatMessage({ id: "earn.profile.skills.add" })}
        onClick={() =>
          onChange([...rows, { name: "", experienceBand: "intermediate", evidenceNote: "" }])
        }
      />
    </div>
  );
}

export function QualificationRowsEditor({
  rows,
  onChange,
}: {
  rows: QualificationRow[];
  onChange: (rows: QualificationRow[]) => void;
}) {
  const { intl } = useZCodeIntl();
  const update = (index: number, patch: Partial<QualificationRow>) => {
    const next = [...rows];
    next[index] = { ...rows[index]!, ...patch };
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1.4fr_1.2fr_0.8fr_1.2fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor={`qual-type-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.qualifications.type" })}
            </Label>
            <Input
              id={`qual-type-${index}`}
              value={row.type}
              onChange={(event) => update(index, { type: event.target.value })}
              placeholder={intl.formatMessage({ id: "earn.profile.qualifications.typePlaceholder" })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`qual-issuer-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.qualifications.issuer" })}
            </Label>
            <Input
              id={`qual-issuer-${index}`}
              value={row.issuer}
              onChange={(event) => update(index, { issuer: event.target.value })}
              placeholder={intl.formatMessage({ id: "earn.profile.qualifications.issuer" })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`qual-year-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.qualifications.year" })}
            </Label>
            <Input
              id={`qual-year-${index}`}
              value={row.year}
              onChange={(event) =>
                update(index, { year: event.target.value.replace(/[^\d]/g, "").slice(0, 4) })
              }
              placeholder="2023"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`qual-state-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.qualifications.state" })}
            </Label>
            <Select
              value={row.verificationState || "unverified"}
              onValueChange={(value) => update(index, { verificationState: value })}
            >
              <SelectTrigger id={`qual-state-${index}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERIFICATION_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <RemoveRowButton
            ariaLabel={intl.formatMessage(
              { id: "earn.profile.removeRow" },
              {
                what: intl.formatMessage({ id: "earn.profile.removeRow.qualification" }),
                index: index + 1,
              },
            )}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <AddRowButton
        label={intl.formatMessage({ id: "earn.profile.qualifications.add" })}
        onClick={() =>
          onChange([
            ...rows,
            { type: "", issuer: "", year: "", verificationState: "unverified" },
          ])
        }
      />
    </div>
  );
}

export function EquipmentRowsEditor({
  rows,
  onChange,
}: {
  rows: EquipmentRow[];
  onChange: (rows: EquipmentRow[]) => void;
}) {
  const { intl } = useZCodeIntl();
  const update = (index: number, patch: Partial<EquipmentRow>) => {
    const next = [...rows];
    next[index] = { ...rows[index]!, ...patch };
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={`eq-${index}`} className="grid gap-2 sm:grid-cols-[1.4fr_1.8fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor={`eq-kind-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.equipment.kind" })}
            </Label>
            <Input
              id={`eq-kind-${index}`}
              value={row.kind}
              onChange={(event) => update(index, { kind: event.target.value })}
              placeholder={intl.formatMessage({ id: "earn.profile.equipment.placeholder" })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`eq-note-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.equipment.note" })}
            </Label>
            <Input
              id={`eq-note-${index}`}
              value={row.note}
              onChange={(event) => update(index, { note: event.target.value })}
              placeholder={intl.formatMessage({ id: "earn.profile.equipment.notePlaceholder" })}
            />
          </div>
          <RemoveRowButton
            ariaLabel={intl.formatMessage(
              { id: "earn.profile.removeRow" },
              {
                what: intl.formatMessage({ id: "earn.profile.removeRow.equipment" }),
                index: index + 1,
              },
            )}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <AddRowButton
        label={intl.formatMessage({ id: "earn.profile.equipment.add" })}
        onClick={() => onChange([...rows, { kind: "", note: "" }])}
      />
    </div>
  );
}

export function PayoutRowsEditor({
  rows,
  onChange,
}: {
  rows: PayoutRow[];
  onChange: (rows: PayoutRow[]) => void;
}) {
  const { intl } = useZCodeIntl();
  const update = (index: number, patch: Partial<PayoutRow>) => {
    const next = [...rows];
    next[index] = { ...rows[index]!, ...patch };
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={`pay-${index}`} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1.8fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor={`pay-rail-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.payout.rail" })}
            </Label>
            <Input
              id={`pay-rail-${index}`}
              value={row.rail}
              onChange={(event) => update(index, { rail: event.target.value })}
              placeholder={intl.formatMessage({ id: "earn.profile.payout.railPlaceholder" })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`pay-status-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.payout.status" })}
            </Label>
            <Select
              value={row.status || "unknown"}
              onValueChange={(value) => update(index, { status: value })}
            >
              <SelectTrigger id={`pay-status-${index}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYOUT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`pay-note-${index}`} className="sr-only">
              {intl.formatMessage({ id: "earn.profile.payout.note" })}
            </Label>
            <Input
              id={`pay-note-${index}`}
              value={row.note}
              onChange={(event) => update(index, { note: event.target.value })}
              placeholder={intl.formatMessage({ id: "earn.profile.payout.notePlaceholder" })}
            />
          </div>
          <RemoveRowButton
            ariaLabel={intl.formatMessage(
              { id: "earn.profile.removeRow" },
              {
                what: intl.formatMessage({ id: "earn.profile.removeRow.payout" }),
                index: index + 1,
              },
            )}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <AddRowButton
        label={intl.formatMessage({ id: "earn.profile.payout.add" })}
        onClick={() =>
          onChange([...rows, { rail: "", status: "unknown", note: "" }])
        }
      />
    </div>
  );
}
