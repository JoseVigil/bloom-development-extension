# Transcripción estructurada de evidencia — Feedback sobre Claude Desktop App (hilo de Twitter/X, Robert Bye)

## 1. Metadata y alcance de la muestra

- **Fuente:** hilo de respuestas al tweet de Robert Bye (@RobertJBye), Product Manager en Anthropic trabajando en Claude AI.
- **URL del tweet original:** https://x.com/RobertJBye/status/2102077263995080789
- **Fecha del tweet:** 21 de septiembre de 2026, 13:47 (hora mostrada por X).
- **Pregunta formulada por Robert Bye:** "What are your thoughts on the Claude desktop app? What do you love/hate? What features should be added? What are some of your biggest frustrations with it?"
- **Métricas del tweet al momento de la extracción:** 33.9 mil visualizaciones, 280 respuestas, 165 me gusta, 2 reposts, 48 guardados.
- **Método de recolección:** navegación con extensión de Chrome (Claude in Chrome), scroll incremental por el hilo ordenado por "Relevante" (orden por defecto de X, no cronológico ni aleatorio), extracción de texto vía DOM de cada `<article>` visible, con expansión de los botones "Mostrar más" dentro de los tweets cuando aparecían truncados.
- **Cobertura:** se recolectaron 160 elementos `<article>` únicos, de los cuales 154 son respuestas de usuarios distintas a anuncios publicitarios y a las confirmaciones breves del propio Robert Bye (ej. "Totally agree!", "agree"). Esto representa aproximadamente el 55% de las 279-280 respuestas totales que el contador de X indica para el hilo. **No se alcanzó a recolectar el 100% del hilo.** El orden "Relevante" de X prioriza respuestas con más interacción, por lo que la muestra está sesgada hacia respuestas con mayor engagement (me gusta, respuestas, vistas) y probablemente subrepresenta respuestas nuevas o con baja interacción al momento de la extracción.
- **Nota sobre duplicados:** algunos usuarios respondieron más de una vez en el hilo (ej. Robert Bye, Steve McNiven-Scott, tongtongtongtongtong, Dayton Davis, André Battagello). Cada respuesta se transcribe por separado porque puede referirse a un problema distinto.
- **Nota sobre idioma:** la gran mayoría de las respuestas está en inglés. Se identificaron respuestas en chino y una mención de una limitación tipográfica específica para usuarios de CJK (chino/japonés/coreano). Se transcriben tal cual, con traducción literal entre corchetes cuando fue posible.
- Este documento **no** contiene interpretación, priorización ni recomendaciones. Es una transcripción organizada de lo que cada persona declaró, agrupada quon fines de lectura cuando varias personas describen el mismo fenómeno.

---

## 2. Tweet original (texto completo)

> Robert Bye (@RobertJBye), Product Manager en Anthropic, trabajando en Claude AI. Anteriormente en Figma, AllTrails, Google. Miembro de la junta de morrama.com.
>
> "What are your thoughts on the Claude desktop app? What do you love/hate? What features should be added? What are some of your biggest frustrations with it?"
>
> 1:47 p.m. · 21 sept. 2026 · 33,9 mil visualizaciones

---

## 3. Evidencia agrupada por tema

Cada grupo indica cuántas respuestas distintas de la muestra sustentan el patrón. Dentro de cada grupo se listan las respuestas individuales con: autor/handle, cita textual (traducida cuando el original no está en español, entre comillas), y — cuando la propia persona lo menciona explícitamente — el contexto/plataforma, la consecuencia declarada y el workaround usado.

### 3.1 Percepción de interfaz "cluttered" / desordenada / sin jerarquía visual clara
**Mencionado por al menos 10 respuestas.**

- **Revanth Krishna (@Revanthkrishna_):** "Lacks UI coherence and the UI feels cluttered. Drawers are a mess, buttons/controls are all of different sizes, etc." — Robert Bye respondió a esta cita: "Totally agree! Lots of work to do here."
- **Siddhant Mehta (@metasidd):** "It's so busy. It comes across as an incoherent product with random feature placements and navigation patterns. Y'all need an IA refresh. It's such a cluttered experience that's neither opinionated, or flexible." — Robert Bye respondió: "agree."
- **Caleb Hill (@thisiscalebhill):** "Much too cluttered and the sidebar is much too compact. Needs some breathing room."
- **edingme (@edingme):** "Needs a lot of UI/UX work. There is no hierarchy, everything is the same level, very hard to distinguish btw chats, sidebar, projects, windows, inchat widgets etc. Mixed with OPUS never ending slop answers. I love the branding and basic DS of Claude, but some color would be [nice]" (texto cortado en la fuente).
- **B (@McCrackTastic):** "Somehow the UI feels cluttered, but you can never really find what you need quickly unless it is something you go to day after day, five days a week. It's definitely not a development tool." — Consecuencia declarada: dificultad para encontrar lo que necesita rápidamente.
- **Michael Hedgpeth (@michaelhedgpeth):** "the app feels like it's 50 different side projects vibe coded together, something needs to pull everything together, and enforce quality. There are tons of paper cuts and it is not fun to use, compared to ChatGPT/Codex." — Comparación explícita con ChatGPT/Codex.
- **SGK (@captaink99):** "Ui left panel is confusing."
- **Wikman (@mattiaswikman):** "The ui, design and structure. Fix that and you have a winner."
- **Tom Zarubin (@artmzrbn):** "shitty small fonts - shitty 'side chat' via /btw with shitty damn small fonts - we need to remove the folders/projects from the left bar (!!!!!!!!) - there are no proj[ects]..." (texto cortado en la fuente).
- **Arjun Raj (@arjunrajlab):** "In general the UI is quite nice. I think there is a lot of confusion about what 'mode' I'm in, making it hard to know where my various conversations live. Like, I need to remember whether something was a Cowork or Code or chat session to find it." — Nota: esta respuesta matiza el patrón (dice que la UI "es bastante linda" en general) mientras describe el mismo problema de confusión de modo.

### 3.2 Fragmentación / confusión entre los "modos" Chat, Cowork y Claude Code
**Mencionado por al menos 8 respuestas.**

