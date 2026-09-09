# Cognituum — Modelo de Incentivos Económicos y Tokenomics de Utilidad (CUUM)

## Marco general

CUUM no es un activo que se compra para especular sobre su futuro precio — es un derecho de acceso a cómputo cuyo valor de balance se recalcula desde fundamentales de uso. Esto tiene una consecuencia de diseño dura: si el token puede listarse en un exchange externo con order book libre, todo lo demás en este documento es cosmético, porque el precio de mercado externo siempre terminará dominando la psicología de los holders.

### Precondición de circuito cerrado

- CUUM se emite y liquida **exclusivamente** dentro del portal interno de Cognituum (custodia no transferible a wallets externas arbitrarias, o transferible solo entre cuentas KYC de la red con throttling anti-arbitraje).
- No existe par CUUM/USD ni CUUM/ETH en ningún AMM externo. El único "exchange rate" es el que publica el protocolo internamente (Sección A).
- Toda entrada de valor externo entra como USD/stablecoin corporativo comprando CUUM al precio publicado (on-ramp), y toda salida es redención de CUUM por USD al mismo precio (off-ramp), nunca trading peer-to-peer especulativo.

---

## A) Mecanismo de Valorización Interna

### Los dos insumos

- **D (Demanda)**: volumen de solicitudes de ejecución de Mandates ponderado por complejidad computacional, medido en ventana móvil (7 días), en "unidades de cómputo solicitado" (UCS).
- **S (Oferta efectiva)**: CUUM bloqueado en Staking de Trayectoria — oferta que los desarrolladores han decidido no redimir sino comprometer como colateral productivo. No es circulante total, es circulante *comprometido*, lo que penaliza la retención pasiva y premia el compromiso activo.

### Fórmula base

```
Price(t) = 1 USD + k · ln( 1 + D(t) / S(t) )
```

Se usa logaritmo, no una razón lineal: una razón lineal D/S dispara el precio ante picos de demanda puntual, reintroduciendo volatilidad tipo especulativa. El logaritmo amortigua los extremos y hace que el precio se mueva por tendencias sostenidas de uso, no por eventos aislados.

- `k` es una constante de sensibilidad calibrada por gobernanza técnica (no por votación especulativa de holders).
- Precio nunca cae por debajo de 1 USD (piso duro), garantizado vía el Fondo de Reserva.

### Frecuencia y suavizado

Recalculado cada época (ej. 4h), pero el precio publicado es un **EMA** (α bajo, ej. 0.1) del precio calculado, para que el ajuste sea perceptible pero no explotable — deriva continua, sin saltos discretos para front-running.

### Fondo de Reserva de Piso

Pool controlado por el protocolo (capitalizado con parte del fee de transacción, no de emisión) que compra CUUM del mercado interno si D/S colapsa y amenaza el piso de 1 USD. Defiende únicamente el piso — nunca empuja el precio hacia arriba artificialmente. La suba solo puede venir de demanda real.

### Schema base

```json
{
  "epoch_id": "uint64",
  "demand_UCS": "float",
  "staked_trajectory_S": "float",
  "raw_price": "float",
  "ema_price": "float",
  "reserve_fund_balance": "float",
  "floor_defense_triggered": "bool"
}
```

---

## B) Sistema de Regalías (Autores + Arranque en Frío)

### B.1 — Regalía perpetua al autor original

Cada ejecución de un Mandate que genera ahorro de inferencia enruta una fracción fija del fee al autor original, vía registro inmutable de autoría (hash del Mandate + wallet, no el código fuente).

```
royalty_author = fee_execution × ρ_author
```

`ρ_author` decae logarítmicamente con el número de forks/mejoras derivadas registradas: si otro dev mejora el Mandate, cobra su propia fracción sobre su delta de eficiencia, y el autor original sigue cobrando sobre el core, en cascada — modelo tipo regalías de sampling musical, no winner-takes-all.

### B.2 — Bootstrap de Arranque en Frío (SampleSize = 0)

```
reward_cold_start = base_reward × multiplier_cold(SampleSize)

multiplier_cold(n) = 1 + β / (1 + n)     // β alto, ej. 4-5x en n=0
```

