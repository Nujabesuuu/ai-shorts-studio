import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static обчислює шлях до бінарника з __dirname; якщо Turbopack
  // збандлить пакет, шлях перетворюється на фіктивний /ROOT/... і spawn
  // падає з ENOENT. Тримаємо пакет зовнішнім — він резолвиться з
  // node_modules у рантаймі.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
