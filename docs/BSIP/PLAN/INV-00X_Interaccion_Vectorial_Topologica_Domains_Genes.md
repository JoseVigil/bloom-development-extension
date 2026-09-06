# INV-00X: Interacción Vectorial-Topológica en Domains, Genes y Mandatos

**Estado:** línea de investigación abierta, sin evidencia de código propia todavía
**Versión:** 1.1 — incorpora Mandatos como capa jerárquica adicional (H5, condicional)
**Fecha:** 2026-09-05
**Ámbito:** Cognituum / Brain — `core/context_planning/`, extensión conceptual hacia Domains, Genes y Mandatos
**Deriva de:** `CONTEXT_PLAN_MAPA_TECNICO_v1_0.md`, específicamente del diseño Domain/Gene
discutido como extensión de `EnrichedTreeGenerator` y de sus decisiones abiertas §2.5
**Naturaleza del documento:** marco de investigación con hipótesis falseables. No es
arquitectura normativa ni implementación aprobada. Ninguna sección de este documento
debe leerse como "esto ya funciona así" — donde algo está implementado se dice
explícitamente; el resto es diseño propuesto pendiente de validación.

**Nota sobre "Mandato" (v1.1):** a diferencia de Domain/Gene — que al menos contaban
con una propuesta de diseño discutida en sesión previa aunque sin código — el término
"Mandato" aparece en todo el corpus revisado hasta ahora en una única mención:
*"Mandate Genesis no está terminado"* (`CONTEXT_PLAN_MAPA_TECNICO_v1_0.md`, §Naturaleza
del hallazgo). No existe evidencia de código, manifiesto, ni especificación de qué
estructura tiene un Mandato, cómo se relaciona con `intent_type` (`dev`/`doc`/`seed`,
visible en `plan.py`), ni si es 1:1 con un Intent o los origina en cascada. La sección
5 (Hipótesis H5) y todo lo que depende de ella en este documento está marcado como
**condicional a tres preguntas abiertas sin responder** — ver §3.5.

---

## 1. Contexto y propósito

El mapa técnico de Context Plan (`CONTEXT_PLAN_MAPA_TECNICO_v1_0.md`) y el diseño de
Domain/Gene que se esbozó como su extensión comparten un supuesto que no fue examinado
en su momento: que la pertenencia de un archivo a una unidad funcional (Gene, Domain)
es un dato binario, declarado en un manifiesto, estable en el tiempo.

Ese supuesto no resiste el estado real del sistema. El propio mapa técnico ya establece
que `Mandate Genesis no está terminado` y que el pipeline de Context Plan nunca se
ejecutó en producción — es decir, el sistema opera, y va a seguir operando por un
tiempo indeterminado, en un estado de **hidratación parcial**: archivos sin metadata,
metadata incompleta, y ningún manifiesto Domain/Gene poblado más allá de lo que se
declare a mano.

Diseñar `genome.json` como manifiesto estático (propuesta de la sesión previa a esta
línea) resuelve el problema *si* el sistema estuviera totalmente hidratado. No resuelve
qué hacer con el archivo que no tiene declaración, ni dice si "Gene" es siquiera una
unidad que se pueda declarar de forma confiable a mano, o si es más bien un cluster
semántico que emerge de cómo el código realmente se relaciona — y que un humano
completando un JSON puede describir mal, incompleto, o de forma inconsistente con
otros archivos del mismo Gene.

**Propósito de esta línea:** investigar, con hipótesis falseables y evidencia medible,
si Domains y Genes pueden representarse como espacios vectoriales (clusters de
embeddings) que (a) permiten inferir pertenencia donde no hay declaración, y (b)
mejoran la noción de centralidad estructural que ya usa `EnrichedTreeGenerator` —
y, con el mismo rigor, estar dispuestos a concluir que no, que el manifiesto
declarativo y el grafo de imports plano son la herramienta correcta y que vectorizar
esta capa no se justifica.

