import { expect, type Browser, type Page } from '@playwright/test';

const SIMULATOR_URL = /chrome-extension:\/\/[^/]+\/synapse-simulator\/index\.html/;
const DISCOVERY_URL = /chrome-extension:\/\/[^/]+\/discovery\/index\.html/;

export async function waitForSimulatorTargets(cdpEndpoint: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${cdpEndpoint}/json/list`, { signal: AbortSignal.timeout(2_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const targets = await response.json() as Array<{ type?: string; url?: string }>;
      const snapshot = JSON.stringify(targets.map(({ type, url }) => ({ type, url })));
      if (snapshot !== lastSnapshot) {
        console.log(`[synapse-simulator] CDP targets: ${snapshot}`);
        lastSnapshot = snapshot;
      }
      const pages = targets.filter((target) => target.type === 'page').map((target) => target.url || '');
      if (pages.some((url) => DISCOVERY_URL.test(url)) && pages.some((url) => SIMULATOR_URL.test(url))) return;
    } catch (error) {
      console.log(`[synapse-simulator] CDP targets unavailable: ${String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`[synapse-simulator] Discovery y Simulator no aparecieron en CDP tras ${timeoutMs}ms; última lista: ${lastSnapshot}`);
}

export async function findSynapseSimulator(browser: Browser, timeoutMs = 30_000): Promise<Page> {
  const context = browser.contexts()[0];
  if (!context) throw new Error('[synapse-simulator] Chromium no expone un contexto CDP');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const page = context.pages().find((candidate) => SIMULATOR_URL.test(candidate.url()));
    if (page) {
      await page.locator('#protocol-list .message-item[data-protocol="discovery"]').first().waitFor();
      return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('[synapse-simulator] No apareció la pestaña synapse-simulator/index.html');
}

export async function selectDiscoveryMessage(page: Page, id: string): Promise<Record<string, unknown>> {
  const item = page.locator(`.message-item[data-protocol="discovery"][data-msg-id="${id}"]`);
  const section = item.locator('xpath=ancestor::*[contains(@class,"protocol-section")]');
  if (await section.locator('.protocol-section-body').evaluate((body) => body.classList.contains('collapsed'))) {
    await section.locator('.protocol-section-header').click();
  }
  await item.click();
  await expect(page.locator('#sim-msg-id')).toHaveText(id);
  const preview = page.locator('#payload-preview-code');
  await expect(preview).not.toHaveText('{}');
  return JSON.parse((await preview.textContent()) || '{}') as Record<string, unknown>;
}

export async function sendDiscoveryMessage(
  page: Page,
  id: string,
  fields: Record<string, string> = {},
  detectGoogleTab = false,
): Promise<Record<string, unknown>> {
  await selectDiscoveryMessage(page, id);
  const groups = page.locator('#sim-params .field-group');
  for (const [name, value] of Object.entries(fields)) {
    let matched = false;
    for (let index = 0; index < await groups.count(); index += 1) {
      const group = groups.nth(index);
      const label = (await group.locator('.field-label').innerText()).trim().split(/\s+/)[0];
      if (label !== name) continue;
      const select = group.locator('select.field-select');
      if (await select.count()) await select.selectOption(value);
      else await group.locator('input.field-input').fill(value);
      matched = true;
      break;
    }
    if (!matched) throw new Error(`[synapse-simulator] Campo ${name} ausente en ${id}`);
  }
  if (detectGoogleTab) {
    const group = groups.filter({ has: page.locator('.field-label', { hasText: 'tabId' }) });
    const detectButton = group.getByRole('button', { name: /Detect/ });
    try {
      await detectButton.click({ timeout: 3_000 });
    } catch (error) {
      if (!String(error).includes('intercepts pointer events')) throw error;
      await expect(detectButton).toBeVisible();
      await expect(detectButton).toBeEnabled();
      await detectButton.focus();
      await page.keyboard.press('Enter');
    }
    await expect(group.locator('input.field-input')).toHaveValue(/^\d+$/);
  }
  const payload = JSON.parse((await page.locator('#payload-preview-code').textContent()) || '{}') as Record<string, unknown>;
  if (JSON.stringify(payload).includes('undefined') || JSON.stringify(payload).includes('(not available)')) {
    throw new Error(`[synapse-simulator] Payload ${id} contiene un valor automático sin resolver: ${JSON.stringify(payload)}`);
  }
  console.log(`[synapse-simulator] UI send ${id}: ${JSON.stringify(payload)}`);
  const sendButton = page.locator('#btn-send');
  try {
    await sendButton.click({ timeout: 3_000 });
  } catch (error) {
    if (!String(error).includes('intercepts pointer events')) throw error;
    await expect(sendButton).toBeVisible();
    await expect(sendButton).toBeEnabled();
    await sendButton.press('Enter');
  }
  await expect(page.locator('#send-status')).toHaveText('✓ Sent');
  console.log(`[synapse-simulator] UI response ${id}: ${await page.locator('#send-status').textContent()}`);
  return payload;
}