- **tongtongtongtongtong (@tongtongtongttt)** [segunda respuesta en el hilo]: "I love the intelligence of Claude models on the app. I especially love the design of UltraCode. I hate the difference among Claude chat, cowork and Claude Code. For me these three things should be merged into one product/interface to simplify the us[e]."
- **threadkillerokc (@threadkillerokc):** "Claude Code is great. Claude Chat/Cowork are confusing for non-technical staff." — Contexto: menciona explícitamente "non-technical staff" (personal no técnico) como el segmento afectado.
- **Chris Moore (@crsmoore):** "Too much fragmentation in siloed 'areas' (chat/cowork/code) and a lot of things also feel crammed in the side panel (in Code, in particular with the new Project view)."
- **MoMo (@BeardedM0M0):** "Having 2 separate environments to code in a project. (Code and cowork)."
- **Matti (@thalrion1337):** "Project organisation is a mess currently. Sections are fine but I cant start a chat within a section. My flow: 1. Start new chat and select the local folder 2. Move it to the respective Section. In ChatGPT, I just start a chat from a Project." — Workaround descrito explícitamente: inicia el chat fuera de la sección y luego lo mueve. Comparación con ChatGPT.
- **Oscar (@oga_no_96):** "chat/code menu is annoying when working in both, would love separate windows without using cli."
- **Tony Severine (@findingtonysb):** "Would love to have ability to move chat from chat/Cowork to Claude code."
- **ohara (@fohara24):** "The new Projects feature should only be limited to Claude Code. The new project model does not work for non-coding / non-work related tasks. Threads lack so many features that regular chats have. Or if the goal is to unify both, make the threads in a project be regular chats." — Propone explícitamente dos alternativas posibles (limitar Projects a Code, o unificar threads con chats regulares).
- **Gibster Fairway (@BriefEpisode):** "I love the Claude desktop app. I would love for some of the UI of CoWork to be available in Claude Code, and for some of the ease of permissioning in Claude Code to be available in Claude CoWork (such as skills, etc.). I like to see how subagents are doing things more Clearly." — Nota: valoración positiva general, pide intercambio de features entre Code y CoWork en vez de fusión.

### 3.3 Organización de proyectos y sidebar (navegación, cantidad de proyectos, remoción)
**Mencionado por al menos 12 respuestas.**

- **Numa ᯅ (@numaausaumon):** "The side bar is hard to read if you have lots of projects. Copy the codex one with custom sections, icons, colors. It just needs better visual hierarchy." — Contexto explícito: ocurre "if you have lots of projects" (con muchos proyectos).
- **Sanzhar Alibekov (@AlibekovSanzhar):** "It would be cool to render some thumbnails sort of thing for your projects maybe? If there a big list of projects and dialogues, It's quite hard to quickly jump between them, especially if it was long ago." — Contexto explícito: listas grandes de proyectos, y proyectos antiguos.
- **Marcin Dyguda (@dygudamarcin):** "reorganizing the left sidebar in clade code desktop app... I can't easily remove the projects."
- **diligentium (@diligentium):** "I'd like the option... not a fan of projects. I'd like to hide this category please since I don't use it." — Caso que matiza: pide poder ocultar la categoría "Projects" porque no la usa, no que se mejore.
- **Ralph J. Smit (@ralphjsmit):** "Love it! Only feature that I need back: ability to toggle which projects to show in the sidebar. Sometimes just want to focus on one project and then hide other directories, so that I don't see all their sessions all the time in the sidebar." — Nota: valoración positiva general ("Love it!") con un pedido puntual de una función que dice que existía antes ("need back").
- **Birgines (@Birgines):** "More dynamic sidebar, tabs, i have multiple conversations going on and it would be so much easier to be able to have dom in differens tabs instead of flicking thru the sidebar."
- **Dominic Meagher (@dom_ma):** "It's hard to find the project or chat I'm looking for."
- **salmanneedsajob (@salmanneedsajob):** "Terrible at organizing projects. Hard to find and return to your sessions after a point. Plz copy the folder view of codex. Cloud sessions should be able to steer a local session whenever there's a dependency that requires it. Side chat could im[prove]..." (texto cortado en la fuente).
- **Peter Assentorp (@assentorp):** "I really like the app! Things I hate / I am frustrated about though: - I can't see which repository/project a 'session' belongs to in the sidebar without clicking on it. - The GitHub status is often unreliable (re-updates on click). - Show the full usage popover on hover instead of requiring a click. - Plugins fail. The Linear plugin works fine in the terminal, but not in the desktop app for some reason. Features: - Better annotation support. It's currently quite hidden and difficult to use, just drag and select? - Make me add a viewport size to the browser." — Nota: valoración positiva general con múltiples puntos de frustración específicos y separados (organización, estado de GitHub, popover de uso, plugins).
- **Thomas Walker (@twwalks):** "Projects within projects. I have a larger project then sub projects I want to have niche context for!"
- **Steve McNiven-Scott (@stevemcniven) [primera respuesta]:** "It's very hard to keep track of work going on across multiple simultaneous projects each with simultaneous threads."
- **Columbia City (@columbiacity):** ver sección 3.4 (se relaciona con historial de sesiones, citada allí).

### 3.4 Historial de sesiones y dificultad para encontrar conversaciones pasadas
**Mencionado por al menos 6 respuestas.**

- **Columbia City (@columbiacity):** "My biggest pet peeve with Claude Code Desktop is session history. Tucking everything into groups makes it a pain to find past work. I just want an optional flat list with newest sessions at the top, dates, project names, and quick search." — Workaround/pedido explícito: lista plana opcional ordenada por fecha con búsqueda rápida.
- **Eric (@ericthevil):** "I have a bunch of stranded threads overtime. Wish it could auto sort into new or existing projects for me. Same thing with new projects — sometimes on the go and will have a ran[dom]..." (texto cortado en la fuente).
- **是小玉呀 (@oomomogoogoo):** "I was able to see my cc sessions from desktop app. but seems not able anymore. even resume can only see past sessions. is that normal?" — Formulado como pregunta; describe un cambio de comportamiento percibido (antes podía, ahora no).
- **Bruce Barnett (@1337secure):** "I use Claude Code in the desktop application (enterprise). Sometimes it seems the previous context windows randomly relocate. In the list. Keeping the order would be great. The indicator is my only saving grace sometimes." — Contexto explícito: aplicación de escritorio "enterprise".
- **Stu Jordan (@JJ_StuJordan):** ver sección 3.9 (relacionado con manejo de archivos, citada allí, pero también toca navegación).

### 3.5 Mover/organizar chats entre proyectos o carpetas (drag and drop, carpetas anidadas)
**Mencionado por al menos 5 respuestas.**

