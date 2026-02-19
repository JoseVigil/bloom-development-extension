/**
 * shared/build-info.js
 *
 * Runtime helper — reads build_info.json from:
 *   1. App resources dir (packed asar, production)
 *   2. __dirname relative path (dev mode)
 *
 * Usage:
 *   const { getBuildInfo } = require('../shared/build-info');
 *   const info = getBuildInfo();
 */

'use strict';

const fs = require('fs');
const path = require('path');

let _cached = null;

function getBuildInfo() {
  if (_cached) return _cached;

  const candidates = [
    // Production: next to main entry point
    path.join(__dirname, '..', 'build_info.json'),
    // Development: in CWD
    path.join(process.cwd(), 'build_info.json'),
    // Electron packed: resources dir
    process.resourcesPath
      ? path.join(process.resourcesPath, '..', 'build_info.json')
      : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        _cached = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        return _cached;
      }
    } catch {
      // Try next
    }
  }

  // Fallback — should never happen in properly built artifacts
  _cached = {
    name: 'unknown',
    product_name: 'Bloom Nucleus',
    version: '0.0.0',
    build: 0,
    full_version: '0.0.0+build.0',
    channel: 'unknown',
    built_at: 'unknown',
    git_commit: 'unknown',
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
    electron_version: 'unknown'
  };

  return _cached;
}

module.exports = { getBuildInfo };