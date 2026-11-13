# Installing Hop3

Hop3 ships as a versioned desktop application built from [ZCode](https://github.com/payswapdotorg/Hop3)
(v3.18.0 base). You do not need Node.js, pnpm, or any development environment —
download an installer, verify it, install it, and launch it.

Installers for every release are attached to the
[GitHub Releases](https://github.com/payswapdotorg/Hop3/releases) page, together with
`SHA256SUMS.txt` (checksums) and `release-manifest.json` (machine-readable build provenance).

## 1. Download

Pick the asset matching your OS and CPU architecture (`Hop3-<version>-<platform>-<arch>.<ext>`):

| Asset pattern | Platform | Install mechanism |
| --- | --- | --- |
| `Hop3-*-linux-x86_64.AppImage` | Linux x64 (any distro) | self-contained, run directly |
| `Hop3-*-linux-amd64.deb` | Ubuntu/Debian x64 | `dpkg` / `apt` |
| `Hop3-*-linux-x86_64.rpm` | RHEL/Fedora/openSUSE x64 | `dnf` / `rpm` |
| `Hop3-*-linux-x86_64.pkg.tar.zst` | Arch x64 | `pacman -U` |
| `Hop3-*-win-x64.exe` | Windows 10/11 x64 | NSIS installer |
| `Hop3-*-mac-arm64.dmg` | macOS 13+ (Apple Silicon) | drag to Applications |
| `Hop3-*-mac-x64.dmg` | macOS 13+ (Intel) | drag to Applications |

## 2. Verify checksums

```bash
sha256sum --check SHA256SUMS.txt --ignore-missing
```

(GNU coreutils; on macOS use `shasum -a 256 -c`; on Windows `certutil -hashfile <file> SHA256`.)
Always verify before installing. The release notes record the exact source commit and toolchain.

## 3. Install

### Linux — deb (Ubuntu/Debian)

```bash
sudo apt install ./Hop3-<version>-linux-amd64.deb
```

Launch from the desktop menu ("Hop3", category Development) or run `hop3`.

### Linux — AppImage (any distro)

```bash
chmod +x Hop3-<version>-linux-x86_64.AppImage
./Hop3-<version>-linux-x86_64.AppImage
```

### Linux — rpm / pacman

```bash
sudo dnf install ./Hop3-<version>-linux-x86_64.rpm
# Arch: pacman -U ./Hop3-<version>-linux-x86_64.pkg.tar.zst
```

### Windows

Run `Hop3-<version>-win-x64.exe`. The installer is assisted (you may choose the install
directory). Silent installs: append `/S`. Default per-user install path:
`%LOCALAPPDATA%\Programs\Hop3\Hop3.exe`.

### macOS

Open the `.dmg`, drag **Hop3** into `/Applications`, launch from there.

First releases are **unsigned**:

- macOS Gatekeeper will warn on first launch — right-click the app, choose **Open**, confirm.
- Windows SmartScreen may show "Windows protected your PC" — choose **More info → Run anyway**.

## 4. First run and data

- First launch creates the app data directory under `~/.config/Hop3` (Linux),
  `%APPDATA%\Hop3` (Windows), `~/Library/Application Support/Hop3` (macOS).
- Hop3 keeps its own data directory and install identity (`io.github.payswapdotorg.hop3`);
  it installs beside — not on top of — any existing ZCode installation.
- The `zcode://` deep-link scheme is intentionally preserved for OAuth compatibility with
  the upstream backend. If both Hop3 and ZCode are installed, the OS routes the link to the
  app that registered it last.
- All agent runtime features (composer, sessions, tools, plugins, the Earn tab) run locally;
  sign-in connects to the upstream production backend.

## 5. Upgrade and uninstall

- **Upgrade**: install a newer version over the existing one. The deb/rpm/pacman/NSIS
  packages replace the application while leaving the user data directory untouched.
- **Uninstall**: `sudo apt remove hop3` (or `dnf remove hop3`, `pacman -R hop3`,
  "Hop3" in Windows Apps settings, or move Hop3.app to Trash on macOS).
  Uninstall removes the application only; delete `~/.config/Hop3` to also remove user data.

## Troubleshooting

- `hop3` does not start on Linux — the deb depends on `libgtk-3-0`, `libnotify4`, `libnss3`
  and friends; the package manager resolves them automatically when installing the `.deb`.
- AppImage requires FUSE (`libfuse2` on Ubuntu 22.04+). Alternatively run it with
  `--appimage-extract-and-run`.
- See [docs/desktop-release/RELEASE.md](docs/desktop-release/RELEASE.md) for the release
  process, verification gates, and the acceptance checklist behind each release.