- **Zyeine (@Zyeine_Art):** "For the love of everything, please let us move chats between projects. Drag and drop and a 'move to' with existing groups listed."
- **Ryan Brown (@Mrryanjbrown):** "I'll open by saying that it was pretty awesome a few months ago, and what made me switch over. That said, it feels a little bit incoherent sometimes and a little cluttered. I love ChatGPT's ability to drag and drop chats, and I think that's really helpful. I wish the browser was [more like a pure browser]..." (continúa, ver sección 3.7). — Contexto temporal explícito: "pretty awesome a few months ago" (era mejor hace unos meses, motivo por el que cambió a Claude).
- **Diego Brmdz (@diego_brmdz):** "Ability to set Zoom in/out in the in-app browser! Ability to set custom labels/tags for chats. Nested folders."
- **Releve (@releve68):** "Love mostly everything, HATE, all of the folder mounting issues that seem to come up more often than not." — Nota: valoración positiva general ("love mostly everything") con una excepción puntual sobre "folder mounting issues" sin más detalle.
- **Fivefootfive (@MrMeisterSmith):** "Allow projects to update their own artifacts/project files."

### 3.6 Búsqueda (search) rota, removida o insuficiente
**Mencionado por al menos 5 respuestas.**

- **Anton (@_anton_ai_):** "The search is not working. At all. Just looking for a pull request number like '456' results in completely wrong threads or nothing found. I just want to find a thread from a day ago and it shows me 5 records from a year ago, then 5 from today (but wrong)." — Ejemplo concreto: búsqueda de un número de PR ("456").
- **Marshall Haas (@marshal):** "Search was removed. I needed that." — Consecuencia implícita: pérdida de una función que antes existía.
- **Robinson Crusoe (@crusoeselkirk):** "It doesn't really add much from the web version. I expect more of an IDE experience. Search in chats is broken badly. I'd love a regex search like Visual Studio Code. In fact it might be best as a plugin to vs code." — Pedido explícito: búsqueda por regex, comparación con VS Code.
- **Enaayet Khan (@EnaayetKhan):** "Chats don't load completely. If you try to scroll down, they just stop. im on windows. Also it's really hard to find a chat from a week ago. I don't wanna use memory feature, just a good search feature." — Contexto explícito: Windows. Aclara que no quiere la función de memoria, específicamente pide búsqueda.
- **Christian Aguiar (@contracorrenteX):** ver también sección 3.7 (navegador), no directamente de búsqueda general.

### 3.7 Navegador interno / in-app browsing
**Mencionado por al menos 8 respuestas.**

- **Ryan Brown (@Mrryanjbrown)** [continuación de la cita en 3.5]: "...I wish the browser was a little bit more like a pure browser so I could just work in Claude the whole time. I'd also like to see the voice mode pop up on the desktop."
- **mrkoopie (@mrkoopie):** "Would be great if the browser support and experience would be improved. Eg open in new tabs, loading indicators when clicking on a link in chat. The projects beta seems to be a nice improvement :-)" — Nota: incluye una valoración positiva puntual sobre el beta de Projects.
- **Alphin Tom (@alphinctom):** "1. The file preview broken at times. 2. In app browsing experience is pathetic. 3. Browser use and computer use are basically non existant. 4. Cant attach files and images easily except images and u never know when that clogs context [and] kill[s] a chat (when working w[ith])..." (texto cortado en la fuente, continúa en otra parte con un pedido de compartir conversaciones completas, ver 3.16).
- **irvin (@irvin0519):** "Add cloud browser take over like ChatGPT does."
- **Christian Aguiar (@contracorrenteX):** "I would like internal browser had full functionality."
- **ADAM BADΞR (@adambader):** "Remote control is a pain to activate. I have to keep the terminal open. Search icon is hidden or hard to find. Browser doesn't import logins and sessions from chrome for me. Browser doesn't retain signed in sessions." — Nota: esta cita también aparece en la sección 3.10 (remote control) por tocar múltiples temas.
- **M (@alnz_k):** "Browser can't do passkey, man. You can't click a link that automatically opens a new tab."
- **Luis Mejia (@l_mejiaC):** "improve computer use + the internal browser."
- **Leonard Briones (@SpaceAgeLender):** "It would be great if the Claude chrome extension chats would be able to show up when logging in directly to Claude and to be able to start those browser chats in any project within Claude. Just like the Comet browser can do from Perplexity." — Comparación explícita con el navegador Comet de Perplexity.

### 3.8 Rendimiento y consumo de recursos (RAM, disco, "pesadez" de la app)
**Mencionado por al menos 6 respuestas.**

- **EduardoCruz.com (@eduardocruz):** "I stopped using because I felt it was too heavy and using a lot of disk space. Claude Code feels way lighter." — Consecuencia explícita: dejó de usar la app de escritorio. Comparación con Claude Code (que percibe más liviano).
- **Charles Nischal (@dillikahoon):** "It slows down my computer a lot, so I prefer using Claude in the browser. Using a Mac Pro M1." — Contexto explícito: Mac Pro M1. Workaround: usa Claude en el navegador en vez de la app.
- **𝑯𝒊𝒃𝒓𝒂 (@hibra_ai):** "Too much RAM use. Probably cause electron." — Atribución especulativa del propio usuario (menciona Electron como posible causa, no confirmado por Anthropic en el hilo).
- **Tim Akhimov (@tmr31337):** "I think the bloated nature vs cli is the most concerning one, perhaps there should be a switch to disable all unused plugins and skill and use them per needs basis." — Propone workaround: interruptor para desactivar plugins/skills no usados.
- **Elmer van der Woude (@Elmeromero88):** "I switched from browser to app, but im not so sure tbh .. I think the browser was more stable." — Nota: dirección inversa (cambió de navegador a app, pero sospecha que el navegador era más estable).
- **Anne Zoutsos (@annezoutsos):** "I had to stop using it and go back to the website. It was flagging innocuous conversations and saying the chat was full. Now I've gone back to the website, no more problems." — Consecuencia explícita: volvió al sitio web. Menciona un comportamiento específico (marcar conversaciones inocuas como "llenas").

### 3.9 Manejo de archivos y artefactos
**Mencionado por al menos 6 respuestas.**

