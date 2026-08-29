import { describe, expect, it } from "vitest";
import { manifestEtag, resolveIonManifest, type ReleaseRow } from "../src/manifest";

type Row = ReleaseRow | {
  organizationId: string | null;
  component: string;
  pinnedVersion: string | null;
  rolloutPercent: number | null;
};

function fakeDatabase(releases: ReleaseRow[], rules: Row[]): D1Database {
  return {
    prepare(query: string) {
      return {
        bind() {
          return {
            async all<T>() {
              return { results: (query.includes("FROM releases") ? releases : rules) as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("ion manifest", () => {
  it("uses the implemented Metamorph contract and organization rule precedence", async () => {
    const db = fakeDatabase([
      {
        id: "release:github:2",
        component: "ionrecipe:github.com",
        version: "2.0.0",
        r2Key: "ion-recipes/github.com/2.0.0.ion",
        sha256: "new-hash",
        publishedAt: 200,
      },
      {
        id: "release:github:1",
        component: "ionrecipe:github.com",
        version: "1.0.0",
        r2Key: "ion-recipes/github.com/1.0.0.ion",
        sha256: "old-hash",
        publishedAt: 100,
      },
    ], [
      { organizationId: "bloom:org:test", component: "ionrecipe:github.com", pinnedVersion: "1.0.0", rolloutPercent: 100 },
      { organizationId: null, component: "ionrecipe:github.com", pinnedVersion: null, rolloutPercent: 100 },
    ]);

    await expect(resolveIonManifest(db, "bloom:org:test", "stable", "http://localhost:8787/v1/manifest"))
      .resolves.toEqual({
        schema_version: "1.0",
        generated_at: "1970-01-01T00:01:40.000Z",
        ions: [{
          domain: "github.com",
          version: "1.0.0",
          sha256: "old-hash",
          zip_path: "",
          download_url: "http://localhost:8787/v1/releases/release%3Agithub%3A1/download",
        }],
      });
  });

  it("creates stable quoted ETags", async () => {
    const first = await manifestEtag('{"ions":[]}');
    const second = await manifestEtag('{"ions":[]}');
    expect(first).toBe(second);
    expect(first).toMatch(/^"[a-f0-9]{64}"$/);
  });
});

