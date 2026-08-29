INSERT INTO organizations (id, name, master_github_username, key_fingerprint, created_at)
VALUES ('bloom:org:local', 'Bloom Local', 'local-developer', 'ed25519:SHA256:local-development', 1787961600);

INSERT INTO users (id, github_username, email, created_at)
VALUES ('github:local-developer', 'local-developer', 'local@example.invalid', 1787961600);

INSERT INTO org_members (org_id, user_id, role)
VALUES ('bloom:org:local', 'github:local-developer', 'master');

INSERT INTO releases (id, component, version, channel, platform, r2_key, sha256, size_bytes, published_at)
VALUES (
  'release:ionrecipe:github.com:1.0.0',
  'ionrecipe:github.com',
  '1.0.0',
  'stable',
  'linux',
  'ion-recipes/github.com/1.0.0.ion',
  '8d969eef6ecad3c29a3a629280e686cff8ca97021e6f7a707f24a2a3a3f9a5b8',
  6,
  1787961600
);

INSERT INTO download_rules (id, organization_id, component, channel, pinned_version, rollout_percent)
VALUES ('rule:local:github.com:stable', 'bloom:org:local', 'ionrecipe:github.com', 'stable', NULL, 100);

