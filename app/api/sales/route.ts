import { NextRequest, NextResponse } from "next/server";
import { requireRole, SALES_ROLES } from "@/lib/auth/require-role";
import { rpcErrorMessage } from "@/lib/supabase/rpc-error";
import {
  escapeLikePattern,
  quoteOrFilterValue,
} from "@/lib/supabase/like";
import { rangedQuery } from "@/lib/supabase/paginate";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SALES_SELECT = `
  id,
  store_id,
  customer_name,
  payment_method,
  subtotal,
  total,
  created_at,
  sale_items (
    id,
    product_id,
    quantity,
    unit_price,
    subtotal,
    products (
      id,
      name,
      sku
    )
  )
`;

function parsePageParams(searchParams: URLSearchParams) {
  const limitRaw = Number(searchParams.get("limit"));
  const offsetRaw = Number(searchParams.get("offset"));

  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.trunc(limitRaw), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const offset =
    Number.isFinite(offsetRaw) && offsetRaw >= 0
      ? Math.trunc(offsetRaw)
      : 0;

  return { limit, offset };
}

type SaleItemInput = {
  product_id: string;
  quantity: number;
};

type CreateSaleBody = {
  items: SaleItemInput[];
  payment_method: string;
  customer_name?: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(SALES_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const { searchParams } = new URL(request.url);

    const { limit, offset } = parsePageParams(searchParams);

    const search = (searchParams.get("search") ?? "").trim();
    const paymentMethod = (
      searchParams.get("payment_method") ?? "todos"
    ).trim();
    const sort = searchParams.get("sort") ?? "recent";

    // ==========================================================
    // OBTENER VENTAS (paginado en el servidor)
    // ==========================================================

    /*
     * PostgREST no admite casts (id::text) dentro de un filtro, así
     * que la búsqueda por ID solo se activa cuando el texto completo
     * es un UUID válido (comparación exacta); el resto del tiempo
     * busca por customer_name. El valor del ilike se escapa y se
     * envuelve en comillas (quoteOrFilterValue) porque va dentro del
     * string combinado de .or() (confirmado contra la API real que,
     * sin comillas, una coma o paréntesis en el texto rompe el
     * parseo con PGRST100).
     */
    let orFilter: string | null = null;

    if (search) {
      const pattern = quoteOrFilterValue(
        `%${escapeLikePattern(search)}%`
      );

      const conditions = [`customer_name.ilike.${pattern}`];

      if (UUID_RE.test(search)) {
        conditions.push(`id.eq.${search}`);
      }

      orFilter = conditions.join(",");
    }

    let dataQuery = supabase
      .from("sales")
      .select(SALES_SELECT, { count: "exact" })
      .eq("store_id", profile.store_id);

    let countQuery = supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("store_id", profile.store_id);

    if (paymentMethod !== "todos") {
      dataQuery = dataQuery.eq("payment_method", paymentMethod);
      countQuery = countQuery.eq("payment_method", paymentMethod);
    }

    if (orFilter) {
      dataQuery = dataQuery.or(orFilter);
      countQuery = countQuery.or(orFilter);
    }

    if (sort === "oldest") {
      dataQuery = dataQuery.order("created_at", { ascending: true });
    } else if (sort === "highest") {
      dataQuery = dataQuery.order("total", { ascending: false });
    } else if (sort === "lowest") {
      dataQuery = dataQuery.order("total", { ascending: true });
    } else {
      dataQuery = dataQuery.order("created_at", { ascending: false });
    }

    dataQuery = dataQuery.order("id");

    const { data, error, count } = await rangedQuery(
      () => dataQuery.range(offset, offset + limit - 1),
      () => countQuery
    );

    if (error) {
      console.error("Error obteniendo ventas:", error);

      return NextResponse.json(
        { error: "No se pudieron obtener las ventas." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sales: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error GET /api/sales:", error);

    return NextResponse.json(
      {
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // ==========================================================
    // CLIENTE SUPABASE AUTENTICADO
    // ==========================================================
    //
    // IMPORTANTE:
    // No usamos la llave secreta para ejecutar el RPC.
    //
    // register_sale() utiliza auth.uid(), por lo que necesitamos
    // conservar la sesión del usuario.
    //
    // ==========================================================

    const auth = await requireRole(SALES_ROLES);

    if (!auth.ok) {
      return auth.response;
    }

    const { supabase, profile } = auth;

    const storeId = profile.store_id;

    // ==========================================================
    // LEER BODY
    // ==========================================================

    let body: CreateSaleBody;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "El cuerpo de la solicitud no es JSON válido.",
        },
        { status: 400 }
      );
    }

    const { items, payment_method, customer_name } = body;

    // ==========================================================
    // VALIDAR ITEMS
    // ==========================================================

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          error:
            "La venta debe contener al menos un producto.",
        },
        { status: 400 }
      );
    }

    // ==========================================================
    // VALIDAR MÉTODO DE PAGO
    // ==========================================================

    if (
      typeof payment_method !== "string" ||
      payment_method.trim() === ""
    ) {
      return NextResponse.json(
        {
          error: "El método de pago es obligatorio.",
        },
        { status: 400 }
      );
    }

    // ==========================================================
    // VALIDAR ITEMS DEL CARRITO
    // ==========================================================

    for (const item of items) {
      if (
        !item ||
        typeof item.product_id !== "string" ||
        item.product_id.trim() === ""
      ) {
        return NextResponse.json(
          {
            error:
              "Cada producto debe tener un product_id válido.",
          },
          { status: 400 }
        );
      }

      if (
        typeof item.quantity !== "number" ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "La cantidad de cada producto debe ser un número entero mayor que 0.",
          },
          { status: 400 }
        );
      }
    }

    // ==========================================================
    // NORMALIZAR ITEMS
    // ==========================================================

    const normalizedItems: SaleItemInput[] = items.map(
      (item) => ({
        product_id: item.product_id.trim(),
        quantity: item.quantity,
      })
    );

    // ==========================================================
    // REGISTRAR VENTA
    // ==========================================================
    //
    // IMPORTANTE:
    //
    // Usamos el cliente autenticado.
    //
    // Así register_sale() puede ejecutar:
    //
    // auth.uid()
    //
    // y validar que p_store_id pertenece realmente al usuario
    // y que el rol está autorizado (assert_store_role).
    //
    // ==========================================================

    const { data, error } = await supabase.rpc(
      "register_sale",
      {
        p_items: normalizedItems,
        p_payment_method: payment_method.trim(),
        p_customer_name:
          typeof customer_name === "string"
            ? customer_name.trim()
            : null,
        p_store_id: storeId,
      }
    );

    if (error) {
      console.error(
        "Error registrando venta mediante register_sale:",
        error
      );

      return NextResponse.json(
        {
          error: rpcErrorMessage(
            error,
            "No se pudo registrar la venta."
          ),
        },
        { status: 400 }
      );
    }

    // ==========================================================
    // RESPUESTA
    // ==========================================================

    return NextResponse.json(
      {
        ok: true,
        sale: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error POST /api/sales:", error);

    return NextResponse.json(
      {
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}
