import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages 빌드만 정적 export. Vercel 빌드는 엣지 함수(API 프록시) 사용.
  ...(process.env.BUILD_TARGET === "pages" ? { output: "export" as const } : {}),
};

export default nextConfig;
