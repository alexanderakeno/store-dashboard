import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // a page visited in the last 30 s opens instantly from the browser (data is cached on the server for 60 s+ anyway;
  // every import / save calls router.refresh(), which clears this)
  experimental: { staleTimes: { dynamic: 30 } },
  serverExternalPackages: ["google-auth-library", "bcryptjs"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
