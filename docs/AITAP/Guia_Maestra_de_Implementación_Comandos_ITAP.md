# Guía Maestra de Implementación de Comandos ITAP

## Propósito

Esta guía se usa para investigar, diseñar e implementar comandos del CLI de
AITAP. El nombre documental solicitado es **ITAP**, pero los nombres técnicos
existentes del producto, paquete, binario y rutas continúan siendo `AITAP`,
`aitap` e `installer/aitap/`.

La guía refleja la implementación real del repositorio. Si una instrucción de
este documento contradice el código vigente, prevalece el código y la
contradicción debe informarse antes de proponer cambios.

Antes de crear o modificar archivos, el agente debe:

1. leer `AGENTS.md` en la raíz del repositorio;
2. leer `installer/aitap/AGENTS.md` y `installer/aitap/README.md`;
3. inspeccionar los comandos y contratos relacionados;
4. presentar a José Vigil la lista exacta de archivos y cambios;
5. esperar autorización explícita sobre esa lista.

Una aprobación conceptual no autoriza escritura.

---

## Requerimiento

**[PEGAR AQUÍ LA DESCRIPCIÓN DEL COMANDO DESEADO]**

Antes de producir código, reconstruir:

- propósito y consumidor del comando;
- categoría CLI aplicable;
- entradas y salidas;
- comportamiento humano y JSON;
- dependencias con Gateway, Vault o Contabilidad;
- contratos y schemas existentes que debe respetar;
- estado implementado frente a comportamiento target;
- archivos exactos que sería necesario tocar.

---

## Frontera arquitectónica obligatoria

AITAP tiene exactamente tres responsabilidades:

1. **Gateway:** routing de runtime y, por separado, de provider/model
   efectivo.
2. **Vault:** uso de referencias `key_id` contra Nucleus; AITAP no custodia
   secretos permanentes.
3. **Contabilidad:** tokens, costo, latencia y auditoría por consumidor.

Un comando de AITAP nunca debe:

- ejecutar código sobre un workspace;
- editar, aplicar parches o inspeccionar diffs de proyectos;
- administrar procesos o sesiones de runtimes;
- implementar adapters de OpenCode, Codex CLI o Claude Code CLI;
- descubrir o instalar binarios de ejecución;
- crear checkpoints, Evidence o promociones canónicas;
- gobernar el ciclo de vida de Intent, Mandate o Temporal;
- parsear o validar semánticamente el `BSIP-Response`;
- convertir a AITAP en autoridad organizacional;
- custodiar secretos permanentes;
- tratar OpenCode como provider o modelo;
- inferir el provider/model efectivo a partir del runtime seleccionado.

Si el requerimiento necesita alguna de esas capacidades, detener la
implementación e informar que pertenece a Brain, Alfred, Nucleus, Executor u
otro componente según la frontera vigente.

---

## Arquitectura CLI real

```text
installer/aitap/
├── src/aitap/
│   ├── __main__.py
│   ├── runtime_paths.py
│   ├── cli/
│   │   ├── base.py
│   │   ├── categories.py
│   │   ├── registry.py
│   │   └── help_renderer.py
│   ├── commands/
│   │   ├── __init__.py
│   │   ├── system/
│   │   ├── keys/
│   │   └── route/
│   └── core o dominios especializados, cuando corresponda
├── contracts/
├── policies/
├── registry/
├── tests/
└── scripts/generate_help.py
```

Responsabilidades:

- `commands/`: Typer, argumentos, opciones, presentación y traducción de
  errores al contrato CLI.
- módulos de dominio: lógica reutilizable y testeable sin Typer.
- `contracts/`: schemas versionados; no se modifican implícitamente al crear
  un comando.
- `policies/` y `registry/`: configuración versionada; no son autoridad
  organizacional por sí mismas.
- `commands/__init__.py`: registro explícito de todos los comandos.
- `help_renderer.py`: ayuda humana y JSON AI-native basada en metadata.

AITAP no tiene autodiscovery. Crear un archivo de comando sin registrarlo en
`discover_commands()` deja el comando fuera del CLI y de la ayuda generada.

---

## Categorías disponibles

El conjunto actual es cerrado:

```python
from aitap.cli.categories import CommandCategory

CommandCategory.SYSTEM  # versión, estado e introspección
CommandCategory.KEYS    # referencias de credenciales; nunca secretos
CommandCategory.ROUTE   # routing e Intelligence Supply
CommandCategory.HEALTH  # salud de AITAP y dependencias autorizadas
```

No crear categorías como `EXECUTE`, `RUN`, `APPLY`, `BASH`, `FILESYSTEM` o
equivalentes. Agregar cualquier categoría, incluso una aparentemente válida,
requiere una decisión y autorización específicas de José.

