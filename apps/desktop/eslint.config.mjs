import {defineConfig} from "eslint/config";
import tseslint from "@electron-toolkit/eslint-config-ts";

export default defineConfig({ignores: ["**/node_modules", "**/dist", "**/out"]}, tseslint.configs.recommended);
