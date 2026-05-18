import {createICNS, createICO, BICUBIC} from "@ctjs/png2icons";
import {$} from "bun";
import {join} from "node:path";
import sharp from "sharp";

const sourceIcon = "./icons/icon.icon";
const sourcePng = "./icons/icon.png";
const resourcesIcons = "./resources/icons";
const dockCanvasSize = 256;
const dockContentSize = Math.round((dockCanvasSize * 824) / 1024);
const linuxIconSizes = [16, 32, 48, 64, 128, 256, 512];

if (!(await Bun.file(join(sourceIcon, "icon.json")).exists())) {
  throw new Error(`Missing macOS bundle icon at ${sourceIcon}`);
}

if (!(await Bun.file(sourcePng).exists())) {
  throw new Error(`Missing fallback icon PNG at ${sourcePng}`);
}

await $`rm -rf ${resourcesIcons}`;
await $`mkdir -p ${resourcesIcons}`;
await $`cp -R ${sourceIcon} ${join(resourcesIcons, "icon.icon")}`;

await resizePng(512, join(resourcesIcons, "icon.png"));
await resizePngWithPadding(dockCanvasSize, dockContentSize, join(resourcesIcons, "dock.png"));

for (const size of linuxIconSizes) {
  await resizePng(size, join(resourcesIcons, `${size}x${size}.png`));
}

const iconInput = await sharp(sourcePng).resize(1024, 1024).ensureAlpha().png().toBuffer();
const icns = createICNS(iconInput, BICUBIC, 0);
if (!icns) throw new Error(`Failed to generate ICNS from ${sourcePng}`);
await Bun.write(join(resourcesIcons, "icon.icns"), icns);

const ico = createICO(iconInput, BICUBIC, 0, false, true);
if (!ico) throw new Error(`Failed to generate ICO from ${sourcePng}`);
await Bun.write(join(resourcesIcons, "icon.ico"), ico);

console.log(`Generated icons from ${sourceIcon} and ${sourcePng}`);

async function resizePng(size: number, output: string): Promise<void> {
  await sharp(sourcePng).resize(size, size).png().toFile(output);
}

async function resizePngWithPadding(canvasSize: number, contentSize: number, output: string): Promise<void> {
  const image = await sharp(sourcePng).resize(contentSize, contentSize).png().toBuffer();
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
