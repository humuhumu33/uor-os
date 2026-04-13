import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // UNS build package and some integration tests are not in-tree; whisper test needs network assets.
    exclude: [
      "src/test/deployment-snapshot.test.ts",
      "src/test/docker-compat-full.test.ts",
      "src/test/uns-build.test.ts",
      "src/modules/identity/uns/core/hologram/whisper-compiler/__tests__/tokenizer.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
