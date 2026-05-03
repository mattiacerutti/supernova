#!/usr/bin/env node
import {Command, InvalidArgumentError} from "commander";
import {DEFAULT_HOST, DEFAULT_PORT, startServer} from "@/runtime";

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new InvalidArgumentError("Port must be an integer between 0 and 65535.");
  }
  return port;
}

const program = new Command()
  .name("pi-desktop-server")
  .description("Start the Pi Desktop server.")
  .option("--host <host>", "Host to bind", DEFAULT_HOST)
  .option("--port <port>", "Port to bind", parsePort, DEFAULT_PORT)
  .showHelpAfterError();

program.parse();

const options = program.opts<{host: string; port: number}>();
const server = await startServer({host: options.host, port: options.port});

console.log(`Pi Desktop server listening at ${server.url}`);