- Máximo en `SampleSize = 0`.
- Cae rápidamente con validaciones independientes de otros ingenieros, convergiendo a 1x en un umbral de confianza estadística (ej. n≥30).
- Solo una porción se libera de inmediato; el resto se vestea (bloquea) y libera proporcionalmente a medida que el Mandate demuestra estabilidad, evitando disparos de telemetría basura solo por el multiplicador alto.

### Schema base

```json
{
  "mandate_id": "hash",
  "author_wallet": "address",
  "genealogy": [{"contributor": "address", "delta_efficiency": "float"}],
  "sample_size": "uint32",
  "cold_start_multiplier": "float",
  "royalty_rate_author": "float",
  "reward_vesting_schedule": {
    "immediate_pct": "float",
    "vested_pct": "float",
    "unlock_condition": "validation_count >= threshold"
  }
}
```

---

## C) Quema por Eficiencia (Burn-on-Execution)

### Fórmula

```
savings_USD = baseline_inference_cost - actual_inference_cost   // debe ser > 0

fee_CUUM = (savings_USD / price_CUUM(t)) × φ      // φ = fracción del ahorro capturada, ej. 0.3

burn_CUUM = fee_CUUM × γ_burn                      // γ_burn ∈ [0,1], ej. 0.4
treasury_CUUM = fee_CUUM × (1 - γ_burn)            // resto financia B.2 y reserva de piso
```

- Si `savings_USD ≤ 0`, no hay fee ni quema — evita incentivar Mandates mediocres por volumen.
- `γ_burn` es ajustable por gobernanza: contracción de oferta vs. capitalización de tesoro, según el ciclo de la red.
- La quema reduce oferta circulante total, presionando el precio (Sección A) hacia arriba de forma orgánica: **más eficiencia real → más quema → mayor valorización → mayor atractivo de aportar telemetría de calidad.**

### Schema base

```json
{
  "execution_id": "hash",
  "mandate_id": "hash",
  "baseline_inference_cost_usd": "float",
  "actual_inference_cost_usd": "float",
  "savings_usd": "float",
  "fee_cuum": "float",
  "burn_cuum": "float",
  "treasury_cuum": "float",
  "gamma_burn_applied": "float"
}
```

---

## D) Filtro de Calidad — Staking Colateral ("Bieber Coder" penalty)

### Mecanismo base

```
collateral_required = base_collateral × cold_start_multiplier(SampleSize)
```

Cuanto mayor el premio potencial por ser early, mayor el colateral exigido, para que el multiplicador de B.2 no se convierta en vector de ataque de bajo costo.

```
if validation_score >= threshold_accept:
    collateral → returned + reward_cold_start liberado según vesting (B.2)
elif validation_score < threshold_reject:
    burn_pct = f(severity_of_noise)
    collateral_burned = collateral_required × burn_pct
    reputation_score -= penalty
else:  // zona gris
    collateral → devuelto sin quema, sin reward (neutral)
```

Se opta por **quema pura** en caso de ruido, no redistribución a validadores: redistribuir crea incentivo perverso de colusión de validadores para rechazar contribuciones legítimas y quedarse con el colateral ajeno. Quemar rompe ese incentivo — nadie gana directamente de rechazar a otro.

### Schema base

```json
{
  "contribution_id": "hash",
  "contributor": "address",
  "mandate_id": "hash",
  "collateral_locked": "float",
  "quarantine_status": "pending|accepted|rejected|neutral",
  "validation_score": "float",
  "burn_pct_applied": "float",
  "collateral_burned": "float",
  "collateral_returned": "float",
  "reputation_delta": "float"
}
```

---

# Especificación Técnica: Sistema de Arbitraje y Mitigación de Riesgos del Filtro de Calidad

## Principio rector

La resistencia a la colusión no puede depender de que "los validadores sean honestos" — eso no es un mecanismo, es una esperanza. Tiene que depender de que la deshonestidad coordinada sea **matemáticamente más cara** que la honestidad, incluso cuando los validadores se conocen entre sí y coordinan fuera de banda.

