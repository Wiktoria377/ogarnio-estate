import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

// Content Security Policy. Next.js inline bootstrap scripts need 'unsafe-inline'
// (no nonce pipeline yet); 'unsafe-eval' only in development (React Refresh).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.fbcdn.net https://*.cdninstagram.com https://media.licdn.com",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin}${isDev ? " ws: wss:" : ""}`.trim(),
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "frame-ancestors 'none'",
  // OAuth redirects (Meta, LinkedIn) and the local API contract mock in development.
  `form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://www.facebook.com https://www.linkedin.com${isDev ? " http://127.0.0.1:4010" : ""}`,
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Lets CI build next to a running dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Native/binary packages used only on the server (image processing, PNG rendering).
  serverExternalPackages: ["sharp", "@resvg/resvg-js", "pdfkit"],
  // Skills (markdown) and fonts are read from disk at runtime by server code.
  outputFileTracingIncludes: {
    "/**": ["./skills/**/*.md", "./assets/fonts/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
