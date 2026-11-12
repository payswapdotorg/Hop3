/**
 * hop3-earn-shared 的对外契约面：Stage 1 冻结的 Earn 领域类型与诚实常量。
 *
 * 冻结纪律（HOP3_RULES / STAGE-1）：本文件再导出的每个形状都来自
 * docs/DOMAIN-MODEL.md + docs/CONNECTORS.md 的冻结定义；任何修改必须走 TL。
 * "unknown" 永不折叠为 "eligible"；估算永不写成保证；Upwork 仅保供应方顺序；
 * 生命周期仅凭事件证据迁移；缺数永远保持缺失。
 */
export * from "./hop3EarnTypes.js";
