export interface ReleaseRow {
  id: string;
  component: string;
  version: string;
  r2Key: string;
  sha256: string;
  publishedAt: number;
}

interface DownloadRuleRow {
  organizationId: string | null;
  component: string;
  pinnedVersion: string | null;
  rolloutPercent: number | null;
}

export interface IonEntry {
  domain: string;
  version: string;
  sha256: string;
  zip_path: string;
  download_url: string;
}

export interface IonManifest {
  schema_version: string;
  generated_at: string;
  ions: IonEntry[];
}

function rolloutBucket(organizationId: string, component: string): number {
  let hash = 2166136261;
  for (const character of `${organizationId}:${component}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function appliesToRollout(organizationId: string, component: string, percent: number | null): boolean {
  if (percent === null || percent >= 100) return true;
  if (percent <= 0) return false;
  return rolloutBucket(organizationId, component) < percent;
}

export async function resolveIonManifest(
  db: D1Database,
  organizationId: string,
  channel: string,
  requestUrl: string,
): Promise<IonManifest> {
  const [releaseResult, ruleResult] = await Promise.all([
    db.prepare(`
      SELECT id, component, version, r2_key AS r2Key, sha256, published_at AS publishedAt
      FROM releases
      WHERE channel = ? AND component LIKE 'ionrecipe:%'
      ORDER BY component ASC, published_at DESC, version DESC
    `).bind(channel).all<ReleaseRow>(),
    db.prepare(`
      SELECT organization_id AS organizationId, component, pinned_version AS pinnedVersion,
             rollout_percent AS rolloutPercent
      FROM download_rules
      WHERE channel = ? AND (organization_id IS NULL OR organization_id = ?)
        AND component LIKE 'ionrecipe:%'
      ORDER BY organization_id IS NOT NULL DESC
    `).bind(channel, organizationId).all<DownloadRuleRow>(),
  ]);

  const releasesByComponent = new Map<string, ReleaseRow[]>();
  for (const release of releaseResult.results) {
    const componentReleases = releasesByComponent.get(release.component) ?? [];
    componentReleases.push(release);
    releasesByComponent.set(release.component, componentReleases);
  }

  const effectiveRules = new Map<string, DownloadRuleRow>();
  for (const rule of ruleResult.results) {
    if (!effectiveRules.has(rule.component)) effectiveRules.set(rule.component, rule);
  }

  const baseUrl = new URL(requestUrl);
  const ions: IonEntry[] = [];
  let generatedAt = 0;

  for (const [component, rule] of [...effectiveRules.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (!appliesToRollout(organizationId, component, rule.rolloutPercent)) continue;
    const candidates = releasesByComponent.get(component) ?? [];
    const release = rule.pinnedVersion
      ? candidates.find((candidate) => candidate.version === rule.pinnedVersion)
      : candidates[0];
    if (!release) continue;

    generatedAt = Math.max(generatedAt, release.publishedAt);
    ions.push({
      domain: component.slice("ionrecipe:".length),
      version: release.version,
      sha256: release.sha256,
      zip_path: "",
      download_url: new URL(`/v1/releases/${encodeURIComponent(release.id)}/download`, baseUrl).toString(),
    });
  }

  return {
    schema_version: "1.0",
    generated_at: new Date(generatedAt * 1000).toISOString(),
    ions,
  };
}

export async function manifestEtag(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `"${hex}"`;
}