La pregunta que organiza todo el documento:

> ¿Un Gene es un conjunto declarado de archivos, o es un cluster que emerge de cómo
> esos archivos se relacionan semánticamente entre sí — y si es lo segundo, un
> manifiesto estático es la herramienta equivocada para representarlo?

---

## 2. Alcance y límites

### 2.1 Dentro de alcance

- Representación vectorial de una unidad funcional (Gene/Domain) a partir de los
  embeddings de sus archivos miembro (H1).
- Inferencia de pertenencia para archivos sin declaración explícita, vía proximidad
  semántica a esa representación (H2).
- Redefinición de "centralidad" para que incorpore distancia semántica al núcleo de
  su Gene/Domain, no solo topología de imports (H3).
- Definición de niveles de hidratación por archivo y de un mecanismo de degradación
  graceful que sea seguro en cualquier estado intermedio del sistema (H4).

### 2.2 Fuera de alcance, explícitamente

- **No se decide** si `genome.json` (manifiesto estático) se abandona, se mantiene
  como capa complementaria, o se convierte en la *salida* de este proceso vectorial
  en vez de su *entrada*. Esa decisión depende de lo que esta línea encuentre.
- **No se toca** el pipeline de Fase 2 de Context Plan (ranking combinado, asignación
  de tiers, diseñado en la línea de investigación previa) hasta que esta línea
  produzca un resultado o un no-resultado documentado.
- **Queda pausado** el rediseño de interfaz de `gemini_router.py` (pregunta 2 de la
  línea previa) y todo uso del `structural_score()` con pesos fijos propuesto
  originalmente — se conserva únicamente como placeholder condicional a H3 (ver §4.3).
- **No se asume** que la solución final es 100% vectorial ni 100% declarativa. El
  resultado más probable es un mecanismo híbrido con fronteras determinadas por
  evidencia, no fijadas de antemano.

### 2.3 Relación de dependencia entre hipótesis

H4 no es un prerrequisito técnico bloqueante de H1–H3 en el sentido de "hay que
terminar H4 antes de empezar el resto" — es el marco de seguridad bajo el cual
H1, H2 y H3 pueden fallar parcial o totalmente sin dejar al sistema en un estado
peor que el actual. Por eso se aborda primero: define el piso antes de construir
encima.

---

## 3. Definición de hipótesis (H1–H4)

Cada hipótesis se formula de manera que tenga una condición de rechazo explícita,
no solo una condición de éxito. Aceptar, rechazar, o marcar como *insuficiente por
falta de evidencia* son los tres veredictos válidos — ninguna hipótesis se da por
buena por default.

### H1 — Representación de Gene/Domain como espacio vectorial (centroide)

**Enunciado.** Un Gene puede representarse como el centroide (media vectorial) de
los embeddings de sus archivos miembro (embeddings calculados sobre `summary` +
`keywords` extraídos de `[BLOOM-META]`, no sobre el contenido completo del archivo),
y ese centroide es una representación semánticamente estable del núcleo del Gene.
Un Domain, de forma análoga, sobre los centroides de sus Genes o sobre el conjunto
completo de sus archivos (ver pregunta derivada abajo).

**Experimento.**
1. Para cada Gene con declaración conocida (aunque sea parcial), calcular centroide
   y medoid de sus archivos.
2. Medir varianza intra-cluster (dispersión de los archivos del Gene respecto a su
   propio centroide) vs. varianza inter-cluster (distancia entre centroides de
   Genes distintos).
3. Pregunta derivada a resolver empíricamente, no por diseño: ¿el centroide de un
   Domain es el centroide de sus Genes (pesa cada Gene igual) o el centroide directo
   de todos sus archivos (pesa cada archivo igual)? No son equivalentes si los
   Genes tienen tamaños muy distintos.