- **Stu Jordan (@JJ_StuJordan):** "When you click a file it made, say a .md, it opens a preview in the side panel. While you can highlight parts of the text, you cannot copy it to paste. Which is annoying if you want to give it an example when giving feedback. Instead, I have to open it in my default app. But now you've taken that option away too, so I have to select open file location in explorer and open the file manually." — Secuencia de consecuencias descrita paso a paso por el usuario (no poder copiar → intentaba abrir en app por defecto → esa opción fue removida → tiene que abrir el explorador de archivos manualmente).
- **Mr. Huber (@Leerzeit):** "My biggest frustration is that Claude Code on Desktop cannot reliably display the file path for output files. Depending on where the file is stored, both opening it or right-clicking to view the file path may not work. Claude says this applies to files located outsid[e]..." (texto cortado en la fuente).
- **Jon (@j1cmd):** "The #1 gripe for me: locally, when you use the worktree option, you get this error when Claude creates things outside of the worktree and then links them in chat. Claude likes to do this a lot, all on its own, so this is a common struggle. Illustrated with the screenshot.." — Incluye captura de pantalla ilustrando el error (contenido visual, no transcrito). Contexto explícito: uso de la opción "worktree".
- **Alphin Tom (@alphinctom)** [continuación]: menciona también "4. Allow people to easily share their entire claude conversation with another person and for that person to keep prompting from there with their own subscription? This would be hard but great for teams." — Pedido de compartir conversaciones completas entre cuentas/suscripciones.
- **Alex (@AlexZadd):** "It's a small thing but you removed the ability [to view] conversations by age - I found that really useful." — Menciona explícitamente una función que existía y fue removida.
- **Small Eyez (@SmallEyez):** "Bring back document outputs in incognito mode. That's literally an insane step back for ppl [who] don't want sensitive information stored in long term chats. This is so bad. When will doc outputs be returning to incognito mode?" — Motivo declarado: preocupación por almacenamiento de información sensible.

### 3.10 Remote control y Dispatch (control remoto de sesiones)
**Mencionado por al menos 8 respuestas.**

- **ADAM BADΞR (@adambader):** "Remote control is a pain to activate. I have to keep the terminal open." (cita repetida de 3.7).
- **CyberCoug (@cybercoug):** "Dispatch is really bad. Wish the mobile solution just let me control the whole experience like Codex. No remote control. Just link and have access to everything on the desktop." — Comparación explícita con Codex.
- **Lucas (@iamlucas_ai):** "Like it. But... 1. The unreliability of the remote connection is sometimes very frustrating. 2. The bible that Claude writes before getting to the real answer is insane. I sometimes start reading it thinking that's the answer and it just like a 'draft' before getting to displaying the answer basically repeating itself." — Nota: valoración inicial positiva ("Like it") matizada por dos frustraciones concretas y no relacionadas entre sí.
- **brugt (@brumgt):** "Remote control needs to catchup to Codex level asap." — Comparación explícita con Codex.
- **Cesar Chapa (@smmsapp):** "Time stamps for /remote-control." — Pedido puntual (marca de tiempo).
- **Steve McNiven-Scott (@stevemcniven)** [tercera respuesta]: "I shouldn't need to keep doing a. 'rc'. If the app is loaded on my pc i should be able to issue any chat to any folder."
- **Dayton Davis (@DaytonDavis)** [primera respuesta]: "Would be nice to see updates faster you announced last week no more cowork and Chat just all in one but I still don't have it." — Menciona un anuncio previo de Anthropic sobre unificación de Cowork y Chat que, según el usuario, aún no se había implementado para él al momento de escribir.
- **Maya (@Maya_BsAs):** "I would like a remote control for items that are being done on the local computer. I cannot open those conversations on the cellphone." — Consecuencia explícita: no puede abrir esas conversaciones desde el celular.

### 3.11 Sesión remota, móvil y sincronización entre dispositivos
**Mencionado por al menos 6 respuestas.**

- **Dustyn Haug (@dustynhaug):** "Would love to have dedicated computers that can stay logged into sessions similar to grok bot. There are specific tasks in my work flow that require a computer rather than cloud based connectors. Would be nice to do those tasks remotely from my phone and still work." — Comparación con "grok bot".
- **Ilia Lopata (@IliaWhy):** "Biggest frustration: 1) can not start a desktop session from my iPhone 2) Archive is not synched sometimes between desktop and iPhone 3) usage in sessions lagging behind the real usage 4) Desktop Design and Code session should be more integrated with each other." — Cuatro puntos separados y numerados por el propio usuario.
- **Ant Ekşiler (@anteksiler):** "I hate that most tasks/projects are not available to pickup on mobile."
- **Nick Cantelmi (@NickCantelmi):** "I want to dive into my desktop sessions over mobile, not the Dispatch chat interface where it's difficult to understand what's going on across sessions." — Contraste explícito entre "sesiones de escritorio" y "la interfaz de chat de Dispatch".
- **Marco D'Alia (@madarco):** "better cloud agents support: setup wizard, envs transfer, screen sharing with vnc, external files copy into sandbox. like what [enlace a github.com/madarco/agentbox] does but integrated into claude desktop." — Referencia a un proyecto externo propio (agentbox) como ejemplo de funcionalidad deseada.
- **Luke Curley (@kixelated):** "I would love a way to create sessions on a remote host, so my desktop can do the compiling."

### 3.12 Comparaciones explícitas con otras herramientas (Codex, ChatGPT, Opencode, Pi)
Esta sección agrupa por referencia comparativa explícita; varias de estas citas ya aparecen en otras secciones por su contenido temático. Se listan aquí para preservar el patrón comparativo en sí.

- **remx (@softmaxing):** "it feels bad to use compared to codex."
- **Raghav Sharma (@raghav_s_1205):** "It doesn't have a voice mode comparable to codex."
- **agotpier (@agot_pier):** "It really needs a facelift, it's looked the same forever. I know you mean the desktop app, but the CLI would be amazing if it looked as slick as Opencode's."
- **Anthony Flores (@tonyflo):** "Just copy Codex. Better auto-compaction for master threads [texto cortado] again, like Codex. I hit 5-hr limit on every account, every session now after usage rollback. More ways t[o]..." (texto cortado en la fuente).
- **Peter Piekarczyk (@peterpme):** "i hate that its slow and expensive compared to pi. give pi a shot. hook up your anthropic api key since you can't use the subscription and play around with it for a few days. the harness just does better. idk what it is. bc of that, i mostly use fable for reviewing plans." — Menciona explícitamente que usa una herramienta llamada "fable" para revisar planes, como workaround/alternativa parcial.
- **Vlad (@invladwetrust):** "In Claude Code: - Side chat is not very useful. - Allow multiple 'replies,' similar to how Codex allows multiple annotations - I also find that Codex manages branches better. - Compress more frequently."
- **Michael Hedgpeth (@michaelhedgpeth):** cita repetida de 3.1, compara con ChatGPT/Codex.
- **CyberCoug, brugt:** citas repetidas de 3.10, comparan con Codex.

### 3.13 Autenticación, login y cuentas múltiples
**Mencionado por al menos 6 respuestas.**

