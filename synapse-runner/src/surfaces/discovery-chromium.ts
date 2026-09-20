import { chromium, type Browser, type Page } from '@playwright/test';

/**
 * Superficie 2 — `chromium.connectOverCDP()`, tab Discovery (Sección 4,
 * punto 2).
 *
 * Nucleus/Sentinel spawnean su propio Chromium con un perfil dedicado
 * (Sección 1) — este módulo NO lanza Chromium, se conecta a la instancia
 * que ya levantó el flujo real vía CDP (--remote-debugging-port). El puerto
 * de debugging concreto depende de cómo Sentinel invoque Chromium — no fue
 * parte de los puntos bloqueantes auditados; se pasa como parámetro en vez
 * de hardcodearlo.
 */

export interface DiscoverySurface {
  browser: Browser;
  discoveryPage: Page;
  close(): Promise<void>;
}

export async function connectToDiscovery(cdpEndpoint: string, urlPattern: RegExp): Promise<DiscoverySurface> {
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const context = browser.contexts()[0] ?? (await browser.newContext());

  const discoveryPage = await findOrWaitForPage(context, urlPattern);

  return {
    browser,
    discoveryPage,
    async close() {
      // No cerramos el browser real (es el de Nucleus/Sentinel, no nuestro)
      // — solo soltamos la conexión CDP del Runner.
      await browser.close().catch(() => {
        /* connectOverCDP a veces no permite close() limpio si el proceso
           remoto sigue vivo — no es un error del Runner. */
      });
    },
  };
}

async function findOrWaitForPage(
  context: Awaited<ReturnType<Browser['newContext']>>,
  urlPattern: RegExp,
  timeoutMs = 30_000,
): Promise<Page> {
  const existing = context.pages().find((p) => urlPattern.test(p.url()));
  if (existing) return existing;

  return new Promise((resolveP, reject) => {
    const timer = setTimeout(() => {
      context.off('page', onPage);
      reject(new Error(`[discovery-chromium] Ninguna tab matcheó ${urlPattern} en ${timeoutMs}ms`));
    }, timeoutMs);

    function onPage(page: Page) {
      page
        .waitForLoadState('domcontentloaded')
        .then(() => {
          if (urlPattern.test(page.url())) {
            clearTimeout(timer);
            context.off('page', onPage);
            resolveP(page);
          }
        })
        .catch(() => {
          /* la página pudo cerrarse antes de cargar — seguimos esperando otras */
        });
    }

    context.on('page', onPage);
  });
}

// ---------------------------------------------------------------------------
// Helpers de la Matriz de Flujo (Sección 3), pasos 02-04.
// Los selectores concretos (texto de botones, data-testid, etc.) NO fueron
// auditados contra el DOM vivo de discovery/index.html en esta sesión — se
// exponen como parámetros para que el spec los inyecte una vez confirmados,
// en vez de hardcodear algo no verificado.
// ---------------------------------------------------------------------------

export async function clickAuthGithub(page: Page, selector: string): Promise<void> {
  await page.click(selector);
}

export async function clickDetectGoogle(page: Page, selector: string): Promise<void> {
  await page.click(selector);
}
