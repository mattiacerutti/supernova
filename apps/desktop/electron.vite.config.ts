import {defineConfig} from "electron-vite";
import {resolve} from "node:path";

export default defineConfig(({command}) => {
  const isDev = command === "serve";
  const sourcePath = resolve("src");

  return {
    main: {
      build: {
        externalizeDeps: {exclude: ["@supernova/server"]},
        rollupOptions: {input: {index: resolve("src/main.ts")}},
      },
      define: {
        SUPERNOVA_IS_DEV: JSON.stringify(isDev),
        SUPERNOVA_SERVER_ENTRY: JSON.stringify(resolve("../server/dist/cli.js")),
        SUPERNOVA_WEB_DIR: JSON.stringify(resolve("../../packages/web/dist")),
      },
      resolve: {
        alias: {"@": sourcePath},
      },
    },
    preload: {
      build: {rollupOptions: {input: {index: resolve("src/preload.ts")}}},
      resolve: {
        alias: {"@": sourcePath},
      },
    },
  };
});
