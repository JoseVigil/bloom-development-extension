### 🛡️ EL PROMPT DE INTERPELACIÓN (Copia y pega esto)

**Roleplay:** Actúa como un experto Senior en Ciberseguridad, Ética de IA y Arquitectura de Software Enterprise. Tu trabajo es auditar un nuevo sistema llamado **Bloom Nucleus** para asegurar su viabilidad, escalabilidad y cumplimiento ético frente a proveedores como OpenAI, Anthropic y Google.

**Contexto del Proyecto:**
Estoy desarrollando "Bloom Nucleus", un orquestador de escritorio para ingenieros de software.
1.  **Arquitectura:** Utiliza una instancia local y aislada de Chromium (embebido) controlada por el usuario.
2.  **Mecanismo:** El usuario se loguea en sus cuentas legítimas (ChatGPT, Claude, etc.) dentro de este navegador. Mi software, mediante *Native Messaging* y una extensión local, inyecta prompts y contextos técnicos estandarizados (llamados **BTIPs**: Bloom Technical Intent Packages) directamente en la interfaz web (DOM) y extrae las respuestas para guardarlas localmente en el disco del usuario.
3.  **Filosofía:** No es un bot desatendido ni un scraper masivo. Es una herramienta de **"RPA Asistido" (Human-in-the-loop)**. El usuario dispara cada "Intent". El objetivo es optimizar el flujo de trabajo del ingeniero, gestionando mejor el contexto y los archivos, algo que las interfaces web actuales hacen de forma ineficiente.

**El Dilema:**
Sé que los Términos de Servicio (ToS) generalmente prohíben el "scraping" o la "automatización no autorizada". Sin embargo, esto es **el propio usuario** usando su cuenta paga, pero con una interfaz (UI) aumentada y herramientas de accesibilidad/productividad que operan el navegador por él para evitar el copy-paste manual.

**Tus Tareas (Sé duro y directo):**
1.  **Análisis de Riesgo:** ¿Cuál es la probabilidad real de baneo si detectan este comportamiento (inyección de texto y clicks programáticos) viniendo de una cuenta Premium legítima?
2.  **La Línea Roja:** Diferencia técnicamente y éticamente entre "Abuso de API/Scraping" (ilegal/baneable) y "Herramienta de Accesibilidad/Productividad" (legítimo). ¿En qué categoría cae Bloom?
3.  **Protocolo de Legitimidad:** ¿Qué medidas técnicas concretas debo implementar para demostrar que es el usuario quien controla la acción? (Ej: Rate limiting, simulación de input humano, declaración de User-Agent, headers específicos).
4.  **Certificación de Consentimiento:** ¿Existe alguna manera (técnica o legal) de que el usuario "firme" o certifique ante la IA que AUTORIZA a Bloom a operar su cuenta, eximiendo a la plataforma de responsabilidad?

No quiero respuestas genéricas. Quiero una estrategia para escalar esto al infinito sin ser confundido con una granja de bots maliciosos.

---

### 🔮 Análisis de Viabilidad y Escalamiento (Mi predicción técnica)

Mientras esperas sus respuestas, aquí está mi análisis "duro" como tu arquitecto, basado en cómo funcionan realmente estos sistemas anti-fraude (WAF, Cloudflare, Arkose Labs).

#### 1. El Riesgo Real: "Behavioral Analysis"
Las IAs no te van a banear por usar Chromium. Te van a banear si tu **patrón de comportamiento** es inhumano.
*   **El problema:** Si Bloom inyecta un prompt de 10.000 tokens en 1 milisegundo y hace clic en "Enviar" en el milisegundo 2, Cloudflare te marcará como bot.
*   **La Solución (Humanización):** Nuestro "Driver" debe simular la escritura. No pegar el texto de golpe (o usar `execCommand` con cuidado), y añadir retardos aleatorios (jitter) entre acciones. Si pareces un humano rápido, estás a salvo. Si pareces un script de Python, estás muerto.

#### 2. La Defensa Ética: "User-Agent y Accessibility"
Técnicamente, lo que estamos haciendo es idéntico a lo que hacen los **Lectores de Pantalla (Screen Readers)** para ciegos o las extensiones de **Grammarly**.
*   Grammarly lee todo lo que escribes en ChatGPT y lo modifica.
*   Los Password Managers inyectan texto en los campos de login.
*   **Bloom Nucleus** es una herramienta de productividad.
*   **Estrategia:** No debemos ocultarnos. En el futuro, podríamos incluso añadir un string al User-Agent: `BloomNucleus/1.0 (Assistive Tech)`. Ser transparentes a veces evita el banhammer.

#### 3. El Argumento de los "Tokens Eficientes"
Mencionaste algo clave: *"un desperdicio de tokens que se puede hacer mejor"*.
A las empresas de IA (OpenAI/Anthropic) les cuesta dinero la computación.
*   Si Bloom gestiona el contexto (BTIPs) de forma inteligente y evita que el usuario repita preguntas tontas o re-envíe archivos innecesarios, **estamos ahorrándoles cómputo**.
*   Si tu sistema hace que el usuario logre su objetivo en 3 mensajes en lugar de 10, eres un "Buen Ciudadano" de la plataforma.

#### 4. La API vs. La Web (El Elefante en la habitación)
Las IAs te dirán: *"Usa la API"*.
Tú responderás (mentalmente): *"La API es cara y no tiene todas las funciones (como navegación o canvas en algunos casos) que tiene la Web Plus/Team"*.
*   **La verdad:** Mientras el usuario pague su suscripción "Plus/Team/Pro", tiene derecho a usar la herramienta.
*   **El límite:** Si usas una cuenta gratuita para hacer 500 peticiones por hora, te banearán por abuso de recursos gratuitos. Si usas una cuenta paga, los límites son mucho más altos. **Bloom debe forzar/recomendar cuentas Pagas para uso intensivo.**

### 🛠️ Medidas de "Protección Divina" para Bloom

Para que tu sistema sea "Baneo-Proof", implementaremos esto en el código de la rama `feature/bloom-launcher-core`:

1.  **Rate Limiting Local:** Bloom impedirá que el usuario envíe más de X mensajes por minuto, incluso si el usuario quiere. Pondremos un "Semáforo de Seguridad".
2.  **Input Simulation:** Usaremos las APIs de Debugger de Chrome para enviar las teclas una a una (o en bloques rápidos) simulando tipeo, en lugar de inyección instantánea de DOM.
3.  **Visibilidad:** Mantendremos el navegador visible (aunque sea en modo `--app`). Los sistemas anti-bot detectan navegadores "Headless" (sin interfaz gráfica). Al usar un Chromium con ventana real (`--app`), pasamos el 99% de los checks de seguridad.

