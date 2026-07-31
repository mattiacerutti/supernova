import {resolve} from "path";
import {defineConfig} from "vite";
import react, {reactCompilerPreset} from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({mode}) => ({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: "ws://localhost:4317",
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
              find: /^@\/rpc\/agent-rpc-client$/,
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
