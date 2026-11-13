#!/usr/bin/env node
/**
 * Hop3 Desktop local-agent install client.
 *
 * Implements the "Local-agent install contract" from docs/desktop-release/RELEASE.md:
 * the machine that consumes Hop3 never builds it. This script only downloads a
 * published release asset, verifies it fail-closed against `SHA256SUMS.txt` and
 * `release-manifest.json`, installs it with the OS mechanism (or a rootless
 * `--user` mode for agent accounts without sudo), and can run a bounded headless
 * first-launch smoke identical to the release pipeline's.
 *
 * Zero runtime dependencies: Node built-ins only. Node >= 18.
 *
 * Usage:
 *   node scripts/install-hop3-desktop.mjs                  # latest release, platform default asset
 *   node scripts/install-hop3-desktop.mjs --list           # show assets of a release
 *   node scripts/install-hop3-desktop.mjs --version v3.18.0-hop3.2
 *   node scripts/install-hop3-desktop.mjs --asset AppImage
 *   node scripts/install-hop3-desktop.mjs --user           # rootless install (no sudo needed)
 *   node scripts/install-hop3-desktop.mjs --download-only   # fetch + verify, no install
 *   node scripts/install-hop3-desktop.mjs --smoke          # bounded headless first-launch check
 *
 * Environment:
 *   HOP3_RELEASE_REPO   GitHub <owner>/<repo> (default payswapdotorg/Hop3)
 *   HOP3_RELEASE_TAG    Default release tag (still overridden by --version)
 *   GITHUB_TOKEN / GH_TOKEN   Optional auth header for rate-limited networks
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir, platform as osPlatform, arch as osArch } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RELEASE_REPO = process.env.HOP3_RELEASE_REPO || "payswapdotorg/Hop3";
const DOWNLOAD_BASE = `https://github.com/${RELEASE_REPO}/releases/download`;
const LATEST_URL = `https://github.com/${RELEASE_REPO}/releases/latest`;
const EXPECTED_MANIFEST_SCHEMA = "hop3-desktop-release/1";
const DOWNLOAD_ATTEMPTS = 3;
const SMOKE_TIMEOUT_SECONDS = 60;

const log = (...parts) => console.log(parts.join(" "));
const warn = (...parts) => console.error(parts.join(" "));

function fail(message) {
  warn(`[hop3-install] ERROR: ${message}`);
  process.exit(1);
}

function usage() {
  return [
    "Usage: node scripts/install-hop3-desktop.mjs [options]",
    "",
    "Options:",
    "  --version <tag>     Release tag or version (e.g. v3.18.0-hop3.2). Default: latest.",
    "  --asset <kind>      deb | rpm | pacman | AppImage | exe | dmg. Default: platform default.",
    "  --user              Rootless install (Linux deb/AppImage, macOS ~/Applications).",
    "  --install-dir <dir> Rootless install root (default ~/.local/share/Hop3).",
    "  --download-only     Download and verify, then stop (no install).",
    "  --list              List release assets from SHA256SUMS + manifest, then exit.",
    "  --smoke             After install, bounded headless first-launch smoke.",
    "  --keep              Keep downloaded artifacts instead of removing them.",
    "  --help              This help.",
    "",
    "Environment: HOP3_RELEASE_REPO, HOP3_RELEASE_TAG, GITHUB_TOKEN/GH_TOKEN (optional).",
  ].join("\n");
}

function parseArgs(args) {
  const options = {
    version: process.env.HOP3_RELEASE_TAG || "latest",
    asset: null,
    userMode: false,
    installDir: null,
    downloadOnly: false,
    list: false,
    smoke: false,
    keep: false,
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = () => {
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) fail(`missing value after ${arg}`);
      index += 1;
      return next;
    };
    if (arg === "--version") options.version = value();
    else if (arg === "--asset") options.asset = value();
    else if (arg === "--install-dir") options.installDir = value();
    else if (arg === "--user") options.userMode = true;
    else if (arg === "--download-only") options.downloadOnly = true;
    else if (arg === "--list") options.list = true;
    else if (arg === "--smoke") options.smoke = true;
    else if (arg === "--keep") options.keep = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else fail(`unknown option ${arg}\n\n${usage()}`);
  }
  return options;
}

function normalizeTag(version) {
  if (version === "latest") return null;
  const trimmed = version.trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

async function authHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function resolveLatestTag() {
  const response = await fetch(LATEST_URL, {
    redirect: "manual",
    headers: await authHeaders(),
  });
  // GitHub answers 302 -> releases/tag/<tag> for the newest published release.
  if (response.status < 300 || response.status >= 400) {
    fail(`could not resolve latest release (HTTP ${response.status}); pass --version explicitly`);
  }
  const location = response.headers.get("location") || "";
  const match = location.match(/\/releases\/tag\/([^/?#]+)/);
  if (!match) fail(`unexpected redirect for latest release: ${location}`);
  return decodeURIComponent(match[1]);
}

function formatBytes(size) {
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
  return `${Math.max(1, Math.round(size / 1024))} KiB`;
}

async function downloadToFile(url, target) {
  const headers = { ...(await authHeaders()) };
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers, redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${basename(url)}`);
      const total = Number(response.headers.get("content-length")) || 0;
      rmSync(target, { force: true });
      const stream = (await import("node:fs")).createWriteStream(target);
      const hash = createHash("sha256");
      let received = 0;
      let lastReport = 0;
      for await (const chunk of response.body) {
        stream.write(chunk);
        hash.update(chunk);
        received += chunk.length;
        const now = Date.now();
        if (total && now - lastReport > 5000) {
          lastReport = now;
          log(`  ... ${formatBytes(received)} / ${formatBytes(total)}`);
        }
      }
      await new Promise((resolveStream, rejectStream) => {
        stream.on("error", rejectStream);
        stream.end(resolveStream);
      });
      return { size: received, sha256: hash.digest("hex") };
    } catch (error) {
      warn(`[hop3-install] download attempt ${attempt}/${DOWNLOAD_ATTEMPTS} failed: ${error.message}`);
      if (attempt === DOWNLOAD_ATTEMPTS) throw error;
      await new Promise((sleep) => setTimeout(sleep, 2000 * attempt));
    }
  }
  throw new Error("unreachable download retry exit");
}

async function fetchText(url) {
  const response = await fetch(url, { headers: await authHeaders(), redirect: "follow" });
  if (!response.ok) fail(`HTTP ${response.status} fetching ${basename(url)}`);
  return response.text();
}

function parseSums(text) {
  const entries = new Map();
  for (const line of text.split("\n")) {
    const match = line.match(/^([0-9a-f]{64})\s+\*?(.+?)\s*$/);
    if (match) entries.set(match[2], match[1]);
  }
  return entries;
}

const ASSET_KINDS = ["deb", "rpm", "pacman", "AppImage", "exe", "dmg"];

const ASSET_PLATFORMS = {
  deb: "linux",
  rpm: "linux",
  pacman: "linux",
  AppImage: "linux",
  exe: "win",
  "dmg-arm64": "mac",
  "dmg-x64": "mac",
};

const ASSET_MATCHERS = {
  deb: (name) => name.endsWith("-linux-amd64.deb"),
  rpm: (name) => name.endsWith("-linux-x86_64.rpm"),
  pacman: (name) => name.endsWith("-linux-x64.pkg.tar.zst"),
  AppImage: (name) => name.endsWith("-linux-x86_64.AppImage"),
  exe: (name) => name.endsWith("-win-x64.exe"),
  "dmg-arm64": (name) => name.endsWith("-mac-arm64.dmg"),
  "dmg-x64": (name) => name.endsWith("-mac-x64.dmg"),
};

function detectPlatform() {
  const platform = osPlatform();
  const arch = osArch();
  if (platform === "linux") {
    if (arch !== "x64") fail(`Linux ${arch} installers are not published yet (first releases are x64 only)`);
    return { platform, arch, kind: "linux" };
  }
  if (platform === "darwin") {
    if (arch !== "arm64" && arch !== "x64") fail(`macOS ${arch} is not supported`);
    return { platform, arch, kind: "mac" };
  }
  if (platform === "win32") {
    if (arch !== "x64") fail(`Windows ${arch} installers are not published yet (first releases are x64 only)`);
    return { platform, arch, kind: "win" };
  }
  return fail(`unsupported platform ${platform}`);
}

function commandExists(name) {
  const pathEnv = process.env.PATH || "";
  const separator = osPlatform() === "win32" ? ";" : ":";
  const suffixes = osPlatform() === "win32" ? ["", ".exe", ".cmd"] : [""];
  for (const dir of pathEnv.split(separator)) {
    if (!dir) continue;
    for (const suffix of suffixes) {
      if (existsSync(join(dir, `${name}${suffix}`))) return true;
    }
  }
  return false;
}

function defaultAssetKind(kind, arch) {
  if (kind === "mac") return arch === "arm64" ? "dmg-arm64" : "dmg-x64";
  if (kind === "win") return "exe";
  if (commandExists("apt-get") && commandExists("dpkg")) return "deb";
  if (commandExists("dnf") || commandExists("rpm")) return "rpm";
  if (commandExists("pacman")) return "pacman";
  return "AppImage";
}

function selectAsset(sums, kind) {
  const candidates = [];
  for (const [name, sha256] of sums) {
    if (ASSET_MATCHERS[kind]?.(name)) candidates.push({ name, sha256 });
  }
  if (candidates.length === 0) fail(`release has no asset matching kind "${kind}" (see --list)`);
  if (candidates.length > 1) {
    const names = candidates.map((entry) => entry.name).join(", ");
    warn(`[hop3-install] ambiguous asset for "${kind}": ${names}; picking ${candidates[0].name}`);
  }
  return candidates[0];
}

function sudoPrefix() {
  if (osPlatform() === "win32") return [];
  if (typeof process.getuid === "function" && process.getuid() === 0) return [];
  if (commandExists("sudo")) return ["sudo"];
  fail("installation requires root privileges but sudo is unavailable; use --user for a rootless install");
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
    ...options.spawn,
  });
  if (result.error) fail(`could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    if (options.capture) {
      const text = `${result.stdout || ""}${result.stderr || ""}`.trim();
      if (text) warn(text);
    }
    fail(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
  return result;
}

function linkLauncher(binary) {
  const binDir = join(homedir(), ".local/bin");
  mkdirSync(binDir, { recursive: true });
  const link = join(binDir, "hop3");
  rmSync(link, { force: true });
  try {
    symlinkSync(binary, link);
  } catch {
    copyFileSync(binary, link);
    chmodSync(link, 0o755);
  }
  if (!(process.env.PATH || "").includes(binDir)) {
    warn(`[hop3-install] note: ${binDir} is not on PATH; add it to launch "hop3" from any shell`);
  }
}

function installDeb(filePath, options) {
  if (options.userMode) return installDebRootless(filePath, options);
  const prefix = sudoPrefix();
  if (commandExists("apt-get")) {
    runCommand(prefix[0] || "apt-get", [...prefix.slice(1), "install", "--yes", filePath]);
  } else {
    runCommand(prefix[0] || "dpkg", [...prefix.slice(1), "--install", filePath]);
  }
  return { binary: "/opt/Hop3/hop3", description: "system deb install (apt/dpkg)" };
}

function installDebRootless(filePath, options) {
  if (!commandExists("dpkg-deb")) fail("--user deb install requires dpkg-deb (dpkg package)");
  const installRoot = resolve(options.installDir || join(homedir(), ".local/share/Hop3"));
  const versionDir = join(installRoot, options.versionLabel || "deb");
  const staging = join(tmpdir(), `hop3-deb-extract-${Date.now()}`);
  mkdirSync(staging, { recursive: true });
  runCommand("dpkg-deb", ["--extract", filePath, staging]);

  const payload = join(staging, "opt", "Hop3");
  if (!existsSync(payload)) fail("deb payload missing expected /opt/Hop3 directory");
  rmSync(versionDir, { recursive: true, force: true });
  mkdirSync(dirname(versionDir), { recursive: true });
  runCommand("mv", [payload, versionDir]);
  const binary = join(versionDir, "hop3");
  if (!existsSync(binary)) fail(`extracted binary missing: ${binary}`);
  chmodSync(binary, 0o755);

  // User-level desktop integration: copy the .desktop entry with a rewritten
  // Exec and the hicolor icons so rootless installs still appear in menus.
  const applicationsSource = join(staging, "usr/share/applications");
  if (existsSync(applicationsSource)) {
    const desktopName = readdirSync(applicationsSource).find((name) => name.endsWith(".desktop"));
    if (desktopName) {
      const entry = readFileSync(join(applicationsSource, desktopName), "utf8");
      const applicationsDir = join(homedir(), ".local/share/applications");
      mkdirSync(applicationsDir, { recursive: true });
      writeFileSync(
        join(applicationsDir, "hop3.desktop"),
        entry.replace(/^Exec=.*$/m, `Exec=${binary} %U`),
      );
    }
  }
  const iconsSource = join(staging, "usr/share/icons/hicolor");
  if (existsSync(iconsSource)) {
    const iconsTarget = join(homedir(), ".local/share/icons/hicolor");
    mkdirSync(iconsTarget, { recursive: true });
    runCommand("cp", ["-a", `${iconsSource}/.`, `${iconsTarget}/`], {
      spawn: { stdio: "ignore" },
    });
  }
  rmSync(staging, { recursive: true, force: true });
  linkLauncher(binary);
  return { binary, description: `rootless deb install at ${versionDir}` };
}

function installRpm(filePath) {
  const prefix = sudoPrefix();
  if (commandExists("dnf")) {
    runCommand(prefix[0] || "dnf", [...prefix.slice(1), "install", "--assumeyes", filePath]);
  } else {
    runCommand(prefix[0] || "rpm", [...prefix.slice(1), "--upgrade", "--replacepkgs", filePath]);
  }
  return { binary: "/opt/Hop3/hop3", description: "system rpm install (dnf/rpm)" };
}

function installPacman(filePath) {
  const prefix = sudoPrefix();
  runCommand(prefix[0] || "pacman", [...prefix.slice(1), "--upgrade", "--noconfirm", filePath]);
  return { binary: "/opt/Hop3/hop3", description: "system pacman install" };
}

function installAppImage(filePath, options) {
  const installRoot = resolve(options.installDir || join(homedir(), "Applications"));
  mkdirSync(installRoot, { recursive: true });
  const target = join(installRoot, basename(filePath));
  rmSync(target, { force: true });
  runCommand("cp", [filePath, target], { spawn: { stdio: "ignore" } });
  chmodSync(target, 0o755);
  linkLauncher(target);
  return { binary: target, description: `AppImage at ${target}` };
}

function installWindowsExe(filePath) {
  runCommand(resolve(filePath), ["/S"], { spawn: { stdio: "ignore", windowsHide: true } });
  const appDir = join(process.env.LOCALAPPDATA || "", "Programs", "Hop3");
  const appExe = join(appDir, "Hop3.exe");
  if (!existsSync(appExe)) fail(`silent install finished but ${appExe} is missing`);
  return { binary: appExe, description: `NSIS install at ${appDir}` };
}

function installDmg(filePath, options) {
  const mount = runCommand("hdiutil", ["attach", "-nobrowse", "-readonly", filePath], { capture: true });
  const mountPoint = `${mount.stdout || ""}${mount.stderr || ""}`
    .match(/\/Volumes\/[^\n]*/)?.[0]
    ?.trim();
  if (!mountPoint) fail("could not parse dmg mount point");
  const appSource = join(mountPoint, "Hop3.app");
  if (!existsSync(appSource)) fail("dmg does not contain Hop3.app");
  const targetRoot = options.userMode ? join(homedir(), "Applications") : "/Applications";
  mkdirSync(targetRoot, { recursive: true });
  const target = join(targetRoot, "Hop3.app");
  rmSync(target, { recursive: true, force: true });
  runCommand("cp", ["-R", appSource, target]);
  runCommand("hdiutil", ["detach", mountPoint]);
  return { binary: join(target, "Contents/MacOS", "Hop3"), description: `Hop3.app at ${targetRoot}` };
}

