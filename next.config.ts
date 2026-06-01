import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Expõe para o bundle cliente (NEXT_PUBLIC_* via env do config são baked-in
  // em build time tanto no server quanto no client chunk — necessário para o
  // hub local onde Turbopack não realiza DefinePlugin replacement em client chunks).
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
};

export default nextConfig;
