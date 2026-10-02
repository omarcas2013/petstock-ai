import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Ruta antigua de traslados (era una copia rota
      // de la página de stock por almacén).
      {
        source: "/inventario/almacenes/traslados",
        destination: "/inventario/traslados",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