---

## 1) Algoritmo del Validation Score

### 1.1 Arquitectura de embudo (funnel), no de jurado único

Mandar todo a arbitraje humano es caro, lento, y — crítico para la colusión — da a un atacante muchas oportunidades de capturar un jurado. La solución es un embudo de tres capas donde el humano solo interviene en la zona de incertidumbre genuina.

```
Contribución de telemetría
        │
        ▼
Capa 1: Suite de Tests Abstractos (ATS)
        │  determinístico, sin humanos, sin exposición de código
        ▼
   ¿Confianza alta?
   ┌────┴────┐
  SÍ         NO / zona gris / cold-start alto valor
   │              │
   ▼              ▼
Auto-resolución    Capa 2: Jurado humano
(accept/reject)    por sorteo (sortition)
                        │
                        ▼
                   Capa 3: Auditoría diferida
                   aleatoria (post-hoc)
```

### 1.2 Capa 1 — Suite de Tests Abstractos (ATS)

Corre exclusivamente sobre estructuras abstractas (grafos de error/remediación, metadatos de Peso Cognitivo) — nunca sobre código fuente, respetando la premisa de confidencialidad. Cuatro sub-tests combinados por **media geométrica ponderada**, no aritmética:

```
S_auto = ∏ᵢ (tᵢ)^(wᵢ)      donde Σwᵢ = 1,  tᵢ ∈ [0,1]
```

Se usa media geométrica deliberadamente: en una media aritmética, un test perfecto (1.0) puede compensar un test catastrófico (0.0) dando un score mediocre pero "aprobable". En la media geométrica, un solo cero anula el resultado completo — que es exactamente el comportamiento deseado para descartar aportes que fallan en una dimensión crítica aunque luzcan bien en las demás.

**Los cuatro sub-tests:**

| Test | Qué mide | Peso sugerido |
|---|---|---|
| `t_topológico` | Coherencia estructural del grafo de error/remediación aportado (¿el nodo de remediación resuelve realmente la clase de error declarada, según reglas de tipado abstracto?) | 0.30 |
| `t_redundancia` | Distancia semántica del aporte contra el corpus existente (embeddings del grafo). Un aporte casi idéntico a uno ya validado sin delta de eficiencia es sospechoso de "wash telemetry" | 0.25 |
| `t_impacto_simulado` | Ejecución del Mandate en un entorno sandbox con casos sintéticos, midiendo si el ahorro de inferencia declarado es reproducible | 0.30 |
| `t_consistencia_autor` | Historial de coherencia del wallet aportante (varianza de sus `validation_score` pasados) | 0.15 |

**Umbral de decisión automática:**

```
S_auto ≥ 0.85  →  accept automático (no pasa a Capa 2)
S_auto ≤ 0.25  →  reject automático (no pasa a Capa 2)
0.25 < S_auto < 0.85  →  zona gris → Capa 2
```

Adicionalmente, **todo Mandate en `SampleSize = 0`** (cold start) pasa obligatoriamente por Capa 2 sin importar `S_auto`, sea cual sea — porque ahí es donde el multiplicador de recompensa es más alto y por tanto el incentivo a intentar colar ruido es máximo. La Capa 1 nunca aprueba en solitario un aporte con recompensa multiplicada.

### 1.3 Capa 2 — Jurado humano por sorteo (sortition)

**Selección del jurado**: no es elección ni voluntariado abierto (ambos capturables). Es sorteo criptográficamente verificable (VRF — Verifiable Random Function) sobre el conjunto de validadores elegibles, ponderado inversamente por `reputation_score` reciente de interacción con el `contributor` (para evitar que un contribuyente y sus cómplices habituales terminen en el mismo jurado).

```
jury_pool = validators WHERE
    reputation_score >= min_reputation_threshold
    AND stake_locked >= validator_min_stake
    AND NOT (recent_interaction_with(contributor) > interaction_cap)

jury = VRF_select(jury_pool, size = N_jury)
```