**Criterio de aceptación.** La varianza intra-cluster es significativamente menor
que la inter-cluster para la mayoría de los Genes evaluados — es decir, los Genes
declarados forman clusters reconocibles en el espacio de embeddings.

**Criterio de rechazo.** La varianza intra-cluster es comparable o mayor a la
inter-cluster: los Genes declarados no forman clusters semánticamente reconocibles,
el centroide no es representación útil, y habría que evaluar alternativas (medoid,
múltiples sub-centroides por tema, envolvente convexa) o concluir que el límite
funcional humano y el límite semántico del embedding no son la misma cosa.

---

### H2 — Inferencia de pertenencia por proximidad semántica

**Enunciado.** Un archivo sin declaración explícita de Gene puede asignarse al Gene
cuyo centroide esté a menor distancia coseno, con una confianza proporcional al
margen de decisión (distancia al centroide más cercano relativa a la distancia al
segundo más cercano), no solo a la distancia absoluta.

**Experimento.**
1. Split de validación: tomar archivos *con* declaración conocida, ocultarla, correr
   la inferencia por proximidad, comparar contra la declaración real oculta.
2. Baseline obligatorio, sin el cual el número no significa nada: heurística barata
   sin embeddings — asignación por directorio físico, prefijo de nombre de archivo,
   o in-degree del grafo de imports (un archivo importado casi exclusivamente por
   los archivos de un Gene es evidencia de pertenencia sin necesitar vector alguno).
3. Definir de antemano el tratamiento del caso ambiguo: si el margen de decisión es
   chico (distancia similar a dos o más centroides), el archivo se marca
   `"gene": "ambiguous"` con las N candidatas y su score — nunca se fuerza una
   asignación de baja confianza como si fuera segura.

**Criterio de aceptación.** La tasa de acierto de la inferencia vectorial supera
de forma significativa al baseline barato.

**Criterio de rechazo.** La inferencia vectorial no mejora meaningfully sobre el
baseline — en cuyo caso no se justifica el costo operativo (vectorizar, mantener
ChromaDB, latencia) frente a una heurística de grafo/directorio que ya es gratis.

---

### H3 — Centralidad semántico-estructural híbrida

**Enunciado.** Ponderar la centralidad de grafo (in-degree normalizado, como ya
calcula `EnrichedTreeGenerator` hoy) con la distancia semántica de un archivo al
centroide validado de su Gene produce un ranking de relevancia mejor correlacionado
con el juicio humano sobre qué archivos son centrales a una unidad funcional, que
la centralidad de grafo sola.

**Experimento.**
1. Requiere un conjunto de prueba con juicio humano — aunque sea chico (5-10
   archivos por 2-3 intents reales), alguien del equipo marca qué archivos
   considera centrales para ese intent, independientemente del embedding.
2. Calcular ranking por centralidad de grafo pura y ranking híbrido (grafo +
   distancia semántica al centroide) para el mismo conjunto.
3. Métrica de acuerdo: correlación de rangos (ej. Spearman) entre cada ranking
   automático y el ranking humano — no solo coincidencia del top-1.

**Criterio de aceptación.** El ranking híbrido tiene correlación significativamente
mayor con el juicio humano que el ranking de grafo puro.

**Criterio de rechazo.** No hay mejora meaningfully sobre la centralidad de grafo
sola — el costo de vectorizar todo el árbol para este propósito no se justifica,
y `EnrichedTreeGenerator` se queda como está.

**Dependencia.** H3 solo es evaluable con centroides que ya pasaron H1 — no tiene
sentido medir distancia semántica contra un centroide que H1 rechazó como no
representativo.

---

### H4 — Cold Start / Degradación graceful

