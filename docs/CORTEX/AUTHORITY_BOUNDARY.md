# AUTHORITY_BOUNDARY.md — Límite de Autoridad en Onboarding de Credenciales

> **Estado:** canónico. Este documento es la fuente de verdad sobre qué hace
> y qué NO hace Cognituum durante el onboarding de cuentas de terceros
> (GitHub, Google, Gemini, y cualquier proveedor futuro).
>
> Si algo en `HARNESS_IONPUMP_SOURCE_OF_TRUTH.md`, en un `.ion`, o en
> código real (`background.js`, etc.) parece contradecir lo que dice acá,
> **este documento gana** hasta que se corrija la fuente en conflicto.

---

## 1. El principio, en una frase

> **Cognituum lleva al usuario hasta la puerta. El usuario cruza la puerta
> solo. Cognituum nunca escribe en un formulario de registro o login de
> un tercero.**

Esto aplica sin excepción a: creación de cuenta, login, 2FA, CAPTCHA,
selección de scopes/permisos, y generación del secreto en sí (API key,
token, etc.). Todos esos pasos son 100% manuales, hechos por un humano,
en su propia sesión de navegador.

## 2. Qué hace Cognituum en realidad (mecanismo verificado en `background.js`)

El flujo real, confirmado leyendo el código — no un manifest ni una
descripción — es:

1. `onboarding_state` entra en un estado de espera (`api_waiting`,
   `gemini_api_waiting`, etc.) cuando el usuario llega a ese paso del
   Discovery.
2. `startClipboardMonitoring()` se activa. **Esto es pasivo**: no navega,
   no inyecta JS en la página del proveedor, no observa el DOM del
   formulario de registro.
3. El usuario hace la registración/login/generación de key **a mano**,
   en la puerta real del proveedor (`accounts.google.com`,
   `aistudio.google.com`, `github.com/settings/tokens`, etc.).
4. El usuario copia su propio secreto real (Ctrl+C / botón "Copy" del
   proveedor).
5. `detectAPIKeyProvider()` corre un regex sobre el contenido del
   clipboard (ej. `/^AIzaSy[0-9A-Za-z_-]{33}$/` para Gemini,
   `/^ghp_[A-Za-z0-9]{36,}$/` para GitHub) para identificar de qué
   proveedor es y validar que tiene forma de secreto real.
6. Si matchea, se emite `API_KEY_DETECTED` y el secreto se registra
   localmente (Vault de Nucleus).

**No hay ningún punto en esta cadena donde Cognituum escriba texto en un
campo de un formulario de terceros.** El único input que Cognituum lee
es el clipboard, y solo después de que el usuario ya hizo el paste por su
cuenta.

## 3. Por qué esto se malinterpretó dos veces (y cómo evitarlo)

El malentendido no fue por mala fe de nadie — fue por **artefactos de
documentación que describen un mecanismo distinto al real**, y que se
leen antes que el código:

| Artefacto | Qué sugiere si se lee solo | Qué es en realidad |
|---|---|---|
| `session_guard.ion` (github.com) | Steps `type`/`click` sobre `username_input`/`password_input` con `$CONTEXT.github_password` — parece login automatizado real | Diseño de referencia/mock temprano, no el mecanismo que corre en producción (`background.js` + clipboard monitoring) |
| `ghp_simulatedToken` en fixtures de test | Parece un token real hardcodeado | String de 14 chars que no matchea el regex real de GitHub (`ghp_[A-Za-z0-9]{36,}`) — existe solo para que `applySchemaDefaults()` no falle en testing |
| Mis `.ion` de `google.com`/`aistudio.google.com` (sesión anterior) | Steps `navigate`/`wait_signal` sobre el DOM del proveedor — sugiere que IonPump controla la navegación del flujo de login/key | Necesitan reescribirse para reflejar el mecanismo real: clipboard monitoring pasivo, sin `navigate` ni `wait_signal` sobre páginas de terceros |

**La regla que se desprende:** cualquier `.ion`, manifest, o doc que
describa un flujo de credenciales de terceros tiene que declarar
explícitamente, en su propio texto, cuál de los dos mecanismos usa:

- `HUMAN_GATE_CLIPBOARD` → el mecanismo real: espera pasiva + clipboard regex.
- `HUMAN_GATE_DOM_WATCH` → mecanismo alternativo (el que yo diseñé antes):
  observa el DOM del proveedor para detectar el resultado, sin clipboard.

Ninguno de los dos escribe en el formulario del proveedor. La diferencia
es solo *cómo* se detecta que el usuario terminó. Pero si un archivo no
dice cuál de los dos es, un lector (humano o modelo) va a asumir el
patrón más parecido a lo que ya vio — que es exactamente lo que pasó acá.

