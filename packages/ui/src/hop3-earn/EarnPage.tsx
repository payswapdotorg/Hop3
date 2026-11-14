/**
 * Hop3 Earn — the Earn tab surface (Stage 1 UI port).
 *
 * Five sections — Inbox / Saved / Applications / Profile / Sources — with
 * accessible tab semantics (role=tablist/tab/tabpanel, arrow-key navigation).
 * Non-negotiables rendered here, always visible:
 *  - the footer carries the no-auto-submit and estimates-never-guarantees
 *    notices plus the canonical source-of-truth pointer (frozen constants
 *    render verbatim — they are contract data, not translations);
 *  - a host without the Earn service shows an honest unavailable state,
 *    never fabricated data.
 */

import * as React from "react";
import { CircleDollarSign } from "lucide-react";

import { Badge } from "@/components/ui/badge.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  ECONOMICS_DISCLAIMER,
  NO_AUTO_SUBMIT_NOTICE,
} from "@zcode/shared";

import { FadeIn } from "./common.js";
import { InboxSection } from "./InboxSection.js";
import { SavedSection } from "./SavedSection.js";
import { ApplicationsSection } from "./ApplicationsSection.js";
import { ProfileSection } from "./ProfileSection.js";
import { SourcesSection } from "./SourcesSection.js";
import { useEarnService } from "./useEarnService.js";

export type EarnSectionKey = "inbox" | "saved" | "applications" | "profile" | "sources";

const EARN_SECTIONS: Array<{ key: EarnSectionKey; labelKey: string }> = [
  { key: "inbox", labelKey: "earn.tab.inbox" },
  { key: "saved", labelKey: "earn.tab.saved" },
  { key: "applications", labelKey: "earn.tab.applications" },
  { key: "profile", labelKey: "earn.tab.profile" },
  { key: "sources", labelKey: "earn.tab.sources" },
];

/**
 * Hosts without the Earn service get an honest unavailable state —
 * no fake inbox, no mock numbers.
 */
function EarnServiceUnavailable() {
  const { intl } = useZCodeIntl();
  return (
    <section
      aria-label={intl.formatMessage({ id: "earn.serviceUnavailable.title" })}
      className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background p-10 text-center"
    >
      <CircleDollarSign className="size-8 text-foreground-subtlest" aria-hidden="true" />
      <p className="text-ui-sm font-medium text-foreground">
        {intl.formatMessage({ id: "earn.serviceUnavailable.title" })}
      </p>
      <p className="max-w-md text-ui-xs leading-relaxed text-foreground-subtle">
        {intl.formatMessage({ id: "earn.serviceUnavailable.hint" })}
      </p>
    </section>
  );
}

export function EarnPage() {
  const { intl } = useZCodeIntl();
  const { service } = useEarnService();
  const [section, setSection] = React.useState<EarnSectionKey>("inbox");

  const goToApplications = React.useCallback(() => setSection("applications"), []);

  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = React.useState(0);

  const onTablistKeyDown = (event: React.KeyboardEvent) => {
    const lastIndex = EARN_SECTIONS.length - 1;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (focusedIndex + 1) % EARN_SECTIONS.length;
    if (event.key === "ArrowLeft") nextIndex = (focusedIndex - 1 + EARN_SECTIONS.length) % EARN_SECTIONS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;
    if (nextIndex == null) return;
    event.preventDefault();
    setFocusedIndex(nextIndex);
    setSection(EARN_SECTIONS[nextIndex]!.key);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="flex min-h-0 h-full flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success text-ui-sm font-bold text-success-foreground"
              aria-hidden="true"
            >
              H3
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-ui-base font-semibold leading-tight">
                {intl.formatMessage({ id: "earn.title" })}
              </h1>
              <p className="truncate text-ui-xs text-foreground-subtle">
                {intl.formatMessage({ id: "earn.subtitle" })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="hidden text-success sm:inline-flex">
              {intl.formatMessage({ id: "earn.stage" })}
            </Badge>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <nav
          role="tablist"
          aria-label={intl.formatMessage({ id: "earn.tablist.label" })}
          className="mb-4 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg bg-surface p-1"
          onKeyDown={onTablistKeyDown}
        >
          {EARN_SECTIONS.map(({ key, labelKey }, index) => {
            const isActive = key === section;
            return (
              <button
                key={key}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`earn-tab-${key}`}
                aria-selected={isActive}
                aria-controls={`earn-tabpanel-${key}`}
                tabIndex={isActive ? 0 : -1}
                className={cn(
                  "h-9 shrink-0 rounded-md px-4 text-ui-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-foreground-subtle hover:bg-hover hover:text-foreground",
                )}
                onClick={() => {
                  setFocusedIndex(index);
                  setSection(key);
                }}
              >
                {intl.formatMessage({ id: labelKey })}
              </button>
            );
          })}
        </nav>

        <div
          role="tabpanel"
          id={`earn-tabpanel-${section}`}
          aria-labelledby={`earn-tab-${section}`}
          className="min-h-0"
        >
          {!service ? (
            <EarnServiceUnavailable />
          ) : (
            <FadeIn>
              {section === "inbox" ? (
                <InboxSection service={service} onGoToApplications={goToApplications} />
              ) : section === "saved" ? (
                <SavedSection service={service} onGoToApplications={goToApplications} />
              ) : section === "applications" ? (
                <ApplicationsSection service={service} />
              ) : section === "profile" ? (
                <ProfileSection service={service} />
              ) : (
                <SourcesSection service={service} />
              )}
            </FadeIn>
          )}
        </div>
      </main>

      {/* Sticky footer: bottom on short pages, pushed down on long pages. */}
      <footer className="mt-auto shrink-0 border-t border-border bg-surface pt-3 pb-[env(safe-area-inset-bottom)]">
        <div className="w-full space-y-1.5 px-4 pb-4 text-ui-xs text-foreground-subtle">
          <p>{NO_AUTO_SUBMIT_NOTICE}</p>
          <p>{ECONOMICS_DISCLAIMER}</p>
          <p>
            {intl.formatMessage({ id: "earn.footer.recordedOnly" })}{" "}
            <a
              href="https://github.com/payswapdotorg/Hop3"
              target="_blank"
              rel="noopener noreferrer"
              className="text-success underline underline-offset-2"
            >
              payswapdotorg/Hop3
            </a>{" "}
            {intl.formatMessage({ id: "earn.footer.reference" })}
          </p>
        </div>
      </footer>
    </div>
  );
}
