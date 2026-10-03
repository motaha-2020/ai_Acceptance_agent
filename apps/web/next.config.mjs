import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker image: NEXT_STANDALONE=true (needs symlink rights, which Windows dev machines often lack).
  output: process.env.NEXT_STANDALONE === 'true' ? 'standalone' : undefined,
  transpilePackages: ['@acceptance/shared', '@acceptance/checklist'],
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
