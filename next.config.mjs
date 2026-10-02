/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  // Imagens e o mapa mudam raramente: o navegador guarda por 1 dia (e revalida em segundo plano por 1 semana)
  async headers() {
    return [
      {
        source: "/:all*(png|jpg|jpeg|svg|webp|json)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
