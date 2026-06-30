import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import checkFile from "eslint-plugin-check-file";
import importPlugin from "eslint-plugin-import";

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
                        {
                            group: ["@radix-ui/react-*"],
                            message:
                                "Use named imports from the unified 'radix-ui' package instead.",
                        },
                    ],
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
    prettier,
]);
