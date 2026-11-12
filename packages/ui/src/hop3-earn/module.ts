/**
 * hop3-earn-ui 模块清单（architecture-governance managed 模块）。
 * 层：contract + ui。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const hop3EarnUiModule = {
  id: "hop3-earn-ui",
  requires: ["ui", "shared", "services"],
  provides: ["hop3-earn-ui"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