- `N_jury` es impar (ej. 5 o 7) para evitar empates.
- **El jurado no conoce la identidad del contribuyente** ni el de los demás jurados hasta el cierre de la votación (commit-reveal, ver 2.2) — esto es la primera barrera anti-colusión: no se puede coludir con alguien cuando no sabés quién más está votando.
- La composición del jurado se revela recién *después* de emitido el resultado, para permitir auditoría post-hoc sin exponer el jurado a presión durante la votación.

**Cada jurado emite un score individual `vⱼ ∈ [0,1]`.** El score final de Capa 2:

```
S_jury = mediana(v₁, ..., v_N)
```

Se usa **mediana, no promedio**: el promedio es manipulable por un solo voto extremo (un jurado coludido votando 0 o 1 para arrastrar el resultado); la mediana requiere coludir a una mayoría real del jurado, lo cual — combinado con la selección aleatoria y anónima — eleva sustancialmente el costo de ataque.

### 1.4 Combinación final del Validation Score

```
validation_score = S_auto                          si no pasó a Capa 2
validation_score = 0.4 × S_auto + 0.6 × S_jury      si pasó a Capa 2
```

Se pondera más el jurado humano (0.6) porque, cuando el caso llegó a Capa 2, es precisamente porque la señal automática fue insuficiente — el juicio humano contextual es la señal de mayor calidad disponible en ese caso.

### 1.5 Capa 3 — Auditoría diferida aleatoria (post-hoc)

Independientemente del resultado, un **muestreo aleatorio del 5-8%** de todas las decisiones (tanto auto-aceptadas como decididas por jurado) se re-audita en diferido por un segundo jurado independiente, semanas después, cuando ya hay más telemetría de contexto disponible para juzgar si la decisión original fue correcta.

Esta capa no existe para corregir el caso individual (ya se resolvió), sino para **generar la señal retroactiva que alimenta la reputación de los validadores** (ver Sección 2) — sin auditoría diferida, un jurado que vota mal en connivencia nunca enfrenta consecuencia, porque nadie vuelve a mirar el caso.

---

## 2) Teoría de Juegos contra la Colusión

### 2.1 El problema formal

Un grupo de `m` validadores coludidos quiere que un aporte de baja calidad (ruido, "Bieber patch") sea aprobado, para que el `contributor` cómplice cobre `reward_cold_start`, dividiendo la ganancia entre el grupo. El diseño debe garantizar:

```
E[ganancia_colusión] < E[pérdida_esperada_por_detección] × P(detección)
```

para todo `m` menor a una mayoría del `jury_pool` total — es decir, que coludir nunca sea +EV incluso para el atacante, salvo que controle una fracción del pool tan grande que ya representaría una captura total del sistema (un escenario distinto, mitigado aparte en 2.4).

### 2.2 Commit-Reveal para eliminar la coordinación en tiempo real

Cada jurado envía su voto `vⱼ` como un hash comprometido (`commit = H(vⱼ ‖ salt)`) durante la ventana de votación, y solo revela `vⱼ` y `salt` después de cerrada la ventana. Esto elimina la posibilidad de que un validador ajuste su voto observando lo que votaron los demás — un vector clásico de colusión oportunista ("veo que el resto va a aprobar, me sumo sin analizar").

Un jurado que no revela su voto a tiempo (`no-reveal`) es tratado como una falla, no como una abstención neutral (ver 2.5).

### 2.3 Función de slashing (quema pura, no redistribución)

Cuando la auditoría diferida (Capa 3) determina que un jurado votó de forma **incongruente con la evidencia disponible al momento de votar** (no solo "distinto al consenso" — eso sería castigar la disidencia legítima, sino demostrablemente contrario a la señal `S_auto` y a la evidencia del grafo), se aplica:

```
slash_amount = validator_stake_locked × σ(deviation_score)

σ(d) = 1 / (1 + e^(-λ(d - d₀)))      // sigmoide, penalización suave cerca del umbral, dura lejos de él
```

