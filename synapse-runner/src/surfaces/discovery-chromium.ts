import { chromium, type Browser, type Page } from '@playwright/test';

/**
 * Superficie 2 de 5 — `chromium.connectOverCDP()`, tab Discovery (Sección
 * 4, punto 2 del dossier / §7 del Requerimiento Integrado). La Superficie 0
 * (browser genérico pre-Electron, Fase 0 server-side) es anterior a ésta en
 * el tiempo pero vive aparte — ver `src/surfaces/phase0-generic-browser.ts`
 * — y se cierra/descarta antes de que este módulo entre en juego.
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

/**
 * Darwin: si el perfil arranca con pestañas restauradas que nunca se
 * mostraron (por ejemplo una segunda Discovery), macOS no las pinta y
 * connectOverCDP queda esperando que terminen de inicializarse. Antes de
 * conectar se activa cada pestaña una vez por el endpoint HTTP de DevTools y
 * se deja al frente el Simulator. No cierra ninguna pestaña: los duplicados
 * los resuelve el spec por launch_id ya conectado. En Windows/Linux no hace nada.
 */
async function activatePageTargetsOnDarwin(cdpEndpoint: string): Promise<void> {
  if (process.platform !== 'darwin') return;
  const response = await fetch(`${cdpEndpoint}/json/list`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`[discovery-chromium] /json/list HTTP ${response.status}`);
  const targets = (await response.json() as Array<{ id?: string; type?: string; url?: string }>)
    .filter((target) => target.type === 'page' && target.id);
  const simulator = targets.filter((target) => /\/synapse-simulator\/index\.html/.test(target.url || ''));
  const ordered = [...targets.filter((target) => !simulator.includes(target)), ...simulator];
  for (const target of ordered) {
    const url = `${cdpEndpoint}/json/activate/${encodeURIComponent(target.id!)}`;
    let activated = await fetch(url, { signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
    if (!activated?.ok) activated = await fetch(url, { method: 'PUT', signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
    console.log(`[discovery-chromium] activar pestaña antes de CDP: ${target.url} → ${activated?.ok ? 'ok' : 'sin respuesta'}`);
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

export async function connectToDiscovery(cdpEndpoint: string, urlPattern: RegExp): Promise<DiscoverySurface> {
  await activatePageTargetsOnDarwin(cdpEndpoint);
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
