/**
 * Hop3 Earn — small shared presentational primitives (Stage 1 UI port).
 *
 * Honest states only: errors offer retry, empty states never imply fabricated
 * content, skeletons are labelled for assistive tech. No motion dependency —
 * a short CSS transition covers the tab-switch fade of the reference port.
 */

import type { ReactNode } from "react";

import { AlertTriangle, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";

import { useFormat } from "./useFormat.js";

/** Thin styled scrollbar for long scrollable regions. */
export const thinScrollbar =
  "[scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border";

/** Subtle entrance used on tab panel switches only (reference FadeIn, CSS-only). */
export function FadeIn({ children }: { children: ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">{children}</div>
  );
}

/** Honest error state with a retry action. */
export function QueryError({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry: () => void;
}) {
  const { intl } = useZCodeIntl();
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive-surface px-4 py-3 text-ui-sm text-foreground"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{title ?? intl.formatMessage({ id: "earn.common.errorTitle" })}</p>
          <p className="text-ui-xs text-foreground-subtle">{message}</p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit"
        onClick={onRetry}
      >
        {intl.formatMessage({ id: "earn.common.retry" })}
      </Button>
    </div>
  );
}

/** Honest empty state — never implies fabricated content. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-background p-8 text-center">
      <Inbox className="size-8 text-foreground-subtlest" aria-hidden="true" />
      <p className="text-ui-sm font-medium text-foreground">{title}</p>
      {hint ? (
        <p className="max-w-md text-ui-xs leading-relaxed text-foreground-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/** "observed {relative}" with the absolute timestamp in a tooltip. */
export function TimeHint({
  label,
  iso,
}: {
  label: string;
  iso?: string | null;
}) {
  const format = useFormat();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="cursor-help underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {label} {format.relativeTime(iso)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{format.absoluteTime(iso)}</TooltipContent>
    </Tooltip>
  );
}

/** Small labelled value row used in evidence panels. */
export function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-0.5 py-1 text-ui-sm sm:grid-cols-[140px_1fr]">
      <dt className="text-ui-xs text-foreground-subtle">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function CardSkeletonGrid({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div role="status" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="motion-safe:animate-pulse flex flex-col gap-3 rounded-xl border border-card-border bg-background p-4"
        >
          <span className="h-5 w-3/4 rounded-md bg-surface" />
          <span className="h-4 w-1/2 rounded-md bg-surface" />
          <span className="h-4 w-2/3 rounded-md bg-surface" />
          <div className="flex gap-2 pt-1">
            <span className="h-5 w-24 rounded-full bg-surface" />
            <span className="h-5 w-32 rounded-full bg-surface" />
          </div>
          <div className="flex gap-2 pt-1">
            <span className="h-8 w-24 rounded-md bg-surface" />
            <span className="h-8 w-32 rounded-md bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse h-8 w-56 rounded-md bg-surface" />
      <div aria-hidden="true" className="motion-safe:animate-pulse h-48 w-full rounded-xl bg-surface" />
    </div>
  );
}

/** Inline list of status chips used by tracker cards and evidence rows. */
export function ChipRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-wrap items-center gap-1.5", className)}>{children}</div>;
}
