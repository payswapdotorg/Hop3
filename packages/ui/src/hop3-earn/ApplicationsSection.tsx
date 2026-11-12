/**
 * Hop3 Earn — applications & outcomes section (Stage 1 UI port).
 *
 * The honest summary counts only user-recorded paid amounts, labelled as
 * such — income is never fabricated. Cards are listed in service order.
 */

import { useZCodeIntl } from "@/i18n/IntlProvider.js";

import { EmptyState, QueryError, SectionSkeleton } from "./common.js";
import { ApplicationTrackerCard } from "./ApplicationTrackerCard.js";
import { isTerminal } from "./applicationLifecycle.js";
import { describeEarnError, useEarnApplications } from "./useEarnData.js";
import { useFormat } from "./useFormat.js";
import type { IEarnService } from "./contract.js";

export function ApplicationsSection({ service }: { service: IEarnService | null }) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const { data, isPending, isError, error, refetch } = useEarnApplications(service);
  const applications = data ?? [];

  const paid = applications.filter((app) => app.paidAt != null && (app.amountPaid ?? 0) > 0);
  const paidTotal = paid.reduce((sum, app) => sum + (app.amountPaid ?? 0), 0);
  const paidCurrencies = [...new Set(paid.map((app) => app.paidCurrency ?? "USD"))];
  const activeCount = applications.filter((app) => !isTerminal(app.status)).length;

  return (
    <section
      className="space-y-4"
      aria-label={intl.formatMessage({ id: "earn.tab.applications" })}
    >
      {/* Honest summary */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-xs text-foreground-subtle">
        <span>
          {intl.formatMessage({ id: "earn.app.listSummary" }, {
            count: applications.length,
            active: activeCount,
            closed: applications.length - activeCount,
          })}
        </span>
        {paid.length > 0 ? (
          <span className="text-success">
            {intl.formatMessage({ id: "earn.app.paidTotal" }, {
              amount: format.formatMoney(paidTotal, paidCurrencies[0]),
              count: paid.length,
            })}
          </span>
        ) : (
          <span>{intl.formatMessage({ id: "earn.app.nothingPaid" })}</span>
        )}
      </div>

      {isPending ? (
        <SectionSkeleton label={intl.formatMessage({ id: "earn.common.loading" })} />
      ) : isError ? (
        <QueryError
          title={intl.formatMessage({ id: "earn.app.error.title" })}
          message={describeEarnError(error, intl)}
          onRetry={() => void refetch()}
        />
      ) : applications.length === 0 ? (
        <EmptyState
          title={intl.formatMessage({ id: "earn.app.empty.title" })}
          hint={intl.formatMessage({ id: "earn.app.empty.hint" })}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {applications.map((application) => (
            <ApplicationTrackerCard
              key={application.id}
              service={service}
              application={application}
            />
          ))}
        </div>
      )}
    </section>
  );
}
