'use client'

/**
 * Hop3 · Earn — Stage 1 shell (Worker C).
 *
 * Single-page Earn surface assembled from the frozen Stage 1 tabs:
 * Inbox (discovery), Saved, Applications (outcome tracking), Profile and
 * Sources (connections + link intake).
 *
 * Non-negotiables rendered here, always visible:
 *  - the footer carries the no-auto-submit, estimates-never-guarantees and
 *    unknown-payout notices plus the canonical source-of-truth pointer;
 *  - the footer sticks to the bottom of the viewport and is pushed down
 *    naturally when content overflows (min-h-screen flex column + mt-auto).
 */

import * as React from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ECONOMICS_DISCLAIMER, NO_AUTO_SUBMIT_NOTICE } from '@/lib/contracts'
import { FadeIn } from '@/components/earn/common'
import { InboxTab } from '@/components/earn/inbox-tab'
import { SavedTab } from '@/components/earn/saved-tab'
import { SourcesTab } from '@/components/earn/sources-tab'
import { ProfileTab } from '@/components/earn/profile-tab'
import { ApplicationsTab } from '@/components/earn/applications-tab'
import { ThemeToggle } from '@/components/earn/theme-toggle'

type TabKey = 'inbox' | 'saved' | 'applications' | 'profile' | 'sources'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'saved', label: 'Saved' },
  { key: 'applications', label: 'Applications' },
  { key: 'profile', label: 'Profile' },
  { key: 'sources', label: 'Sources' },
]

export default function Home() {
  const [tab, setTab] = React.useState<TabKey>('inbox')
  const goToApplications = React.useCallback(() => setTab('applications'), [])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white"
              aria-hidden="true"
            >
              H3
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-tight">
                Hop3 · Earn
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Verified earning-opportunity discovery — evidence first
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="hidden text-emerald-700 sm:inline-flex dark:text-emerald-400">
              Stage 1
            </Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
          <TabsList className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto bg-muted/40 p-1">
            {TABS.map(({ key, label }) => (
              <TabsTrigger
                key={key}
                value={key}
                className="h-11 shrink-0 px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm sm:h-9"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="inbox" className="mt-0">
            <FadeIn>
              <InboxTab onGoToApplications={goToApplications} />
            </FadeIn>
          </TabsContent>

          <TabsContent value="saved" className="mt-0">
            <FadeIn>
              <SavedTab onGoToApplications={goToApplications} />
            </FadeIn>
          </TabsContent>

          <TabsContent value="applications" className="mt-0">
            <FadeIn>
              <ApplicationsTab />
            </FadeIn>
          </TabsContent>

          <TabsContent value="profile" className="mt-0">
            <FadeIn>
              <ProfileTab />
            </FadeIn>
          </TabsContent>

          <TabsContent value="sources" className="mt-0">
            <FadeIn>
              <SourcesTab />
            </FadeIn>
          </TabsContent>
        </Tabs>
      </main>

      {/* Sticky footer: bottom on short pages, pushed down on long pages */}
      <footer className="mt-auto border-t bg-muted/30 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-6xl space-y-1.5 px-4 py-4 text-xs text-muted-foreground">
          <p>{NO_AUTO_SUBMIT_NOTICE}</p>
          <p>{ECONOMICS_DISCLAIMER}</p>
          <p>
            Earnings appear only when you record them with evidence — Hop3 never
            fabricates income. Canonical source of truth:{' '}
            <a
              href="https://github.com/payswapdotorg/Hop3"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
            >
              payswapdotorg/Hop3
            </a>{' '}
            (docs/handoffs/STAGE-1.md). This app is the Stage 1 reference
            implementation of the Earn surface.
          </p>
        </div>
      </footer>
    </div>
  )
}