Donde:
- `deviation_score` mide qué tan lejos estuvo el voto del jurado respecto de la reconstrucción post-hoc de la evidencia (no respecto del voto de otros jurados — esto es clave, para no penalizar por votar distinto a la mayoría si la mayoría también estaba coludida).
- `λ` controla qué tan abrupta es la transición (penalización severa a partir de cierto punto, no lineal, para no castigar duro errores de juicio marginales pero sí colusión evidente).
- `d₀` es el punto de inflexión, calibrado para que un error de juicio razonable (~10-15% de desviación) caiga en zona de penalización baja, y una connivencia evidente (>40% de desviación respecto a la evidencia) caiga en zona de penalización cercana al máximo.

**El monto se quema en su totalidad — nunca se redistribuye a otros validadores ni al denunciante.** Esta es la decisión de diseño central de esta sección: si el slash se redistribuyera a "quien detectó la colusión" o a "los demás jurados", se crea un incentivo para que grupos de validadores acusen falsamente a competidores honestos para quedarse con su stake — es el mismo problema de fondo que la Sección D ya resolvió para los contribuyentes (evitar que rechazar a otro sea rentable), aplicado ahora a los validadores. La quema, al conectar con la Sección C, además contrae oferta circulante — la deshonestidad de un validador termina beneficiando indirectamente a toda la red vía presión alcista de precio, en lugar de beneficiar a un tercero específico que tuviera incentivo a fabricar acusaciones.

### 2.4 Por qué la colusión de mayoría simple no es +EV incluso siendo posible

Si `m` validadores coludidos logran, por mala suerte del sorteo VRF, ocupar una mayoría del jurado de `N_jury` en un caso puntual:

```
ganancia_esperada_grupo = reward_cold_start_capturado / m
pérdida_esperada_grupo = P(auditoría_Capa3) × slash_amount_promedio × m
```

Con `P(auditoría_Capa3)` fijado entre 5-8% por caso individual, el cálculo ingenuo parecería favorecer al atacante en el corto plazo. La contramedida no es subir la probabilidad de auditoría al 100% (inviable en costos) sino hacer que **la probabilidad acumulada tienda a 1 con la repetición**: coludir una vez para capturar un `reward_cold_start` puntual rinde poco; para que valga la pena, el grupo necesita coludir repetidamente — y la probabilidad de que *ninguna* de `k` instancias de colusión repetida sea auditada cae exponencialmente:

```
P(nunca_detectado, k intentos) = (1 - p_audit)^k
```

Con `p_audit = 0.06` y `k = 20` intentos repetidos (el mínimo razonable para que la colusión sea un negocio, no un golpe de suerte aislado), `P(nunca_detectado) ≈ 0.29` — es decir, más del 70% de probabilidad de que al menos una instancia sea detectada y dispare el slash sobre **todo el stake acumulado del validador**, no solo sobre el caso puntual (ver 2.5), lo que vuelve la ecuación de EV negativa para cualquier estrategia de colusión sostenida.

### 2.5 Severidad creciente por reincidencia (no lineal)

Un segundo hallazgo de colusión/mala fe para el mismo validador no pena "otra vez lo mismo" — pena estructuralmente más, porque una segunda ocurrencia ya no es un error de juicio, es un patrón:

```
slash_amount(offense_n) = base_slash × σ(deviation_score) × ρ^(offense_n - 1)
```

Con `ρ > 1` (ej. 2.2), de forma que la segunda infracción cuesta más del doble que la primera, y la tercera activa expulsión automática del `jury_pool` (`reputation_score → 0`, imposibilidad de re-entrar sin un período de cooldown largo y re-stake desde cero). No hay una "cuarta oportunidad" barata — el costo marginal de seguir siendo deshonesto crece más rápido que cualquier ganancia posible.

### 2.6 Recompensa a la honestidad constante

El lado positivo del incentivo, simétricamente diseñado para no depender solo del miedo al slash:

```
fee_validator = network_fee_pool × (weight_reputation_j / Σ weight_reputation_all_active_j)

weight_reputation_j = reputation_score_j × streak_multiplier_j

streak_multiplier_j = min(1 + 0.02 × consecutive_correct_validations_j, cap=2.0)
```

