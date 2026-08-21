# Handoff — ownership de implementación de AITAP Routing

**Origen:** ARCHITECTURE  
**Destino:** AITAP  
**Estado:** transferido para auditoría y reconciliación; implementación no aprobada  
**Fecha:** 2026-08-20

## 1. Autoridad

Architecture conserva autoridad sobre:

- fronteras entre Brain, Temporal, AITAP, Executor, Nucleus y Vault;
- taxonomía de runtime e Intelligence Provider/Model;
- separación entre runtime e inteligencia efectiva;
- contratos neutrales cross-system;
- prohibiciones de ownership y criterios de retorno a Architecture.

AITAP recupera ownership exclusivo de implementación para:

- policy-driven runtime selection;
- provider/backend y model selection;
- Vault/Credential References, nunca secretos permanentes;
- Accounting de routing e inferencia;
- schemas, registry, policies, engine, CLI y tests propios.

La transferencia no aprueba automáticamente los cambios no commiteados bajo
`installer/aitap/` o `docs/AITAP/`.

## 2. Frontera con Executor

AITAP decide de manera abstracta y auditable:

```text
runtime_id + runtime_kind
effective_intelligence.provider + model + credential_ref
```

Executor posee exclusivamente discovery físico, installation manifests,
compatibility, trust, adapters, procesos, workspaces, containment, checkpoints,
Evidence y promoción. AITAP no recibe paths físicos ni inicia runtimes.

AITAP puede consumir Capability Descriptors sanitizados publicados por Executor:
runtime ID, kind, capabilities, health, conformance y versión contractual. No
inspecciona binarios ni conoce comandos/flags/session IDs nativos.

## 3. Auditoría obligatoria de cambios actuales

AITAP debe inventariar y reconciliar todos los cambios no commiteados en:

- `installer/aitap/`;
- `docs/AITAP/`.

Debe revisar, como mínimo:

1. schemas de Routing Request, Routing Decision y Capability Descriptor;
2. separación ortogonal runtime vs provider/model efectivo;
3. registry y eliminación operativa de `opencode_intelligence`/
   `opencode_execution`;
4. clasificación `opencode=first_party_runtime`;
5. clasificación Codex/Claude CLI como `external_runtime`;
6. policies forced/sticky/failover/escalation/recovery;
7. determinismo, fingerprint y snapshots del engine;
8. correlación logical execution/routing decision/attempt;
9. Vault references sin secrets;
10. Accounting y atribución del provider/model real;
11. CLI humana y JSON machine-readable;
12. tests unitarios, schema, policy, fallback, override y replay;
13. documentación implementado vs target;
14. compatibilidad con los contratos neutrales de Executor.

## 4. Devolución requerida

AITAP debe entregar:

- inventario archivo por archivo de cambios encontrados;
- estado `IMPLEMENTADO`, `PARCIAL`, `BROKEN`, `TARGET` o `NOT_RUN`;
- pruebas ejecutadas y resultados;
- schemas/registry/policies finales propuestos;
- evidencia de que runtime e inteligencia no se mezclan;
- evidencia de que OpenCode nunca oculta provider/model efectivo;
- gaps de Vault y Accounting;
- contradicciones documentales corregidas o señaladas;
- contratos que requieren nueva versión;
- decisiones de ownership que deben volver a Architecture;
- plan de implementación y gates propios.

## 5. Criterios de no aprobación

Routing no se considera aprobado si:

- sólo existen schemas o fixtures sin consumidor real;
- health/capabilities son valores estáticos presentados como observados;
- una decisión Temporal no puede reproducirse desde policy/snapshot/fingerprint;
- AITAP inicia procesos o accede filesystem;
- provider/model efectivo queda reemplazado por el nombre del runtime;
- Vault entrega secretos a Brain, Temporal, logs o Evidence;
- tests no fueron ejecutados o sus dependencias no estaban disponibles;
- cambios no commiteados no fueron reconciliados.

## 6. Condiciones de retorno a Architecture

AITAP debe detenerse y devolver una propuesta si necesita:

- cambiar ownership de un componente;
- modificar taxonomía de runtime/intelligence;
- agregar semántica BISP al contrato;
- exponer detalles físicos de Executor;
- alterar autoridad Temporal sobre dispatch/retry/swap;
- alterar Grants, Vault custody o Promotion;
- introducir un cambio incompatible en contratos cross-system.

Architecture no modificará implementación AITAP salvo corrección normativa
cross-system explícita.

