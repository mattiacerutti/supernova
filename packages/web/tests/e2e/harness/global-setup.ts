import {execFileSync} from "node:child_process";
import {resolve} from "node:path";

const REPO = resolve(import.meta.dirname, "../../../../..");

export default function globalSetup(): void {
  if (process.env.SUPERNOVA_E2E_SKIP_BUILD === "1") return;
  execFileSync("bun", ["run", "build", "--filter=@supernova/server", "--filter=@supernova/web"], {cwd: REPO, stdio: "inherit"});
}
