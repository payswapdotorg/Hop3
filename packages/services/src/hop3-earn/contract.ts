/**
 * hop3-earn 模块对外契约面：`IEarnService`（15 方法）+ 其 RPC descriptor。
 *
 * 冻结契约在 `@zcode/shared` 的 hop3-earn-shared 模块（修改走 TL）。
 * 工厂 `createEarnService()` 为 Node-only（`node.ts` 注册），不进入本导出。
 */
export * from "./hop3Earn.js";
export * from "./module.js";
