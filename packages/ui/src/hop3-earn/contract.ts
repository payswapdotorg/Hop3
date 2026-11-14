/**
 * hop3-earn-ui 模块对外契约面。
 *
 * 消费冻结契约（@zcode/shared hop3-earn-shared）与 `IEarnService`
 * （accessor 上可选暴露）；composer 交接复用 `requestComposerTextInsert`
 * —— 仅预填，永不自动发送（NO_AUTO_SUBMIT_NOTICE）。
 */
// UI 模块对服务层的唯一类型入口（managed-worktrees 同款范式）。
export type { IEarnService } from "@zcode/services";
