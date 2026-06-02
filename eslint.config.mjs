import {defineConfig} from "eslint/config";
import {dirname} from "node:path";
import {fileURLToPath} from "node:url";
import tseslint from "typescript-eslint";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  {ignores: ["**/node_modules", "**/dist", ".context"]},
  {
    files: ["scripts/**/*.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir,
      },
    },
  }
);