- **Artem Klen (@ArtemkaKlen):** "I hate how often it makes me log in again—it's seriously so annoying."
- **Eduardo Vidal (@e_vidal_b):** "Multi account loggin (openAI just added). Clearly show usage. Dispatch still there (anyone using it?). How do i use the new projects?" — Menciona que OpenAI acaba de agregar login multi-cuenta, como referencia comparativa.
- **deckl (@davideckl):** "Switch between accounts. Work / personal."
- **Nightshade (@Nightshadessx):** "Multiple Claude accounts log in and easy switching between them, option to add multiple accounts on the same mcp (ex multiple gmail accounts)."
- **Josh (@neversitdull):** "I'd love for the login experience to be unified between Mac desktop and the iOS app. I use Login with Apple on iOS but that's not an option on the desktop app. I can only do the whole email to get a sign in link." — Contraste explícito entre método de login disponible en iOS (Apple) vs. desktop (solo email/link).
- **ADAM BADΞR (@adambader):** cita repetida de 3.7/3.10, sobre el navegador no importar/retener sesiones de Chrome.

### 3.14 Git, diffs y control de versiones dentro de la app
**Mencionado por al menos 5 respuestas.**

- **Harlley Oliveira (@harlleydev):** "diff doesn't work right. I need to see my changes in @git_fork."
- **Matt (@consistentmedia):** "The 'changes' tabs for diff never works when using Claude Code. I really like the improvements made to Claude Code via the desktop. The /btw opens a small window and that could be improved." — Nota: valoración positiva parcial junto con dos problemas puntuales distintos (diff y ventana de /btw).
- **Jonas (@panicunwrap):** "When working in Code, a few things keep pushing me back toward the CLI: • No way to open a terminal before sending the first prompt in a new chat. I often just want to pull, check git status, etc. first. • No easy way to make the desktop experience match my CLI config. Even a [texto cortado]" — Consecuencia explícita: esto lo empuja de vuelta al uso de la CLI en lugar de la app de escritorio.
- **Pierre Dev3o (@Pierozi):** "You need to make it easier for non-developer to manage Git branches, they always ask me help and my reflex is having them to open a terminal…" — Contexto: menciona usuarios no-desarrolladores que dependen de él para gestionar branches.
- **Andrew Luo (@andrewlu0):** "would be nice if you could open terminal in the new chat view."

### 3.15 Uso de computadora ("computer use") y visibilidad de qué agente está activo
**Mencionado por al menos 3 respuestas.**

- **Jacob Miller (@pwnies):** "Something that's been bugging me across all agents is computer use. This banner is pretty much a perpetual fixture in my life now. Biggest thing is I don't know which agent is using it, given how many I'm running. I often find it hard to know which agents are usi[ng browsers]..." (texto cortado en la fuente, acompañado de una imagen).
- **Alphin Tom (@alphinctom):** cita repetida de 3.7 ("Browser use and computer use are basically non existant").
- **Luis Mejia (@l_mejiaC):** cita repetida de 3.7 ("improve computer use + the internal browser").

### 3.16 Bugs de estabilidad y notificaciones
**Mencionado por al menos 4 respuestas, todas describiendo bugs distintos.**

- **Pawel Bielecki (@BieleckiPawel):** "On windows it sends notifications on turn end and when it's clicked the app freezes. Another frustrating bug that is hard to reproduce is that it sometimes pins itself to the top - ony killing the app helps." — Contexto explícito: Windows. Workaround: matar el proceso de la app.
- **Bruce Barnett (@1337secure):** cita repetida de 3.4 (reubicación aleatoria de ventanas de contexto).
- **Automa Dynamics (@automadynamics):** "/Low-Priorirty is a great feature but it only seems to work 50% of the time. The /clear going into a loop on the Claude remote app on iOS is a pain as well." — Dos bugs distintos: comando /Low-Priority funciona ~50% del tiempo; /clear entra en loop en la app remota de iOS.
- **Anne Zoutsos (@annezoutsos):** cita repetida de 3.8 (marcaba conversaciones inocuas como "full").

### 3.17 Visibilidad de uso y límites del plan
**Mencionado por al menos 5 respuestas.**

- **Jedson Pinto (@JedsonPinto):** "1. Pin down usage for people to be able to see. This is high ROI and easy UI. The enterprise UI is still bad. 2. Ideally. It would be nice to see [texto cortado]" — Calificación propia del pedido como "alto ROI, UI fácil".
- **DriftGauge (@DriftGauge):** "Need a usage meter on main vs sifting through settings. Thanks for considering."
- **KillerChip (@Killerchip22):** "Would love a use bar that gives you your limits for the day, week. Make it optional."
- **Eric Leszkowicz (@ericleszkowicz):** "There are aspects of it changing how I do things but right now we are not in good place. The outputs and the speed are difficult. The number one issue allowing me to look at other AI is there is very little TEAM in the teams plan. I can discuss further if need be." — Menciona explícitamente que esto lo hace considerar otras alternativas de IA.
- **Anthony Flores (@tonyflo):** cita repetida de 3.12 ("I hit 5-hr limit on every account, every session now after usage rollback").
- **Alex Brazh (@alexbrazh):** "'Usage' keyboard shortcut." — Pedido puntual de atajo de teclado.

### 3.18 Tamaño de fuente y legibilidad
**Mencionado por al menos 4 respuestas.**

- **Tim Gavin (@timgavn):** "Claude Code transcript text is too small even on the largest setting. It's too difficult for me to read so I stick with Claude Code in the terminal." — Consecuencia explícita: usa la terminal en lugar de la app por este motivo.
- **Todd Fraser (@toddfraser):** "Pick one font size for everything and let us adjust it globally."
- **Tom Zarubin (@artmzrbn):** cita repetida de 3.1 ("shitty small fonts").
- **窥基 (@wingedwork)** [en chino, traducción literal]: "La elegante tipografía serif le da a Claude un aire literario, pero el rediseño de hace unos meses hizo que los usuarios de CJK ya no puedan usar la tipografía serif. Debido al fallback de la tipografía serif, la interfaz de usuario en estos idiomas vuelve a una tipografía sans-serif, lo cual es muy decepcionante." — Caso aislado específico de localización tipográfica para usuarios de idiomas CJK (chino/japonés/coreano).

### 3.19 Modo de anotación y modo de voz
**Mencionado por al menos 4 respuestas.**

- **Janis Vegis (@jvegis):** "Just let me point at things on the screen with my mouse and yap about what I want changed. Or at least give me a decent annotation mode. Hell, even voice mode would do…"
- **Godwin (@Godwin_UX):** "would love to be able to leave contextually relevant annotated comments on Claude output & created assets/code."
- **Ryan Brown (@Mrryanjbrown):** cita repetida de 3.5/3.7 (pide que el voice mode aparezca en desktop).
- **Peter Assentorp (@assentorp):** cita repetida de 3.3 (menciona que el soporte de anotación "está actualmente bastante escondido y es difícil de usar").

