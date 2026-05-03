import {defineConfig} from "eslint/config";
import {dirname} from "node:path";
import {fileURLToPath} from "node:url";
import tseslint from "@electron-toolkit/eslint-config-ts";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  {ignores: ["**/node_modules", "**/dist", "**/out"]},
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir,
      },
    },
  }
);
