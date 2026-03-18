/** @type {import('next').NextConfig} */
const nextConfig = {
  // API calls go to the live-view server
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:6080/api/:path*",
      },
    ];
  },
};

export default nextConfig;