### 3.20 Colaboración multi-usuario
**Mencionado por al menos 3 respuestas.**

- **tongtongtongtongtong (@tongtongtongttt)** [primera respuesta]: "The feature should be added is the multi-user chat. For example, I want to be able to invite my colleague or friend to join the same Claude conversation. A bit like Claude Tag but within Claude app. I got plenty of ideas."
- **Michael Ryerse (@MichaelRyerse):** "Cannot easily collaborate with others. Doesn't integrate well with Claude code in a folder. Would be nice to bounce between the apps in a common workspace / folder."
- **Alphin Tom (@alphinctom):** cita repetida de 3.9 (compartir conversación completa entre cuentas).

### 3.21 Automatizaciones y rutinas
**Mencionado por al menos 3 respuestas.**

- **André Battagello (@andrebattagello)** [primera respuesta]: "It would be great to be able to kickoff new sessions without the notification/chip.. for instance, I'd like to kickoff new sessions from a routine, automatically, right now it does not seem that this is possible (without manually approving each new sess[ion])..." (texto cortado en la fuente).
- **André Battagello (@andrebattagello)** [segunda respuesta]: "It would be great if Claude code could introspect and use/setup itself: eg create some routine straight com a Claude code session. It would be great to have some AI-assisted way to create a routine (last time i tried to create a new one, i had to type [texto cortado])."
- **Thiago Brezinski (@thiagobrez):** cita (dentro de una cita a su propio tweet anterior del 15 de septiembre): "Trying to get Claude automations running, but it doesn't seem to be able to create new threads like Codex, and instead it creates these 'runs' inside the routine? Really hard to follow up / request changes, and also there is no namin[g]..." — Comparación con Codex, incluye capturas de pantalla del comportamiento descrito.
- **Dayton Davis (@DaytonDavis)** [segunda respuesta]: "Very clunky cowork tasks would be nicer if they were just included in an automations tab instead of being in cowork."

### 3.22 Colaboración con terceros y contexto entre sesiones (grep, contexto compartido)
- **Henry Sowell (@realhenry):** "I would use the crap out of cowork but it can't grep across chat sessions (fine with opting-in to that). It makes me manually build a ton of context that's already across sessions." — Menciona explícitamente estar dispuesto a hacer "opt-in" a esa función.

---

## 4. Casos aislados relevantes (mencionados por una sola respuesta en la muestra, sin formar un patrón repetido)

- **Steven Webster (@stevenjwebster):** "I wonder whether the mental model should be a kanban board per project, with goals decomposed into issues and tasks, that can be assigned to different models, parallelized, and where issues move back and forth the kanban board with a sense of order, structure and progress." — Propuesta conceptual, no una queja.
- **Nuno Barreto (@nbarreto):** "I'd like a Kanban view of all chats, tasks, and Claude Code sessions. It would include tasks in progress (running), tasks that have stopped and are waiting on my input, tasks that have completed and are waiting on my review, and tasks I archived because I no longe[r need them]." — Nota: coincide temáticamente con la propuesta de Steven Webster (vista tipo Kanban) pero son dos respuestas independientes en puntos distintos del hilo; no se fusionaron porque describen alcances algo distintos (por proyecto vs. global).
- **David Jayatillake (@DSJayatillake):** "Would be nice to have cmux style tile arrangement and splitting power. Otherwise I'm really looking forward to Projects being enabled on local."
- **Griffin Chase (@GChase):** "would love multi window similar to how I use CC in terminal vs having the tab setup."
- **Max J (@maxj3i):** "Tabs, please. Split view. Panes. Whatever to allow switching quickly between sessions.."
- **JAKO (@Jskddysah):** "We need tabs. Like google/mozilla/etc tabs. So its easier to work in different things at the same time!!! You actually have a space in the app window PERFECT for that." — Nota: temáticamente relacionado con los pedidos de "tabs" de Max J y Griffin Chase, pero se mantiene aparte porque son formulaciones independientes en distintos momentos del hilo.
- **Businessing with Pat Miller (@Businessing):** "I'd sure love to a Claude window open for each chat so I can more easily monitor multiple tasks at once."
- **Adam Sandler (@TheViableEdge):** "I would like to pop out Cowork chats like I can with Claude code."
- **Katie Stone (@KatieStonePoker):** "We need pop out tables like design has for chats/projects (like online poker tables)."
- **Nota general sobre "tabs/split view/pop-out":** si bien varias de estas respuestas puntuales apuntan a un tema similar (ventanas múltiples / vistas paralelas), se mantienen listadas de forma individual en esta sección porque ninguna las agrupó explícitamente entre sí en el hilo y las formulaciones (tabs de navegador, ventanas por chat, pop-out de Cowork, tile arrangement estilo cmux) no son idénticas.
- **Sergey Kaplich (@sergey_kaplich):** "It's fine, but I barely use it 🤷" — Caso de uso mínimo/indiferencia, sin queja ni elogio particular.
- **Andrew (@andrewmcgehee):** "I never look at artifacts. Not sure if it's just me." — Caso aislado de no-uso de una función existente (artifacts), formulado como duda sobre si es un caso atípico.
- **Miguel (@miguelarios_):** "I want my local skills to be useable via the desktop. I can only use it with Claude code version of desktop app and I have to import them into Claude chat side of things. They just feel too separate."
- **EC (@ege02):** "I would like agents to be able to start their own stand-alone sessions. Right now they can only list sessions and read their transcripts and send messages. But need a launch-session CCD skill."
- **0xinha (@0xinha):** "Like most game apps, add a 'Notifications' button or category so that anyone can easily see it. And please show the update version along with the detailed patch notes for what was updated in each version." — Comparación con apps de juegos ("most game apps").
- **Daniel Morgan (@DanPMorgan):** "I think it would be cool to have the option of a highlighted artefact so that you can see something that is relevant, like your daily agenda or the status of your work without having to manually click [texto cortado]."
- **yupp (@jamesndls):** "I'd love a PDF review mode that works like Claude Docs: open the PDF inside Claude, highlight and annotate it, and leave comments for Claude to respond to. I'd also like Claude Docs to be more customizable and have features closer to a full word processor like Microsoft Word."
- **Vikas Raj Yadav (@Vraj247):** "Icons when it comes to selecting iOS and iPad simulator or maybe a separating the iPhones and iPad? Although it's simple but take a while to search from the list." — Caso muy específico de un flujo de desarrollo iOS/iPad.
- **MidMarketInfo (@MidMarketInfo):** "Would love to be able to email Claude things."
- **Will (@will123195):** "I want it to honor AGENTS.md."
- **Kyle Sexton (@melodicsoftware):** "I know a lot of features are Mac first - it'd be nice to have feature parity, gaps closed quicker. Particularly when it comes to things like computer use."
- **Jose Moreno (@13doots):** "Pinned chat and create new for a group."
- **doubledimple (@objboya)** [en chino, traducción literal]: "Solo uso CLI, mi computadora ya no puede instalar la aplicación de escritorio porque es demasiado vieja." — Caso aislado de limitación de hardware/OS antiguo que impide instalar la app.
- **Revo Laition (@revolaition):** "Sort by projects by what needs my attention now."
- **kefallrain (@kefallrain):** "It would be better to enable turning off ready for review and projectwithout deactivating it, since sometimes I just want to see the usage on the homepage instead of some long-lasting PRs and active project."
- **Shawn | Waldo Development (@WaldoDev13):** "needs to be usable for builds front to back." — Formulación breve, sin más contexto.
- **RelativelySmart (@DumbEinstein):** "Really digging the phone cloud code setup, I know it's not the desktop but it's impressive." — Valoración positiva sobre una función relacionada pero distinta a la app de escritorio (el setup de "phone cloud code").
- **Steve McNiven-Scott (@stevemcniven)** [segunda respuesta]: "Slash commands like /mcp do different things on cli or deaktop, very frustrating." — Reporta inconsistencia de comportamiento entre CLI y desktop para el mismo comando slash.

