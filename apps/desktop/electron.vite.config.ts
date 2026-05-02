import {resolve} from "path";
import {defineConfig} from "electron-vite";

const rendererDevServerUrl = "http://localhost:5173";

export default defineConfig(({command}) => ({
  main: {
    define: {
      PI_DESKTOP_IS_DEV: JSON.stringify(command === "serve"),
      PI_DESKTOP_RENDERER_DEV_URL: JSON.stringify(rendererDevServerUrl),
      PI_DESKTOP_WEB_DIST: JSON.stringify(resolve("../web/dist")),
    },
    build: {
      externalizeDeps: {
        exclude: ["@pi-desktop/pi-runtime", "electron-serve"],
      },
    },
  },
  preload: {},
}));
