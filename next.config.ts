import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ==========================================================
  // OUTPUT FILE TRACING
  // ==========================================================

  /*
   * Social Share thumbnail generator membaca:
   *
   * assets/fonts/Inter-Bold.ttf
   *
   * secara runtime menggunakan fs.readFileSync().
   *
   * Karena file tersebut bukan import JS/TS biasa,
   * Next.js/Vercel bisa saja tidak memasukkannya
   * ke serverless bundle secara otomatis.
   *
   * Kita paksa folder font ikut output tracing.
   */
  outputFileTracingIncludes: {
    "/*": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
