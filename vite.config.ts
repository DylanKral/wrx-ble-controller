import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/wrx-ble-controller/",
  plugins: [react()],
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
