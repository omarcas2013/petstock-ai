-- =====================================================================
-- Migración 1: permisos de las funciones de escritura
--
-- Guarda como migración el arreglo que ya se aplicó en producción:
-- las 9 funciones de escritura dejan de poder ejecutarse sin sesión
-- (anon) o por cualquier rol (public). Es idempotente.
-- =====================================================================

revoke execute on function public.create_purchase(uuid, uuid, text, timestamptz, text, jsonb) from public, anon;
revoke execute on function public.receive_purchase(uuid, uuid) from public, anon;
revoke execute on function public.receive_purchase(uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function public.receive_purchase_at_scope(uuid, uuid, text, uuid, uuid, uuid) from public, anon;
revoke execute on function public.register_bulk_inventory(uuid, jsonb, text, text) from public, anon;
revoke execute on function public.register_customer_return(uuid, uuid, uuid, integer, text) from public, anon;
revoke execute on function public.register_inventory_movement(uuid, text, integer, text, uuid) from public, anon;
revoke execute on function public.register_sale(jsonb, text, text, uuid) from public, anon;
revoke execute on function public.transfer_inventory(uuid, uuid, uuid, uuid, uuid, uuid, integer, text) from public, anon;

grant execute on function public.create_purchase(uuid, uuid, text, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function public.receive_purchase(uuid, uuid) to authenticated, service_role;
grant execute on function public.receive_purchase(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.receive_purchase_at_scope(uuid, uuid, text, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.register_bulk_inventory(uuid, jsonb, text, text) to authenticated, service_role;
grant execute on function public.register_customer_return(uuid, uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.register_inventory_movement(uuid, text, integer, text, uuid) to authenticated, service_role;
grant execute on function public.register_sale(jsonb, text, text, uuid) to authenticated, service_role;
grant execute on function public.transfer_inventory(uuid, uuid, uuid, uuid, uuid, uuid, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Funciones futuras: que no nazcan ejecutables por public ni anon.
--
-- OJO: en PostgreSQL los privilegios por defecto "IN SCHEMA" solo se
-- SUMAN a los globales; no pueden quitar uno global. El EXECUTE para
-- PUBLIC es un privilegio global por defecto, así que se revoca sin
-- "in schema". El de anon lo concede Supabase por esquema, así que se
-- revoca con "in schema public".
-- ---------------------------------------------------------------------

alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
