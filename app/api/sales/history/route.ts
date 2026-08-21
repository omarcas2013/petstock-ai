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

export async function GET() {
try {
const supabase = getSupabase();


const { data, error } = await supabase
  .from("sales")
  .select(`
    id,
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
        name,
        sku
      )
    )
  `)
  .order("created_at", {
    ascending: false,
  });

if (error) {
  console.error(
    "ERROR CARGANDO HISTORIAL DE VENTAS:",
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
  ok: true,
  sales: data || [],
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
