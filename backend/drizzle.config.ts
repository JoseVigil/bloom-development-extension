import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "../contracts/marketplace-schema.ts",
  out: "./migrations",
});

