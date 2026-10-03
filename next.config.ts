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
      // Ruta antigua del escáner (tanda 3, Parte C.2).
      {
        source: "/inventory/scanner",
        destination: "/inventario/escaner",
        permanent: false,
      },
      // Duplicado de /proveedores eliminado (tanda 3, Parte C.3).
      {
        source: "/inventario/proveedores",
        destination: "/proveedores",
        permanent: false,
      },
      // Duplicado del cargue CSV eliminado (tanda 3, Parte C.3):
      // /inventario/carga ya cubre esa función.
      {
        source: "/inventario/cargue",
        destination: "/inventario/carga",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
