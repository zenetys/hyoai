import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import checkFile from "eslint-plugin-check-file";
import importPlugin from "eslint-plugin-import";

const RADIX_PATTERN = {
    group: ["@radix-ui/react-*"],
    message: "Use named imports from the unified 'radix-ui' package instead.",
};

export default defineConfig([
    globalIgnores([".next", "out", "components/ui", "next-env.d.ts"]),
    ...nextVitals,
    ...nextTs,
    {
        plugins: { "check-file": checkFile, import: importPlugin },
        rules: {
            // Static export: next/image server optimization does not apply here
            "@next/next/no-img-element": "off",
            "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0 }],
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        RADIX_PATTERN,
                        {
                            group: ["@/plugins", "@/plugins/*"],
                            message:
                                "The core never imports a plugin: plugins are discovered by lib/plugins/registry.",
                        },
                    ],
                },
            ],
            // No native title: it shows the browser's own tooltip (use aria-label or Tooltip)
            "no-restricted-syntax": [
                "error",
                {
                    selector:
                        "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']",
                    message:
                        "No native title attribute: use aria-label, or the Tooltip component for a visible hint.",
                },
            ],
            // Components in PascalCase (or a single lowercase word), hooks
            // and lib in camelCase; kebab-case is forbidden
            "check-file/filename-naming-convention": [
                "error",
                {
                    "components/**/*.tsx": "@(+([a-z])|[A-Z]*([a-zA-Z0-9]))",
                    "**/{hooks,lib,types,data}/**/*.ts": "CAMEL_CASE",
                },
                { ignoreMiddleExtensions: true },
            ],
            "import/order": [
                "error",
                {
                    alphabetize: { order: "asc", caseInsensitive: true },
                    groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
                    "newlines-between": "always",
                    pathGroups: [{ pattern: "@/**", group: "internal" }],
                    pathGroupsExcludedImportTypes: ["builtin"],
                },
            ],
            "sort-imports": ["error", { ignoreCase: true, ignoreDeclarationSort: true }],
        },
    },
    {
        // Plugins only see the public SDK, so the core can change without breaking them
        files: ["plugins/**/*.{ts,tsx}"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        RADIX_PATTERN,
                        {
                            regex: "^@/(?!lib/plugins/sdk$)",
                            message: "A plugin imports from '@/lib/plugins/sdk' only.",
                        },
                        {
                            group: [
                                "react",
                                "react/*",
                                "react-dom",
                                "react-dom/*",
                                "next",
                                "next/*",
                            ],
                            message:
                                "A plugin ships no UI: it declares data, transports and strings.",
                        },
                    ],
                },
            ],
        },
    },
    prettier,
]);
