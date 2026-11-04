import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship compiled ESM from dist/ (built via turbo ^build).
  poweredByHeader: false,
  // Playwright belongs on workers only — never bundle into the Next server graph.
  serverExternalPackages: ['playwright', 'playwright-core'],
};

export default nextConfig;
