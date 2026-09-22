-- 0017_authority_genesis_result.sql
--
-- Diseño P — mecanismo de retorno de génesis para Conductor
-- (Propuesta_Diseno_Retorno_Genesis_y_Hallazgo_Invitaciones_v0_1.md §3.1, autorizada por
-- Jose 2026-09-22). Aditivo puro sobre una tabla que ya existe: agrega el lugar donde
-- finishGenesis puede dejar una copia del resultado para que un segundo consumidor
-- (Conductor, vía GET /v1/authority/genesis/result con el secreto `browser`) lo
-- recupere una única vez. No cambia ninguna columna existente ni el contrato HTTP
-- directo del callback, que sigue siendo la fuente primaria para `nucleus auth genesis`
-- (CLI) sin ningún cambio de comportamiento.

ALTER TABLE authority_genesis_flows ADD COLUMN result_json TEXT;
