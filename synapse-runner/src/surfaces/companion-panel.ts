import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { DiagnosticBus } from '../diagnostics/diagnostic-bus';
import { attachCompanionPortListener, type CompanionPortHandle } from '../diagnostics/layer1-companion-port';

/**
 * Superficie 3 — Target del Side Panel (Companion) dentro de la misma
 * conexión CDP (Sección 4, punto 3).
 *
 * Chrome expone los Side Panels como su propio Target en el protocolo CDP,
 * DISTINTO de las tabs normales — hay que enumerarlo
 * (browser.targets() / Target.getTargets) filtrando por la URL del panel
 * (chrome-extension://<id>/index.html), NO asumir que aparece anidado en
 * el DOM de Discovery (dossier, Sección 4).
 *
 * Playwright no tiene una API de alto nivel dedicada a "Side Panel target"
 * — este módulo intenta primero el camino simple (a veces Chromium expone
 * targets de extensión como páginas normales dentro del mismo
 * BrowserContext, visibles vía context.pages()) y, si no aparece ahí, cae a
 * enumeración CDP cruda vía Browser.newBrowserCDPSession(). Cuál de los dos
 * caminos es el real para el Side Panel de esta extensión es algo que la
 * Sección 4 del dossier deja explícitamente para confirmar contra un
 * browser real — no estaba en la lista de puntos bloqueantes de la Sección
 * 7, así que no se asume acá; se implementan ambos caminos y se documenta
 * cuál terminó funcionando la primera vez que esto corra (ver README).
 */

export interface CompanionSurface {
  page: Page;
  portHandle: CompanionPortHandle;
  ownCommandIds: Set<string>;
  close(): Promise<void>;
}

export async function attachToCompanionSidePanel(
  browser: Browser,
  context: BrowserContext,
  extensionId: string,
  bus: DiagnosticBus,
): Promise<CompanionSurface> {
  const panelUrlPattern = new RegExp(`^chrome-extension://${extensionId}/(index\\.html)?`);

  const page = await findSidePanelPage(browser, context, panelUrlPattern);
  const ownCommandIds = new Set<string>();
  const portHandle = await attachCompanionPortListener(page, bus, ownCommandIds);

  return {
    page,
    portHandle,
    ownCommandIds,
    async close() {
      await portHandle.dispose();
    },
  };
}

async function findSidePanelPage(
  browser: Browser,
  context: BrowserContext,
  panelUrlPattern: RegExp,
  timeoutMs = 20_000,
): Promise<Page> {
  // Camino simple: ¿ya aparece como page normal del context?
  const direct = context.pages().find((p) => panelUrlPattern.test(p.url()));
  if (direct) return direct;

  // Camino CDP crudo: enumerar targets vía Target.getTargets y esperar a
  // que aparezca uno que matchee. Si Playwright lo adopta como page (caso
  // común cuando el target type es 'page' aunque sea un side panel),
  // context.pages() lo reflejará en el próximo poll.
  const cdpSession = await browser.newBrowserCDPSession();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { targetInfos } = (await cdpSession.send('Target.getTargets')) as {
      targetInfos: Array<{ targetId: string; type: string; url: string }>;
    };
    const match = targetInfos.find((t) => panelUrlPattern.test(t.url));

    if (match) {
      const existing = context.pages().find((p) => panelUrlPattern.test(p.url()));
      if (existing) return existing;
      // El target existe a nivel CDP pero Playwright todavía no lo expuso
      // como Page en este context — puede requerir attach manual
      // (Target.attachToTarget) si type !== 'page'. Lo dejamos como TODO
      // explícito: interactuar con un target no-'page' vía CDP crudo
      // (Runtime.evaluate / DOM domain) requiere código adicional que no
      // vamos a fabricar sin confirmar primero el `type` real que reporta
      // esta build de Chrome para un side panel de extensión.
      throw new Error(
        `[companion-panel] Target del Side Panel encontrado por CDP (type: ${match.type}, url: ${match.url}) ` +
          `pero no expuesto como Page por Playwright. Requiere attach manual vía Target.attachToTarget — ` +
          `ver comentario en companion-panel.ts y Sección 7 del README (punto no bloqueante, a resolver en la ` +
          `primera corrida contra un browser real).`,
      );
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    `[companion-panel] Ningún target matcheó ${panelUrlPattern} en ${timeoutMs}ms. ` +
      `¿La tab activa navegó a un dominio de AI_SIDE_PANEL_DOMAINS (chatgpt.com, claude.ai, gemini.google.com) ` +
      `para que background-companion.js habilite el panel vía chrome.sidePanel.setOptions()? (Matriz, paso 07)`,
  );
}

/** Aserciones del paso 11 (Companion display) — DOM del propio Side Panel. */
export async function readRefinedResponseState(page: Page): Promise<string | null> {
  return page.getAttribute('#refined-response', 'data-state');
}

export async function readTechnicalLogEntries(page: Page): Promise<string[]> {
  return page.$$eval('#technical-log-list > *', (nodes) => nodes.map((n) => n.textContent?.trim() ?? ''));
}