**Enunciado.** El sistema puede definir un conjunto discreto de niveles de
hidratación por archivo, tal que en cada nivel exista un comportamiento de
fallback bien definido que (a) nunca produce una señal de confianza más alta que
la evidencia real disponible, y (b) converge al comportamiento *hoy ya
implementado* de `EnrichedTreeGenerator` cuando el nivel de hidratación es mínimo.
El sistema vectorial-topológico debe ser un superset estrictamente aditivo del
sistema actual, nunca un reemplazo que pueda fallar peor que la línea base.

**Experimento.** No es un experimento estadístico como H1–H3, sino una prueba de
invariante sobre la implementación de `structural_score()` (ver §4.3): para
cualquier combinación de niveles de hidratación e inputs, el score resultante no
debe caer por debajo del que produciría `file_centrality` sola.

**Criterio de aceptación.** Ningún camino de `structural_score()` produce un score
menor al de la centralidad de archivo base, y el `provenance_tag` asociado siempre
refleja honestamente el nivel de evidencia real usado (declarado vs. inferido,
validado vs. no validado).

**Criterio de rechazo.** Existe algún nivel intermedio de hidratación donde el
comportamiento definido produce un resultado peor que ignorar Domain/Gene
directamente — falso positivo de confianza, tier mal asignado por inferencia de
bajo margen tratada como declaración, o exclusión silenciosa de archivos sin vector.

**Nota de alcance.** H4 puede terminar siendo la única hipótesis aceptada en el
corto/mediano plazo. Si H1, H2 o H3 resultan rechazadas o quedan insuficientes por
mucho tiempo, H4 es lo que garantiza que el sistema no queda en un estado peor que
el actual mientras tanto — el sistema simplemente permanece en las capas más bajas
del modelo de progresión (§4.4).

---

## 4. Modelo de hidratación (L0–L4) y matriz de fallback

### 4.1 Niveles de hidratación

Escala ordinal por archivo — no es una progresión automática ni uniforme: un
archivo puede estar en L1 sin L2 (tiene summary, nadie declaró su Gene), o en L3
sin L4 (tiene vector propio, pero el Gene al que se lo quiere asignar no tiene
centroide validado todavía).

| Nivel | Nombre | Condición | Estado actual conocido |
|---|---|---|---|
| **L0** | Sin metadata | Sin `[BLOOM-META]`, sin entrada en `genome.json`, sin embedding | Estado por defecto de cualquier archivo nuevo |
| **L1** | Metadata textual | Tiene `summary`/`keywords` de `[BLOOM-META]` (o fallback por nombre de archivo) | Único nivel que `EnrichedTreeGenerator` usa hoy — **ya implementado** |
| **L2** | Declarado estructuralmente | Tiene entrada en `genome.json` (Domain/Gene asignado por humano) | No existe aún — depende de que se retome el diseño de manifiesto pausado |
| **L3** | Vectorizado | Tiene embedding calculado (`nomic-embed-text` sobre summary+keywords) | No existe aún — depende de implementación derivada de H1 |
| **L4** | Cluster validado | Su Gene/Domain tiene centroide *y* ese centroide pasó el test de varianza de H1 | Depende de H1 aceptada |

Esta tabla es un instrumento de medición propuesto, no un reporte de estado real
del corpus. La primera tarea concreta de esta línea (§5.1) es correr esa medición,
no asumirla.

### 4.2 Estructura de dato: `HydrationRecord`

Artefacto que separa "qué tan justificado está confiar en cada señal" de "cuál es
el valor de la señal". Se calcula una vez por corrida, antes de cualquier scoring:

```python
@dataclass
class HydrationRecord:
    file_levels: Dict[str, str]                       # path -> "L0".."L4"
    gene_declared_files: Dict[str, Set[str]]          # de genome.json, si existe
    gene_inferred_files: Dict[str, Dict[str, float]]  # gene -> {path: confidence}, de H2
    gene_centroid_valid: Dict[str, bool]              # resultado de H1 por gene
    domain_of_gene: Dict[str, str]

    def level(self, path: str) -> str: ...
    def gene_of(self, path: str) -> Optional[str]: ...
    def gene_has_centroid(self, path: str) -> bool: ...
    def assignment_confidence(self, path: str) -> float:
        """1.0 si path in gene_declared_files[gene]; si no, busca en
        gene_inferred_files y devuelve el score de H2 para ese path."""
```

