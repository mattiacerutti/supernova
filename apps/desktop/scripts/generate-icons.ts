import {createICNS, createICO, BICUBIC} from "@ctjs/png2icons";
import {$} from "bun";
import {existsSync} from "node:fs";
import {join} from "node:path";
import sharp from "sharp";

const iconVariants = ["dev", "prod"] as const;
type IconVariant = (typeof iconVariants)[number];

const requestedVariant =
  Bun.argv
    .find((argument) => argument.startsWith("--variant="))
    ?.split("=")
    .at(1) ??
  process.env.SUPERNOVA_ICON_VARIANT ??
  "prod";
const skipIfPresent = Bun.argv.includes("--if-missing");

if (!isIconVariant(requestedVariant)) {
  throw new Error(`Invalid icon variant "${requestedVariant}". Expected one of: ${iconVariants.join(", ")}`);
}

const sourceIcons = `./icons/${requestedVariant}`;
const sourceMacIcon = join(sourceIcons, "macos.icon");
// Keep Icon Composer exports scoped to macOS; the shimmer is not appropriate for Windows/Linux.
const sourceMacPng = join(sourceIcons, "macos.png");
const sourcePng = join(sourceIcons, "icon.png");
const resourcesIcons = "./resources/icons";
const dockCanvasSize = 256;
const dockContentSize = Math.round((dockCanvasSize * 824) / 1024);
const iconBorderRadiusRatio = 0.18;
const linuxIconSizes = [16, 32, 48, 64, 128, 256, 512];

if (!(await Bun.file(join(sourceMacIcon, "icon.json")).exists())) {
  throw new Error(`Missing macOS bundle icon at ${sourceMacIcon}`);
}

if (!(await Bun.file(sourceMacPng).exists())) {
  throw new Error(`Missing macOS PNG icon at ${sourceMacPng}`);
}

if (!(await Bun.file(sourcePng).exists())) {
  throw new Error(`Missing cross-platform PNG icon at ${sourcePng}`);
}

if (skipIfPresent && existsSync(resourcesIcons)) {
  console.log(`Using existing icons at ${resourcesIcons}`);
  process.exit(0);
}

console.log(`Generating ${requestedVariant} icons from ${sourceIcons}`);

await $`rm -rf ${resourcesIcons}`;
await $`mkdir -p ${resourcesIcons}`;
await $`cp -R ${sourceMacIcon} ${join(resourcesIcons, "icon.icon")}`;

await renderIconPng(512, join(resourcesIcons, "icon.png"));
await resizeMacPngWithPadding(dockCanvasSize, dockContentSize, join(resourcesIcons, "dock.png"));

for (const size of linuxIconSizes) {
  await renderIconPng(size, join(resourcesIcons, `${size}x${size}.png`));
}

const macIconInput = await sharp(sourceMacPng).resize(1024, 1024).ensureAlpha().png().toBuffer();
const iconInput = await renderIconBuffer(1024);

const icns = createICNS(macIconInput, BICUBIC, 0);
if (!icns) throw new Error(`Failed to generate ICNS from ${sourceMacPng}`);
await Bun.write(join(resourcesIcons, "icon.icns"), icns);

const ico = createICO(iconInput, BICUBIC, 0, false, true);
if (!ico) throw new Error(`Failed to generate ICO from ${sourcePng}`);
await Bun.write(join(resourcesIcons, "icon.ico"), ico);

console.log(`Generated ${requestedVariant} icons from ${sourceIcons}`);

function isIconVariant(value: string): value is IconVariant {
  return iconVariants.some((variant) => variant === value);
}

async function renderIconPng(size: number, output: string): Promise<void> {
  await sharp(await renderIconBuffer(size)).toFile(output);
}

/** Applies the cross-platform rounded shape */
async function renderIconBuffer(size: number): Promise<Buffer> {
  const radius = Math.round(size * iconBorderRadiusRatio);
  const foreground = await sharp(sourcePng).resize(size, size).ensureAlpha().png().toBuffer();
  const roundedMask = Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
  );

  return sharp(foreground)
    .composite([{input: roundedMask, blend: "dest-in"}])
    .png()
    .toBuffer();
}

/** Adds dock padding around the already-rendered Icon Composer PNG (so that it renders the correct size). */
async function resizeMacPngWithPadding(canvasSize: number, contentSize: number, output: string): Promise<void> {
  const image = await sharp(sourceMacPng).resize(contentSize, contentSize).png().toBuffer();
  const offset = Math.round((canvasSize - contentSize) / 2);

  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: {r: 0, g: 0, b: 0, alpha: 0},
    },
  })
    .composite([{input: image, left: offset, top: offset}])
    .png()
    .toFile(output);
}
