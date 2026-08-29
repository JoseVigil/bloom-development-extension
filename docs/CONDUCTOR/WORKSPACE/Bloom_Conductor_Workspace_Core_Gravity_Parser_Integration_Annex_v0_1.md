# Bloom Conductor Workspace Core — Anexo de integración del Parser de Gravity

## Propuesta v0.1

**Tipo:** anexo de análisis para Conductor Workspace Core  
**Estado:** integración propuesta; no implementada  
**Artefacto objetivo:** Bloom Workspace (`installer/conductor/workspace`)

## 1. Propósito

Conductor Workspace Core necesita feedback inmediato mientras una persona
edita `gravityRules[].expression`. El parser TypeScript generado desde la misma
gramática que Nucleus permite señalar errores antes de confirmar una Postura sin
convertir a la interfaz en autoridad.

Este anexo no implementa la UI. Fija la frontera que deberá respetar esa
implementación.

## 2. Producto y superficie correctos

El consumidor no es un producto denominado Paladin. Es la superficie
post-onboarding **Core** de la aplicación Electron **Bloom Workspace**:

```text
installer/conductor/workspace/
    main_conductor.js
    core/
        core.html
        preload_core.js
```

Las especificaciones históricas cuyo nombre contiene `Paladin` se conservan
como fuentes de UX, no como nombres del runtime o del artefacto desplegable.

## 3. Contrato de autoridad

La invocación cliente es advisory:

```text
edición en Workspace Core
    → parse TypeScript
    → AST o error sintáctico efímero
    → feedback local
    → confirmación enviada a Nucleus
    → parse y validación autoritativos en Nucleus
```

El AST cliente:

- no se persiste como segunda fuente de verdad;
- no reemplaza `expression`;
- no habilita por sí mismo una firma;
- no convierte un resultado advisory en autorización;
- se descarta al cerrar o cancelar el borrador.

Si cliente y Nucleus discrepan, prevalece Nucleus.

## 4. Punto de invocación pendiente

La integración debe ocurrir en el flujo de edición del `PosturaDraft` de Core,
al cambiar el campo `criterio`/`expression`, y antes de presentar la respuesta
de confirmación. Aún debe decidirse, contra la implementación real de esa UI,
si el parser corre directamente en el renderer o detrás del preload.

Por ser una función pura sin acceso a filesystem, credenciales ni APIs del SO,
el renderer es el candidato más simple. Esa elección no queda aprobada por este
anexo: debe verificarse contra la política de módulos, CSP y aislamiento de
contexto de Workspace antes de implementar.

No se propone IPC hacia Nucleus para el parseo advisory. La confirmación sí debe
usar el canal autoritativo que gobierne la escritura/firma real.

## 5. Empaquetado requerido

Hoy `contracts/gravity` queda fuera de los `files` de
`installer/conductor/workspace/package.json`, y ese paquete tampoco declara
`antlr4`. Para que el parser llegue a `bloom-workspace` hará falta diseñar y
probar una de estas estrategias, sin elegirla todavía:

1. compilar y copiar un módulo autocontenido dentro de `workspace/core/`;
2. incorporar un bundler explícito para el módulo Gravity;
3. declarar y empaquetar el runtime y los módulos requeridos desde Workspace.

La solución elegida debe conservar `contracts/gravity/GravityExpression.g4`
como fuente única; ningún parser manual puede vivir dentro de `workspace/core`.

## 6. Artefactos y rollout

La integración TypeScript debe viajar dentro del componente Electron existente:

```text
Windows  installer/native/bin/win64/workspace/bloom-workspace.exe
macOS    installer/native/bin/darwin_{x64|arm64}/workspace/
Linux    installer/native/bin/linux_x64/workspace/
```

Metamorph debe seguir desplegando el componente `workspace`. No se crea un
componente `parser` ni una carpeta `installer/native/bin/parser`.

## 7. Comportamiento de UI a definir

La implementación posterior deberá precisar:

- momento y frecuencia del parseo durante edición;
- presentación diferenciada de error sintáctico y rechazo semántico;
- representación del AST útil para feedback, sin exponerlo como verdad;
- accesibilidad y comportamiento de foco;
- estado mientras Nucleus confirma o rechaza;
- manejo de discrepancias de versión de gramática;
- pruebas del artefacto Electron ya empaquetado, no solo del módulo aislado.

## 8. Criterios mínimos de aceptación futuros

Antes de declarar la integración productiva deberán verificarse:

1. mismo corpus produce el mismo AST JSON en Go y TypeScript;
2. Workspace Core muestra errores sintácticos sin persistir AST cliente;
3. Nucleus vuelve a parsear antes de aceptar la operación autoritativa;
4. una aceptación local nunca sobreescribe un rechazo de Nucleus;
5. `bloom-workspace` empaquetado funciona sin depender del repo;
6. el rollout normal de `workspace` instala todos los módulos requeridos;
7. no se requiere Java ni el JAR de ANTLR en producción.

## 9. Fuera de alcance de este anexo

- implementar el evaluador de Gravity;
- diseñar arbitraje entre Mandates;
- crear comandos Cobra de Nucleus;
- modificar `CreateNode` o la firma de nodos;
- decidir tokens visuales finales;
- ejecutar build o rollout productivos.