`generate_structured()` (extensión propuesta de `EnrichedTreeGenerator`) devuelve
este `HydrationRecord` junto con la señal de centralidad de archivo, permitiendo
que cualquier consumidor decida qué camino de `structural_score()` aplica sin
volver a consultar `genome.json` o ChromaDB en cada llamada.

### 4.3 Matriz de fallback — `structural_score()` con guardas

```python
def structural_score(
    file_path: str,
    file_centrality: float,           # siempre disponible desde L1 (ya existe hoy)
    hydration: "HydrationRecord",
    gene_scores: Dict[str, float],     # p.ej. 1 - inestabilidad de Martin, sin vectores
    domain_scores: Dict[str, float],
) -> Tuple[float, str]:
    """
    Returns: (score, provenance_tag). El provenance_tag alimenta directamente
    el campo de proveniencia que Context Plan necesita registrar (qué mecanismo
    asignó cada tier: vectorial / regla estructural / declarado / LLM).
    """
    level = hydration.level(file_path)

    if level == "L0":
        # Peor caso, pero ya manejado hoy (fallback_summary por nombre).
        # Sin boost de ningún tipo.
        return file_centrality, "structural_only_no_metadata"

    if level == "L1":
        # Estado de hoy. Ningún cambio de comportamiento.
        return file_centrality, "structural_only"

    if level == "L2" and not hydration.gene_has_centroid(file_path):
        # Declarado, pero el Gene no tiene centroide validado (H1 no cerrada
        # para ese Gene). Boost SOLO estructural de grafo agregado (in-degree
        # de Gene, no depende de ningún vector), nunca semántico.
        gene_key = hydration.gene_of(file_path)
        boost = gene_scores.get(gene_key, 0.0)
        return 0.7 * file_centrality + 0.3 * boost, "structural_plus_declared_gene"

    if level in ("L2", "L3") and hydration.gene_has_centroid(file_path) is False:
        # Vector propio, pero sin centroide de referencia validado.
        # Mismo camino que el caso anterior: sin centroide confiable,
        # el vector individual no aporta señal verificable.
        gene_key = hydration.gene_of(file_path)
        boost = gene_scores.get(gene_key, 0.0)
        return 0.7 * file_centrality + 0.3 * boost, "structural_plus_declared_gene"

    if level == "L4":
        # Único camino habilitado a usar boost semántico real: declarado
        # o inferido con margen suficiente (H2), y el Gene tiene centroide
        # que pasó H1.
        gene_key = hydration.gene_of(file_path)
        confidence = hydration.assignment_confidence(file_path)
        semantic_boost = domain_scores.get(hydration.domain_of(gene_key), 0.0) * confidence
        tag = ("structural_plus_validated_cluster" if confidence == 1.0
               else f"structural_plus_inferred_cluster(conf={confidence:.2f})")
        return (0.5 * file_centrality + 0.3 * gene_scores.get(gene_key, 0.0)
                + 0.2 * semantic_boost, tag)

    # Caso residual: nunca fallar, degradar al piso.
    return file_centrality, "structural_only_fallback"
```

Tres invariantes de diseño que son, en sí mismos, la definición operativa de H4:

1. **Una asignación inferida (H2) nunca se trata como equivalente a una
   declarada.** El `provenance_tag` distingue siempre ambos casos.
2. **Un centroide de Gene no validado por H1 nunca participa del score**, aunque
   exista técnicamente. La validación de H1 es por Gene, no global — es posible
   que algunos Genes formen clusters reconocibles y otros no.