- Los validadores cobran una porción del pool de fees de red (alimentado por una fracción de `fee_execution` de la Sección C) proporcional a su reputación y a su racha de validaciones correctas confirmadas por auditoría diferida — no por volumen de votos emitidos, lo cual evitaría que alguien vote mecánicamente en masa solo para maximizar cobros.
- El `streak_multiplier` tiene un techo (`cap=2.0`) para que la racha no genere un efecto "demasiado grande para fallar" donde un validador muy antiguo se vuelva efectivamente inmune al riesgo relativo de una sola mala decisión.

---

## 3) Sistema de Reputación Dinámica (Credit Score)

### 3.1 Filosofía: acumulación lenta, destrucción rápida y asimétrica

La reputación debe comportarse como confianza real: se construye con esfuerzo sostenido en el tiempo, y se destruye desproporcionadamente rápido ante una falla grave — igual que en cualquier sistema de confianza humano, donde un historial de años no compra impunidad ante una traición confirmada.

### 3.2 Acumulación (crecimiento)

```
reputation_score(t+1) = reputation_score(t) + η × (1 - reputation_score(t)) × outcome_signal
```

Donde:
- `reputation_score ∈ [0, 1]`.
- `η` es la tasa de aprendizaje (ej. 0.05) — deliberadamente baja, para que la reputación alta tome tiempo real, no se gane con un puñado de aportes.
- El factor `(1 - reputation_score(t))` hace que el crecimiento sea **cóncavo**: cerca de 0 el crecimiento es más notorio (para no desalentar a un principiante honesto), pero cerca de 1 el crecimiento es casi nulo (rendimientos marginales decrecientes, evitando reputaciones "infladas" artificialmente por volumen puro de contribuciones repetitivas y triviales).
- `outcome_signal ∈ [-1, 1]`: `+1` si la contribución/validación fue confirmada correcta en auditoría, `-1` si fue confirmada incorrecta, valores intermedios para zona gris.

### 3.3 Reducción de colateral base por reputación

```
base_collateral_effective(reputation) = base_collateral_floor + (base_collateral_ceiling - base_collateral_floor) × (1 - reputation_score)^κ
```

- `κ > 1` (ej. 1.8) hace que la reducción de colateral se acelere en los tramos altos de reputación — es decir, pasar de reputación 0.9 a 0.95 reduce el colateral exigido notablemente más que pasar de 0.3 a 0.35. Esto premia de forma concreta y visible el historial largo, funcionando como un "credit score" real: cuanto más consistente el historial, menor la fricción de entrada para seguir contribuyendo.
- `base_collateral_floor` nunca llega a cero: **ningún nivel de reputación exime completamente del staking colateral**, porque eliminarlo del todo reabriría la puerta a que una identidad de alta reputación sea comprometida, vendida o usada una única vez para un ataque de alto valor sin ningún costo de entrada.

### 3.4 Destrucción asimétrica ante fallo crítico

Un fallo crítico (colusión confirmada, telemetría fraudulenta confirmada, manipulación de `SampleSize` para explotar cold start) no decae la reputación con la misma función suave de 3.2 — se aplica un colapso abrupto:

```
reputation_score(t+1) = reputation_score(t) × (1 - Φ)

Φ = Φ_base + (1 - Φ_base) × severity_normalized
```

Con `Φ_base` alto (ej. 0.5, es decir, un fallo crítico mínimo ya destruye al menos la mitad de la reputación acumulada, sin importar cuán alta fuera) y `severity_normalized ∈ [0,1]` escalando hasta una destrucción casi total (`Φ → 1`) en los casos más graves (colusión de jurado confirmada en Capa 3, fraude de telemetría deliberado y reincidente).

**La asimetría es intencional y central al diseño**: construir reputación de 0 a 0.9 puede tomar cientos de contribuciones honestas a lo largo de meses (por el `η` bajo y la concavidad de 3.2); destruirla de 0.9 a ~0.3 toma un solo evento confirmado. Esto reproduce, matemáticamente, el principio de que la confianza es cara de construir y barata de perder — y es lo que hace que un validador con reputación alta **no tenga incentivo racional a arriesgarla** por una ganancia puntual de colusión, conectando directamente con el análisis de EV negativo de la Sección 2.4: cuanto más alta la reputación del validador, mayor es lo que tiene para perder, por lo que los validadores más valiosos para la red son, precisamente, los que menos conviene que se coludan.

