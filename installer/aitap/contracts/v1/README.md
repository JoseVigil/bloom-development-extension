# Routing contracts v1 — superseded

**Estado:** `SUPERSEDED`, lectura histórica solamente.

V1 mezclaba runtime e intelligence en `target_id/target_class`, no separaba
provider/model/credential/accounting y admitía categorías ajenas al registry
sanitizado de Executor. No debe producir nuevas decisiones.

Migración: consumidores deben enviar `cognituum.routing/v2`; no existe
conversión implícita porque V1 carece de inteligencia efectiva suficiente.
