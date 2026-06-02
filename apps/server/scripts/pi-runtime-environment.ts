import {mkdirSync, writeFileSync} from "node:fs";
import {homedir, tmpdir} from "node:os";
import {join, resolve} from "node:path";

type SupernovaStateMode = "dev" | "userdata";

const PI_RUNTIME_PACKAGE_DIR = join(tmpdir(), "pi-runtime-package");
const PI_RUNTIME_PACKAGE_JSON = {
  piConfig: {
    configDir: ".supernova",
  },
};

function expandHomePath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

function resolveSupernovaHome(): string {
  const configuredHome = process.env.SUPERNOVA_HOME?.trim();
  return resolve(expandHomePath(configuredHome && configuredHome.length > 0 ? configuredHome : join(homedir(), ".supernova")));
}

function resolveSupernovaStateMode(): SupernovaStateMode {
  return process.env.SUPERNOVA_SERVER_DEV === "1" ? "dev" : "userdata";
}

function resolveSupernovaAgentDir(): string {
  return join(resolveSupernovaHome(), resolveSupernovaStateMode(), "agent");
}

// Pi reads package.json during module initialization to derive runtime metadata
// such as CONFIG_DIR_NAME. The bundled server is not a real package directory,
// so generate the minimal package metadata in tmp and point Pi at it.
mkdirSync(PI_RUNTIME_PACKAGE_DIR, {recursive: true});
writeFileSync(join(PI_RUNTIME_PACKAGE_DIR, "package.json"), `${JSON.stringify(PI_RUNTIME_PACKAGE_JSON, null, 2)}\n`);

process.env["PI_PACKAGE_DIR"] = PI_RUNTIME_PACKAGE_DIR;
process.env["PI_CODING_AGENT_DIR"] = resolveSupernovaAgentDir();
