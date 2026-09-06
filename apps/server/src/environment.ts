import {mkdirSync, writeFileSync} from "node:fs";
import {homedir, tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {registerBunOAuthFlows} from "@earendil-works/pi-ai/bun-oauth";

const PI_RUNTIME_PACKAGE_DIR = join(tmpdir(), "pi-runtime-package");
const PI_RUNTIME_PACKAGE_JSON = {
  piConfig: {
    configDir: ".supernova",
  },
};

/** Expands the configured home and keeps development state separate from normal runs. */
function resolveAgentDirectory(): string {
  let home = process.env.SUPERNOVA_HOME?.trim() || join(homedir(), ".supernova");

  if (home === "~") {
    home = homedir();
  } else if (home.startsWith("~/") || home.startsWith("~\\")) {
    home = join(homedir(), home.slice(2));
  }

  const mode = process.env.SUPERNOVA_SERVER_DEV === "1" ? "dev" : "userdata";
  return join(resolve(home), mode, "agent");
}

// Pi reads package.json during module initialization to derive runtime metadata
// such as CONFIG_DIR_NAME. The bundled server is not a real package directory,
// so generate the minimal package metadata in tmp and point Pi at it.
mkdirSync(PI_RUNTIME_PACKAGE_DIR, {recursive: true});
writeFileSync(join(PI_RUNTIME_PACKAGE_DIR, "package.json"), `${JSON.stringify(PI_RUNTIME_PACKAGE_JSON, null, 2)}\n`);

process.env["PI_PACKAGE_DIR"] = PI_RUNTIME_PACKAGE_DIR;
process.env["PI_CODING_AGENT_DIR"] = resolveAgentDirectory();
process.env["PI_CODING_AGENT"] = "true";

// Pi keeps OAuth implementations behind bundler-opaque dynamic imports. The
// packaged server is a standalone bundle, so register Pi's static loaders.
registerBunOAuthFlows();
