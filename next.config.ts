import { readFileSync } from "node:fs";

import type { NextConfig } from "next";

// Version of this build: the one in package.json, shown by the Changelog page of the settings.
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
    output: process.env.NODE_ENV === "production" ? "export" : undefined,
    basePath: process.env.BASE_PATH,
    trailingSlash: true,
    images: { unoptimized: true },
    agentRules: false,
    env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
