-- =====================================================================
-- Migración 5: trazabilidad (quién hizo cada operación)
--
-- created_by toma auth.uid() por defecto. auth.uid() lee el claim "sub"
-- del JWT de la petición (request.jwt.claims), que PostgREST fija por
-- transacción. SECURITY DEFINER solo cambia el rol con el que corre la
-- función (current_user), no esas variables de la petición; por eso el
-- default funciona también en los inserts que hacen las funciones
-- SECURITY DEFINER llamadas con la sesión del usuario.
-- Con la llave secreta (service_role) no hay "sub" y queda null.
--
-- created_by usa "on delete set null": si se borra el usuario, los
-- registros se conservan con created_by en null en vez de fallar.
-- =====================================================================

alter table public.inventory_movements
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

alter table public.sales
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

alter table public.purchases
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

alter table public.customer_returns
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

alter table public.inventory_transfers
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------
-- Prueba manual sugerida (no forma parte de la migración). Simula una
-- petición de un usuario y deshace todo al final:
--
-- begin;
--   select set_config(
--     'request.jwt.claims',
--     '{"sub":"<UUID-DE-UN-USUARIO>","role":"authenticated"}',
--     true
--   );
--   select auth.uid();  -- debe devolver <UUID-DE-UN-USUARIO>
--   select public.register_inventory_movement(
--     '<UUID-PRODUCTO-DE-SU-TIENDA>', 'entrada', 1, 'prueba created_by',
--     '<UUID-DE-SU-TIENDA>'
--   );
--   select created_by from public.inventory_movements
--   where reason = 'prueba created_by';  -- debe ser <UUID-DE-UN-USUARIO>
-- rollback;
-- ---------------------------------------------------------------------
