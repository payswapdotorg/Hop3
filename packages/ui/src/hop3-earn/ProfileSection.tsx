/**
 * Hop3 Earn — worker profile section (Stage 1 UI port).
 *
 * Wrapper with honest loading/error states; the form is remounted on
 * server-side updatedAt so a completed save is reflected without
 * clobbering in-progress edits.
 */

import { Badge } from "@/components/ui/badge.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

import { QueryError, SectionSkeleton } from "./common.js";
import { ProfileForm } from "./ProfileForm.js";
import { describeEarnError, useEarnProfile } from "./useEarnData.js";
import { useFormat } from "./useFormat.js";
import type { IEarnService } from "./contract.js";

export function ProfileSection({ service }: { service: IEarnService | null }) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const { data, isPending, isError, error, refetch } = useEarnProfile(service);
  const profile = data ?? null;

  return (
    <section
      className="space-y-4"
      aria-label={intl.formatMessage({ id: "earn.tab.profile" })}
    >
      {isPending ? (
        <SectionSkeleton label={intl.formatMessage({ id: "earn.common.loading" })} />
      ) : isError ? (
        <QueryError
          title={intl.formatMessage({ id: "earn.profile.error.title" })}
          message={describeEarnError(error, intl)}
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {profile ? (
              <Badge variant="outline" className="text-success">
                {intl.formatMessage(
                  { id: "earn.profile.savedBadge" },
                  {
                    when: profile.updatedAt
                      ? format.shortAbsoluteTime(profile.updatedAt)
                      : intl.formatMessage({ id: "earn.format.unknown" }),
                  },
                )}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-warning">
                {intl.formatMessage({ id: "earn.profile.emptyBadge" })}
              </Badge>
            )}
          </div>
          {/* Remount on server-side updatedAt so a completed save is reflected
              without clobbering in-progress edits. */}
          <ProfileForm key={profile?.updatedAt ?? "empty"} service={service} profile={profile} />
        </>
      )}
    </section>
  );
}