---

## Contrato base de comandos

Todo comando hereda de `BaseCommand` e implementa `metadata()` y
`register()`.

```python
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class ExampleCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="example",
            category=CommandCategory.SYSTEM,
            description="Descripción corta, exacta y verificable",
            version="0.1.0",
            requires_vault=False,
            aliases=[],
            examples=[
                "aitap system example",
                "aitap --json system example",
            ],
        )

    def register(self, app) -> None:
        ...
```

Reglas de metadata:

- `name` es el subcomando expuesto por Typer.
- `category` debe pertenecer al enum vigente.
- `description` debe describir capacidad real, sin afirmar integraciones
  target como implementadas.
- `version` se explicita cuando difiere del default de `CommandMetadata`.
- `requires_vault=True` informa una dependencia, pero no implementa ni prueba
  un gate de autorización.
- `aliases` solo se agregan si están realmente registrados y probados.
- `examples` deben ser comandos ejecutables y usar `aitap`, no `brain`.

---

## GlobalContext y output dual

`aitap.core.context.GlobalContext` contiene actualmente:

```python
@dataclass
class GlobalContext:
    json_mode: bool = False
    verbose: bool = False
```

No existe `gc.output(...)`. Cada comando debe implementar explícitamente su
salida humana y JSON.

Patrón recomendado:

```python
import json
import typer


def register(self, app: typer.Typer) -> None:
    @app.command(self.metadata().name)
    def execute(ctx: typer.Context) -> None:
        json_mode = bool(getattr(ctx.obj, "json_mode", False))
        verbose = bool(getattr(ctx.obj, "verbose", False))

        if verbose:
            typer.echo("Procesando solicitud...", err=True)

        result = {
            "status": "success",
            "operation": "example",
            "data": {},
        }

        if json_mode:
            typer.echo(json.dumps(result, ensure_ascii=False, sort_keys=True))
            return

        self._render_human(result)


def _render_human(self, result: dict) -> None:
    typer.echo("Operación completada")
```

Reglas:

- la salida de datos va a stdout;
- el logging verbose va a stderr;
- el modo JSON no debe mezclar texto humano;
- el JSON debe ser estable y adecuado para automatización;
- no registrar prompts, respuestas crudas o secretos salvo que un contrato
  vigente lo requiera expresamente y defina su tratamiento seguro.

---

## Manejo de errores

Los errores deben producir código de salida distinto de cero y un envelope
estable en modo JSON.

```python
def _fail(json_mode: bool, code: str, message: str) -> None:
    import json
    import typer

    payload = {
        "status": "error",
        "error": {
            "code": code,
            "message": message,
        },
    }

    if json_mode:
        typer.echo(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    else:
        typer.echo(f"Error [{code}]: {message}", err=True)
    raise typer.Exit(code=1)
```

Antes de introducir un envelope nuevo, revisar si el dominio ya posee una
excepción o contrato de error, por ejemplo `SupplyError`. No duplicar códigos
ni traducir silenciosamente errores específicos a un mensaje genérico.

No incluir en errores:

- valores de secretos;
- headers de autorización;
- payloads sensibles completos;
- paths privados innecesarios;
- respuestas de providers que puedan contener credenciales.

---

## Separación entre CLI y lógica de dominio

No todos los comandos requieren exactamente dos archivos.

### Comando autocontenido

Es apropiado para versión, información o estado calculado de forma trivial.
Puede consistir únicamente en:

```text
src/aitap/commands/<categoria>/<comando>.py
```

### Comando con lógica de dominio

Cuando existen validación compleja, persistencia, routing, provider access o
Accounting, la lógica debe vivir fuera de Typer:

```text
src/aitap/commands/<categoria>/<comando>.py
src/aitap/<dominio>/<servicio_o_modelo>.py
tests/<pruebas_focalizadas>.py
```

La capa de dominio:

- no importa Typer;
- no llama `sys.exit()`;
- no imprime directamente;
- usa tipos explícitos;
- produce datos o excepciones del dominio;
- puede probarse sin ejecutar el CLI.

No crear por rutina una clase genérica llamada `Manager`. Usar nombres que
expresen la responsabilidad real y reutilizar servicios existentes cuando ya
cubren el caso.

---

## Imports y recursos empaquetados

Preferir imports directos cuando no generan ciclos. Usar lazy imports dentro
de `register()` únicamente cuando eviten una dependencia pesada, opcional o
circular demostrable.

No copiar automáticamente la regla de Brain que exige todos los imports core
dentro de la función: esa no es una condición universal en AITAP.

Para contratos, policies, registry u otros recursos incluidos en la
aplicación standalone, usar:

```python
from aitap.runtime_paths import resource_root

root = resource_root()
policy_path = root / "policies" / "policy.json"
```

