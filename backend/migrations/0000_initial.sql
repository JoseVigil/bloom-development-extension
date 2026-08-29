PRAGMA foreign_keys = ON;

CREATE TABLE `organizations` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `master_github_username` text NOT NULL,
  `key_fingerprint` text NOT NULL,
  `created_at` integer NOT NULL
);

CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `github_username` text NOT NULL,
  `email` text,
  `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `users_github_username_unique` ON `users` (`github_username`);

CREATE TABLE `org_members` (
  `org_id` text NOT NULL REFERENCES `organizations`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `role` text NOT NULL,
  PRIMARY KEY (`org_id`, `user_id`)
);

CREATE TABLE `mandates` (
  `id` text PRIMARY KEY NOT NULL,
  `origin_org_id` text NOT NULL REFERENCES `organizations`(`id`),
  `slug` text NOT NULL,
  `description` text NOT NULL,
  `visibility` text NOT NULL,
  `latest_version` text NOT NULL,
  `pillar` text,
  `origin_type` text,
  `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `mandates_origin_slug_unique` ON `mandates` (`origin_org_id`, `slug`);

CREATE TABLE `mandate_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `mandate_id` text NOT NULL REFERENCES `mandates`(`id`),
  `version` text NOT NULL,
  `r2_key` text NOT NULL,
  `sha256` text NOT NULL,
  `published_at` integer NOT NULL
);
CREATE UNIQUE INDEX `mandate_versions_mandate_version_unique` ON `mandate_versions` (`mandate_id`, `version`);

CREATE TABLE `mandate_adoptions` (
  `id` text PRIMARY KEY NOT NULL,
  `mandate_version_id` text NOT NULL REFERENCES `mandate_versions`(`id`),
  `adopting_org_id` text NOT NULL REFERENCES `organizations`(`id`),
  `adopted_at` integer NOT NULL
);

CREATE TABLE `releases` (
  `id` text PRIMARY KEY NOT NULL,
  `component` text NOT NULL,
  `version` text NOT NULL,
  `channel` text NOT NULL,
  `platform` text NOT NULL,
  `r2_key` text NOT NULL,
  `sha256` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `published_at` integer NOT NULL
);
CREATE UNIQUE INDEX `releases_component_version_channel_platform_unique`
  ON `releases` (`component`, `version`, `channel`, `platform`);

CREATE TABLE `download_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text REFERENCES `organizations`(`id`),
  `component` text NOT NULL,
  `channel` text NOT NULL,
  `pinned_version` text,
  `rollout_percent` integer
);

