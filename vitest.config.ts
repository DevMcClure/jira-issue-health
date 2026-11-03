import path from "node:path"
import { defineConfig } from "vitest/config"

// Date logic uses local time; pin it so tests are deterministic everywhere.
process.env.TZ = "UTC"

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
})
