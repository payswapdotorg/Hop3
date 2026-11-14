import type { IEarnService } from "./contract.js";

/** 例 1：UI 消费服务（经 accessor 拿到 IEarnService）。 */
export async function refreshInboxExample(service: IEarnService) {
  return service.listOpportunities({ status: "active" });
}

/**
 * 例 2：宿主集成（Issue #13 之后）。Earn 不再是窗口级页签 —— 打开动作由宿主
 * 提供（useAppPanels().handleOpenEarn → activateEarnSidePane），UI 模块自身
 * 不再导出任何 tab kind 常量。
 */
export type EarnHostIntegrationExample = {
  onOpenEarn: () => void;
};
