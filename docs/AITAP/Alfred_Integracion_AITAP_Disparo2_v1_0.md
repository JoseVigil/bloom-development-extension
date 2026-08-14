# Alfred — Directiva de Integración con AITAP (Disparo 2)

**Sistema:** BLOOM / BTIPS / BISP
**Componente:** Alfred (bot en diseño) × AITAP
**Versión:** 1.0
**Estado:** Directiva de arquitectura para el desarrollador de Alfred — sección "Lado Recepción" **BLOQUEADA**
**Depende de:** `AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` v1.1 (marco conceptual, no-negociable —
incluye la corrección de que AITAP nunca parsea el `BSIP-Response`, solo transporta respuesta cruda),
`BSIP_Response_Spec_PoC_Disparo1_v1_0.md` (Contrato D — condición de desbloqueo de este documento),
`BLOOM_BISP_Fuente_de_Verdad_v1_0.md` (protocolo BISP genérico), `installer/aitap/AGENTS.md` (guardrail de
código de AITAP, referencia de estilo para el futuro `AGENTS.md` de Alfred)

---

## 0. Por qué existe este documento

Alfred es un consumidor nuevo del ecosistema y **no debe integrarse con AITAP mediante parches ad-hoc**.
Esta directiva fija, desde el arranque del desarrollo de Alfred, las reglas de interacción con AITAP — para
que el desarrollador no tenga que reinferir decisiones que ya están tomadas, y para que Alfred no reintroduzca
por conveniencia acoplamientos que ya se descartaron explícitamente para Brain (ver
`AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md`).

## 1. Alfred es consumidor de primer nivel, al mismo nivel que Brain

Alfred no es un caso especial ni un cliente secundario de AITAP. Es un **orquestador**, con el mismo estatus
que Brain (`IntentExecutor`): gestiona su propio ciclo de vida de trabajo y su propia ejecución, y consume a
AITAP exclusivamente para obtener razonamiento de un modelo de frontera.

```text
   Brain (IntentExecutor)          Alfred (por diseñar)
            │                              │
            └──────────────┬───────────────┘
                            │  BSIP-Payload
                            ▼
                         AITAP
              (grifo + vault + contabilidad — nunca parsea)
                            │
                            │  Respuesta cruda del modelo
                            ▼
            ┌───────────────┴───────────────┐
            ▼                                ▼
    Brain PARSEA la respuesta        Alfred PARSEA la respuesta
    cruda (schema Contrato D)        cruda (mismo schema, su
    y aplica el resultado con        propia implementación) y
    su propio mecanismo              aplica el resultado con SU
    (MergeManager, y hoy ya          PROPIO mecanismo — todavía
    resuelto: invocación local       sin definir, no es
    a OpenCode — ver Arquitectura    responsabilidad de AITAP
    §6)                              decidir cuál
```

## 2. Lado Emisión (Input) — cómo Alfred le habla a AITAP

Alfred empaqueta sus intenciones siguiendo el mismo protocolo BISP que usa Brain — no un formato propio ni
una variante simplificada:

- Estructura `.payload.json` / `.index.json` según `BLOOM_BISP_Fuente_de_Verdad_v1_0.md` Parte A.
- Se acoge explícitamente a uno de los Contratos de Synapse existentes (A — Continuar, B — Evaluar,
  C — Decidir compatibilidad) según el tipo de interacción que necesite, tal como exige el propio documento
  fuente de verdad para "cualquier consumidor adicional".
- No inventa un cuarto camino de emisión propio. Si el caso de uso de Alfred no encaja en ninguno de los
  contratos existentes, eso se documenta como una propuesta de contrato nuevo (siguiendo el mismo criterio
  que ya se aplicó para el Contrato D del lado de salida) — no se fuerza dentro de uno existente.

## 3. Agnosticismo del grifo — guardrail explícito

**Alfred debe ser agnóstico a cuál es el motor de ejecución en el filesystem.** Recibe de AITAP la misma
respuesta cruda, sin parsear, que recibe Brain — AITAP no le entrega a Alfred nada más interpretado que a
Brain. Alfred **parsea esa respuesta por su cuenta** contra el schema del Contrato D (mismo schema que usa
Brain, implementación propia — ver `AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` §3) y decide **puertas
adentro de Alfred**, sin que AITAP lo sepa ni lo condicione, cómo aplicar el resultado: con su propio
mecanismo interno, con un adapter de OpenCode (eventualmente compartido en implementación con el que ya usa
Brain, ver Arquitectura §6, pero invocado de forma independiente), o con cualquier otro método que Alfred
defina.

AITAP no expone ninguna opción de "elegir motor de ejecución" — porque AITAP no tiene noción de motores de
ejecución. Ver `AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` §3 para la formulación completa de este
principio, que aplica sin excepción a Alfred.

## 4. Lado Recepción (Output) — **BLOQUEADO**

> ⚠️ **Esta sección está formalmente bloqueada y diferida.** No se especifica todavía cómo Alfred debe
> parsear la respuesta cruda de AITAP contra el Contrato D e interpretar el `BSIP-Response` resultante
> (estado de ejecución, validaciones, `.report.json` o equivalente), porque el schema del Contrato D
> todavía no está cerrado. Esta responsabilidad de parseo es 100% de Alfred, nunca de AITAP — ver
> `AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` §1 y §3.
>
> **Condición de desbloqueo:** `BSIP_Response_Spec_PoC_Disparo1_v1_0.md` debe llegar a un schema validado
> por PoC (§4 de ese documento) antes de que esta sección se complete.
>
> **Motivo de la secuencia, no burocracia:** escribir esta sección ahora, contra un schema todavía en
> borrador, obligaría a reescribirla en cuanto el PoC del Disparo 1 ajuste el formato — dos veces el
> trabajo por no esperar una dependencia real.

Cuando se desbloquee, esta sección debe cubrir como mínimo:

- [ ] Cómo Alfred distingue una respuesta válida de una malformada (delegado al mismo mecanismo de
  validación que use el Contrato D, no uno propio).
- [ ] Qué hace Alfred si el `BSIP-Response` viene con operaciones fuera de su scope esperado.
- [ ] Si Alfred necesita algo del equivalente a `.report.json` de Brain, o si su propio ciclo de vida no
  lo requiere.

## 5. Próximo paso concreto para el desarrollador de Alfred

Mientras la sección 4 permanece bloqueada, el trabajo disponible para arrancar es:

1. Diseñar el ciclo de vida propio de Alfred como orquestador (equivalente a lo que `IntentExecutor` es
   para Brain) — esto no depende del Contrato D.
2. Implementar el lado Emisión (§2) contra AITAP, reutilizando el mismo cliente/protocolo que use Brain
   donde sea posible, para no duplicar lógica de comunicación con el grifo.
3. Cuando Alfred tenga su propia carpeta en el repo, crear su `AGENTS.md`/`CLAUDE.md` con el mismo patrón
   de tripwires explícitos que `installer/aitap/AGENTS.md` — en particular, el guardrail de agnosticismo
   de motor de ejecución de §3 de este documento debe quedar codificado ahí, no solo en este PDF.
