import fs from "node:fs";
import path from "node:path";

// Memuat .env dari direktori root (satu tingkat di atas frontend)
function loadRootEnv() {
  const candidates = [
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../.env.production"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), ".env.production"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        const content = fs.readFileSync(file, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
            if (key && !(key in process.env)) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch {
        // Abaikan jika tidak bisa dibaca
      }
    }
  }
}
loadRootEnv();

/** @type {import('next').NextConfig} */
const backend =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8080";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "",
    NEXT_PUBLIC_API_LOGIN_URL: process.env.NEXT_PUBLIC_API_LOGIN_URL || "",
    NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN || "",
  },
  // Browser hanya bicara ke Next.js (same-origin); /api diteruskan ke backend Go.
  // Dengan begitu cookie sesi HttpOnly tidak perlu CORS.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};
export default nextConfig;
