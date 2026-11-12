# hop3-earn-ui — CONTRACT

- **Owner:** Hop3 TL（§1 冻结入口；§2 UI 实现按此契约落地）
- **Layer:** contract（`contract.ts`）+ ui（`.`）双层
- **Requires:** ui, shared, services
- **Consumed by:** `Root.tsx` 渲染分支、`WorkspaceSidebarFooter` 入口、`tabStore`（`EarnTabState` 种类）

## Public surface（§2 落地后）

- `EarnPage`（Inbox / Saved / Applications / Profile / Sources 五区）
- `useEarnService` / `useEarnData`（数据 hooks；只读列表 + 证据门控变更）
- 诚实徽标（honest badges）、经济学披露、来源证据面板、去重分组、证据门控申请追踪器
- `useEarnComposerHandoff` — 照 `startDraftInWorkspace` 范式：`startDraft` + `requestComposerTextInsert`，**没有任何发送路径**
- i18n：en-US + zh-CN 全量 `earn.*` 键（ja/ru/ko 回退 en-US）

## 诚实纪律

- 渲染层不得把 unknown 折叠成 eligible；诚实常量按契约原样渲染。
- Upwork 来源只显示供应方顺序；无 Hop3 排名/评分。
- 所有申请变更走 `recordEvent`（证据门控）；UI 无独立状态写路径。
