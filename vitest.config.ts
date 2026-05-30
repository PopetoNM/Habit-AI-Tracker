import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [
      ["tests/unit/coach.test.ts", "node"],
      ["tests/unit/repository.test.ts", "node"]
    ]
  },
  resolve: {
    alias: {
      "@shared": "/src/shared"
    }
  }
});
