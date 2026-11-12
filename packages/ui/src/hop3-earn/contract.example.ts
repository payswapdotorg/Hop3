import type { IEarnService } from "./contract.js";
import { EARN_TAB_KIND } from "./contract.js";

/** 例 1：UI 消费服务（经 accessor 拿到 IEarnService）。 */
export async function refreshInboxExample(service: IEarnService) {
  return service.listOpportunities({ status: "active" });
}

/** 例 2：tab 种类常量的守卫式收窄。 */
export function isEarnTabKind(kind: string): boolean {
  return kind === EARN_TAB_KIND;
}
