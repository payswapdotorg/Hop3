# hop3-earn-shared — CONTRACT

- **Owner:** Hop3 TL（冻结契约，修改必须走 TL）
- **Layer:** contract（`packages/shared/src/hop3-earn`）
- **Requires:** shared
- **Consumed by:** `hop3-earn`（services/adapters）、`hop3-earn-ui`（ui）、任何经 `IEarnService` 的调用方

## Public surface

- `hop3EarnTypes.ts` — Stage 1 冻结的领域形状与常量（逐字移植自参考实现 `contracts.ts`；源头：`docs/DOMAIN-MODEL.md` + `docs/CONNECTORS.md`）
- `contract.ts` — 模块对外契约面（再导出冻结表面）
- `contract.example.ts` — 编译期用法示例（构造 RawListing / 卡片 DTO / 诚实常量）
- `index.ts` — 公共入口

## 冻结纪律（不可协商）

1. 缺失值保持缺失 —— 永不填模型猜测值。
2. 未知资格/支付是 `"unknown"`，永不写成 `"eligible"`。
3. 毛额与净额永不合并；估算永不写成保证（`EconomicsEstimate.guaranteed` 恒 `false`）。
4. 有排名限制的来源（Upwork）只保供应方顺序 —— `rankingPolicy: "provider-order-only"`。
5. 无自动提交；生命周期仅凭证据事件迁移（`RecordEventInput` 是状态唯一变更入口）。
6. 五条诚实常量（no-auto-submit / payout-unknown / economics-disclaimer / user-submitted / sandbox-fixture）是 locale 无关的契约数据，UI 原样渲染。

## 变更流程

任何形状变更都必须：先改 `docs/DOMAIN-MODEL.md` 或 `docs/CONNECTORS.md` 的冻结定义，再由 TL 在本模块同步，并在两个消费模块（`hop3-earn`、`hop3-earn-ui`）重跑闸门。Worker 不得直接修改本目录。
