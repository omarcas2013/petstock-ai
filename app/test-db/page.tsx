import { createSupabaseClient } from "@/lib/supabase";

export default async function TestDatabase() {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from("products")
    .select("*");

  return (
    <main className="min-h-screen p-10">
      <h1 className="text-3xl font-bold">
        Prueba de Supabase
      </h1>

      {error ? (
        <pre className="mt-6 rounded-lg bg-red-100 p-4 text-red-700">
          {JSON.stringify(error, null, 2)}
        </pre>
      ) : (
        <pre className="mt-6 rounded-lg bg-gray-100 p-4">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </main>
  );
}