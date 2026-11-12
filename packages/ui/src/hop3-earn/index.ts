/**
 * hop3-earn-ui 公共入口（§1 骨架 + §2 UI 实现）。
 *
 * 契约面（contract.ts / module.ts）保持冻结；§2 落地的公共再导出：
 * EarnPage、数据 hooks、composer handoff 与诚实展示组件族。
 * 消费方（Root 渲染分支、WorkspaceSidebarFooter 入口、tabStore kind）只走本入口。
 */
export * from "./contract.js";
export * from "./module.js";

export { EarnPage, type EarnSectionKey } from "./EarnPage.js";
export { useEarnService, type EarnServiceState } from "./useEarnService.js";
export {
  describeEarnError,
  invalidateEarn,
  useEarnApplications,
  useEarnOpportunities,
  useEarnOpportunityDetail,
  useEarnProfile,
  useEarnSources,
  useIntake,
  useSyncSource,
  useSaveToggle,
  useSavedNotes,
  useCreateApplication,
  usePrepareDraft,
  useSaveDraft,
  useRecordEvent,
  useMarkPrepared,
  useSaveProfile,
  type EarnQueryResult,
  type OpportunityCardWithNotes,
} from "./useEarnData.js";
export { useEarnComposerHandoff, buildApplicationPrefillText, type EarnComposerHandoff } from "./useEarnComposerHandoff.js";
export { useFormat, type EarnFormatter } from "./useFormat.js";
