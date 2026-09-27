import checkFile from "eslint-plugin-check-file";
import {defineConfig} from "eslint/config";
import {dirname} from "node:path";
import {fileURLToPath} from "node:url";
import tseslint from "typescript-eslint";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

const features = ["configuration", "folders", "projects", "providers", "session-runtime", "sessions", "workspace"];

/** A feature depends on `pi/`, `lib/`, and itself. Features never import each other; the RPC edge composes them. */
const featureBoundaryRules = features.map((feature) => ({
  files: [`src/features/${feature}/**/*.ts`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: features.filter((other) => other !== feature).map((other) => `@supernova/agent-runtime/features/${other}/*`),
            message: "Features do not import each other. Shared Pi integration belongs in pi/, plain helpers in lib/.",
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
  // pi/ and lib/ are the foundation; they depend on nothing above them.
  {
    files: ["src/{pi,lib}/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supernova/agent-runtime/features/*", "@supernova/agent-runtime/rpc/*", "@supernova/agent-runtime/runtime"],
              message: "pi/ and lib/ must not depend on features or the edge.",
            },
          ],
        },
      ],
    },
  },
  ...featureBoundaryRules
);
