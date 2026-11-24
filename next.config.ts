import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';

function getKeycloakOrigin(): string {
  const issuer = process.env.KEYCLOAK_ISSUER?.trim();
  if (issuer) {
    try {
      return new URL(issuer).origin;
    } catch {
      // Fall through to default identity origin
    }
  }
  return 'https://identity.winterfur.org';
}

const keycloakOrigin = getKeycloakOrigin();

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  `form-action 'self' ${keycloakOrigin}`,
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Content-Security-Policy', value: cspDirectives },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, private' },
        ],
      },
    ];
  },
};

export default nextConfig;
