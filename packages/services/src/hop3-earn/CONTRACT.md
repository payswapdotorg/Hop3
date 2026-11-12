# hop3-earn — CONTRACT

- **Owner:** Hop3 TL
- **Layer:** adapters（`packages/services/src/hop3-earn`）
- **Requires:** shared, services, session
- **Descriptor:** `IEarnService` = `createServiceDescriptor(ServiceChannels.Hop3Earn)`
- **Registration:** `createLocalServices`（`packages/services/src/node.ts`）中 `.register(IEarnService, createEarnService())` —— 注册即自动暴露给桌面 renderer 与 web（ProxyChannel）。

## Service surface（15 方法）

| 面 | 方法 |
|---|---|
| profile | `getProfile` / `upsertProfile` |
| sources | `listSources` / `syncSource` / `recordIntake` |
| opportunities | `listOpportunities` / `getOpportunityDetail` / `toggleSaved` / `setSavedNotes` |
| applications | `listApplications` / `createApplication` / `prepareDraft` / `saveDraft` / `recordEvent` / `markPrepared` |

## 冻结与诚实纪律

- 形状全部来自 hop3-earn-shared（TL 冻结）；实现不得私改。
- 列表顺序：机会按 `firstSeenAt` asc；Upwork 只保供应方顺序（`rankingPolicy: "provider-order-only"`）。
- 变更方法失败返回 `{ ok: false; error }` —— 原因诚实，不跨通道抛 raw error。
- `prepareDraft` 只产出预填材料；**模块内不存在任何发送/提交路径**（NO_AUTO_SUBMIT_NOTICE）。
- `recordEvent` 是申请状态唯一变更入口，且必须带证据类型。
- Upwork 连接器在 OAuth 未完成时诚实报 `blocked`；OAuth 走既有 MCP OAuth 路径，本模块不另实现。

## Persistence（§2 落地）

- 7 张 `earn_*` 表经 `tasksDatabase` 迁移 `0008_earn_tables`（additive-only）。
- 单一持久所有者 `EarnRepo`（`node:sqlite` `DatabaseSync`，automationRepo 骨架）。

## Tests

`hop3Earn.test.ts`（服务面行为）、`earnSchema.test.ts`（EARN_SCHEMA 防漂移）等已登记进 `scripts/engineering-test-files.json`。
