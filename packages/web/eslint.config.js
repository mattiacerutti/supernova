import js from "@eslint/js";
import globals from "globals";
import checkFile from "eslint-plugin-check-file";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import {defineConfig, globalIgnores} from "eslint/config";
import {dirname} from "node:path";
import {fileURLToPath} from "node:url";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

const features = ["projects", "sessions", "settings", "updates", "workspace"];

/** Everything in a feature except the folders other features may consume. */
const featurePrivateFolders = ["api", "hooks", "lib", "pages", "stores"];

/**
 * Cross-feature imports are limited to `components` and `types`; a feature that needs another
 * feature's data goes through a component that feature exports.
 */
const featureBoundaryRules = features.map((feature) => ({
  files: [`src/features/${feature}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: features.filter((other) => other !== feature).flatMap((other) => featurePrivateFolders.map((folder) => `@/features/${other}/${folder}/*`)),
            message: "Import another feature's components or types only; its stores, hooks, api, lib, and pages are private.",
          },
        ],
      },
    ],
  },
}));

export default defineConfig([
  globalIgnores(["dist"]),

  {
    files: ["**/*.{ts,tsx}"],

    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat["recommended-latest"], reactRefresh.configs.vite],

    plugins: {"check-file": checkFile},

    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir,
      },
    },

    rules: {
      "check-file/filename-naming-convention": ["error", {"**/*.{ts,tsx}": "KEBAB_CASE"}, {ignoreMiddleExtensions: true}],
      "check-file/folder-naming-convention": ["error", {"src/**/": "KEBAB_CASE", "tests/**/": "KEBAB_CASE"}],
    },
  },

  // Shared code never depends on a feature; composition happens in src/app.
  {
    files: ["src/{api,components,config,hooks,lib,stores}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {patterns: [{group: ["@/features/*"], message: "Shared code must not import from features; compose in src/app."}]}],
    },
  },

  ...featureBoundaryRules,
]);