### 3.5 Cooldown y rehabilitación

Tras un fallo crítico, el validador no queda permanentemente expulsado (salvo reincidencia, ver 2.5) pero entra en un estado de `probation`:

- No es elegible para sorteo VRF de jurado (Capa 2) durante un período fijo (`cooldown_epochs`).
- Puede seguir aportando telemetría como `contributor` normal (Sección D), pero con `base_collateral_effective` recalculado desde `reputation_score` post-colapso, es decir, pagando el costo real de haber perdido confianza — no un castigo adicional arbitrario, sino simplemente la consecuencia matemática de 3.3 aplicada a su nuevo score, más baja.

---

## Schemas JSON — Estado de Validadores y Ciclo de Arbitraje

```json
{
  "validator_state": {
    "validator_id": "address",
    "stake_locked": "float",
    "reputation_score": "float",
    "consecutive_correct_validations": "uint32",
    "streak_multiplier": "float",
    "offense_count": "uint32",
    "status": "active | probation | expelled",
    "cooldown_until_epoch": "uint64 | null",
    "eligible_for_jury": "bool",
    "last_audit_epoch": "uint64"
  },

  "jury_selection": {
    "case_id": "hash",
    "vrf_seed": "hex",
    "jury_pool_size": "uint32",
    "selected_jurors": ["address"],
    "N_jury": "uint8",
    "selection_epoch": "uint64",
    "identities_revealed": "bool"
  },

  "validation_case": {
    "contribution_id": "hash",
    "mandate_id": "hash",
    "contributor": "address",
    "sample_size_at_submission": "uint32",
    "s_auto": "float",
    "auto_subtests": {
      "t_topologico": "float",
      "t_redundancia": "float",
      "t_impacto_simulado": "float",
      "t_consistencia_autor": "float"
    },
    "routed_to_jury": "bool",
    "jury_votes_committed": ["hash"],
    "jury_votes_revealed": ["float"],
    "s_jury": "float | null",
    "validation_score_final": "float",
    "decision": "accept | reject | neutral",
    "collateral_burned": "float",
    "reputation_deltas_applied": [
      {"address": "address", "delta": "float", "reason": "string"}
    ]
  },

  "post_hoc_audit": {
    "case_id": "hash",
    "audit_epoch": "uint64",
    "audited_original_decision": "string",
    "reconstructed_evidence_score": "float",
    "jurors_evaluated": [
      {
        "validator_id": "address",
        "original_vote": "float",
        "deviation_score": "float",
        "slash_triggered": "bool",
        "slash_amount": "float"
      }
    ]
  },

  "slashing_event": {
    "event_id": "hash",
    "validator_id": "address",
    "offense_number": "uint32",
    "base_slash": "float",
    "deviation_score": "float",
    "sigma_applied": "float",
    "rho_multiplier_applied": "float",
    "final_slash_amount": "float",
    "burn_destination": "protocol_burn",
    "reputation_before": "float",
    "reputation_after": "float"
  }
}
```

---

## Resumen de los tres loops de defensa

1. **Capa automática (ATS)** filtra el volumen masivo de ruido obvio sin costo humano ni exposición de código, usando media geométrica para que ninguna dimensión débil quede oculta por un promedio favorable.
2. **Jurado por sorteo con commit-reveal** hace que coludir requiera controlar una mayoría de un grupo aleatorio y anónimo que ni siquiera se conoce a sí mismo hasta después de votar.
3. **Auditoría diferida + slashing por quema pura + reputación de destrucción asimétrica** aseguran que, incluso si la colusión puntual tiene éxito por azar del sorteo, el valor esperado de sostenerla en el tiempo es negativo — y que la reputación acumulada, cara de construir y barata de perder, se convierte en el activo que ningún validador racional arriesga por una ganancia de corto plazo.
