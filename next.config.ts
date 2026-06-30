import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: process.env.NODE_ENV === "production" ? "export" : undefined,
    basePath: process.env.BASE_PATH,
    trailingSlash: true,
    images: { unoptimized: true },
};

export default nextConfig;
