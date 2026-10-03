-- =====================================================================
-- Migración tanda 3, A1.2 — fase B: ¡NO CORRER TODAVÍA!
--
-- Esta migración se corre DESPUÉS de que el código de la Parte B esté
-- desplegado (ninguna ruta de Next.js debe seguir leyendo ni
-- escribiendo products.purchase_price en ese momento). El nombre del
-- archivo tiene una fecha muy posterior a propósito, para que nadie la
-- corra junto con el resto de la tanda 3 por accidente.
--
-- CORRECCIÓN DE AUDITORÍA (reproducido en Postgres 16 real): la
-- versión anterior de esta fase volvía a copiar
-- products.purchase_price -> product_costs antes de borrar la columna,
-- con "on conflict do update" -- es decir, pisaba sin condición
-- cualquier costo que el código NUEVO ya hubiera escrito directo en
-- product_costs durante la ventana entre la fase A y este paso
-- (reproducido: un costo editado a 1500 volvía a 1000). Ahora que la
-- fase A instaló un trigger que mantiene product_costs sincronizada
-- automáticamente mientras el código viejo siga vivo,
-- product_costs ya está al día en el momento en que se corre esta
-- fase; lo único que puede faltar son productos sin ninguna fila
-- todavía (no debería haber ninguno, porque el trigger también corre
-- en INSERT, pero por si acaso), así que el backfill de aquí usa
-- "on conflict do nothing": solo llena lo que falte, nunca pisa un
-- valor que ya esté.
--
-- Qué hace, en orden:
-- 1. Backfill de solo-faltantes (on conflict do nothing).
-- 2. Elimina el trigger y la función de sincronización de la fase A
--    (ya no hacen falta: después de este paso nada vuelve a escribir
--    products.purchase_price).
-- 3. Elimina products.purchase_price.
--
-- Antes de correrla, confirma (grep) que ninguna ruta, página ni
-- función SQL siga usando products.purchase_price. El reporte de este
-- commit lo hace una vez; si pasó tiempo entre el merge y este paso,
-- vuelve a correrlo.
-- =====================================================================

insert into public.product_costs (product_id, store_id, purchase_price, updated_at)
select
  p.id,
  p.store_id,
  coalesce(p.purchase_price, 0),
  now()
from public.products p
on conflict (product_id) do nothing;

drop trigger if exists sync_product_costs_trigger on public.products;
drop function if exists public.sync_product_costs();

alter table public.products
  drop column if exists purchase_price;
