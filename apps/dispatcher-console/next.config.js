/** @type {import('next').NextConfig} */
const isStaticExport = process.env.NEXT_EXPORT === '1';

const nextConfig = {
  reactStrictMode: true,
  // Static export for Docker/Railway builds (output: 'export' forbids rewrites)
  ...(isStaticExport
    ? { output: 'export', distDir: 'dist', basePath: '/dispatcher', trailingSlash: true }
    : {
        // Dev only: proxy /api/* to local backend so no CORS issues
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/:path*`,
            },
          ];
        },
      }),
};

module.exports = nextConfig;
