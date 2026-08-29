import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  masterGithubUsername: text("master_github_username").notNull(),
  keyFingerprint: text("key_fingerprint").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  githubUsername: text("github_username").notNull(),
  email: text("email"),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("users_github_username_unique").on(table.githubUsername)]);

export const orgMembers = sqliteTable("org_members", {
  orgId: text("org_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),
}, (table) => [primaryKey({ columns: [table.orgId, table.userId] })]);

export const mandates = sqliteTable("mandates", {
  id: text("id").primaryKey(),
  originOrgId: text("origin_org_id").notNull().references(() => organizations.id),
  slug: text("slug").notNull(),
  description: text("description").notNull(),
  visibility: text("visibility").notNull(),
  latestVersion: text("latest_version").notNull(),
  pillar: text("pillar"),
  originType: text("origin_type"),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("mandates_origin_slug_unique").on(table.originOrgId, table.slug)]);

export const mandateVersions = sqliteTable("mandate_versions", {
  id: text("id").primaryKey(),
  mandateId: text("mandate_id").notNull().references(() => mandates.id),
  version: text("version").notNull(),
  r2Key: text("r2_key").notNull(),
  sha256: text("sha256").notNull(),
  publishedAt: integer("published_at").notNull(),
}, (table) => [uniqueIndex("mandate_versions_mandate_version_unique").on(table.mandateId, table.version)]);

export const mandateAdoptions = sqliteTable("mandate_adoptions", {
  id: text("id").primaryKey(),
  mandateVersionId: text("mandate_version_id").notNull().references(() => mandateVersions.id),
  adoptingOrgId: text("adopting_org_id").notNull().references(() => organizations.id),
  adoptedAt: integer("adopted_at").notNull(),
});

export const releases = sqliteTable("releases", {
  id: text("id").primaryKey(),
  component: text("component").notNull(),
  version: text("version").notNull(),
  channel: text("channel").notNull(),
  platform: text("platform").notNull(),
  r2Key: text("r2_key").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  publishedAt: integer("published_at").notNull(),
}, (table) => [uniqueIndex("releases_component_version_channel_platform_unique").on(
  table.component,
  table.version,
  table.channel,
  table.platform,
)]);

export const downloadRules = sqliteTable("download_rules", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id),
  component: text("component").notNull(),
  channel: text("channel").notNull(),
  pinnedVersion: text("pinned_version"),
  rolloutPercent: integer("rollout_percent"),
});

