'use strict';
const fs = require('fs');
const path = require('path');
const { MilestoneRegistry } = require('./milestone-registry');
const { MilestoneReactor } = require('./milestone-reactor');

const NUCLEUS_JSON = '/tmp/nucleus_sim.json';

function writeNucleus(obj) {
  fs.writeFileSync(NUCLEUS_JSON, JSON.stringify(obj, null, 2));
}

function readNucleus() {
  return JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
}

async function run(label, fn) {
  console.log(`\n=== ${label} ===`);
  await fn();
}

(async () => {
  const registry = new MilestoneRegistry({ bloomRoot: '/nonexistent', ONBOARDING_EVENTS: new Set() });
  registry.loadSteps();

  // ── Test 1: no handle available -> nucleus init NOT called ──────────────
  await run('Test 1: sin handle -> no debe invocar nucleus init', async () => {
    writeNucleus({ onboarding: { vault_initialized: true } });
    const calls = [];
    const execNucleus = async (args) => { calls.push(args); return { success: true }; };
    const reactor = new MilestoneReactor({
      registry, getWindow: () => null, execNucleus, NUCLEUS_JSON,
      verbose: true, logger: console,
    });
    reactor.handleMilestone('github_app_auth', { type: 'ONBOARDING_MILESTONE', event: 'GITHUB_APP_AUTHORIZED', data: {} });
    await new Promise(r => setTimeout(r, 50));
    const initCalls = calls.filter(a => a[1] === 'init');
    console.log('init calls:', initCalls.length, '(esperado: 0)');
    console.log('ownership_init_status:', readNucleus().onboarding.ownership_init_status, '(esperado: undefined)');
  });

  // ── Test 2: handle via enriched.data.username -> nucleus init called once
  await run('Test 2: con handle -> invoca nucleus init una sola vez', async () => {
    writeNucleus({ onboarding: { vault_initialized: true } });
    const calls = [];
    const execNucleus = async (args) => { calls.push(args); return { success: true }; };
    const reactor = new MilestoneReactor({
      registry, getWindow: () => null, execNucleus, NUCLEUS_JSON,
      verbose: true, logger: console,
    });
    reactor.handleMilestone('github_app_auth', { type: 'ONBOARDING_MILESTONE', event: 'GITHUB_APP_AUTHORIZED', data: { username: 'jose-dev' } });
    await new Promise(r => setTimeout(r, 50));
    const initCalls = calls.filter(a => a[1] === 'init');
    console.log('init calls:', initCalls.length, '(esperado: 1)', JSON.stringify(initCalls[0]));
    console.log('ownership_init_status:', readNucleus().onboarding.ownership_init_status, '(esperado: done)');
  });

  // ── Test 3: poll-identity backfill path reuses reactor, dedupes vs real event
  await run('Test 3: backfill (poll-identity) + evento real -> nucleus init UNA sola vez', async () => {
    writeNucleus({ onboarding: { vault_initialized: true, github_username: 'jose-dev' } });
    const calls = [];
    const execNucleus = async (args) => { calls.push(args); return { success: true }; };
    const reactor = new MilestoneReactor({
      registry, getWindow: () => null, execNucleus, NUCLEUS_JSON,
      verbose: true, logger: console,
    });
    // Simula backfill de poll-identity primero (llega antes que el evento real de Brain)
    reactor.handleMilestone('github_app_auth', {
      type: 'ONBOARDING_MILESTONE', event: 'GITHUB_APP_AUTHORIZED',
      data: { username: readNucleus().onboarding.github_username }, _backfill: true,
    });
    // Luego llega el evento real de Brain (mismo stepId:event) -> debe dedupearse
    reactor.handleMilestone('github_app_auth', {
      type: 'ONBOARDING_MILESTONE', event: 'GITHUB_APP_AUTHORIZED',
      data: { username: 'jose-dev' },
    });
    await new Promise(r => setTimeout(r, 50));
    const initCalls = calls.filter(a => a[1] === 'init');
    console.log('init calls:', initCalls.length, '(esperado: 1 -- dedupeado por stepId:event)');
  });

  // ── Test 4: nucleus init falla con "already initialized" -> tratado como ok
  await run('Test 4: exec falla con "already initialized" -> status=done, no error fatal', async () => {
    writeNucleus({ onboarding: { vault_initialized: true } });
    const execNucleus = async (args) => {
      if (args[1] === 'init') {
        const e = new Error('Organization already initialized');
        throw e;
      }
      return { success: true };
    };
    const reactor = new MilestoneReactor({
      registry, getWindow: () => null, execNucleus, NUCLEUS_JSON,
      verbose: true, logger: console,
    });
    reactor.handleMilestone('github_app_auth', { type: 'ONBOARDING_MILESTONE', event: 'GITHUB_APP_AUTHORIZED', data: { username: 'jose-dev' } });
    await new Promise(r => setTimeout(r, 50));
    console.log('ownership_init_status:', readNucleus().onboarding.ownership_init_status, '(esperado: done)');
  });

  // ── Test 5: exec falla con error real -> status=failed, no rollback de completed_steps
  await run('Test 5: exec falla con error real -> status=failed, github_app_auth SIGUE completo', async () => {
    writeNucleus({ onboarding: { vault_initialized: true } });
    const execNucleus = async (args) => {
      if (args[1] === 'init') throw new Error('brain binary not found');
      return { success: true };
    };
    const reactor = new MilestoneReactor({
      registry, getWindow: () => null, execNucleus, NUCLEUS_JSON,
      verbose: true, logger: console,
    });
    reactor.handleMilestone('github_app_auth', { type: 'ONBOARDING_MILESTONE', event: 'GITHUB_APP_AUTHORIZED', data: { username: 'jose-dev' } });
    await new Promise(r => setTimeout(r, 50));
    const d = readNucleus();
    console.log('ownership_init_status:', d.onboarding.ownership_init_status, '(esperado: failed)');
    console.log('completed_steps includes github_app_auth:', d.onboarding.completed_steps.includes('github_app_auth'), '(esperado: true, sin rollback)');
  });

  console.log('\n=== FIN sim_test.js ===');
})();
