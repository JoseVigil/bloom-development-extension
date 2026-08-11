# BTIP Webview — Qué está implementado en el Home

> Análisis de código fuente real (`webview/app/src/routes` + componentes del shell).
> No incluye inferencias: cada punto está anclado a lo que el código hace hoy.

---

## 1. Flujo de entrada

```
/  (routes/+page.svelte)
   → onMount → goto('/home')      ✅ funciona, sin lógica adicional
   → spinner mientras redirige

/home (routes/home/+page.svelte)
   → contenido real del dashboard
```

La raíz nunca renderiza nada propio; es un passthrough. Todo el "home" real vive en `/home`.

---

## 2. Shell — `+layout.svelte` (envuelve `/home` y el resto de rutas)

Aplica a **todas** las páginas, no solo home.

| Elemento | Estado |
|---|---|
| Onboarding gate | ❌ Removido a propósito — el webview asume "ya onboarded"; el onboarding real vive en Electron, fuera de este contexto |
| Header con título `"CAMBIO TEST 123"` | 🟡 Placeholder de testing, no es texto final |
| `<SystemStatus mode="badge" />` en header | ✅ Implementado (ver §5) |
| Botón "Crear Nucleus" | 🟡 Renderizado, sin `on:click` — no hace nada |
| Botón "Explorer" | 🟡 Renderizado, sin `on:click` — no hace nada |
| `<Sidebar />` | ✅ Implementado (ver §3) |
| `<TabBar />` | ✅ Implementado (ver §4) |
| Evento `newmandate` (desde TabBar) | ❌ Solo `console.log`; el modal "New Mandate" no existe como componente |
| Evento `togglealfred` (desde TabBar) | ❌ Solo `console.log`; el panel de Alfred no existe como componente |
| Right-pane colapsable | 🟡 Mecanismo de colapso funciona; el `<slot name="right-pane">` no recibe contenido desde ninguna página revisada |

---

## 3. `Sidebar.svelte`

Reemplaza un sidebar viejo (con toggle expandir/colapsar) por un rail fijo de 56px, fusionando la identidad visual de un mock (`btips_workspace_v3.html`) con la navegación real vía `<a href>` de SvelteKit.

**Links reales, con routing funcional (no simulado):**

| Ruta | Ícono | Nota |
|---|---|---|
| `/home` | ✅ propio | |
| `/intents` | ✅ propio | activo también cubre `/intents/[id]`, `/intents/dev/[id]`, `/intents/doc/[id]` |
| `/nucleus` | ✅ propio | |
| `/projects` | ✅ propio | |
| `/profiles` | ✅ propio | mapea a "Accounts" del mock original |
| `/genesis` | 🟡 provisorio | sin redirect automático ni TabBar/GenesisTab que lo aloje; es el único acceso manual hoy, marcado explícitamente como parche temporal |
| `/account` | ✅ propio | vive aparte, en `sidebar-bottom` |

Decisión de diseño documentada en el propio código: se eliminó el toggle expandir/colapsar del sidebar viejo (el mock no lo contempla); el tooltip on-hover/on-focus reemplaza los labels visibles. Es reversible si se quiere otro comportamiento.

---

## 4. `TabBar.svelte`

- Consume `$lib/stores/tabs` (`tabsStore`) para la lista de tabs abiertos — **store real, no mock**.
- `selectTab` / `closeTab` están conectados al store (`tabsStore.setActive`, `tabsStore.closeTab`) — funcional.
- Soporta teclado (`Enter`/`Espacio` selecciona tab).
- Estado vacío: `"Sin pestañas abiertas"` si no hay tabs.
- Dos botones de acción (Nuevo Mandate / Alfred) **disparan los eventos** (`dispatch('newmandate')`, `dispatch('togglealfred')`) — el emisor está completo; lo que falta es el receptor (ver §2, esos eventos solo loguean en el layout).

En resumen: el *mecanismo* de tabs está completo; lo que falta es lo que se abre al crear un Mandate o togglear Alfred.

---

## 5. `SystemStatus.svelte`

Dos modos: `badge` (usado en el header) y `full` (no se ve usado en home ni en layout, pero existe).

- Llama a `getSystemHealth()` real (`$lib/api`) en `onMount` — **no es mock**, pega contra la API.
- Actualiza el store `systemStatus` con tres flags: `plugin`, `host`, `extension`.
- ⚠️ **Inconsistencia a marcar:** `host` se setea **siempre en `false`**, hardcodeado, sin importar la respuesta real de `getSystemHealth()`. Solo `plugin` refleja el estado real (`health.status === 'ok'`); `extension` está hardcodeado en `true`. Es decir, de los 3 indicadores que se muestran en modo `full`, solo uno (`plugin`) refleja estado real hoy.
- El modo `badge` (el que se usa en el header de home) solo muestra el punto verde/rojo de `plugin` — ese sí es honesto respecto al estado real.

---

## 6. `home/+page.svelte` — contenido del dashboard

Estructura: header + 4 secciones apiladas.

```
BTIPS Dashboard
├── SystemStatus (modo full, implícito por prop no pasada)
├── GeminiTokenForm
├── [ NucleusPanel | ProjectsPanel ]   ← dos columnas
└── IntentsLink
```

No se subió el código fuente de `GeminiTokenForm`, `NucleusPanel`, `ProjectsPanel` ni `IntentsLink`, así que **no puedo confirmar si están implementados de verdad o son placeholders** — solo puedo confirmar que la página los importa y los monta. Si querés el detalle real de cada uno (qué hacen, si pegan contra la API o son mock), los necesito subidos.

Notar que `home/+page.svelte` monta `<SystemStatus />` sin `mode`, por lo que cae en `mode: 'full'` (el default) — muestra los 3 indicadores (Plugin/Host/Extension), no el badge del header. Esto duplica la lógica de status (dos instancias del componente montadas a la vez: una en el header vía layout, otra acá).

---

## 7. Resumen — implementado vs. placeholder

| Pieza | Estado |
|---|---|
| Redirect `/` → `/home` | ✅ |
| Shell (header/sidebar/tabbar/right-pane) | ✅ estructura, 🟡 algunas acciones sin cablear |
| Sidebar — navegación real | ✅ (excepto `/genesis`, marcado como parche) |
| TabBar — manejo de tabs | ✅ completo |
| TabBar — Nuevo Mandate / Alfred (UI) | ✅ emite evento, ❌ sin receptor/componente |
| SystemStatus — chequeo real de `plugin` | ✅ |
| SystemStatus — `host` y `extension` | ❌ hardcodeados, no reflejan estado real |
| Botones "Crear Nucleus" / "Explorer" (header) | ❌ sin handler |
| Onboarding gate | ✅ removido intencionalmente (vive en Electron) |
| `GeminiTokenForm`, `NucleusPanel`, `ProjectsPanel`, `IntentsLink` | ❓ montados en home, contenido no verificado (falta código fuente) |

---

## 8. Abierto / próximos pasos sugeridos

1. Confirmar si `host` y `extension` en `SystemStatus` deberían reflejar estado real o si es intencional (a corto plazo) que solo `plugin` esté vivo.
2. Definir si el modal de "New Mandate" y el panel de Alfred se construyen como componentes propios o se reusan de otro lado.
3. Resolver el acceso a `/genesis` (redirect automático o tab dedicado) para sacar el link "parche" del sidebar.
4. Si querés el detalle de home a nivel de componente, subir: `GeminiTokenForm.svelte`, `NucleusPanel.svelte`, `ProjectsPanel.svelte`, `IntentsLink.svelte`, y de paso `stores/tabs.ts` y `stores/system.ts` para ver la forma de esos stores.
