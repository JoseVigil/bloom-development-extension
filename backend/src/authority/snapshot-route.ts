import { EmissionStoreError } from "./emission-store";
import { wireVersion } from "./emission";
import { resolveWireAuthoritySnapshot } from "./snapshot";

export interface VerifiedSnapshotInstallation { organizationId: string; installationId: string }

/** Authentication is a mandatory caller precondition, supplied only after the existing
 * installation middleware succeeds. This handler does not authenticate humans or sign current-checks. */
export async function authoritySnapshotResponse(db: D1Database, request: Request,
  verified: VerifiedSnapshotInstallation | null): Promise<Response> {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const error = (code: string, status: number) => new Response(JSON.stringify({ error: code }), { status, headers });
  if (!verified?.installationId || !verified.organizationId) return error("installation_auth_required", 401);
  const url = new URL(request.url);
  if (url.searchParams.getAll("org").length !== 1 || !url.searchParams.get("org")) return error("invalid_org", 400);
  const org = url.searchParams.get("org")!;
  if (org !== verified.organizationId) return error("organization_mismatch", 403);
  if (url.searchParams.getAll("base_version").length > 1) return error("invalid_base_version", 400);
  const base = url.searchParams.get("base_version");
  try { if (base !== null) wireVersion(base); } catch { return error("invalid_base_version", 400); }
  try {
    const raw = await resolveWireAuthoritySnapshot(db, org, verified.installationId, base);
    return new Response(raw, { status: 200, headers });
  } catch (failure) {
    if (failure instanceof EmissionStoreError) {
      const status = failure.code === "audience_mismatch" ? 403 : failure.code === "version_ahead" ? 409 : 503;
      return error(failure.message, status);
    }
    return error("authority_storage_unavailable", 503);
  }
}
