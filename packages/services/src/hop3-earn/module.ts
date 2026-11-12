/**
 * hop3-earn 模块清单（architecture-governance managed 模块）。
 * 层：adapters。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const hop3EarnModule = {
  id: "hop3-earn",
  requires: ["shared", "services", "session"],
  provides: ["hop3-earn-service"],
  publicEntrypoints: ["index.ts", "contract.ts"],
} as const;
