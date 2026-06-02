import {execFile} from "node:child_process";
import {chmod, copyFile, mkdir, readdir, rm, writeFile} from "node:fs/promises";
import {arch, platform} from "node:os";
import {basename, join} from "node:path";
import {promisify} from "node:util";

const execFilePromise = promisify(execFile);
const fdVersion = "10.3.0";
const toolsDir = join(process.cwd(), "dist", "tools");
const tmpDir = join(process.cwd(), "dist", ".tools-tmp");

interface ToolAsset {
  readonly binaryName: string;
  readonly fileName: string;
}

function resolveFdAsset(): ToolAsset {
  const currentPlatform = platform();
  const currentArch = arch();
  const binaryName = currentPlatform === "win32" ? "fd.exe" : "fd";

  if (currentPlatform === "darwin") {
    const targetArch = currentArch === "arm64" ? "aarch64" : "x86_64";
    return {binaryName, fileName: `fd-v${fdVersion}-${targetArch}-apple-darwin.tar.gz`};
  }

  if (currentPlatform === "linux") {
    const targetArch = currentArch === "arm64" ? "aarch64" : "x86_64";
    return {binaryName, fileName: `fd-v${fdVersion}-${targetArch}-unknown-linux-gnu.tar.gz`};
  }

  if (currentPlatform === "win32") {
    const targetArch = currentArch === "arm64" ? "aarch64" : "x86_64";
    return {binaryName, fileName: `fd-v${fdVersion}-${targetArch}-pc-windows-msvc.zip`};
  }

  throw new Error(`Unsupported fd platform: ${currentPlatform}/${currentArch}`);
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const bytes = await response.arrayBuffer();
  await writeFile(destination, Buffer.from(bytes));
}

async function extractArchive(archivePath: string): Promise<void> {
  if (archivePath.endsWith(".tar.gz")) {
    await execFilePromise("tar", ["xzf", archivePath, "-C", tmpDir]);
    return;
  }

  if (archivePath.endsWith(".zip")) {
    if (platform() === "win32") {
      await execFilePromise("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        archivePath,
        tmpDir,
      ]);
      return;
    }

    await execFilePromise("unzip", ["-q", archivePath, "-d", tmpDir]);
    return;
  }

  throw new Error(`Unsupported archive format: ${archivePath}`);
}

async function findFile(rootDir: string, fileName: string): Promise<string | undefined> {
  const entries = await readdir(rootDir, {withFileTypes: true});

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isFile() && entry.name === fileName) return entryPath;
    if (entry.isDirectory()) {
      const match = await findFile(entryPath, fileName);
      if (match) return match;
    }
  }

  return undefined;
}

async function prepareFd(): Promise<void> {
  const asset = resolveFdAsset();
  const archivePath = join(tmpDir, asset.fileName);
  const downloadUrl = `https://github.com/sharkdp/fd/releases/download/v${fdVersion}/${asset.fileName}`;

  await rm(tmpDir, {force: true, recursive: true});
  await mkdir(tmpDir, {recursive: true});
  await mkdir(toolsDir, {recursive: true});

  await downloadFile(downloadUrl, archivePath);
  await extractArchive(archivePath);

  const binaryPath = await findFile(tmpDir, asset.binaryName);
  if (!binaryPath) {
    throw new Error(`Could not find ${asset.binaryName} in ${basename(archivePath)}.`);
  }

  const outputPath = join(toolsDir, asset.binaryName);
  await rm(outputPath, {force: true});
  await copyFile(binaryPath, outputPath);

  if (platform() !== "win32") {
    await chmod(outputPath, 0o755);
  }

  await rm(tmpDir, {force: true, recursive: true});
}

await prepareFd();
