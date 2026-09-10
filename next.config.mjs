/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  async headers() {
    const staging = process.env.AUTOLOCAL_PUBLISHING_NAMESPACE ||
      (process.env.RAILWAY_ENVIRONMENT_NAME && process.env.RAILWAY_ENVIRONMENT_NAME !== 'production');
    return staging ? [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }] : [];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.autolocal.ai' }],
        destination: 'https://autolocal.ai/:path*',
        permanent: true,
      },
      {
        source: '/services/web-development',
        destination: '/',
        permanent: true,
      },
      {
        source: '/services/web-development/',
        destination: '/',
        permanent: true,
      },
      {
        source: '/services/appointment-booking',
        destination: '/',
        permanent: true,
      },
      {
        source: '/services/:path*',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
