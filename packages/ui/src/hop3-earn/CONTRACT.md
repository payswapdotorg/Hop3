# hop3-earn-ui — CONTRACT

- **Owner:** Hop3 TL（§1 冻结入口；§2 UI 实现按此契约落地）
- **Layer:** contract（`contract.ts`）+ ui（`.`）双层
- **Requires:** ui, shared, services
- **Consumed by:** `AnimatedSidePanePanel` 右侧面板内容分支（Issue #13）、`WorkspaceSidebarFooter` 入口（经 `onOpenEarn`）、side pane tab 表现层（图标/标题/概览）

## Public surface（§2 落地后）

- `EarnPage`（Inbox / Saved / Applications / Profile / Sources 五区）
- `useEarnService` / `useEarnData`（数据 hooks；只读列表 + 证据门控变更）
- 诚实徽标（honest badges）、经济学披露、来源证据面板、去重分组、证据门控申请追踪器
- `useEarnComposerHandoff` — 照 `startDraftInWorkspace` 范式：`startDraft` + `requestComposerTextInsert`，**没有任何发送路径**
- i18n：en-US + zh-CN 全量 `earn.*` 键（ja/ru/ko 回退 en-US）

## 宿主集成（Issue #13 之后）

- Earn 是右侧面板标签：`WorkspaceSidePaneTab` 的 `type: "earn"`（固定 id `"earn"`，workspace 级可见性，每 workspace 一个，重复打开聚焦既有标签）。
- 窗口级 `EarnTabState` / `openEarnTab` / Root 全屏覆盖分支已删除；不存在全屏 Earn 或把 workspace 置 inert 的路径。
- 打开动作走 `useAppPanels().handleOpenEarn`（经 Shell 转发为 `onOpenEarn`）；不触发任何 provider 同步。
- 无 workspace 时（含 Settings 页 footer）不渲染 Earn 入口；不自动创建 workspace。

## 诚实纪律

- 渲染层不得把 unknown 折叠成 eligible；诚实常量按契约原样渲染。
- Upwork 来源只显示供应方顺序；无 Hop3 排名/评分。
- 所有申请变更走 `recordEvent`（证据门控）；UI 无独立状态写路径。
