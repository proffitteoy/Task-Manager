const path = require("path");

const { i18n } = require("./next-i18next.config");

const monorepoRoot = path.join(__dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.jsdelivr.net",
      },
    ],
    unoptimized: true,
  },
  i18n,
};

module.exports = nextConfig;
