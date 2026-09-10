import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createPublicKey, verify } from "node:crypto";
import { emitSnapshot, normalizeState, normalizeWireTime, stateDigest, wireVersion } from "../src/authority/emission";
import { canonicalizeJson, digestCanonical, digestWire, signCanonicalPayload, verifyCanonicalSignature, signWithDomain, verifyWithDomain } from "../src/authority/canonical";
import type { WireFullContent } from "../src/authority/schema";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixture = JSON.parse(readFileSync(join(root, "docs/ROLES/fixtures/authority_interop_v1.json"), "utf8"));
const privateKey = Uint8Array.from(Buffer.from(fixture.private_key_pkcs8_base64, "base64")).buffer;
const publicKey = Uint8Array.from(Buffer.from(fixture.public_key_base64url, "base64url")).buffer;
const emit = () => Promise.all([
  emitSnapshot({ metadata: fixture.metadata.base, state: fixture.base_state }, privateKey, fixture.key_id),
  emitSnapshot({ metadata: fixture.metadata.result, state: fixture.result_state }, privateKey, fixture.key_id),
  emitSnapshot({ metadata: fixture.metadata.result, state: fixture.result_state, base: { authority_version: fixture.metadata.base.authority_version, state: fixture.base_state } }, privateKey, fixture.key_id),
  emitSnapshot({ metadata: fixture.metadata.renewal, state: fixture.result_state }, privateKey, fixture.key_id),
]);