3. **Ningún camino puede producir un score menor al de `file_centrality` sola.**
   Los boosts son aditivos con peso ≤0.3, nunca multiplicativos ni reemplazan el
   término base. Si en la implementación real algún boost mal calibrado termina
   *bajando* la relevancia de un archivo bien puntuado por grafo, eso es evidencia
   directa contra H4.

### 4.4 Modelo de progresión por capas

H1, H2 y H3 no se activan de forma simultánea ni total: se habilitan capa por
capa, y cada capa requiere que la anterior esté *validada con evidencia*, no solo
implementada. La activación es por unidad (por Gene individual), no por sistema
completo.

```
Capa 0 (existe hoy, sin cambios)
  └─ file_centrality vía EnrichedTreeGenerator. Piso de seguridad — ningún
     archivo puede quedar peor que esto. Corresponde a L0/L1.

Capa 1 (requiere: genome.json con cobertura medible)
  └─ gene_scores vía agregación de grafo (in-degree de Gene, inestabilidad
     de Martin). No depende de ningún vector, solo de declaración + topología
     de imports. Se activa Gene por Gene según measure_hydration() (§5.1).

Capa 2 (requiere: H1 aceptada PARA ESE GENE puntual)
  └─ gene_has_centroid() = True → boost semántico habilitado en
     structural_score(). Gene por Gene, no todo o nada.

Capa 3 (requiere: H2 aceptada, con tasa de acierto medida contra baseline)
  └─ assignment_confidence() deja de ser binaria (1.0/0.0) y acepta archivos
     L0/L1 sin declaración vía inferencia — solo si el margen de decisión
     supera el umbral que H2 determine como confiable.

Capa 4 (requiere: H3 aceptada con ground truth humano)
  └─ Los pesos fijos (0.5/0.3/0.2) de structural_score() dejan de ser una
     heurística razonable de partida y pasan a ser lo que H3 determine
     empíricamente como mejor correlación con juicio humano.
```

Si H1 se rechaza completamente, el sistema permanece de forma permanente en
Capa 1 — funcional, útil, sin vectores — en vez de quedar roto o bloqueado
esperando una validación que nunca llega.

---

## 5. Metodología y plan de experimentación

### 5.1 Paso 0 — Medición real de hidratación (prerrequisito de todo lo demás)

```python
def measure_hydration(root: Path, genome_path: Optional[Path]) -> Dict[str, int]:
    """
    Recorre el codebase real y devuelve el conteo de archivos por nivel L0-L4
    ANTES de que exista ningún centroide o inferencia — es decir, mide cuánto
    hay hoy en L0/L1/L2, que es todo lo medible sin H1/H2 corridas.
    L3/L4 son 0 por definición hasta que existan implementaciones de H1/H2.
    """
    # reusa EnrichedTreeGenerator._extract_file_metadata para distinguir L0 de L1
    # reusa genome.json (si existe) para L2
    ...
```

Sin este número, cualquier discusión sobre si vale la pena invertir en H1/H2 es
especulativa. Si el corpus real ya tiene, por ejemplo, 85% de archivos en L1 con
summary razonable y solo falta L2, el problema es de otro orden de magnitud que
si la mayoría está en L0 puro.

### 5.2 Plan por hipótesis, en orden de dependencia

1. **H4 (esta sección):** formalizar `HydrationRecord` y `structural_score()` con
   guardas (§4.2, §4.3) e implementarlos como capa aditiva sobre
   `EnrichedTreeGenerator` actual, sin esperar a H1/H2/H3.
2. **Medición de hidratación (§5.1):** correr contra el codebase real.
3. **Capa 1 standalone (§4.4):** implementar `gene_scores` por agregación de
   grafo — no depende de H1/H2/H3, es valioso incluso si esas tres se rechazan.
4. **H1:** calcular centroides sobre Genes con declaración conocida, medir
   varianza intra/inter-cluster.
