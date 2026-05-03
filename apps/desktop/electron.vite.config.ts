import {defineConfig} from "electron-vite";
import {resolve} from "path";

export default defineConfig(({command}) => ({
  main: {
    define: {
      PI_DESKTOP_IS_DEV: JSON.stringify(command === "serve"),
      PI_DESKTOP_SERVER_ENTRY: JSON.stringify(resolve("../server/src/bootstrap.ts")),
    },
    build: {
      externalizeDeps: {
        exclude: ["@pi-desktop/pi-runtime"],
      },
    },
  },
  preload: {},
}));
