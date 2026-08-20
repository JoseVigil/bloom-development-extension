# Execution Layer — guardrails

Fuente normativa:
`../../docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md`.

- Esta carpeta posee lifecycle, persistencia y Evidence de ejecución.
- No interpreta ni redefine Intent/BISP.
- No contiene Intelligence Supply ni custodia secretos.
- Los providers son adapters reemplazables y no exportan formatos nativos.
- Todo cambio de contrato se versiona bajo `contracts/` y se refleja en la
  arquitectura normativa antes de modificar adapters.
