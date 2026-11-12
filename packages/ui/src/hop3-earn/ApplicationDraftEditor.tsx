/**
 * Hop3 Earn — application draft editor (Stage 1 UI port).
 *
 * Drafts are generated from truthful profile facts, edited by the user, and
 * marked "prepared" only when a draft exists (reviewed). Saving edits marks
 * draftEditedByUser. There is no submit path anywhere in this editor.
 */

import * as React from "react";
import { CheckCircle2, LoaderCircle, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import { Label } from "@/components/ui/label.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { NO_AUTO_SUBMIT_NOTICE, type ApplicationDTO } from "@zcode/shared";

import { SUCCESS_OUTLINE } from "./badges.js";
import { parseApplicationDraft } from "./format.js";
import { describeEarnError, useSaveDraft } from "./useEarnData.js";
import { useFormat } from "./useFormat.js";
import type { IEarnService } from "./contract.js";

export function ApplicationDraftEditor({
  service,
  application,
}: {
  service: IEarnService | null;
  application: ApplicationDTO;
}) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const draft = parseApplicationDraft(application.draft);
  const [text, setText] = React.useState(draft?.messageDraft ?? "");
  const saveDraft = useSaveDraft(service);

  // Re-sync when the server draft changes (regeneration or refetch).
  React.useEffect(() => {
    setText(parseApplicationDraft(application.draft)?.messageDraft ?? "");
  }, [application.draft]);

  const dirty = text !== (draft?.messageDraft ?? "");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {application.draftEditedByUser ? (
          <Badge variant="outline" className={SUCCESS_OUTLINE}>
            {intl.formatMessage({ id: "earn.app.draft.editedByYou" })}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-warning">
            {intl.formatMessage({ id: "earn.app.draft.generated" })}
          </Badge>
        )}
        {application.draftModel ? (
          <Badge variant="secondary">
            {intl.formatMessage(
              { id: "earn.app.draft.template" },
              { model: application.draftModel },
            )}
          </Badge>
        ) : null}
        {application.draftGeneratedAt ? (
          <span className="text-ui-xs text-foreground-subtle">
            {intl.formatMessage(
              { id: "earn.app.draft.generatedAt" },
              { when: format.shortAbsoluteTime(application.draftGeneratedAt) },
            )}
          </span>
        ) : null}
      </div>

      {draft && draft.checklist.length > 0 ? (
        <div className="space-y-1">
          <p className="text-ui-xs font-medium">
            {intl.formatMessage({ id: "earn.app.draft.checklist" })}
          </p>
          <ul className="space-y-1">
            {draft.checklist.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-ui-xs text-foreground-subtle">
                <CheckCircle2
                  className="mt-0.5 size-3.5 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`draft-${application.id}`} className="text-ui-xs">
          {intl.formatMessage({ id: "earn.app.draft.messageLabel" })}
        </Label>
        <Textarea
          id={`draft-${application.id}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={Math.min(20, Math.max(8, Math.ceil(text.length / 90)))}
          className="text-ui-sm leading-relaxed"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
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
          {saveDraft.isPending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Pencil aria-hidden="true" />
          )}
          {saveDraft.isPending
            ? intl.formatMessage({ id: "earn.app.draft.saving" })
            : intl.formatMessage({ id: "earn.app.draft.save" })}
        </Button>
        <span className="text-ui-xs text-foreground-subtle">
          {draft?.notice ?? NO_AUTO_SUBMIT_NOTICE}
        </span>
      </div>
      {saveDraft.isError && saveDraft.error ? (
        <p role="alert" className="text-ui-xs text-destructive">
          {describeEarnError(saveDraft.error, intl)}
        </p>
      ) : null}
    </div>
  );
}
