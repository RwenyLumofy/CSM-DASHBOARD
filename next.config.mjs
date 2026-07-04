/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Type errors still fail the build; ESLint flat-config is wired separately.
  eslint: { ignoreDuringBuilds: true },
  // Allow large server actions for sync jobs; integrations run server-side only.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
