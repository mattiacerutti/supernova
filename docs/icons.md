# Desktop Icons

Desktop icon sources live in `apps/desktop/icons`.

The root folder may contain shared source artwork such as the original SVG logo. Generated desktop assets do not read directly from that root artwork. Instead, icon generation reads from one of the variant folders:

```text
apps/desktop/icons/
  dev/
    macos.icon
    macos.png
    icon.png
  prod/
    macos.icon
    macos.png
    icon.png
```

## Variants

`dev` is used when running the desktop app in development.

`prod` is used for builds, packaging, and preview/start runs.

The generator writes the selected variant into `apps/desktop/resources/icons`, which is the folder consumed by Electron and Electron Builder.

## Source Files

`macos.icon` is the Icon Composer bundle used for the packaged macOS app icon. It preserves Icon Composer-specific styling such as liquid glass and macOS icon theme compatability.

`macos.png` is the 1024x1024 PNG exported from Icon Composer. It is used only for macOS-related generated files that need the Icon Composer render but cannot consume the `.icon` bundle directly (for example the dev dock preview or the .dmg icon).

`icon.png` is the cross-platform icon source. It should include the logo and its normal background, but it should not include macOS-only effects such as the diagonal light or rounded corners. The generator applies rounded corners in code before producing Windows and Linux assets.

We do not reuse `macos.png` for Windows or Linux because the Icon Composer export includes macOS-specific diagonal light in the corners.

## Generated Outputs

The generator creates these files in `apps/desktop/resources/icons`:

| Output                         | Source                          | Used by                                                      |
| ------------------------------ | ------------------------------- | ------------------------------------------------------------ |
| `icon.icon`                    | `macos.icon`                    | Packaged macOS app icon                                      |
| `icon.icns`                    | `macos.png`                     | macOS DMG icon                                               |
| `dock.png`                     | `macos.png`                     | Runtime macOS Dock override for dev                          |
| `icon.png`                     | `icon.png` with rounded corners | Electron `BrowserWindow.icon` fallback, mostly Windows/Linux |
| `icon.ico`                     | `icon.png` with rounded corners | Windows packaged app icon                                    |
| `16x16.png`, `32x32.png`, etc. | `icon.png` with rounded corners | Linux packaged app icons                                     |

## Commands

Generate production icons:

```sh
bun run --filter @supernova/desktop generate:icons
```

Generate development icons:

```sh
bun run --filter @supernova/desktop generate:icons:dev
```
