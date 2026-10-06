-- =====================================================================
-- Tanda 5, cierre: correr SOLO después del merge (cuando producción ya
-- usa register_return). Deja register_customer_return solo para uso
-- interno: así una devolución siempre vuelve al lote de la venta.
-- =====================================================================

revoke execute on function public.register_customer_return(uuid, uuid, uuid, integer, text) from authenticated;
