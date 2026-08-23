import {defineConfig} from "electron-vite";
import {resolve} from "node:path";

export default defineConfig(({command}) => {
  const isDev = command === "serve";
  const sourcePath = resolve("src");

  return {
    main: {
      define: {
        SUPERNOVA_IS_DEV: JSON.stringify(isDev),
        SUPERNOVA_SERVER_ENTRY: JSON.stringify(resolve(isDev ? "../server/src/bootstrap.ts" : "../server/dist/bootstrap.js")),
      },
      resolve: {
        alias: {"@": sourcePath},
      },
    },
    preload: {
      resolve: {
        alias: {"@": sourcePath},
      },
    },
  };
});
