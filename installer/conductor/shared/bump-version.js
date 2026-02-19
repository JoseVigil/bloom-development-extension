#!/usr/bin/env node
/**
 * bump-version.js — Shared build counter for Bloom Nucleus executables
 *
 * Usage (from setup/ or launcher/):
 *   node ../shared/bump-version.js [--dry-run] [--patch] [--minor] [--major]
 *
 * - Increments build number on every call (always)
 * - Optionally bumps patch/minor/major (resets lower counters)
 * - Updates package.json "version" field to match semver
 * - Writes build_info.json (embedded in asar, exposed via --info/--version)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Resolve paths relative to CWD (script is called from setup/ or launcher/) ───
const CWD = process.cwd();
const VERSION_FILE = path.join(CWD, 'version.json');
const PACKAGE_FILE = path.join(CWD, 'package.json');
const BUILD_INFO_FILE = path.join(CWD, 'build_info.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BUMP_MAJOR = args.includes('--major');
const BUMP_MINOR = args.includes('--minor');
const BUMP_PATCH = args.includes('--patch');
// Default: only increment build counter

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[bump-version] ERROR: File not found: ${filePath}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`[bump-version] ERROR: Failed to parse ${filePath}: ${e.message}`);
    process.exit(1);
  }
}

function writeJson(filePath, data) {
  if (!DRY_RUN) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
}

function getGitCommit() {
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse --short HEAD', { cwd: CWD, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function getTargetArch() {
  // Detect build platform: check process.arch and env overrides
  const archEnv = process.env.BLOOM_ARCH || process.env.npm_config_arch;
  if (archEnv) return archEnv;
  const arch = os.arch();
  // Normalize to our naming convention
  if (arch === 'x64') return 'win64';
  if (arch === 'ia32' || arch === 'x32') return 'win32';
  return arch; // arm64, etc.
}

// ─── Read current state ───────────────────────────────────────────────────────
const version = readJson(VERSION_FILE);
const pkg = readJson(PACKAGE_FILE);

// ─── Apply bumps ──────────────────────────────────────────────────────────────
if (BUMP_MAJOR) {
  version.major += 1;
  version.minor = 0;
  version.patch = 0;
  version.build = 0;
} else if (BUMP_MINOR) {
  version.minor += 1;
  version.patch = 0;
  version.build = 0;
} else if (BUMP_PATCH) {
  version.patch += 1;
  version.build = 0;
}

// Always increment build
version.build += 1;

// Recompute semver string
version.semver = `${version.major}.${version.minor}.${version.patch}`;
const fullVersion = `${version.semver}+build.${version.build}`;

// ─── Compute build metadata ───────────────────────────────────────────────────
const buildInfo = {
  name: pkg.name,
  product_name: pkg.productName || pkg.name,
  version: version.semver,
  build: version.build,
  full_version: fullVersion,
  channel: version.channel || 'stable',
  built_at: new Date().toISOString(),
  git_commit: getGitCommit(),
  platform: process.platform,
  arch: getTargetArch(),
  node_version: process.version,
  electron_version: pkg.devDependencies?.electron || pkg.dependencies?.electron || 'unknown'
};

// ─── Patch package.json version field ────────────────────────────────────────
pkg.version = version.semver;

// ─── Write files ──────────────────────────────────────────────────────────────
if (DRY_RUN) {
  console.log('[bump-version] DRY RUN — no files written');
  console.log('[bump-version] version.json would be:', JSON.stringify(version, null, 2));
  console.log('[bump-version] build_info.json would be:', JSON.stringify(buildInfo, null, 2));
} else {
  writeJson(VERSION_FILE, version);
  writeJson(PACKAGE_FILE, pkg);
  writeJson(BUILD_INFO_FILE, buildInfo);
}

console.log(`[bump-version] ✅ ${buildInfo.product_name} → ${fullVersion} (${buildInfo.built_at})`);
console.log(`[bump-version]    git: ${buildInfo.git_commit} | arch: ${buildInfo.arch} | platform: ${buildInfo.platform}`);