## 4. Checklist para cualquier `.ion` o manifest nuevo que toque un proveedor externo

Antes de mergear un `.ion` que interactúe con `accounts.google.com`,
`github.com`, o cualquier dominio de un proveedor de identidad/API:

- [ ] ¿El manifest declara `dom_type` o `dom_click` como capability? →
      Si el flujo es `HUMAN_GATE_CLIPBOARD`, **no debería declararlos**.
- [ ] ¿Hay algún `type:` step apuntando a un selector de
      username/password/email en la page.ion del proveedor? → Si existe,
      tiene que estar marcado explícitamente como legado/mock, con un
      comentario que diga por qué no refleja producción.
- [ ] ¿El fragmento que verifica "sesión completa" usa `wait_signal` sobre
      un DOM del proveedor, o `clipboard_read` + regex? → Declararlo en
      la primera línea del `description:`.
- [ ] ¿El `description:` del fragment/action menciona explícitamente
      "el usuario completa este paso manualmente"? Si no lo dice, un
      lector no tiene forma de saberlo sin leer los steps uno por uno.

## 5. Dónde vive este documento y quién lo referencia

Colocar en: `bloom-development-extension/AUTHORITY_BOUNDARY.md` (raíz del
repo, no dentro de `ions/`, para que sea lo primero que se vea al abrir
el proyecto).

Referenciarlo desde:
- El header de `HARNESS_IONPUMP_SOURCE_OF_TRUTH.md` — una línea al
  principio: *"Ver AUTHORITY_BOUNDARY.md para el límite de autoridad en
  credenciales de terceros — tiene precedencia sobre cualquier ejemplo
  de este documento."*
- Cada `domain.manifest.json` que toque un proveedor externo, en un
  campo `"authority_boundary_ref": "../../AUTHORITY_BOUNDARY.md"`.
- El `description:` de `session_guard.ion` — agregar una línea
  aclarando si ese archivo es legado/mock o si de verdad corre en
  producción tal cual está.

## 6. Resuelto: `session_guard.ion` en producción vs. debug

Confirmado leyendo `background.js` completo (no solo grep):

- **GitHub usa el mismo mecanismo de clipboard que Gemini**, no un login
  automatizado. `API_KEY_PATTERNS.github` (`/^ghp_[A-Za-z0-9]{36,}$/`)
  vive en el mismo diccionario que Gemini/Claude/OpenAI/Grok, y
  `startClipboardMonitoring()` tiene una rama explícita
  `if (detected.provider === 'github')` que emite `GITHUB_PAT_DETECTED`
  por clipboard — igual que cualquier otro proveedor.
- **El disparador de la vida real es `onboarding_state`.** El listener
  de `chrome.storage.onChanged` arranca el clipboard monitor cuando
  `currentStep` incluye `api_waiting`/`gemini_api_waiting`. Eso es lo
  único que corre automáticamente durante el onboarding de un usuario.
- **`ION_EXECUTE_FLOW`** — el comando que dispararía `generate_pat.ion`
  y, con él, los steps `type`/`click` de `session_guard.ion` — está
  documentado en el propio código como *"Harness → background →
  Brain/IonPump"*. No cuelga del listener de `onboarding_state`. Solo
  llega desde el panel de debug del Harness (dev-only, no se despliega
  en producción — ver `HARNESS_IONPUMP_SOURCE_OF_TRUTH.md` §0.1).

**Conclusión:** `session_guard.ion` y `generate_pat.ion` son código
real y funcional — el pipeline de `DOM_TYPE`/`DOM_CLICK` en
`content.js` existe y ejecuta esos steps si se invoca — pero su único
punto de entrada es el Harness de debug (un developer simulando el
evento para no gastar cuentas reales al testear la UI repetidamente).
**Nunca se invocan como parte del onboarding real de un usuario**, que
corre 100% por `HUMAN_GATE_CLIPBOARD` (sección 2).

Acción recomendada sobre el archivo en sí: agregar un comentario en la
cabecera de `session_guard.ion` que deje esto explícito, para que la
próxima persona (o modelo) que lo abra sin el contexto de
`background.js` no repita el mismo malentendido:

```
fragment: "session_guard"
# ⚠️ SOLO se invoca desde el Harness de debug (ION_EXECUTE_FLOW), nunca
# desde el onboarding real de un usuario. El onboarding real usa
# HUMAN_GATE_CLIPBOARD (ver AUTHORITY_BOUNDARY.md §2) — el usuario
# hace login/registro a mano y el sistema detecta el resultado por
# clipboard, no por estos steps de type/click.
description: "Verifica sesión activa en GitHub. Si no hay sesión, hace login con credenciales de Vault."
```
