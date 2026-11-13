# Hop3 Desktop Release

Status: implemented (first release `v3.18.0-hop3.1`).

This document specifies how Hop3 desktop installers are built, verified, and published.
Hop3 is a modified ZCode distribution: the build extends the existing Electron packaging
infrastructure — it does not replace it. See `HOP3_RULES.md` §3 (ZCode preservation) for the
constraints this pipeline must keep satisfying.

## Product identity

Hop3 identity is established through the existing product-identity resolution chain, not a
text replacement:

| Layer | Source of truth | Hop3 value |
| --- | --- | --- |
| Identity object | `packages/desktop/scripts/desktop-product-identity.mjs` | `productName: "Hop3"`, `appId: "io.github.payswapdotorg.hop3"`, `linuxExecutableName/PackageName: "hop3"` |
| Preview flavor | same module | `"Hop3 Preview"`, `io.github.payswapdotorg.hop3.preview`, `hop3-preview` |
| Electron Builder | `packages/desktop/electron-builder.config.js` (`appId`, `productName`, `extraMetadata`) | reads the identity object; asar `package.json` gets `productName: "Hop3"` |
| Linux deb/rpm/pacman | `deb.packageName` / `rpm.packageName` / `pacman.packageName` | `hop3` |
| Linux desktop entry | builder-generated | `Name=Hop3`, `Exec=/opt/Hop3/hop3`, `Icon=hop3`, `StartupWMClass=Hop3` |
| Runtime app name | `packages/desktop/src/main/desktopRuntimeEnv.ts` (`runtimeApplicationName`) | `Hop3` / `Hop3 Preview` / `Hop3 Dev` |
| About dialog | `packages/desktop/src/main/about.ts` | "Hop3 Desktop App", copyright line credits Hop3 Contributors + ZCode (Apache-2.0) |
| Window title | `packages/web/index.html` | `Hop3` |
| Icons | `packages/desktop/build/**` (icon, installer, windows, hicolor, dmg background) | Hop3 mark (three ascending hops) |

Deliberately preserved (upstream compatibility):

- Scoped module names (`@zcode/*`), the `zcode://` deep-link scheme, update-channel plumbing
  (`publish` generic placeholder), data-directory conventions inside the agent runtime,
  and the `ZCODE_*` environment contract.
- Attribution and licensing: `LICENSE`, `NOTICE.md`, `THIRD-PARTY-NOTICES.md` untouched;
  the About dialog and release notes credit ZCode.

Versioning: `<zcode-base>-hop3.<n>` (e.g. `3.18.0-hop3.1`), tagged `v3.18.0-hop3.1`.
Debian normalizes `-` to `~` (`3.18.0~hop3.1`), which sorts below the upstream base — correct
for a distribution fork.

## Release pipeline

Workflow: `.github/workflows/release-desktop.yml`, triggered by `v*` tags.

1. **Build jobs** (parallel, one OS per runner — no cross-compiled native dependencies):
   - Linux x64 (`ubuntu-latest`): AppImage, deb, rpm, pacman via `pnpm bundle:desktop -- linux x64`.
   - Windows x64 (`windows-latest`): NSIS via `pnpm bundle:desktop -- win x64`.
   - macOS arm64 + x64 (`macos-latest` matrix): dmg + zip.
   All builds run with `ZCODE_ENV=production` (production identity, no `_TEST` suffix).
2. **Mechanical gates** already inside `bundle.mjs` (run for every platform):
   runtime-dependency closure verification inside `app.asar`, native package policy,
   node-pty prebuild assertion, and the bundle-size audit.
3. **Installation smokes** (bounded, evidence-producing):
   - Linux: deb control fields (`Package: hop3`, homepage), desktop-entry fields, then a
     headless first launch (`--ozone-platform=headless`) checked for missing-module errors.
   - Windows: `/S` silent install, installed `Hop3.exe` present, bounded headless first launch.
   - macOS: dmg mounts, `Hop3.app` exists, `CFBundleIdentifier` is `io.github.payswapdotorg.hop3`.
4. **Publish job** (needs all builds): assembles `SHA256SUMS.txt` and
   `release-manifest.json` (asset sizes + SHA256 + source commit + toolchain), creates a
   **draft** release, uploads assets, re-verifies the required asset set, and only then
   flips the release to published. Any missing required asset fails the job and the release
   stays draft — failed or incomplete builds are never presented as releases.

First releases are unsigned (no Apple Developer ID, no Authenticode); installers state this
via release notes and `INSTALL.md` includes the bypass steps. Signing can be enabled later
via the existing `ZCODE_ENABLE_MAC_SIGN` / `ZCODE_ENABLE_WINDOWS_SIGN` switches without
changing this pipeline.

Local constrained validation may subset Linux targets via
`ZCODE_DESKTOP_LINUX_TARGETS="AppImage,deb"`; CI always builds the full target set.

## Local-agent install contract

The machine that consumes Hop3 never builds it:

1. Detect OS/architecture.
2. Download the matching `Hop3-*` asset from the GitHub Release.
3. Verify against `SHA256SUMS.txt`.
4. Install with the OS mechanism (`apt`/`dpkg`, NSIS `/S`, dmg copy, `dnf`, `pacman -U`).
5. Launch `hop3` / `Hop3.exe` / `Hop3.app` and complete first-run configuration.

The reference implementation of this contract is
`scripts/install-hop3-desktop.mjs` (zero dependencies, Node >= 18):

```bash
node scripts/install-hop3-desktop.mjs            # latest release, platform default asset
node scripts/install-hop3-desktop.mjs --user --smoke   # rootless install + bounded first-launch check
```

It resolves the latest published release via redirects (no GitHub API — avoids
rate limits), cross-verifies every download against **both** `SHA256SUMS.txt`
and `release-manifest.json` (fail-closed on disagreement or mismatch), installs
with the OS mechanism, and supports `--user` rootless installs for agent
accounts without sudo (deb payload extracted to `~/.local/share/Hop3/<version>`
with a rewritten `.desktop` entry and `~/.local/bin/hop3` launcher), plus
`--download-only`, `--list`, `--asset`, and `--version` pinning. Agents without
Node can follow the manual steps in `INSTALL.md` instead.

## Acceptance checklist (per release)

- [ ] Clean-machine install on each supported OS (CI smoke covers install + first launch).
- [ ] First launch reaches the main window without missing runtime modules.
- [ ] Correct Hop3 identity: window/menu/About show "Hop3"; deb `Package: hop3`;
      macOS `CFBundleIdentifier` matches the appId; Linux desktop entry `Name=Hop3`.
- [ ] Existing ZCode features remain available (composer, sessions, tools, plugins).
- [ ] The Earn integration is present in the packaged app.
- [ ] Data survives application restart (userData directory persistence).
- [ ] Upgrade installs over the previous version without destroying user data.
- [ ] Uninstall removes the application and is documented (`INSTALL.md` §5).
- [ ] `SHA256SUMS.txt` and `release-manifest.json` attached and verified before publishing.

## Out of scope (tracked separately)

- Linux arm64 and Windows arm64 installers (infrastructure exists; add after first release).
- Code-signing certificates and notarization.
- Auto-update channel rewiring (upstream server-manifest updater is out of scope for the
  first releases; the packaged updater is disabled for production until a feed is decided).
