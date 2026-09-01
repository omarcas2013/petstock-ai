import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

function getSupabaseAdmin() {
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

async function getAuthenticatedUser() {
  const supabase =
    await createServerSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function getUserStoreId(
  userId: string
) {
  const supabase =
    getSupabaseAdmin();

  const { data, error } =
    await supabase
      .from("profiles")
      .select("store_id")
      .eq("id", userId)
      .single();

  if (error) {
    throw new Error(
      `No se pudo obtener el perfil: ${error.message}`
    );
  }

  if (!data?.store_id) {
    throw new Error(
      "El usuario no tiene una tienda asignada."
    );
  }

  return data.store_id;
}

/*
|--------------------------------------------------------------------------
| GET /api/products
|--------------------------------------------------------------------------
|
| Sin barcode:
|   Devuelve todos los productos de la tienda.
|
| Con barcode:
|   GET /api/products?barcode=7501055364548
|   Devuelve el producto correspondiente.
|
*/

export async function GET(
  request: Request
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        { status: 401 }
      );
    }

    const storeId =
      await getUserStoreId(user.id);

    const supabase =
      getSupabaseAdmin();

    const { searchParams } =
      new URL(request.url);

    const barcode =
      searchParams
        .get("barcode")
        ?.trim();

    /*
    |--------------------------------------------------------------------------
    | BUSCAR POR CÓDIGO DE BARRAS
    |--------------------------------------------------------------------------
    */

    if (barcode) {
      const {
        data,
        error,
      } = await supabase
        .from("products")
        .select(`
          *,
          suppliers (
            id,
            name
          )
        `)
        .eq("store_id", storeId)
        .eq("barcode", barcode)
        .maybeSingle();

      if (error) {
        console.error(
          "ERROR BUSCANDO PRODUCTO POR BARCODE:",
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

      if (!data) {
        return NextResponse.json(
          {
            error:
              "No existe un producto con ese código de barras.",
            barcode,
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        product: data,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | LISTAR TODOS LOS PRODUCTOS
    |--------------------------------------------------------------------------
    */

    const {
      data,
      error,
    } = await supabase
      .from("products")
      .select(`
        *,
        suppliers (
          id,
          name
        )
      `)
      .eq("store_id", storeId)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "ERROR DE SUPABASE EN GET /api/products:",
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

    return NextResponse.json({
      products: data || [],
    });
  } catch (error) {
    console.error(
      "ERROR INTERNO EN GET /api/products:",
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

/*
|--------------------------------------------------------------------------
| POST /api/products
|--------------------------------------------------------------------------
*/

export async function POST(
  request: Request
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        { status: 401 }
      );
    }

    const body =
      await request.json();

    const storeId =
      await getUserStoreId(user.id);

    const supabase =
      getSupabaseAdmin();

    const supplierId =
      body.supplier_id || null;

    const barcode =
      body.barcode?.trim() || null;

    /*
    |--------------------------------------------------------------------------
    | VALIDAR PROVEEDOR
    |--------------------------------------------------------------------------
    */

    if (supplierId) {
      const {
        data: supplier,
        error: supplierError,
      } = await supabase
        .from("suppliers")
        .select("id")
        .eq("id", supplierId)
        .eq("store_id", storeId)
        .maybeSingle();

      if (supplierError) {
        console.error(
          "ERROR VALIDANDO PROVEEDOR:",
          supplierError
        );

        return NextResponse.json(
          {
            error:
              supplierError.message,
          },
          { status: 400 }
        );
      }

      if (!supplier) {
        return NextResponse.json(
          {
            error:
              "El proveedor no pertenece a tu tienda.",
          },
          { status: 403 }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDAR BARCODE
    |--------------------------------------------------------------------------
    |
    | Evitamos que dos productos de la misma tienda
    | tengan exactamente el mismo código.
    |
    */

    if (barcode) {
      const {
        data: existingProduct,
        error: barcodeError,
      } = await supabase
        .from("products")
        .select("id, name")
        .eq("store_id", storeId)
        .eq("barcode", barcode)
        .maybeSingle();

      if (barcodeError) {
        console.error(
          "ERROR VALIDANDO BARCODE:",
          barcodeError
        );

        return NextResponse.json(
          {
            error:
              barcodeError.message,
          },
          { status: 400 }
        );
      }

      if (existingProduct) {
        return NextResponse.json(
          {
            error:
              "Este código de barras ya está asignado a otro producto.",
            product: existingProduct,
          },
          { status: 409 }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | CREAR PRODUCTO
    |--------------------------------------------------------------------------
    */

    const {
      data,
      error,
    } = await supabase
      .from("products")
      .insert({
        store_id: storeId,

        name:
          body.name,

        brand:
          body.brand,

        category:
          body.category,

        supplier_id:
          supplierId,

        pet_type:
          body.pet_type,

        presentation:
          body.presentation,

        sku:
          body.sku,

        /*
        |--------------------------------------------------------------------------
        | NUEVO: CÓDIGO DE BARRAS
        |--------------------------------------------------------------------------
        */

        barcode:
          barcode,

        purchase_price:
          Number(
            body.purchase_price
          ) || 0,

        sale_price:
          Number(
            body.sale_price
          ) || 0,

        stock:
          Number(
            body.stock
          ) || 0,

        minimum_stock:
          Number(
            body.minimum_stock
          ) || 0,

        maximum_stock:
          body.maximum_stock === ""
            ? null
            : Number(
                body.maximum_stock
              ),
      })
      .select()
      .single();

    if (error) {
      console.error(
        "ERROR DE SUPABASE EN POST /api/products:",
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

    return NextResponse.json(
      {
        ok: true,
        message:
          "Producto guardado correctamente.",
        product: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "ERROR INTERNO EN POST /api/products:",
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