---

## 5. Respuestas que matizan, contradicen o son neutrales respecto de los patrones principales

- **Robert Bye (@RobertJBye)**, autor del tweet, respondiendo dentro de su propio hilo: coincide explícitamente con las quejas de desorden de interfaz ("Totally agree! Lots of work to do here", "agree").
- **Robin Ebers (@robinebers):** "it has come a very long way. submitted lots of bugs over the past few months to @amorriscode who's been an absolute rockstar in in fixing and relaying them to you. honestly right now, not many issues at all. one of the biggest improvements in recent history were definitely split screens, full browser support, live artifacts connecting to MCPs and of course computer use. when it comes to things that aren't going well, i'd say the obvious cloud transition. there just isn't a good way to mix them, and it feels like you're forcing them." — Esta es la respuesta más extensa que combina explícitamente una valoración muy positiva de la evolución reciente ("not many issues at all") con una crítica puntual y específica sobre la transición a la nube ("there just isn't a good way to mix them").
- **Kez (@Kieren______):** "I love it, use it everyday and coach small business how to use it. We have had over 1500 people attend our live sessions on Claude. My biggest gripes are the Speed. It feels slow vs terminal. Also [texto cortado]" — Valoración de uso intensivo y positivo, con una queja puntual de velocidad.
- **threadkillerokc (@threadkillerokc):** matiza el patrón de "confusión" limitándolo explícitamente a "non-technical staff", mientras elogia Claude Code para uso técnico.
- **Peter Assentorp (@assentorp):** "I really like the app!" seguido de una lista de frustraciones puntuales (ver 3.3).
- **Ralph J. Smit (@ralphjsmit):** "Love it!" con un solo pedido puntual (ver 3.3).
- **Arjun Raj (@arjunrajlab):** "In general the UI is quite nice" matizando el patrón de "cluttered" de la sección 3.1, aunque coincide en el problema de confusión de "modo".
- **RelativelySmart (@DumbEinstein):** valoración positiva sobre una función relacionada (ver sección 4).
- **Sergey Kaplich (@sergey_kaplich):** indiferencia declarada ("It's fine, but I barely use it").
- **joseamijares (@joseamijares):** "I really like the upgrade to have an interface from Claude code instead of onl[y]... [texto cortado] ites, add integrations autonomous from chrome open app to the GitHub app." — Valoración positiva sobre un cambio de interfaz específico, seguida de un pedido de integración adicional.
- **Elmer van der Woude (@Elmeromero88):** matiza el patrón dominante de "cambié de navegador a app por mejoras" señalando la dirección inversa de sospecha ("pero no estoy tan seguro... creo que el navegador era más estable").

---

## 6. Apéndice — listado completo de respuestas recolectadas (orden de aparición en el hilo, tal como fue mostrado por X bajo el criterio "Relevante")

Este apéndice preserva, sin categorizar, el orden y contenido de las 154 respuestas de usuarios distintas recolectadas (se excluyen del listado las confirmaciones breves del propio Robert Bye y los anuncios publicitarios intercalados por la plataforma, que no son parte del cuerpo de respuestas de usuarios).