function killTree(child) {
  if (osPlatform() === "win32") {
    if (child.pid) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    }
    return;
  }
  try {
    if (child.pid) process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // Process already gone.
    }
  }
}

async function smokeLaunch(installed) {
  const kind = detectPlatform().kind;
  if (kind === "mac") {
    warn("[hop3-install] --smoke is not supported on macOS (matching release pipeline coverage)");
    return;
  }
  if (!existsSync(installed.binary)) fail(`smoke: binary missing at ${installed.binary}`);
  const home = join(tmpdir(), `hop3-smoke-home-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  log(`[hop3-install] smoke: launching ${installed.binary} headless for ${SMOKE_TIMEOUT_SECONDS}s`);
  const child = spawn(installed.binary, ["--no-sandbox", "--disable-gpu", "--ozone-platform=headless"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOME: home },
    detached: osPlatform() !== "win32",
  });
  let output = "";
  const append = (chunk) => {
    output += chunk;
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  const exited = new Promise((settle) => child.on("exit", () => settle("exited")));
  const timer = setTimeout(() => killTree(child), SMOKE_TIMEOUT_SECONDS * 1000);
  await Promise.race([
    exited,
    new Promise((sleep) => setTimeout(sleep, SMOKE_TIMEOUT_SECONDS * 1000 + 5000)),
  ]);
  clearTimeout(timer);
  killTree(child);
  await exited;
  const tail = () => output.split("\n").slice(-20).join("\n");
  if (/Cannot find module|MODULE_NOT_FOUND/.test(output)) {
    warn(tail());
    fail("smoke: launch log reports missing runtime modules");
  }
  if (!/version=/.test(output)) {
    warn(tail());
    fail("smoke: launch log lacks the version banner");
  }
  log("[hop3-install] smoke: first launch OK (no missing modules, version banner present)");
  rmSync(home, { recursive: true, force: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    log(usage());
    return 0;
  }
  if (options.asset && !ASSET_KINDS.includes(options.asset)) {
    fail(`unknown asset kind "${options.asset}" (expected one of ${ASSET_KINDS.join(", ")})`);
  }

  const detected = detectPlatform();
  const tag = normalizeTag(options.version) || (await resolveLatestTag());
  log(`[hop3-install] release repo : ${RELEASE_REPO}`);
  log(`[hop3-install] release tag  : ${tag}`);
  log(`[hop3-install] platform    : ${detected.platform}-${detected.arch}`);

  const releaseBase = `${DOWNLOAD_BASE}/${tag}`;
  const sums = parseSums(await fetchText(`${releaseBase}/SHA256SUMS.txt`));
  let manifest;
  try {
    manifest = JSON.parse(await fetchText(`${releaseBase}/release-manifest.json`));
  } catch {
    fail("release-manifest.json is not valid JSON");
  }
  if (manifest.schema !== EXPECTED_MANIFEST_SCHEMA) {
    fail(`release-manifest.json schema ${manifest.schema} != ${EXPECTED_MANIFEST_SCHEMA}`);
  }
  if (sums.size === 0) fail("SHA256SUMS.txt contains no entries");

  if (options.list) {
    log(`release ${manifest.product} ${manifest.version} (commit ${manifest.sourceCommit}, built ${manifest.builtAt})`);
    for (const asset of manifest.assets || []) {
      log(`  ${asset.name}  ${formatBytes(asset.size)}  sha256:${asset.sha256.slice(0, 16)}...`);
    }
    return 0;
  }

  const kind = options.asset
    ? options.asset === "dmg"
      ? detected.kind === "mac"
        ? detected.arch === "arm64"
          ? "dmg-arm64"
          : "dmg-x64"
        : fail("--asset dmg is only valid on macOS")
      : options.asset
    : defaultAssetKind(detected.kind, detected.arch);

  if ((ASSET_PLATFORMS[kind] || detected.kind) !== detected.kind) {
    const supported = Object.entries(ASSET_PLATFORMS)
      .filter(([, platform]) => platform === detected.kind)
      .map(([name]) => name);
    fail(`asset "${kind}" does not match platform ${detected.platform}; use one of: ${supported.join(", ")}`);
  }

  const asset = selectAsset(sums, kind);
  const manifestEntry = (manifest.assets || []).find((entry) => entry.name === asset.name);
  if (!manifestEntry) fail(`${asset.name} is missing from release-manifest.json (fail-closed)`);
  if (manifestEntry.sha256 !== asset.sha256) {
    fail(`checksum disagreement between SHA256SUMS.txt and release-manifest.json for ${asset.name}`);
  }
  log(`[hop3-install] asset       : ${asset.name} (${formatBytes(manifestEntry.size)})`);
  log(`[hop3-install] source commit: ${manifest.sourceCommit}`);
  options.versionLabel = manifest.version;

  const workDir = join(process.cwd(), ".hop3-install-cache");
  mkdirSync(workDir, { recursive: true });
  const target = join(workDir, asset.name);
  const download = await downloadToFile(`${releaseBase}/${encodeURIComponent(asset.name)}`, target);
  if (download.sha256 !== asset.sha256) {
    fail(`sha256 mismatch for ${asset.name}: got ${download.sha256}, expected ${asset.sha256}`);
  }
  if (manifestEntry.size !== download.size) {
    fail(`size mismatch for ${asset.name}: got ${download.size}, expected ${manifestEntry.size}`);
  }
  log(`[hop3-install] verified sha256 ${asset.sha256}`);

  if (options.downloadOnly) {
    log(`[hop3-install] downloaded to ${target} (--download-only)`);
    return 0;
  }

  log(`[hop3-install] installing (${kind})...`);
  let installed;
  switch (kind) {
    case "deb":
      installed = installDeb(resolve(target), options);
      break;
    case "rpm":
      if (options.userMode) fail("--user is not supported for rpm assets; use deb or AppImage");
      installed = installRpm(resolve(target));
      break;
    case "pacman":
      if (options.userMode) fail("--user is not supported for pacman assets; use deb or AppImage");
      installed = installPacman(resolve(target));
      break;
    case "AppImage":
      installed = installAppImage(resolve(target), options);
      break;
    case "exe":
      if (options.userMode) {
        warn("[hop3-install] note: the NSIS installer is already per-user; --user has no extra effect");
      }
      installed = installWindowsExe(resolve(target));
      break;
    case "dmg-arm64":
    case "dmg-x64":
      installed = installDmg(resolve(target), options);
      break;
    default:
      fail(`unhandled asset kind ${kind}`);
  }
  log(`[hop3-install] installed   : ${installed.description}`);
  log(`[hop3-install] launch with: ${installed.binary}`);

  if (options.smoke) await smokeLaunch(installed);

  if (!options.keep) rmSync(workDir, { recursive: true, force: true });
  log(`[hop3-install] done (Hop3 ${manifest.version}, commit ${manifest.sourceCommit}).`);
  return 0;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || "install-hop3-desktop.mjs")).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    fail(error.stack || error.message);
  }
}