No resolver recursos empaquetados desde el current working directory ni
asumir que la aplicación corre desde el checkout fuente.

---

## Registro obligatorio

Después de crear el comando, importar su clase y agregarla a la secuencia de
`discover_commands()`:

```python
from aitap.commands.system.example import ExampleCommand


def discover_commands() -> CommandRegistry:
    registry = CommandRegistry()
    for command_cls in (
        VersionCommand,
        ExampleCommand,
    ):
        registry.register(command_cls())
    return registry
```

El orden afecta la presentación de la ayuda. Conservar un orden coherente
dentro de cada categoría.

El `CommandRegistry` usa como clave interna la combinación de categoría y
nombre. No registrar dos comandos con la misma combinación.

---

## Ayuda humana y JSON AI-native

`help_renderer.py` construye su salida a partir de `CommandMetadata`. Un
comando correctamente registrado debe aparecer en:

```text
aitap --help
aitap --json-help
```

La metadata publicada incluye:

- nombre;
- categoría;
- descripción;
- dependencia del Vault;
- aliases;
- ejemplos.

No editar `help_renderer.py` para agregar manualmente un comando. Si una nueva
necesidad exige ampliar el schema de ayuda para todos los comandos, eso es un
cambio separado que debe proponerse y autorizarse explícitamente.

La ayuda durable se genera en:

```text
installer/help/aitap_help.json
installer/help/aitap_help.txt
```

mediante el pipeline aprobado. No regenerarla ni ejecutar el build sin
autorización puntual.

---

## Vault y credenciales

Un comando relacionado con credenciales debe:

- transportar o resolver referencias `key_id` conforme al contrato vigente;
- reconocer a Nucleus como dueño del Vault;
- evitar persistir secretos en configuración, journal, Accounting o logs;
- fallar explícitamente si Vault no está disponible o rechaza la operación;
- distinguir referencia ausente, Vault bloqueado, autorización rechazada y
  dependencia no disponible cuando los contratos existentes lo permitan.

No interpretar posesión de un `key_id` como autorización. No agregar roles,
memberships, permisos o mecanismos equivalentes por iniciativa propia.

`requires_vault=True` es metadata descriptiva. Si el comando necesita un gate
real, debe utilizar el mecanismo aprobado por Nucleus; no debe simularlo.

---

## Routing e Intelligence Supply

Los comandos de routing deben conservar separadas estas dimensiones:

- runtime;
- backend/provider efectivo;
- modelo efectivo;
- Credential Reference;
- Accounting.

Seleccionar OpenCode como runtime nunca autoriza registrarlo como provider o
modelo. Seleccionar un runtime tampoco implica por sí mismo un provider/model.

Un comando de routing puede producir una decisión abstracta, candidatos,
razones, fallback y fingerprints. No puede invocar un runtime de ejecución ni
conocer sus comandos internos.

Un comando de Intelligence Supply puede invocar un provider únicamente dentro
de la frontera y contratos aprobados. Debe devolver respuesta cruda y metadata
operativa; Brain o Alfred conservan la interpretación semántica.

---

## Template de comando autocontenido

```python
import json

import typer

from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class ExampleCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="example",
            category=CommandCategory.SYSTEM,
            description="Describe exactamente la capacidad implementada",
            examples=[
                "aitap system example",
                "aitap --json system example",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(self.metadata().name)
        def execute(ctx: typer.Context) -> None:
            json_mode = bool(getattr(ctx.obj, "json_mode", False))
            result = {
                "status": "success",
                "operation": "example",
            }

            if json_mode:
                typer.echo(json.dumps(result, ensure_ascii=False, sort_keys=True))
                return

            typer.echo("AITAP example: success")
```

---

## Template de comando con servicio de dominio

```python
import json

import typer

from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.example.service import ExampleError, ExampleService


class ExampleCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="example",
            category=CommandCategory.ROUTE,
            description="Ejecuta una operación aprobada del dominio AITAP",
            examples=[
                "aitap --json route example --request request.json",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(self.metadata().name)
        def execute(
            ctx: typer.Context,
            request: str = typer.Option(..., "--request"),
        ) -> None:
            json_mode = bool(getattr(ctx.obj, "json_mode", False))
            verbose = bool(getattr(ctx.obj, "verbose", False))

            try:
                if verbose:
                    typer.echo("Procesando request...", err=True)
                result = ExampleService().run(request)
            except ExampleError as exc:
                payload = {
                    "status": "error",
                    "error": {"code": exc.code, "message": str(exc)},
                }
                if json_mode:
                    typer.echo(json.dumps(payload, ensure_ascii=False))
                else:
                    typer.echo(f"Error [{exc.code}]: {exc}", err=True)
                raise typer.Exit(code=1)

            if json_mode:
                typer.echo(json.dumps(result, ensure_ascii=False, sort_keys=True))
            else:
                typer.echo("Operación completada")
```