5. **H2:** correr split de validación con baseline obligatorio, solo si H1 fue
   aceptada para al menos algunos Genes (no tiene sentido inferir pertenencia
   contra un centroide que H1 ya rechazó).
6. **H3:** construir conjunto de prueba con juicio humano, comparar ranking
   híbrido vs. ranking de grafo puro — solo evaluable con centroides que
   pasaron H1.

### 5.3 Riesgos metodológicos a evitar

1. **No repetir la confusión de nombres entre mecanismos de vectorización**
   señalada en el mapa técnico (§A.5.1 vs §A.5.2 de BLOOM_BISP). Un tercer
   mecanismo (centroides de Gene) necesita nombre y ubicación de código
   explícitamente distintos desde el diseño, no como corrección posterior.
2. **No asumir que "vectorial" es automáticamente mejor que "declarativo".**
   El resultado deseable no es reemplazar el manifiesto por vectores, es saber
   con evidencia en qué proporción cada uno es la herramienta correcta.
3. **Cuidado con la circularidad de validación en el cold start.** Si los
   clusters emergentes de H1 se comparan contra un `genome.json` que fue
   poblado por alguien agrupando "a ojo" por similitud de tema, la validación
   deja de ser independiente. Cada entrada usada como ground truth debe
   registrar si fue declarada por criterio funcional/de dominio o por
   similitud aparente — solo la primera sirve como validación real.

---

## 6. Criterios de cierre y entregables esperados

### 6.1 Criterios de cierre

La línea se da por resuelta — no necesariamente con un "sí" a todo — cuando
exista, para cada una de las cuatro hipótesis, uno de estos tres veredictos:

- **Aceptada:** evidencia empírica suficiente para pasar a diseño de
  implementación real.
- **Rechazada:** evidencia empírica suficiente para descartarla, documentada
  como resultado negativo válido, no como fracaso a esconder.
- **Insuficiente:** evidencia no concluyente dado el estado de hidratación
  actual, documentado como bloqueo real (ej. "no hay suficientes archivos con
  `[BLOOM-META]` completo para correr el split de validación con
  significancia") — en sí mismo, información útil para priorizar qué hidratar
  primero.

### 6.2 Estructura del documento final de cierre

Siguiendo el mismo formato ya validado en `CONTEXT_PLAN_MAPA_TECNICO_v1_0.md`:

1. Estado / propósito / naturaleza del hallazgo
2. Fuentes de evidencia, con clasificación tripartita (código leído / documental
   / no verificado)
3. Resultados por hipótesis (H1–H4), cada uno con experimento, números, y
   veredicto (aceptada / rechazada / insuficiente)
4. Tabla actualizada de "qué está implementado, qué es decisión sin código, qué
   es hipótesis"
5. Propuesta mínima de cómo esto se conecta con el diseño Domain/Gene y con la
   fórmula de ranking combinado de Context Plan — condicionada a los
   resultados, no decidida de antemano
6. Preguntas que esta línea abre y no cierra

### 6.3 Qué queda pausado durante la ejecución de esta línea

- El rediseño de interfaz de `gemini_router.py` (pregunta 2 de la línea de
  Context Plan).
- Cualquier implementación de `genome.json` como manifiesto rígido de
  producción — se mantiene como hipótesis de trabajo para semilla de H1, no
  como decisión tomada.
- El `structural_score()` con pesos fijos (0.5/0.3/0.2) queda marcado como
  placeholder condicional a H3, no como diseño final.

### 6.4 Próximos pasos inmediatos

1. Correr `measure_hydration()` (§5.1) contra el codebase real.
2. Implementar `HydrationRecord` y `structural_score()` con guardas (§4.2, §4.3)
   como capa aditiva, independiente del resultado de H1–H3.
3. Evaluar si Capa 1 (gene_scores por agregación de grafo, sin vectores) se
   implementa como entregable standalone — es valiosa incluso si H1/H2/H3 se
   rechazan todas.
