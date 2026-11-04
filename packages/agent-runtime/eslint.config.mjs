import checkFile from "eslint-plugin-check-file";
import {defineConfig} from "eslint/config";
import {readdirSync} from "node:fs";
import {dirname} from "node:path";
import {fileURLToPath} from "node:url";
import tseslint from "typescript-eslint";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

const features = readdirSync(new URL("src/features", import.meta.url), {withFileTypes: true})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** Feature implementations stay independent; facets and application operations may use the runtime's type. */
const featureBoundaryRules = features.map((feature) => ({
  files: [`src/features/${feature}/**/*.ts`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: features.filter((other) => other !== feature).map((other) => `@supernova/agent-runtime/features/${other}/*`),
            message: "Features do not import each other. Shared Pi integration belongs in pi/, plain helpers in lib/; composition/ passes the rest in.",
          },
          {
            group: ["@supernova/agent-runtime/composition/*"],
            allowTypeImports: true,
            message: "Features may import composition types, not implementations. Operations and facets receive the runtime.",
          },
        ],
      },
    ],
  },
}));

export default defineConfig(
  {ignores: ["**/node_modules", "**/dist"]},
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
    plugins: {"check-file": checkFile},
    languageOptions: {
      parserOptions: {
        tsconfigRootDir,
      },
    },
    rules: {
      "check-file/filename-naming-convention": ["error", {"**/*.ts": "KEBAB_CASE"}, {ignoreMiddleExtensions: true}],
      "check-file/folder-naming-convention": ["error", {"src/**/": "KEBAB_CASE", "tests/**/": "KEBAB_CASE"}],
    },
  },
  // Every source file lives in one of the four layers; nothing is loose at the root but the package entry.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/index.ts", "src/{composition,features,lib,pi}/**/*.ts"],
    rules: {"no-restricted-syntax": ["error", {selector: "Program", message: "Put this file in composition/, features/, lib/ or pi/."}]},
  },
  // pi/ and lib/ are the foundation; they depend on nothing above them.
  {
    files: ["src/{pi,lib}/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supernova/agent-runtime/features/*", "@supernova/agent-runtime/composition/*"],
              message: "pi/ and lib/ must not depend on features or composition/.",
            },
          ],
        },
      ],
    },
  },
  ...featureBoundaryRules
);
