# Desktop icons

Desktop icon sources live in `apps/desktop/icons`.

Edit the selected variant's source artwork, not generated assets. Shared artwork at the root, such as the original SVG logo, is not read directly by icon generation; each variant supplies its own three source files.

## Variants

`dev` is used when running the desktop app in development.

`prod` is used for stable builds, packaging, and preview/start runs. Nightly versions select `nightly` by default. The [generator](../../apps/desktop/scripts/generate-icons.ts) owns variant selection and explicit overrides.

The generator writes the selected variant into `apps/desktop/resources/icons`, which is the folder consumed by Electron and Electron Builder.

## Source files

`macos.icon` is the Icon Composer bundle used for the packaged macOS app icon. It preserves Icon Composer-specific styling such as liquid glass and macOS icon theme compatibility.

`macos.png` is the 1024x1024 PNG exported from Icon Composer. It is used only for macOS-related generated files that need the Icon Composer render but cannot consume the `.icon` bundle directly (for example the dev dock preview or the .dmg icon).

`icon.png` is the cross-platform icon source. It should include the logo and its normal background, but it should not include macOS-only effects such as the diagonal light or rounded corners. The generator applies rounded corners in code before producing Windows and Linux assets.

We do not reuse `macos.png` for Windows or Linux because the Icon Composer export includes macOS-specific diagonal light in the corners.

## Commands

After changing source artwork, regenerate explicitly: development startup may reuse existing generated files. Inspect the platform-specific results at small sizes as well as the full-size source.

Generate icons for the current build variant:

```sh
bun run --filter @supernova/desktop generate:icons
```

Generate development icons:

```sh
bun run --filter @supernova/desktop generate:icons:dev
```
