// Wisdom — presentación de la oferta de Mandate.
//
// Core no decide ni persiste: lee por separado el catálogo remoto, las
// instalaciones locales y la elegibilidad de los proyectos (todo vía Nucleus) y
// los une para mostrar. Instalar y preparar exigen gestos separados del Paladín.
// Preparar deja la instancia inactiva y no ejecuta ningún Intent.

export interface Offer {
  definition_id: string;
  version: string;
  digest: string;
  label: string;
  purpose: string;
  publisher: { publisher_id: string; key_id: string };
  published_at: string;
  size_bytes: number;
  requires: { contract_version: number; project: boolean };
  preparation: { status: string };
}

export interface InstalledInstance {
  statePath: string;
  consistent: boolean;
  problem?: string;
  instance: {
    mandateId: string;
    status: string;
    organizationId: string;
    projectId: string;
    definition: { definitionId: string; version: string; digest: string; label: string; publisherKeyId: string; preparation: string };
    authorization: { kind: string; installationId: string };
    installedAt: string;
    preparation?: { definition: { version: string; digest: string }; contractDigest: string; sourceFiles: string[] };
  };
}

export interface ProjectEligibility {
  projectId: string;
  name: string;
  eligible: boolean;
  binding: string;
  location: string;
  continuity: string;
  reason: string | null;
}

export type Failure = { code: string; message: string };
export type Read<T> = { ok: true; value: T } | { ok: false; error: Failure };

interface WisdomBridge {
  readOffers(): Promise<any>;
  readInstallations(): Promise<any>;
  readProjects(): Promise<any>;
  install(selection: { definitionId: string; version: string; digest: string; projectId: string }): Promise<any>;
  readProjectFiles(projectId: string): Promise<any>;
  prepare(selection: { mandateId: string; definitionId: string; version: string; digest: string; inputs: string[] }): Promise<any>;
}

function bridge(): WisdomBridge | null {
  const b = typeof window !== 'undefined' ? (window as any).wisdom : null;
  return b && typeof b.readOffers === 'function' ? b : null;
}

const unavailable = { ok: false as const, error: { code: 'wisdom_bridge_unavailable', message: 'Wisdom requiere Workspace (Conductor).' } };

function failure(response: any, fallback: string): { ok: false; error: Failure } {
  return { ok: false, error: response?.error ?? { code: fallback, message: fallback } };
}

export async function readOffers(): Promise<Read<Offer[]>> {
  const b = bridge();
  if (!b) return unavailable;
  const r = await b.readOffers();
  if (!r?.ok || r.catalog?.schema !== 'bloom.mandate-offers' || !Array.isArray(r.catalog.offers)) return failure(r, 'catalog_unavailable');
  return { ok: true, value: r.catalog.offers };
}

export async function readInstallations(): Promise<Read<InstalledInstance[]>> {
  const b = bridge();
  if (!b) return unavailable;
  const r = await b.readInstallations();
  if (!r?.ok || !Array.isArray(r.installations)) return failure(r, 'installations_unavailable');
  return { ok: true, value: r.installations };
}

export async function readProjects(): Promise<Read<ProjectEligibility[]>> {
  const b = bridge();
  if (!b) return unavailable;
  const r = await b.readProjects();
  if (!r?.ok || !Array.isArray(r.projects)) return failure(r, 'projects_unavailable');
  return { ok: true, value: r.projects };
}

export async function installOffer(offer: Offer, projectId: string): Promise<Read<any>> {
  const b = bridge();
  if (!b) return unavailable;
  const r = await b.install({ definitionId: offer.definition_id, version: offer.version, digest: offer.digest, projectId });
  if (!r?.ok) return failure(r, 'install_failed');
  return { ok: true, value: r.install };
}

export async function readProjectFiles(projectId: string): Promise<Read<string[]>> {
  const b = bridge();
  if (!b) return unavailable;
  const r = await b.readProjectFiles(projectId);
  if (!r?.ok || !Array.isArray(r.files)) return failure(r, 'project_files_unavailable');
  return { ok: true, value: r.files };
}

export async function prepareOffer(offer: Offer, installation: InstalledInstance, inputs: string[]): Promise<Read<any>> {
  const b = bridge();
  if (!b) return unavailable;
  const r = await b.prepare({ mandateId: installation.instance.mandateId, definitionId: offer.definition_id,
    version: offer.version, digest: offer.digest, inputs });
  if (!r?.ok) return failure(r, 'preparation_failed');
  return { ok: true, value: r.preparation };
}

export type RowState =
  | { kind: 'installed'; installation: InstalledInstance }
  | { kind: 'available' }
  | { kind: 'not_eligible'; reason: string };

/** Estado de la oferta para cada proyecto: instalado, disponible o no elegible. */
export function rowState(offer: Offer, project: ProjectEligibility, installations: InstalledInstance[]): RowState {
  const installed = installations.find(i => i.instance.projectId === project.projectId &&
    i.instance.definition.definitionId === offer.definition_id);
  if (installed) return { kind: 'installed', installation: installed };
  if (!project.eligible) return { kind: 'not_eligible', reason: project.reason || 'context_unavailable' };
  return { kind: 'available' };
}

const REASONS: Record<string, string> = {
  binding_not_read: 'Pendiente de vínculo con Authority',
  project_binding_required: 'Pendiente de vínculo con Authority',
  project_binding_unavailable: 'Vínculo con Authority no disponible',
  selected_project_unresolved: 'Proyecto no encontrado en la organización activa',
  context_unavailable: 'No se pudo evaluar el proyecto',
};

export function reasonText(reason: string): string {
  return REASONS[reason] ?? reason;
}

export function preparationText(status: string): string {
  if (status === 'not_defined') return 'Preparación no disponible en esta versión';
  if (status === 'defined') return 'Preparación disponible';
  return 'Preparación: ' + status;
}

export function shortDigest(digest: string): string {
  return digest.length > 16 ? `${digest.slice(0, 8)}…${digest.slice(-8)}` : digest;
}
