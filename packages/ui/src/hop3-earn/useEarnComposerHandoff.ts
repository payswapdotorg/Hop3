/**
 * Hop3 Earn — D6 composer handoff (Stage 1 UI port).
 *
 * Mirrors `startDraftInWorkspace` (packages/ui/src/root/useRootWorkspaceActions.ts)
 * step by step over the SAME store path:
 *
 *   readComposerWorkspaceScope → resolveComposerScope → readV4ComposerDraft
 *   → rememberComposerWorkspaceScope → persistV4ComposerDraft
 *   → useZCodeSessionStore.getState().startDraft(...)
 *   → persistV4ComposerDraft({ text }) + requestComposerTextInsert(text)
 *
 * The application draft text is PREFILLED ONLY — there is no send/submit path
 * anywhere in this hook (NO_AUTO_SUBMIT_NOTICE is rendered alongside it).
 * The pane/workbench reset of the Root action stays with Root's entry points;
 * this handoff only creates the draft task and prefills the composer, then
 * focuses the covered workspace tab so the user can review before sending.
 */

import { useCallback, useMemo } from "react";

import { useComposerClientNamespace } from "@/hooks/useServices.js";
import { useTabStore, useTabStoreApi } from "@/store/TabStoreProvider.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import {
  persistV4ComposerDraft,
  readComposerWorkspaceScope,
  readV4ComposerDraft,
  rememberComposerWorkspaceScope,
  resolveComposerScope,
  V4_DRAFT_SCOPE_ROOT,
} from "@/v4/composer/composerDraftStore.js";
import { NO_AUTO_SUBMIT_NOTICE, type ApplicationDTO } from "@zcode/shared";

import { parseApplicationDraft } from "./format.js";

/** Compose the prefill text from the tracked application (title/link/draft). */
export function buildApplicationPrefillText(application: ApplicationDTO): string {
  const draft = parseApplicationDraft(application.draft);
  const lines: string[] = [`${application.opportunityTitle} — ${application.platform}`];
  if (application.canonicalUrl) {
    lines.push(application.canonicalUrl);
  }
  if (draft && draft.checklist.length > 0) {
    lines.push("");
    for (const item of draft.checklist) {
      lines.push(`- [ ] ${item}`);
    }
  }
  if (draft?.messageDraft) {
    lines.push("");
    lines.push(draft.messageDraft);
  }
  lines.push("");
  lines.push(`— ${draft?.notice ?? NO_AUTO_SUBMIT_NOTICE}`);
  return lines.join("\n");
}

export interface EarnComposerHandoff {
  /** True when a workspace tab exists to hand the draft off into. */
  available: boolean;
  /** Prefill-only handoff; resolves to true when the draft task was created. */
  handoffDraftToComposer: (application: ApplicationDTO, draftText?: string) => boolean;
}

export function useEarnComposerHandoff(): EarnComposerHandoff {
  const composerClientNamespace = useComposerClientNamespace();
  const tabStoreApi = useTabStoreApi();
  const activeWorkspacePath = useTabStore((state) => state.activeWorkspacePath);
  const activeWorkspaceIdentity = useTabStore((state) => state.activeWorkspaceIdentity);

  const available = Boolean(activeWorkspacePath);

  const handoffDraftToComposer = useCallback(
    (application: ApplicationDTO, draftText?: string): boolean => {
      const workspacePath = tabStoreApi.getState().activeWorkspacePath;
      if (!workspacePath) return false;
      const workspaceIdentity =
        tabStoreApi.getState().activeWorkspaceIdentity ?? undefined;

      // --- startDraftInWorkspace mirrored store path (same call sequence) ---
      const projectId =
        readComposerWorkspaceScope(workspacePath, workspaceIdentity, composerClientNamespace)
          ?.projectId ?? null;
      const scope = resolveComposerScope(
        projectId,
        workspaceIdentity,
        composerClientNamespace,
      );
      const savedDraft = readV4ComposerDraft(
        workspacePath,
        workspaceIdentity,
        V4_DRAFT_SCOPE_ROOT,
        scope,
      );
      const taskGroupId =
        savedDraft?.taskGroupId !== undefined ? savedDraft.taskGroupId : null;
      rememberComposerWorkspaceScope(workspacePath, workspaceIdentity, scope);
      persistV4ComposerDraft(
        workspacePath,
        workspaceIdentity,
        V4_DRAFT_SCOPE_ROOT,
        {
          text: "",
          ...(savedDraft ?? {}),
          projectId,
          taskGroupId,
        },
        scope,
      );
      useZCodeSessionStore
        .getState()
        .startDraft(workspacePath, undefined, workspaceIdentity, {
          projectId,
          taskGroupId,
        });

      // Prefill-only text insert — mirrors the initialPrompt branch of
      // startDraftInWorkspace; nothing here ever sends the message.
      const text = (draftText ?? "").trim() || buildApplicationPrefillText(application);
      if (text) {
        persistV4ComposerDraft(
          workspacePath,
          workspaceIdentity,
          V4_DRAFT_SCOPE_ROOT,
          {
            text,
            projectId,
            taskGroupId,
          },
          scope,
        );
        useZCodeSessionStore
          .getState()
          .requestComposerTextInsert(workspacePath, text, workspaceIdentity);
      }

      // Focus the workspace the Earn surface covers so the user reviews the
      // prefilled draft in the composer before doing anything with it.
      const state = tabStoreApi.getState();
      const workspaceTab = state.tabs.find(
        (tab) =>
          isWorkspaceTab(tab) &&
          tab.workspacePath === workspacePath &&
          (workspaceIdentity ? tab.workspaceIdentity === workspaceIdentity : true),
      );
      if (workspaceTab) {
        state.activateTab(workspaceTab.id);
      }
      return true;
    },
    [composerClientNamespace, tabStoreApi],
  );

  return useMemo(
    () => ({ available, handoffDraftToComposer }),
    [available, handoffDraftToComposer],
  );
}
