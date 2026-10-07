"use client";

import { useRouter } from "next/navigation";

export default function ReportesPage() {
  const router = useRouter();

  const reports = [
    {
      title: "Reporte de ventas",
      description:
        "Consulta ventas por período, métodos de pago, productos vendidos y totales.",
      path: "/reportes/ventas",
      available: true,
    },
    {
      title: "Reporte de inventario",
      description:
        "Analiza existencias, stock bajo, productos agotados y valor del inventario.",
      path: "/reportes/inventario",
      available: true,
    },
    {
      title: "Sugeridos de compra",
      description:
        "Calcula cuánto pedir a cada proveedor según la demanda, el stock mínimo y las compras pendientes.",
      path: "/reportes/sugeridos",
      available: true,
    },
    {
      title: "Reporte de productos",
      description: "Consulta el comportamiento y rendimiento de tus productos.",
      path: "/reportes/productos",
      available: false,
    },
    {
      title: "Reporte financiero",
      description:
        "Consulta ingresos, costos, utilidad y principales indicadores financieros.",
      path: "/reportes/financiero",
      available: false,
    },
    {
      title: "Movimientos de stock",
      description:
        "Consulta entradas, salidas, ajustes y movimientos históricos del inventario.",
      path: "/reportes/movimientos",
      available: true,
    },
  ];

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">PetStock AI</p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">Reportes</h1>

            <p className="mt-2 text-gray-600">
              Consulta y analiza la información de tu negocio.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
          >
            Dashboard
          </button>
        </div>

        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <button
              key={report.path}
              type="button"
              disabled={!report.available}
              onClick={() => {
                if (report.available) {
                  router.push(report.path);
                }
              }}
              className={`rounded-2xl bg-white p-6 text-left shadow-sm transition ${
                report.available
                  ? "cursor-pointer hover:-translate-y-1 hover:shadow-md"
                  : "cursor-not-allowed opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {report.title}
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    {report.description}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    report.available
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {report.available ? "Disponible" : "Próximamente"}
                </span>
              </div>

              {report.available && (
                <p className="mt-6 text-sm font-semibold text-gray-900">
                  Abrir reporte →
                </p>
              )}
            </button>
          ))}
        </section>

        <section className="mt-8 rounded-2xl bg-gray-900 p-6 text-white">
          <p className="text-sm text-gray-400">PetStock AI</p>

          <h2 className="mt-1 text-2xl font-bold">Centro de análisis</h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
            Aquí iremos incorporando los diferentes reportes de PetStock AI para
            analizar ventas, inventario, productos y resultados financieros
            desde un solo lugar.
          </p>
        </section>
      </div>
    </main>
  );
}
