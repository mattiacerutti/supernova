// Temporary: packs Pi from a pinned main commit, since the commits Supernova needs are not released yet. Delete this
// and pin npm versions once a Pi release contains them. See plan.md, Phase 1, "Implementation order".
//
//   node --experimental-strip-types scripts/pi-main/pack.ts
//
// It checks out PI_COMMIT in .context/pi (cloning it when missing), installs and builds the packages Supernova uses
// on Node 24, and packs each into vendor/pi. Internal dependencies keep their exact versions: Supernova's root
// `overrides` points every Pi package at its tarball here, so one install resolves one coherent set (a `file:` path
// inside a tarball resolves against the installing project, not the tarball). Reads the model data Pi's checkout
// already has; run Pi's `npm run hydrate:model-data` there first when it is missing.
import {execFileSync} from "node:child_process";
import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";

const PI_COMMIT = "1bc7076b2";
const PI_REPOSITORY = "https://github.com/earendil-works/pi.git";

/** Build order: each after the packages it depends on. `ai` builds offline from the checkout's model data. */
const PACKAGES = [
  {dir: "telemetry", build: "build"},
  {dir: "schema", build: "build"},
  {dir: "chord", build: "build"},
  {dir: "tui", build: "build"},
  {dir: "codemode", build: "build"},
  {dir: "mcp", build: "build"},
  {dir: "ai", build: "build:offline"},
  {dir: "durable", build: "build"},
  {dir: "agent", build: "build"},
  // Supernova imports the library only; the standalone CLI bundle is not needed.
  {dir: "coding-agent", build: "build:unbundled"},
] as const;

const root = resolve(import.meta.dirname, "../..");
const pi = join(root, ".context/pi");
const out = join(root, "vendor/pi");

const run = (command: string, args: readonly string[], cwd: string) => execFileSync(command, args, {cwd, stdio: "inherit"});

if (!existsSync(pi)) run("git", ["clone", PI_REPOSITORY, pi], root);
run("git", ["fetch", "--quiet", "origin", "main"], pi);
run("git", ["checkout", "--quiet", PI_COMMIT], pi);
run("npm", ["ci", "--ignore-scripts", "--registry=https://registry.npmjs.org/"], pi);
for (const {dir, build} of PACKAGES) run("npm", ["run", build], join(pi, "packages", dir));

rmSync(out, {recursive: true, force: true});
mkdirSync(out, {recursive: true});
for (const {dir} of PACKAGES) {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", out], {cwd: join(pi, "packages", dir), encoding: "utf8"}));
  const {filename, name} = (Array.isArray(packed) ? packed[0] : Object.values(packed)[0]) as {filename: string; name: string};
  const target = `${name.replace("@", "").replace("/", "-")}.tgz`;
  run("mv", [filename, target], out);
  console.log(`packed ${name} -> vendor/pi/${target}`);
}

writeFileSync(join(out, "COMMIT"), `${execFileSync("git", ["rev-parse", "HEAD"], {cwd: pi, encoding: "utf8"}).trim()}\n`);
