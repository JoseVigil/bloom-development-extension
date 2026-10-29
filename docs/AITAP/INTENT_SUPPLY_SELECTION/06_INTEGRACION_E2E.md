# Encargo 6 — Integración E2E y conformidad

## Párrafo disparador

Integración E2E: leé primero `docs/AITAP/INTENT_SUPPLY_SELECTION/00_DOCUMENTO_MAESTRO.md` y los cinco handoffs implementados antes de ejecutar este encargo. Tu misión es verificar el circuito completo sin convertirte en propietario del código ni corregir silenciosamente incumplimientos. Prepará plan, fixtures, matriz de evidencia y lista exacta de archivos de prueba; esperá aprobación de José antes de modificar o ejecutar infraestructura.

## Misión

Demostrar que la selección manual transitoria funciona desde Wisdom hasta Supply real y que cada frontera conserva su ownership.

## Escenarios mínimos

1. Un destino válido para todos los Intents.
2. Destinos distintos por Intent.
3. Intent cognitivo sin asignación.
4. Backend/modelo incompatibles.
5. Grant ausente, vencido o revocado.
6. Credential Reference no utilizable.
7. Privacidad incompatible.
8. Health unknown/stale.
9. Digest preparado modificado.
10. Límites excedidos.
11. Cierre de Core antes del inicio: selección perdida.
12. Core cerrado después del inicio: workflow conserva input.
13. Rama condicional no ejecutada.
14. Rama condicional ejecutada.
15. Revalidación rechazada antes del provider.
16. Supply exitoso con Accounting correcto.

## Evidencia obligatoria

- cero tokens al listar y validar;
- ningún secret en UI, IPC, logs o fixtures;
- correlación de Mandate, digest, Intent, Routing Decision y Accounting;
- provider/model efectivos coincidentes;
- ausencia de llamadas a Execution Layer durante selección;
- ausencia de configuración persistida antes del inicio;
- continuidad del input en workflow iniciado;
- errores estables por Intent.

## Fronteras

- No cambiar contratos para hacer pasar pruebas.
- No agregar mocks en producción.
- No habilitar providers, credenciales o Grants reales sin autorización.
- No consumir tokens reales sin autorización explícita.
- No corregir código de otros Works; devolver el incumplimiento al owner.

## Veredicto final

La devolución termina con uno:

- `VERTICAL MANUAL CONFORME`;
- `BLOQUEADO POR INCUMPLIMIENTO DE CONTRATO`;
- `BLOQUEADO POR AUTORIZACIÓN O EVIDENCIA`;
- `BLOQUEADO POR DECISIÓN DE JOSÉ`.

Debe incluir findings por Work, pruebas ejecutadas/no ejecutadas y evidencia reproducible.

