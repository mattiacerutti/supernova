import {DEFAULT_HOST, DEFAULT_WEB_DEV_URL, startServer} from "@/runtime";

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PI_DESKTOP_SERVER_PORT must be an integer between 0 and 65535.");
  }
  return port;
}

const host = process.env.PI_DESKTOP_SERVER_HOST ?? DEFAULT_HOST;
const port = parsePort(process.env.PI_DESKTOP_SERVER_PORT);
const devUrl = process.env.PI_DESKTOP_SERVER_DEV === "1" ? DEFAULT_WEB_DEV_URL : undefined;
const server = await startServer({host, port, devUrl});

console.log(`PI_DESKTOP_SERVER_URL=${server.url}`);
console.log(`Pi Desktop server listening at ${server.url}`);
