import {resolve} from "node:path";
import {defineConfig} from "vite";
import react, {reactCompilerPreset} from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({mode}) => ({
  plugins: [
    react(),
    babel({
      cwd: __dirname,
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
  ],
  server: {
    // Keep the UI origin stable so localStorage survives development restarts.
    host: "127.0.0.1",
    port: 48371,
    proxy: {
      "/ws": {
        target: process.env.SUPERNOVA_SERVER_URL ?? "http://127.0.0.1:4317",
        ws: true,
      },
    },
    strictPort: true,
  },
  optimizeDeps: {
    include: ["@pierre/diffs"],
  },
  resolve: {
    alias: [
      ...(mode === "e2e"
        ? [
            {
              find: /^@\/rpc\/transport\/client$/,
              replacement: resolve(__dirname, "tests/e2e/mocks/timeline-rpc-client.ts"),
            },
          ]
        : []),
      {find: "@assets", replacement: resolve(__dirname, "assets")},
      {find: "@e2e", replacement: resolve(__dirname, "tests/e2e")},
      {find: "@", replacement: resolve(__dirname, "src")},
    ],
  },
}));
