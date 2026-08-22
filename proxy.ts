import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(
            ({ name, value, options }) => {
              response.cookies.set(
                name,
                value,
                options
              );
            }
          );
        },
      },
    }
  );

  /*
   * Obtiene la sesión/claims actuales.
   * Esto también permite a Supabase refrescar
   * correctamente la sesión cuando corresponda.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  /*
   * Rutas públicas.
   */
  const isPublicRoute =
    pathname === "/login" ||
    pathname.startsWith("/auth");

  /*
   * Si no hay usuario y está intentando acceder
   * a una ruta protegida, lo mandamos al login.
   */
  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();

    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "redirect",
      pathname
    );

    return NextResponse.redirect(loginUrl);
  }

  /*
   * Si ya está autenticado e intenta entrar
   * nuevamente al login, lo llevamos al dashboard.
   */
  if (user && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();

    dashboardUrl.pathname = "/";
    dashboardUrl.search = "";

    return NextResponse.redirect(
      dashboardUrl
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};