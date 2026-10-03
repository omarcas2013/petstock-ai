-- =====================================================================
-- Migración tanda 3, A7: no desactivar ni borrar con existencias
--
-- Elegí hacerlo con triggers (en vez de en la API) porque es la misma
-- idea de la tanda 2: la autorización y las reglas de negocio
-- importantes viven en la base, no solo en el código Next.js, así que
-- ninguna ruta nueva ni ningún acceso directo a Supabase puede
-- saltárselas. Son BEFORE UPDATE OF is_active (solo cuando pasa de
-- true a false) y BEFORE DELETE, en warehouses, branches y locations;
-- una sola función reutilizable, parametrizada por la columna de
-- inventory_stock que corresponde a cada tabla.
--
-- Alcance de cada una (literal: "esa tabla tiene existencias"):
-- - warehouses: inventory_stock.warehouse_id = este almacén (cubre
--   tanto existencias a nivel de almacén como a nivel de ubicación,
--   porque en ambos casos inventory_stock.warehouse_id queda lleno).
-- - locations: inventory_stock.location_id = esta ubicación.
-- - branches: inventory_stock.branch_id = esta sucursal (solo
--   existencias asignadas directamente a la sucursal; no revisa las
--   existencias de los almacenes que pertenezcan a ella, que se rigen
--   por su propio estado).
--
-- El error se lanza con RAISE EXCEPTION (P0001). Hoy los DELETE de
-- almacén/proveedor en la API solo traducen el código 23503; esta
-- migración no lo cambia (es un archivo SQL), pero lo señalo para la
-- Parte B: conviene que esas rutas (y el PUT que desactiva) muestren
-- el mensaje del trigger cuando el código sea P0001, igual que ya se
-- hace con las RPC.
-- =====================================================================

create or replace function public.prevent_disable_or_delete_with_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_scope_column text := TG_ARGV[0];
  v_label text := TG_ARGV[1];
  v_entity_id uuid := OLD.id;
  v_has_stock boolean;
begin

  if TG_OP = 'UPDATE' then
    -- Solo nos interesa la transición true -> false.
    if OLD.is_active is false or NEW.is_active is not false then
      return NEW;
    end if;
  end if;

  execute format(
    'select exists (select 1 from public.inventory_stock where %I = $1 and quantity > 0)',
    v_scope_column
  )
  into v_has_stock
  using v_entity_id;

  if v_has_stock then
    raise exception
      'No se puede % % porque tiene existencias asociadas (quantity > 0).',
      case TG_OP when 'DELETE' then 'eliminar' else 'desactivar' end,
      v_label;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  return NEW;

end;
$function$;

revoke execute on function public.prevent_disable_or_delete_with_stock() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- warehouses
-- ---------------------------------------------------------------------

drop trigger if exists prevent_disable_or_delete_warehouse_with_stock on public.warehouses;

create trigger prevent_disable_or_delete_warehouse_with_stock
  before update of is_active or delete on public.warehouses
  for each row
  execute function public.prevent_disable_or_delete_with_stock('warehouse_id', 'el almacén');

-- ---------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------

drop trigger if exists prevent_disable_or_delete_branch_with_stock on public.branches;

create trigger prevent_disable_or_delete_branch_with_stock
  before update of is_active or delete on public.branches
  for each row
  execute function public.prevent_disable_or_delete_with_stock('branch_id', 'la sucursal');

-- ---------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------

drop trigger if exists prevent_disable_or_delete_location_with_stock on public.locations;

create trigger prevent_disable_or_delete_location_with_stock
  before update of is_active or delete on public.locations
  for each row
  execute function public.prevent_disable_or_delete_with_stock('location_id', 'la ubicación');
