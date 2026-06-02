#!/usr/bin/env node
// Pi needs package metadata before agent-runtime imports it. Keep this first so
// PI_PACKAGE_DIR points at Supernova's generated package.json before Pi loads.
import "../scripts/pi-runtime-package";
import {Command, InvalidArgumentError} from "commander";
import {DEFAULT_HOST, DEFAULT_PORT, startServer} from "@/runtime";
import {registerBundledToolsPath} from "@/tools-path";

registerBundledToolsPath();

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new InvalidArgumentError("Port must be an integer between 0 and 65535.");
  }
  return port;
}

const program = new Command()
  .name("supernova-server")
  .description("Start the Supernova server.")
  .option("--host <host>", "Host to bind", DEFAULT_HOST)
  .option("--port <port>", "Port to bind", parsePort, DEFAULT_PORT)
  .showHelpAfterError();

program.parse();

const options = program.opts<{host: string; port: number}>();
const server = await startServer({host: options.host, port: options.port});

console.log(`Supernova server listening at ${server.url}`);
