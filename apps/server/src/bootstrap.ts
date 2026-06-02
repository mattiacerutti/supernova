// Pi needs package metadata before agent-runtime imports it. Keep this first so
// PI_PACKAGE_DIR points at Supernova's generated package.json before Pi loads.
import "../scripts/pi-runtime-package";
import {DEFAULT_HOST, DEFAULT_PORT, DEFAULT_WEB_DEV_URL, startServer} from "@/runtime";
import {registerBundledToolsPath} from "@/tools-path";

registerBundledToolsPath();

function parsePort(value: string | undefined): number {
  const port = Number(value ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("SUPERNOVA_SERVER_PORT must be an integer between 0 and 65535.");
  }
  return port;
}

const host = process.env.SUPERNOVA_SERVER_HOST ?? DEFAULT_HOST;
const port = parsePort(process.env.SUPERNOVA_SERVER_PORT);
const devUrl = process.env.SUPERNOVA_SERVER_DEV === "1" ? DEFAULT_WEB_DEV_URL : undefined;
const server = await startServer({host, port, devUrl});

console.log(`SUPERNOVA_SERVER_URL=${server.url}`);
console.log(`Supernova server listening at ${server.url}`);
