/**
 * Hop3 Earn — service acquisition hook (Stage 1 UI port).
 *
 * The only place in this module that names `IEarnService`; it goes through
 * `useServices()` (packages/ui/src/hooks/useServices.tsx accessor pattern)
 * and reads the optional `earnService` field. Hosts that do not register the
 * Hop3 Earn channel legitimately lack it — the UI surfaces an honest
 * "not available on this host" state instead of fabricating data.
 */

import { useServices } from "@/hooks/useServices.js";
import type { IEarnService } from "./contract.js";

export interface EarnServiceState {
  /** null on hosts that do not register the Hop3 Earn service channel. */
  service: IEarnService | null;
}

export function useEarnService(): EarnServiceState {
  // 服务访问器范式：useServices() → accessor.earnService（可选字段）。
  // earnService 缺失是合法状态（host 未注册该 channel），不是错误。
  const accessor = useServices();
  return { service: accessor.earnService ?? null };
}