1. Revanth Krishna (@Revanthkrishna_)
2. Siddhant Mehta (@metasidd)
3. Zyeine (@Zyeine_Art)
4. Ryan Brown (@Mrryanjbrown)
5. Steven Webster (@stevenjwebster)
6. Michael Ryerse (@MichaelRyerse)
7. Gibster Fairway (@BriefEpisode)
8. ohara (@fohara24)
9. mrkoopie (@mrkoopie)
10. tongtongtongtongtong (@tongtongtongttt) — 1ª respuesta
11. Automa Dynamics (@automadynamics)
12. joseamijares (@joseamijares)
13. Dustyn Haug (@dustynhaug)
14. Sanzhar Alibekov (@AlibekovSanzhar)
15. kefallrain (@kefallrain)
16. Enaayet Khan (@EnaayetKhan)
17. André Battagello (@andrebattagello) — 1ª respuesta
18. André Battagello (@andrebattagello) — 2ª respuesta
19. Tim Akhimov (@tmr31337)
20. Jon (@j1cmd)
21. tongtongtongtongtong (@tongtongtongttt) — 2ª respuesta
22. JAKO (@Jskddysah)
23. Janis Vegis (@jvegis)
24. Caleb Hill (@thisiscalebhill)
25. Numa ᯅ (@numaausaumon)
26. Vlad (@invladwetrust)
27. Kyle Sexton (@melodicsoftware)
28. Matti (@thalrion1337)
29. Cesar Chapa (@smmsapp)
30. Dayton Davis (@DaytonDavis) — 1ª respuesta
31. Anne Zoutsos (@annezoutsos)
32. Alex (@AlexZadd)
33. Pawel Bielecki (@BieleckiPawel)
34. remx (@softmaxing)
35. Revo Laition (@revolaition)
36. RelativelySmart (@DumbEinstein)
37. 窥基 (@wingedwork)
38. edingme (@edingme)
39. doubledimple (@objboya)
40. Charbs (@charbs_io)
41. agotpier (@agot_pier)
42. Artem Klen (@ArtemkaKlen)
43. Eric (@ericthevil)
44. Godwin (@Godwin_UX)
45. Raghav Sharma (@raghav_s_1205)
46. Shawn | Waldo Development (@WaldoDev13)
47. brugt (@brumgt)
48. Columbia City (@columbiacity)
49. Leonard Briones (@SpaceAgeLender)
50. yupp (@jamesndls)
51. Alphin Tom (@alphinctom)
52. Jedson Pinto (@JedsonPinto)
53. 是小玉呀 (@oomomogoogoo)
54. EC (@ege02)
55. Eduardo Vidal (@e_vidal_b)
56. Diego Brmdz (@diego_brmdz)
57. Daniel Morgan (@DanPMorgan)
58. Matt (@consistentmedia)
59. 0xinha (@0xinha)
60. David Jayatillake (@DSJayatillake)
61. Kez (@Kieren______)
62. irvin (@irvin0519)
63. Charles Nischal (@dillikahoon)
64. Bruce Barnett (@1337secure)
65. Jonas (@panicunwrap)
66. Jacob Miller (@pwnies)
67. CyberCoug (@cybercoug)
68. MidMarketInfo (@MidMarketInfo)
69. Andrew (@andrewmcgehee)
70. Miguel (@miguelarios_)
71. Lucas (@iamlucas_ai)
72. Dayton Davis (@DaytonDavis) — 2ª respuesta
73. threadkillerokc (@threadkillerokc)
74. Jinani (@jinaniLXD)
75. Chris Moore (@crsmoore)
76. Luke Curley (@kixelated)
77. Fivefootfive (@MrMeisterSmith)
78. Michael Hedgpeth (@michaelhedgpeth)
79. Ilia Lopata (@IliaWhy)
80. B (@McCrackTastic)
81. Anthony Flores (@tonyflo)
82. Thomas Walker (@twwalks)
83. Anton (@_anton_ai_)
84. Harlley Oliveira (@harlleydev)
85. DriftGauge (@DriftGauge)
86. James Lawley (@jameslawley)
87. Birgines (@Birgines)
88. Nuno Barreto (@nbarreto)
89. Dominic Meagher (@dom_ma)
90. Stu Jordan (@JJ_StuJordan)
91. Tony Severine (@findingtonysb)
92. Andrew Luo (@andrewlu0)
93. Neil Acquatella (@nacquatella)
94. Todd Fraser (@toddfraser)
95. Robinson Crusoe (@crusoeselkirk)
96. Pierre Dev3o (@Pierozi)
97. Releve (@releve68)
98. MoMo (@BeardedM0M0)
99. deckl (@davideckl)
100. Alex Brazh (@alexbrazh)
101. Marcin Dyguda (@dygudamarcin)
102. Businessing with Pat Miller (@Businessing)
103. Adam Sandler (@TheViableEdge)
104. salmanneedsajob (@salmanneedsajob)
105. Peter Assentorp (@assentorp)
106. Oscar (@oga_no_96)
107. Josh (@neversitdull)
108. Vikas Raj Yadav (@Vraj247)
109. Thiago Brezinski (@thiagobrez)
110. Tom Zarubin (@artmzrbn)
111. Small Eyez (@SmallEyez)
112. Henry Sowell (@realhenry)
113. Tim Gavin (@timgavn)
114. Nightshade (@Nightshadessx)
115. 𝑯𝒊𝒃𝒓𝒂 (@hibra_ai)
116. diligentium (@diligentium)
117. Steve McNiven-Scott (@stevemcniven) — 1ª respuesta
118. Mr Vibe (@mr_vibe_it)
119. Eric Leszkowicz (@ericleszkowicz)
120. ADAM BADΞR (@adambader)
121. Griffin Chase (@GChase)
122. Steve McNiven-Scott (@stevemcniven) — 2ª respuesta
123. Arjun Raj (@arjunrajlab)
124. EduardoCruz.com (@eduardocruz)
125. M (@alnz_k)
126. Christian Aguiar (@contracorrenteX)
127. Will (@will123195)
128. Nick Cantelmi (@NickCantelmi)
129. Mr. Huber (@Leerzeit)
130. Maya (@Maya_BsAs)
131. Luis Mejia (@l_mejiaC)
132. Elmer van der Woude (@Elmeromero88)
133. Peter Piekarczyk (@peterpme)
134. [usuario no identificado por handle en el fragmento capturado — mención de "purely native for the Mac" y login multi-cuenta]
135. Marco D'Alia (@madarco)
136. Max J (@maxj3i)
137. Marshall Haas (@marshal)
138. SGK (@captaink99)
139. Sergey Kaplich (@sergey_kaplich)
140. KillerChip (@Killerchip22)
141. Robin Ebers (@robinebers)
142. Ralph J. Smit (@ralphjsmit)
143. Ant Ekşiler (@anteksiler)
144. Wikman (@mattiaswikman)
145. Jose Moreno (@13doots)
146. Steve McNiven-Scott (@stevemcniven) — 3ª respuesta
147. Katie Stone (@KatieStonePoker)

**Nota sobre el ítem 134:** en el fragmento de texto recolectado aparece una respuesta parcialmente cortada que menciona el deseo de una app "purely native for the Mac" y la posibilidad de loguearse con múltiples cuentas de Claude o al menos cambiar entre ellas, pero el handle del autor no quedó capturado de forma legible en el extracto ("...tic asshole, I wish it was purely native for the Mac, and I wish I could login to multiple Claude accounts or at least switch."). Se deja registrado como evidencia aunque no se pudo atribuir con certeza.

---

## 7. Limitaciones explícitas de este documento

- La muestra cubre aproximadamente el 55% de las respuestas totales del hilo (154-160 de ~279-280), priorizadas por el algoritmo de relevancia de X, no es censo completo.
- Algunas citas quedaron truncadas en la fuente original porque el tweet superaba el largo visible y no todos los botones "Mostrar más" pudieron expanderse antes de la captura; se marcan con "[texto cortado]" donde corresponde.
- No se recolectaron las respuestas anidadas dentro de citas de tweets anteriores al 21 de septiembre (ej. Charbs citando un hilo del 9 de septiembre, o Jinani citando uno propio del 9 de septiembre) más allá del fragmento visible en el momento de la captura.
- No se verificó independientemente ninguna de las afirmaciones técnicas hechas por los usuarios (por ejemplo, la atribución de alto consumo de RAM a Electron es una opinión de un usuario, no un dato confirmado).
- Este documento no incluye capturas de pantalla ni imágenes adjuntas a los tweets (mencionadas donde correspondía, ej. Jon @j1cmd, Thiago Brezinski, Brooks Gray), solo el texto que las acompañaba.