describe("authority wire v1 interoperability", () => {
  it("matches literal normal forms and digests in the shared fixture", async () => {
    expect(canonicalizeJson(normalizeState(fixture.base_state, "org-fixture"))).toBe(fixture.expected.base_state_jcs);
    expect(canonicalizeJson(normalizeState(fixture.result_state, "org-fixture"))).toBe(fixture.expected.state_jcs);
    expect(await stateDigest(fixture.base_state, "org-fixture")).toBe(fixture.expected.base_state_digest);
    expect(await stateDigest(fixture.result_state, "org-fixture")).toBe(fixture.expected.state_digest);
  });

  it("emits the independently signed full, delta and renewal vectors byte for byte", async () => {
    const envelopes = await emit();
    const publicDer = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey)]);
    const key = createPublicKey({ key: publicDer, format: "der", type: "spki" });
    for (const [index, name] of ["full1", "full2", "delta2", "renewal3"].entries()) {
      expect(canonicalizeJson(envelopes[index])).toBe(canonicalizeJson(fixture.envelopes[name]));
      const canonical = canonicalizeJson(envelopes[index].payload);
      expect(verify(null, Buffer.concat([Buffer.from("BLOOM-AUTHORITY-SNAPSHOT-v1\0"), Buffer.from(canonical)]), key, Buffer.from(envelopes[index].integrity.signature, "base64url"))).toBe(true);
    }
    expect(envelopes[1].integrity.digest).not.toBe(envelopes[2].integrity.digest);
    expect(envelopes[1].integrity.digest).not.toBe(envelopes[3].integrity.digest);
  });

  it("normalizes arrays without mutating inputs, including UTF-16 and numeric role order", async () => {
    const shuffled: WireFullContent = structuredClone(fixture.result_state);
    for (const collection of Object.values(shuffled)) collection.reverse();
    for (const role of shuffled.role_definitions) role.permissions.reverse();
    const before = JSON.stringify(shuffled);
    expect(await stateDigest(shuffled, "org-fixture")).toBe(fixture.expected.state_digest);
    expect(JSON.stringify(shuffled)).toBe(before);
    expect(normalizeState(shuffled, "org-fixture").role_definitions.map(r => r.role_version)).toEqual(["2", "10"]);
    expect(normalizeState(shuffled, "org-fixture").principals.map(p => p.principal_id)).toEqual(["p-😀", "p-\uE000"]);
  });

  it("preserves nanoseconds and removes only insignificant fractional zeros", () => {
    expect(normalizeWireTime("2026-09-08T12:00:00.123456789Z")).toBe("2026-09-08T12:00:00.123456789Z");
    expect(normalizeWireTime("2026-09-08T12:00:00.120000000Z")).toBe("2026-09-08T12:00:00.12Z");
    expect(normalizeWireTime("2026-09-08T12:00:00.000Z")).toBe("2026-09-08T12:00:00Z");
  });
  it.each(["2026-02-30T00:00:00Z", "2026-09-08T12:00:00+00:00", "2026-09-08T12:00:00.1234567890Z", "2026-09-08T12:00:60Z", "0000-01-01T00:00:00Z"])("rejects invalid wire timestamp %s", time => {
    expect(() => normalizeWireTime(time)).toThrow();
  });
  it.each(["0", "01", "+1", "-1", "1.0", "18446744073709551616", "", 2])("rejects invalid version %s", version => {
    expect(() => wireVersion(version as string)).toThrow();
  });
  it("preserves the full uint64 range without Number conversion", () => {
    expect(wireVersion("18446744073709551615")).toBe(18446744073709551615n);
  });

  const invalidStates: [string, (s: any) => void][] = [
    ["missing collection", s => { delete s.memberships; }],
    ["null collection", s => { s.memberships = null; }],
    ["unknown property", s => { s.extra = true; }],
    ["duplicate principal", s => { s.principals.push(s.principals[0]); }],
    ["duplicate active identity", s => { s.principals[1].external_identities = s.principals[0].external_identities; }],
    ["unpaired surrogate", s => { s.principals[0].principal_id = "\uD800"; }],
    ["duplicate role version", s => { s.role_definitions.push(s.role_definitions[0]); }],
    ["unknown permission", s => { s.role_definitions[0].permissions = ["*"]; }],
    ["contradictory builtin", s => { s.role_definitions[0].role_id = "master"; s.role_definitions[0].role_origin = "builtin"; s.role_definitions[0].role_version = "1"; }],
    ["architect", s => { s.role_definitions[0].role_id = "Architect"; }],
    ["absent role version", s => { s.role_assignments[0].role_version = "3"; }],
    ["wrong org scope", s => { s.role_assignments[0].scope = { type: "organization", id: "other" }; }],
    ["missing membership", s => { s.role_assignments[0].membership_id = "other"; }],
    ["invalid validity", s => { s.memberships[0].valid_until = "2026-01-01T00:00:00Z"; }],
    ["invalid revocation target", s => { s.revocations[0].target_type = "assignment"; }],
  ];
  it.each(invalidStates)("rejects %s before signing", async (_name, mutate) => {
    const state = structuredClone(fixture.result_state); mutate(state);
    await expect(emitSnapshot({ metadata: fixture.metadata.result, state }, privateKey, fixture.key_id)).rejects.toThrow();
  });

  it("requires a revocation for removal and preserves revocation and role history", async () => {
    const missing = structuredClone(fixture.result_state); missing.revocations = [];
    await expect(emitSnapshot({ metadata: fixture.metadata.result, state: missing, base: { authority_version: fixture.metadata.base.authority_version, state: fixture.base_state } }, privateKey, fixture.key_id)).rejects.toThrow("removal requires revocation");
    const withoutHistory = structuredClone(fixture.result_state); withoutHistory.role_definitions.shift();
    await expect(emitSnapshot({ metadata: fixture.metadata.result, state: withoutHistory, base: { authority_version: fixture.metadata.base.authority_version, state: fixture.base_state } }, privateKey, fixture.key_id)).rejects.toThrow("historical role removal");
    await expect(emitSnapshot({ metadata: fixture.metadata.renewal, state: missing, base: { authority_version: fixture.metadata.result.authority_version, state: fixture.result_state } }, privateKey, fixture.key_id)).rejects.toThrow("revocation history");
  });
  it("rejects future revocation versions and non-increasing delta versions", async () => {
    const state = structuredClone(fixture.result_state); state.revocations[0].recorded_in_authority_version = "18446744073709551615";
    await expect(emitSnapshot({ metadata: fixture.metadata.result, state }, privateKey, fixture.key_id)).rejects.toThrow("future revocation");
    await expect(emitSnapshot({ metadata: fixture.metadata.result, state: fixture.result_state, base: { authority_version: fixture.metadata.result.authority_version, state: fixture.result_state } }, privateKey, fixture.key_id)).rejects.toThrow("delta version order");
  });
  it("requires a new role version when permissions change", async () => {
    const state = structuredClone(fixture.result_state); state.role_definitions[0].permissions = ["intent.create"];
    await expect(emitSnapshot({ metadata: fixture.metadata.result, state, base: { authority_version: fixture.metadata.base.authority_version, state: fixture.base_state } }, privateKey, fixture.key_id)).rejects.toThrow("new role version");
  });
  it("preserves the existing hex/base64 and domain-separated helper interfaces", async () => {
    const value = { text: "fixture" }; const { canonical, digestHex } = await digestCanonical(value);
    expect(digestHex).toMatch(/^[a-f0-9]{64}$/);
    expect(await digestWire(value)).toBe(Buffer.from(digestHex, "hex").toString("base64url"));
    const signature = await signCanonicalPayload(canonical, privateKey);
    expect(signature).toHaveLength(88);
    expect(await verifyCanonicalSignature(canonical, signature, publicKey)).toBe(true);
    const alternate = await signWithDomain("FIXTURE-ALTERNATE-DOMAIN", canonical, privateKey);
    expect(await verifyWithDomain("FIXTURE-ALTERNATE-DOMAIN", canonical, alternate, publicKey)).toBe(true);
    expect(await verifyCanonicalSignature(canonical, alternate, publicKey)).toBe(false);
  });

  it("exchanges newly emitted artifacts with Go and verifies its signed receipt", async () => {
    const [full1, full2, delta2, renewal3] = await emit();
    const dir = mkdtempSync(join(tmpdir(), "bloom-authority-interop-"));
    try {
      const path = join(dir, "backend-artifacts.json");
      writeFileSync(path, JSON.stringify({ full1, full2, delta2, renewal3 }));
      const output = execFileSync("go", ["test", "./internal/authority", "-run", "^TestAuthorityInteropBackendArtifacts$", "-count=1", "-v"], {
        cwd: join(root, "installer/nucleus"), encoding: "utf8", timeout: 150000,
        env: { ...process.env, AUTHORITY_INTEROP_ARTIFACT: path, GOCACHE: join(tmpdir(), "bloom-authority-go-cache"), GOPROXY: "off" },
      });
      expect(output).toContain("--- PASS: TestAuthorityInteropBackendArtifacts");
      const receipt = JSON.parse(readFileSync(path + ".receipt.json", "utf8"));
      expect(receipt.state_digest).toBe(fixture.expected.state_digest);
      expect(receipt.high_water_mark).toBe(fixture.metadata.renewal.authority_version);
      expect(receipt.journal_entries).toBe(3);
      expect(canonicalizeJson(receipt.go_envelope)).toBe(canonicalizeJson(full2));
      expect(await verifyCanonicalSignature(canonicalizeJson(receipt.go_envelope.payload), Buffer.from(receipt.go_envelope.integrity.signature, "base64url").toString("base64"), publicKey)).toBe(true);
    } finally {
      // Only the exact directory returned by mkdtemp is removed.
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);
});
