import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/polla-amigos",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
