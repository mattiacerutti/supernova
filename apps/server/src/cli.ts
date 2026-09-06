#!/usr/bin/env node
// Configure Pi before importing the runtime.
import "@/environment";
import {Command, Option} from "commander";
import {DEFAULT_HOST, DEFAULT_PORT, parsePort, startServer} from "@/server";
import {registerBundledToolsPath} from "@/tools";

/** Runs the headless API and owns its signal/parent-disconnect lifecycle. */
async function main(): Promise<void> {
  registerBundledToolsPath();

  const program = new Command()
    .name("supernova-server")
    .description("Start the Supernova API server (no UI).")
    .addOption(new Option("--host <host>", "Host to bind").env("SUPERNOVA_SERVER_HOST").default(DEFAULT_HOST))
    .addOption(new Option("--port <port>", "Port to bind; 0 selects an available port").env("SUPERNOVA_SERVER_PORT").argParser(parsePort).default(DEFAULT_PORT))
    .showHelpAfterError();

  // Electron's Node mode has Node argv, not Electron's GUI argv convention.
  program.parse(process.argv.slice(2), {from: "user"});

  const startup = startServer(program.opts<{host: string; port: number}>());
  let stopping = false;

  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;

    const deadline = setTimeout(() => process.exit(1), 5_000);
    deadline.unref();

    try {
      const server = await startup.catch(() => undefined);
      await server?.close();
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
      if (process.connected) process.disconnect();
    }
  };

  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
  process.once("disconnect", () => void stop());

  const server = await startup;
  if (stopping) return;

  process.send?.({type: "ready", url: server.url});
  console.log(`Supernova API listening at ${server.url}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message || String(error) : error);
  process.exitCode = 1;

  if (process.connected) process.disconnect();
});
