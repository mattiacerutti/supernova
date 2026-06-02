import {mkdirSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const PI_RUNTIME_PACKAGE_DIR = join(tmpdir(), "pi-runtime-package");
const PI_RUNTIME_PACKAGE_JSON = {
  piConfig: {
    configDir: ".supernova",
  },
};

// Pi reads package.json during module initialization to derive runtime metadata
// such as CONFIG_DIR_NAME. The bundled server is not a real package directory,
// so generate the minimal package metadata in tmp and point Pi at it.
mkdirSync(PI_RUNTIME_PACKAGE_DIR, {recursive: true});
writeFileSync(join(PI_RUNTIME_PACKAGE_DIR, "package.json"), `${JSON.stringify(PI_RUNTIME_PACKAGE_JSON, null, 2)}\n`);

process.env["PI_PACKAGE_DIR"] = PI_RUNTIME_PACKAGE_DIR;
