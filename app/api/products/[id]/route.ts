import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Faltan las variables de Supabase."
    );
  }

  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error(
        "ERROR OBTENIENDO PRODUCTO:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      product: data,
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    const body = await request.json();

    const supabase = getSupabase();

    /*
     * Primero obtenemos el producto actual.
     */
    const { data: currentProduct, error: currentError } =
      await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

    if (currentError || !currentProduct) {
      return NextResponse.json(
        {
          error: "Producto no encontrado.",
        },
        { status: 404 }
      );
    }

    /*
     * Validaciones básicas.
     */

    if (!body.name?.trim()) {
      return NextResponse.json(
        {
          error:
            "El nombre del producto es obligatorio.",
        },
        { status: 400 }
      );
    }

    const purchasePrice =
      Number(body.purchase_price);

    const salePrice =
      Number(body.sale_price);

    const minimumStock =
      Number(body.minimum_stock);

    const newStock =
      Number(body.stock);

    const maximumStock =
      body.maximum_stock === "" ||
      body.maximum_stock === null
        ? null
        : Number(body.maximum_stock);

    if (
      !Number.isFinite(purchasePrice) ||
      purchasePrice < 0
    ) {
      return NextResponse.json(
        {
          error:
            "El precio de compra no es válido.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(salePrice) ||
      salePrice < 0
    ) {
      return NextResponse.json(
        {
          error:
            "El precio de venta no es válido.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(newStock) ||
      newStock < 0
    ) {
      return NextResponse.json(
        {
          error:
            "El stock debe ser un número entero mayor o igual a 0.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(minimumStock) ||
      minimumStock < 0
    ) {
      return NextResponse.json(
        {
          error:
            "El stock mínimo no es válido.",
        },
        { status: 400 }
      );
    }

    if (
      maximumStock !== null &&
      (!Number.isInteger(maximumStock) ||
        maximumStock < 0)
    ) {
      return NextResponse.json(
        {
          error:
            "El stock máximo no es válido.",
        },
        { status: 400 }
      );
    }

    if (
      maximumStock !== null &&
      maximumStock < minimumStock
    ) {
      return NextResponse.json(
        {
          error:
            "El stock máximo no puede ser menor que el stock mínimo.",
        },
        { status: 400 }
      );
    }

    /*
     * Actualizamos solamente los datos generales.
     *
     * IMPORTANTE:
     * No actualizamos stock aquí.
     */
    const { data, error } = await supabase
      .from("products")
      .update({
        name: body.name.trim(),
        brand: body.brand?.trim() || null,
        category:
          body.category?.trim() || null,
        supplier_id:
          body.supplier_id || null,
        pet_type:
          body.pet_type || null,
        presentation:
          body.presentation?.trim() || null,
        sku:
          body.sku?.trim() || null,
        purchase_price: purchasePrice,
        sale_price: salePrice,
        minimum_stock: minimumStock,
        maximum_stock: maximumStock,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(
        "ERROR ACTUALIZANDO PRODUCTO:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 400 }
      );
    }

    /*
     * Si el usuario modificó el stock,
     * registramos el cambio como AJUSTE.
     */
    if (
      newStock !== currentProduct.stock
    ) {
      const {
        data: movement,
        error: movementError,
      } = await supabase.rpc(
        "register_inventory_movement",
        {
          p_product_id: id,
          p_movement_type: "ajuste",
          p_quantity: newStock,
          p_reason:
            "Ajuste de stock desde edición de producto",
        }
      );

      if (movementError) {
        console.error(
          "ERROR AJUSTANDO STOCK:",
          movementError
        );

        /*
         * Intentamos devolver un error claro.
         * Los datos generales ya fueron actualizados,
         * pero el stock no.
         */
        return NextResponse.json(
          {
            error:
              "El producto se actualizó, pero no se pudo ajustar el stock.",
            details:
              movementError.message,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        message:
          "Producto actualizado y stock ajustado correctamente.",
        product: {
          ...data,
          stock: movement.stock_after,
        },
        movement,
      });
    }

    return NextResponse.json({
      ok: true,
      message:
        "Producto actualizado correctamente.",
      product: data,
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno del servidor.",
      },
      { status: 500 }
    );
  }
}