El ejemplo muestra la forma, no autoriza crear `aitap.example` ni los nombres
utilizados. La ubicación y nomenclatura reales deben derivarse del dominio
existente y ser aprobadas por José.

---

## Checklist previo a solicitar autorización

### Alcance

- [ ] El comando pertenece a Gateway, Vault-reference o Contabilidad.
- [ ] No absorbe responsabilidades de Brain, Alfred, Nucleus o Executor.
- [ ] No introduce una categoría nueva sin decisión expresa.
- [ ] No inventa schemas, endpoints, eventos o componentes.
- [ ] La lista exacta de archivos fue presentada a José.

### CLI

- [ ] Hereda de `BaseCommand`.
- [ ] Implementa metadata completa y veraz.
- [ ] Usa una categoría existente.
- [ ] Lee `ctx.obj` de manera segura cuando necesita contexto global.
- [ ] Separa stdout de logs en stderr.
- [ ] Produce JSON estable en `--json`.
- [ ] Devuelve código distinto de cero ante error.
- [ ] No expone secretos ni contenido sensible.

### Dominio

- [ ] La lógica no trivial está fuera de Typer.
- [ ] No hay prints, inputs ni `sys.exit()` en servicios de dominio.
- [ ] Los errores tienen clasificación estable.
- [ ] Se reutilizan contratos y servicios vigentes.
- [ ] Los recursos empaquetados se resuelven con `resource_root()`.

### Registro y ayuda

- [ ] El comando fue agregado explícitamente a `discover_commands()`.
- [ ] No duplica categoría y nombre.
- [ ] Los ejemplos usan la sintaxis real de AITAP.
- [ ] Aparece en ayuda humana y JSON.
- [ ] No se editó el renderer solo para insertar el comando.

### Pruebas propuestas

- [ ] Camino exitoso humano.
- [ ] Camino exitoso JSON.
- [ ] Entrada ausente o inválida.
- [ ] Error de dominio y exit code.
- [ ] Registro e introspección de metadata.
- [ ] Ausencia de secretos en output y errores.
- [ ] Casos de frontera propios del dominio.
- [ ] Ninguna prueba consume tokens reales sin autorización específica.

---

## Errores comunes

| Incorrecto | Correcto |
|---|---|
| Copiar imports `brain.*` | Usar exclusivamente módulos reales `aitap.*` |
| Usar `gc.output(...)` | Renderizar explícitamente JSON o salida humana |
| Crear archivo sin registrarlo | Agregar la clase a `discover_commands()` |
| Inventar una categoría | Usar el enum vigente o elevar la decisión |
| Exigir siempre dos archivos | Crear solo las capas necesarias |
| Resolver resources desde CWD | Usar `resource_root()` |
| Imprimir logs en stdout JSON | Enviar logging verbose a stderr |
| Tratar `requires_vault` como autorización | Considerarlo metadata descriptiva |
| Guardar o loggear el secreto | Conservar solo referencias autorizadas |
| Mezclar runtime con provider/model | Mantener dimensiones independientes |
| Hacer que AITAP ejecute un CLI | Devolver un target abstracto para Executor |
| Parsear `BSIP-Response` | Devolver respuesta cruda al orquestador |
| Describir target como implementado | Distinguir implementado, parcial y pendiente |

---

## Entregables esperados

No existe un número fijo de archivos. Antes de implementar, devolver:

1. resumen del comportamiento solicitado;
2. confirmación de que pertenece a AITAP;
3. categoría seleccionada y motivo;
4. contratos existentes reutilizados;
5. lista exacta de archivos por crear, modificar, borrar o renombrar;
6. cambio preciso propuesto para cada archivo;
7. pruebas que se ejecutarían;
8. cualquier decisión todavía pendiente de José.

Después, detenerse y esperar autorización explícita. Una vez autorizada la
lista, implementar únicamente esos cambios. Si aparece la necesidad de tocar
otro archivo, detenerse y pedir una ampliación puntual del alcance.

---

## Instrucción final para el agente implementador

Basándote en el requerimiento incluido al comienzo:

1. investigá el código y la documentación vigentes;
2. distinguí hechos implementados de comportamiento target;
3. verificá la frontera arquitectónica de AITAP;
4. proponé la solución sin escribir archivos;
5. enumerá rutas y cambios exactos;
6. esperá autorización explícita de José Vigil;
7. implementá únicamente la lista aprobada;
8. no ejecutes Git, builds, pipelines ni consumo real de modelos sin
   autorización puntual adicional.
