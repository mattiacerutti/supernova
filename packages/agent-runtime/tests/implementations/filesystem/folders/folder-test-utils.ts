import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

export async function createProjectFixture(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "pi-desktop-folder-files-"));
  await mkdir(join(tempDir, ".git"));
  await mkdir(join(tempDir, ".config"));
  await mkdir(join(tempDir, "features", "feature-one", "operations"), {recursive: true});
  await mkdir(join(tempDir, "src", "components"), {recursive: true});
  await writeFile(join(tempDir, "src", "components", "button.tsx"), "export const Button = null;");
  await writeFile(join(tempDir, "src", "session.ts"), "export const session = null;");
  await writeFile(join(tempDir, ".gitignore"), "ignored.ts\n");
  await writeFile(join(tempDir, ".env"), "SECRET=hidden");
  await writeFile(join(tempDir, "ignored.ts"), "ignored by fd");
  return tempDir;
}
