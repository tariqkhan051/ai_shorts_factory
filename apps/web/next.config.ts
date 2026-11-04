import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship compiled ESM from dist/ (built via turbo ^build).
  poweredByHeader: false,
};

export default nextConfig;
