/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL || "http://localhost:8080";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Browser hanya bicara ke Next.js (same-origin); /api diteruskan ke backend Go.
  // Dengan begitu cookie sesi HttpOnly tidak perlu CORS.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};
export default nextConfig;
