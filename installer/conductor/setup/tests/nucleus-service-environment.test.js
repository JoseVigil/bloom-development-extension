'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const {
  MANAGED_AITAP_PROBE_ENVIRONMENT_NAMES,
  buildNucleusServiceEnvironment,
  readExistingNucleusServiceEnvironment,
  selectManagedAitapProbeEnvironment,
  writeNucleusServiceEnvironment,
} = require('../install/service-installer-nucleus');

const [ANTHROPIC_ENV, GEMINI_ENV] = MANAGED_AITAP_PROBE_ENVIRONMENT_NAMES;
const localAppData = 'C:\\Users\\contract\\AppData\\Local';

function decodeEnvironment(environment) {
  assert.ok(environment.envContent.endsWith('\0'));
  assert.strictEqual(environment.envContent, `${environment.envEntries.join('\0')}\0`);
  return environment.envContent.split('\0').filter(Boolean);
}

function countByName(entries, name) {
  const prefix = `${name.toUpperCase()}=`;
  return entries.filter(entry => entry.toUpperCase().startsWith(prefix)).length;
}

function encodedRegistryOutput(entries) {
  return entries
    .map(entry => Buffer.from(entry, 'utf8').toString('base64'))
    .join('\r\n') + (entries.length ? '\r\n' : '');
}

// New installation: generated environment remains unchanged and contains no
// probe configuration when the registry has no prior value.
const freshRead = readExistingNucleusServiceEnvironment(() => '');
const freshEnvironment = buildNucleusServiceEnvironment(localAppData, 'SYSTEM_PATH', freshRead);
const freshEntries = decodeEnvironment(freshEnvironment);
assert.strictEqual(countByName(freshEntries, ANTHROPIC_ENV), 0);
assert.strictEqual(countByName(freshEntries, GEMINI_ENV), 0);
assert.ok(freshEntries.includes(
  `BLOOM_PYTHON_PATH=${path.join(localAppData, 'BloomNucleus', 'bin', 'engine', 'runtime', 'python.exe')}`
));

// Repair with both managed entries: read the existing REG_MULTI_SZ, ignore all
// unrelated inherited variables, and append exactly one canonical assignment.
const bothExisting = [
  'UNRELATED_SECRET=must-not-be-copied',
  `${ANTHROPIC_ENV}=grant-probe-anthropic`,
  `${GEMINI_ENV}=grant-probe-gemini`,
];
let readInvocation = null;
const bothRead = readExistingNucleusServiceEnvironment((executable, args, options) => {
  readInvocation = { executable, args, options };
  return encodedRegistryOutput(bothExisting);
});
assert.strictEqual(readInvocation.executable, 'powershell.exe');
assert.deepStrictEqual(readInvocation.options.stdio, ['ignore', 'pipe', 'pipe']);
execFileSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', '[void][scriptblock]::Create([Console]::In.ReadToEnd())'],
  { input: readInvocation.args.at(-1), encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] }
);
const bothEntries = decodeEnvironment(
  buildNucleusServiceEnvironment(localAppData, 'SYSTEM_PATH', bothRead)
);
assert.strictEqual(countByName(bothEntries, ANTHROPIC_ENV), 1);
assert.strictEqual(countByName(bothEntries, GEMINI_ENV), 1);
assert.ok(bothEntries.includes(`${ANTHROPIC_ENV}=grant-probe-anthropic`));
assert.ok(bothEntries.includes(`${GEMINI_ENV}=grant-probe-gemini`));
assert.strictEqual(bothEntries.some(entry => entry.startsWith('UNRELATED_SECRET=')), false);

// Repair with one managed entry: the absent provider remains absent.
const oneEntries = decodeEnvironment(buildNucleusServiceEnvironment(
  localAppData,
  'SYSTEM_PATH',
  [`${GEMINI_ENV}=grant-probe-gemini-only`]
));
assert.strictEqual(countByName(oneEntries, ANTHROPIC_ENV), 0);
assert.strictEqual(countByName(oneEntries, GEMINI_ENV), 1);

// Duplicates and invalid values: names are case-insensitive, the last valid
// value wins, invalid duplicates do not erase a prior valid assignment, and
// control characters or empty values are rejected.
const selected = selectManagedAitapProbeEnvironment([
  `${ANTHROPIC_ENV}=grant-anthropic-first`,
  `${ANTHROPIC_ENV.toLowerCase()}=grant-anthropic-effective`,
  `${ANTHROPIC_ENV}=`,
  `${GEMINI_ENV}=grant-gemini-effective`,
  `${GEMINI_ENV}=invalid\nvalue`,
  `${GEMINI_ENV}=invalid\0value`,
  'UNRELATED=ignored',
  null,
]);
assert.deepStrictEqual(selected, [
  `${ANTHROPIC_ENV}=grant-anthropic-effective`,
  `${GEMINI_ENV}=grant-gemini-effective`,
]);

// Registry writer: values travel only through stdin, and the fixed PowerShell
// command writes the native MultiString type. No Grant ID is present in the
// executable or command arguments.
let writeInvocation = null;
writeNucleusServiceEnvironment(bothEntries, (executable, args, options) => {
  writeInvocation = { executable, args, options };
  return '';
});
assert.strictEqual(writeInvocation.executable, 'powershell.exe');
assert.ok(writeInvocation.args.includes('-NonInteractive'));
assert.ok(writeInvocation.args.join(' ').includes('RegistryValueKind]::MultiString'));
assert.strictEqual(writeInvocation.args.join(' ').includes('grant-probe-anthropic'), false);
assert.strictEqual(writeInvocation.args.join(' ').includes('grant-probe-gemini'), false);
assert.deepStrictEqual(writeInvocation.options.stdio, ['pipe', 'ignore', 'pipe']);
assert.deepStrictEqual(JSON.parse(writeInvocation.options.input), { entries: bothEntries });
execFileSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', '[void][scriptblock]::Create([Console]::In.ReadToEnd())'],
  { input: writeInvocation.args.at(-1), encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] }
);

console.log('Nucleus service environment persistence tests passed');
