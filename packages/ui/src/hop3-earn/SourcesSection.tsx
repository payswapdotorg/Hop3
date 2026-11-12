/**
 * Hop3 Earn — source connections section (Stage 1 UI port).
 *
 * Policy-first rendering: access mode, auth, per-operation capability,
 * ranking-policy notes, payout caveats and honest run summaries. Blocked
 * sources show their exact handoff message; nothing is scraped.
 */

import * as React from "react";
import { AlertTriangle, LoaderCircle, Plus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js";
import { Badge } from "@/components/ui/badge.js";
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
import type { SourceConnectionDTO, SourceKey } from "@zcode/shared";

import { EmptyState, QueryError } from "./common.js";
import { SourceModeBadge } from "./badges.js";
import { useFormat } from "./useFormat.js";
import { useEarnSources, useIntake, useSyncSource } from "./useEarnData.js";
import type { IEarnService } from "./contract.js";

const OPERATIONS = ["search", "read", "draft", "submit", "message", "hire", "pay"] as const;

const POLICY_NOTE_KEYS: Partial<Record<SourceKey, string>> = {
  upwork_mcp: "earn.sources.policy.upwork",
  fiverr_mcp: "earn.sources.policy.fiverr",
  oneforma: "earn.sources.policy.oneforma",
  url_intake: "earn.sources.policy.urlIntake",
};

function OperationChips({ operations }: { operations: SourceConnectionDTO["operations"] }) {
  const { intl } = useZCodeIntl();
  return (
    <div className="flex flex-wrap gap-1.5">
      {OPERATIONS.map((op) => {
        const cap = operations?.[op];
        if (cap?.allowed) {
          return (
            <Badge key={op} variant="outline" className="text-ui-xs">
              {intl.formatMessage({ id: "earn.sources.opAllowed" }, { op })}
            </Badge>
          );
        }
        return (
          <Badge
            key={op}
            variant="secondary"
            className="line-through opacity-60 text-ui-xs"
          >
            {intl.formatMessage({ id: "earn.sources.opNotAllowed" }, { op })}
          </Badge>
        );
      })}
    </div>
  );
}

function SourceCard({ service, source }: { service: IEarnService | null; source: SourceConnectionDTO }) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const [mode, setMode] = React.useState<"live" | "sandbox">(
    source.mode === "live" ? "live" : "sandbox",
  );
  const sync = useSyncSource(service);

  React.useEffect(() => {
    setMode(source.mode === "live" ? "live" : "sandbox");
  }, [source.mode]);

  const blocked = source.mode === "blocked";
  const policyNoteKey = POLICY_NOTE_KEYS[source.key];

  return (
    <Card size="sm">
      <CardHeader className="gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-ui-base">{source.displayName}</CardTitle>
          <SourceModeBadge mode={source.mode} />
        </div>
        <CardDescription className="text-ui-xs">
          {intl.formatMessage({ id: "earn.sources.access" }, { mode: source.accessMode })}
          {" · "}
          {intl.formatMessage({ id: "earn.sources.kind" }, { kind: source.sourceKind })}
          {" · "}
          {intl.formatMessage(
            { id: "earn.sources.actors" },
            { actors: source.actorModes?.join(", ") || intl.formatMessage({ id: "earn.sources.actorsUnknown" }) },
          )}
          {source.termsUrl ? (
            <>
              {" · "}
              <a
                href={source.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-success underline underline-offset-2"
              >
                {intl.formatMessage({ id: "earn.sources.terms" })}
              </a>
            </>
          ) : null}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Policy */}
        <div className="space-y-1.5">
          <p className="text-ui-xs font-medium">
            {intl.formatMessage({ id: "earn.sources.operations" })}
          </p>
          <OperationChips operations={source.operations} />
          {policyNoteKey ? (
            <p className="text-ui-xs text-foreground-subtle">
              {intl.formatMessage({ id: policyNoteKey })}
            </p>
          ) : null}
        </div>

        {/* Payout */}
        <div className="space-y-1">
          <p className="text-ui-xs font-medium">
            {intl.formatMessage({ id: "earn.sources.payoutGlobal" })}
          </p>
          {source.payout?.methodKnown ? (
            <div className="space-y-0.5 text-ui-xs text-foreground-subtle">
              {source.payout.methods && source.payout.methods.length > 0 ? (
                <p>
                  {intl.formatMessage({ id: "earn.sources.payout.methods" })}{" "}
                  {source.payout.methods.join(", ")}
                </p>
              ) : null}
              {source.payout.threshold ? (
                <p>
                  {intl.formatMessage({ id: "earn.sources.payout.threshold" })}{" "}
                  {source.payout.threshold}
                </p>
              ) : null}
              {source.payout.fees ? (
                <p>
                  {intl.formatMessage({ id: "earn.sources.payout.fees" })} {source.payout.fees}
                </p>
              ) : null}
              {source.payout.cadence ? (
                <p>
                  {intl.formatMessage({ id: "earn.sources.payout.cadence" })} {source.payout.cadence}
                </p>
              ) : null}
              {source.payout.evidenceUrl ? (
                <a
                  href={source.payout.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-success underline underline-offset-2"
                >
                  {intl.formatMessage({ id: "earn.sources.payout.evidence" })}
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-ui-xs text-foreground-subtle">
              {intl.formatMessage({ id: "earn.sources.payoutUnknown" })}
            </p>
          )}
          <p className="text-ui-xs text-warning">
            {intl.formatMessage({ id: "earn.sources.payoutGlobalWarning" })}
          </p>
        </div>

        {/* Blocked handoff */}
        {blocked && source.statusMessage ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>{intl.formatMessage({ id: "earn.sources.blocked.title" })}</AlertTitle>
            <AlertDescription>
              <p>{source.statusMessage}</p>
            </AlertDescription>
          </Alert>
        ) : null}
        {!blocked && source.statusMessage ? (
          <p className="text-ui-xs text-foreground-subtle">{source.statusMessage}</p>
        ) : null}

        {/* Run */}
        <div className="space-y-2">
          <p className="text-ui-xs font-medium">{intl.formatMessage({ id: "earn.sources.run" })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[150px]">
              <Select value={mode} onValueChange={(value) => setMode(value as "live" | "sandbox")}>
                <SelectTrigger
                  className="w-full"
                  aria-label={intl.formatMessage(
                    { id: "earn.sources.syncModeAria" },
                    { name: source.displayName },
                  )}
                >
                  <SelectValue placeholder={intl.formatMessage({ id: "earn.sources.mode.placeholder" })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">
                    {intl.formatMessage({ id: "earn.sources.mode.sandbox" })}
                  </SelectItem>
                  <SelectItem value="live" disabled={blocked}>
                    {blocked
                      ? intl.formatMessage({ id: "earn.sources.mode.liveBlocked" })
                      : intl.formatMessage({ id: "earn.sources.mode.live" })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={sync.isPending}
              onClick={() =>
                void sync.mutate({
                  key: source.key,
                  mode,
                  displayName: source.displayName,
                })
              }
            >
              {sync.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : null}
              {sync.isPending
                ? intl.formatMessage({ id: "earn.sources.syncing" })
                : intl.formatMessage({ id: "earn.sources.sync" })}
            </Button>
          </div>
          {source.key === "upwork_mcp" && mode === "live" ? (
            <p className="text-ui-xs text-warning">
              {intl.formatMessage({ id: "earn.sources.upworkLiveNote" })}
            </p>
          ) : null}
          <p className="text-ui-xs text-foreground-subtle">
            {source.lastRun
              ? intl.formatMessage(
                  { id: "earn.sources.lastRun" },
                  {
                    status: source.lastRun.status,
                    mode: source.lastRun.mode,
                    when: format.relativeTime(source.lastRun.startedAt),
                    fetched: source.lastRun.fetched,
                    inserted: source.lastRun.inserted,
                    updated: source.lastRun.updated,
                    duplicates: source.lastRun.duplicates,
                  },
                ) +
                (source.lastRun.message ? ` — ${source.lastRun.message}` : "")
              : intl.formatMessage({ id: "earn.sources.noRuns" })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function IntakeCard({ service }: { service: IEarnService | null }) {
  const { intl } = useZCodeIntl();
  const [url, setUrl] = React.useState("");
  const [context, setContext] = React.useState("");
  const intake = useIntake(service);

  const trimmed = url.trim();
  const valid = /^https?:\/\/.+/i.test(trimmed);

  const submit = () => {
    if (!valid) return;
    void intake.mutate(
      { url: trimmed, context: context.trim() || undefined },
    ).then((result) => {
      if (result) {
        setUrl("");
        setContext("");
      }
    });
  };

  return (
    <Card size="sm" className="border-dashed">
      <CardHeader className="gap-1.5">
        <CardTitle className="text-ui-base">
          {intl.formatMessage({ id: "earn.sources.intake.title" })}
        </CardTitle>
        <CardDescription className="text-ui-xs">
          {intl.formatMessage({ id: "earn.sources.intake.hint" })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="intake-url">{intl.formatMessage({ id: "earn.sources.intake.url" })}</Label>
          <Input
            id="intake-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/listing"
            inputMode="url"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="intake-context">
            {intl.formatMessage({ id: "earn.sources.intake.context" })}
          </Label>
          <Input
            id="intake-context"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder={intl.formatMessage({ id: "earn.sources.intake.contextPlaceholder" })}
          />
        </div>
        <Button disabled={!valid || intake.isPending} onClick={submit}>
          {intake.isPending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          {intl.formatMessage({ id: "earn.sources.intake.submit" })}
        </Button>
      </CardContent>
    </Card>
  );
}

export function SourcesSection({ service }: { service: IEarnService | null }) {
  const { intl } = useZCodeIntl();
  const { data, isPending, isError, error, refetch } = useEarnSources(service);
  const sources = data ?? [];

  return (
    <section
      className="space-y-4"
      aria-label={intl.formatMessage({ id: "earn.tab.sources" })}
    >
      {isPending ? (
        <div role="status" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <span className="sr-only">{intl.formatMessage({ id: "earn.common.loading" })}</span>
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="motion-safe:animate-pulse flex flex-col gap-3 rounded-xl border border-card-border bg-background p-4"
            >
              <span className="h-6 w-40 rounded-md bg-surface" />
              <span className="h-4 w-2/3 rounded-md bg-surface" />
              <div className="flex flex-wrap gap-1.5">
                <span className="h-5 w-20 rounded-full bg-surface" />
                <span className="h-5 w-24 rounded-full bg-surface" />
                <span className="h-5 w-16 rounded-full bg-surface" />
              </div>
              <span className="h-9 w-48 rounded-md bg-surface" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <QueryError
          title={intl.formatMessage({ id: "earn.sources.error.title" })}
          message={error ?? intl.formatMessage({ id: "earn.common.unknownError" })}
          onRetry={() => void refetch()}
        />
      ) : sources.length === 0 ? (
        <EmptyState
          title={intl.formatMessage({ id: "earn.sources.empty.title" })}
          hint={intl.formatMessage({ id: "earn.sources.empty.hint" })}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sources.map((source) => (
            <SourceCard key={source.key} service={service} source={source} />
          ))}
        </div>
      )}

      <IntakeCard service={service} />
    </section>
  );
}

