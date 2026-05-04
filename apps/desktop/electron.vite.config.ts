import {defineConfig} from "electron-vite";
import {resolve} from "path";

export default defineConfig(({command}) => {
  const isDev = command === "serve";

  return {
    main: {
      define: {
        PI_DESKTOP_IS_DEV: JSON.stringify(isDev),
        PI_DESKTOP_SERVER_ENTRY: JSON.stringify(resolve(isDev ? "../server/src/bootstrap.ts" : "../server/dist/bootstrap.js")),
      },
    },
    preload: {},
  };
});
