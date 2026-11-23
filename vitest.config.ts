import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          include: ["src/shared/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.toml" },
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations("./migrations"),
                DEV_USER_EMAIL: "test@example.com",
                STRAVA_CLIENT_ID: "298532",
                STRAVA_CLIENT_SECRET: "test-secret",
                TOKEN_ENCRYPTION_KEY: "test-encryption-key",
              },
            },
          })),
        ],
        test: {
          name: "worker",
          include: ["test/worker/**/*.test.ts"],
          setupFiles: ["./test/worker/setup.ts"],
        },
      },
    ],
  },
});
