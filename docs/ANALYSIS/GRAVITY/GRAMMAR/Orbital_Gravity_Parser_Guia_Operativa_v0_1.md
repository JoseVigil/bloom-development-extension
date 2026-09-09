# Orbital · Gravity — Guía Operativa del Parser

## Estado de implementación v0.1

**Tipo:** guía operativa de un work todavía abierto  
**Estado:** implementado como biblioteca y verificado; integraciones productivas pendientes  
**Dominio:** Gravity · Nucleus · Conductor Workspace Core

Esta guía explica qué se genera, cómo se prueba y qué llega a cada producto. La
especificación normativa de sintaxis, AST y errores sigue siendo
`Orbital_Gravity_Expression_Grammar_Parser_Spec_v0_1.md`.

## 1. Propósito y frontera

El parser transforma `gravityPostures[].expression: string` en el AST canónico de
Gravity. No evalúa el AST, no arbitra Mandates y no constituye un servicio o
ejecutable independiente.

Una sola gramática genera implementaciones para dos runtimes:

```text
contracts/gravity/GravityExpression.g4
    ├── Go         → Nucleus (autoritativo)
    └── TypeScript → Conductor Workspace Core (advisory)
```

La doble generación evita mantener dos gramáticas escritas a mano. Nucleus
conserva la autoridad: un resultado aceptado por la interfaz nunca reemplaza la
validación del backend.

## 2. Artefactos del repositorio

### 2.1 Contrato canónico y cliente TypeScript

`contracts/gravity/` contiene:

- `GravityExpression.g4`: fuente sintáctica única y versionada;
- `ast.ts`: forma JSON del AST, errores y contrato de evaluación;
- `parser.ts`: fachada pura `parse(expression)`;
- `generated/*.ts`: lexer, parser y visitor generados; no editar a mano;
- `parser.test.ts`: pruebas focalizadas TypeScript.

La gramática y la forma serializada del AST son contrato. Los archivos
generados son implementaciones derivadas del contrato.

### 2.2 Implementación Go

`installer/nucleus/internal/gravity/` contiene:

- `expression_parser.go`: fachada pura `Parse(expression string)`;
- `expression_ast.go`: representación Go del AST y de los rechazos;
- `gravityexpression_*.go`: código generado; no editar a mano;
- `expression_parser_test.go`: pruebas focalizadas Go.

El paquete también contiene persistencia, resolución y masa, pero esas
responsabilidades no forman parte del parser.

## 3. Dependencias

Para probar fuentes ya generadas:

- Go y las dependencias de `installer/nucleus/go.mod`;
- Node.js/npm y las dependencias del `package.json` raíz.

Antes de la suite TypeScript, `build-all.py` verifica con `npm ls` que `antlr4`
y `typescript` estén realmente instalados. Si el checkout tiene un
`node_modules` ausente o desactualizado, ejecuta `npm install` en la raíz y
vuelve a validar ambas dependencias antes de continuar.

Java no es dependencia de ejecución ni de deployment. Solo se necesita al
modificar la gramática y regenerar código. La generación vigente usa Java 21 y
`antlr-4.13.2-complete.jar`, cuya ruta se pasa mediante `-AntlrJar` o la
variable de sesión `ANTLR_JAR`.

## 4. Regeneración explícita

En Windows PowerShell:

```powershell
cd C:\repos\bloom-development-extension
$env:ANTLR_JAR = "C:\Tools\antlr\antlr-4.13.2-complete.jar"
.\scripts\generate-gravity-parser.ps1
```

En Linux o macOS:

```bash
cd ~/repos/bloom-development-extension
export ANTLR_JAR="/ruta/a/antlr-4.13.2-complete.jar"
bash scripts/generate-gravity-parser.sh
```

Ambos scripts generan Go y TypeScript y eliminan metadatos transitorios de ANTLR. La
regeneración no forma parte del build normal: los fuentes generados se revisan
y versionan antes de construir productos.

## 5. Verificación

Desde la raíz:

```powershell
npm run test:gravity-parser
npm run compile
```

Desde el módulo Nucleus:

```powershell
cd installer\nucleus
go test -vet=off ./internal/gravity
```

`build-all.py` ejecuta las pruebas focalizadas Go y TypeScript como preflight
fail-fast cuando Nucleus entra en el build. El preflight no regenera fuentes y
no requiere Java. También prepara las dependencias Node raíz cuando sea
necesario. La prueba TypeScript escribe temporales descartables en
`.tmp/gravity-parser-test/`.

## 6. Build y deployment

### 6.1 Nucleus

El parser Go es una biblioteca interna del módulo `installer/nucleus`; no
produce `parser.exe` ni una carpeta `installer/native/bin/parser`.

El build de Nucleus produce:

```text
Windows  installer/native/bin/win64/nucleus/nucleus.exe
macOS    installer/native/bin/darwin_{x64|arm64}/nucleus/nucleus
Linux    installer/native/bin/linux_{x64|arm64}/nucleus/nucleus
```

El rollout ordinario de Nucleus copia ese componente a:

```text
Windows  %LOCALAPPDATA%\BloomNucleus\bin\nucleus\
macOS    ~/Library/BloomNucleus/bin/nucleus/
Linux    ~/.local/share/BloomNucleus/bin/nucleus/
```

Metamorph no necesita una entrada nueva para el parser. Cuando el parser tenga
un consumidor productivo, llegará dentro del binario mediante el rollout normal
de Nucleus.

### 6.2 Conductor Workspace Core

El parser TypeScript no entra en el binario de Nucleus. Su producto de destino
es la superficie Core de `installer/conductor/workspace`, empaquetada por
Electron Builder como componente `workspace`.

En el estado actual `workspace/package.json` no incluye `contracts/gravity`, no
declara el runtime `antlr4` y Workspace Core no importa `parse()`. Por eso la
compilación raíz a `out/contracts/gravity` no equivale a integración o
deployment en `bloom-workspace`.

La integración prevista se diseña en
`Bloom_Conductor_Workspace_Core_Gravity_Parser_Integration_Annex_v0_1.md`.

## 7. Estado real

| Capacidad | Estado |
|---|---|
| Gramática `.g4` canónica | Implementada |
| Parser y AST Go | Implementados y probados |
| Parser y AST TypeScript | Implementados y probados |
| Preflight de Gravity en `build-all.py` | Implementado |
| Comando Cobra para invocar el parser | No existe |
| Validación autoritativa mediante `Parse()` antes de persistir | No conectada |
| Import desde Conductor Workspace Core | No conectado |
| Empaquetado TypeScript dentro de `bloom-workspace` | No conectado |
| Evaluador real y arbitraje consumidor del AST | Fuera de este work |

## 8. Regla de avance

No debe registrarse el parser como activo en producción hasta que exista un
consumidor explícito. Exponerlo por CLI, conectarlo a la escritura autoritativa
de Nucleus o incorporarlo a Workspace Core son cambios de comportamiento
separados que requieren diseño, autorización y pruebas propios.
