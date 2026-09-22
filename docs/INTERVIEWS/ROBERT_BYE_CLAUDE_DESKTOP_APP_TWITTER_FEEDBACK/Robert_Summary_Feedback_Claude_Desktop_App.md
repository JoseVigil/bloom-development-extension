Se recopilaron ~154 respuestas relevantes del hilo (de un total de 279, tomando las de mayor visibilidad según el orden "Relevante" de X). Esto es lo que sale del análisis:

## 1. Problema concreto del desarrollador

El patrón dominante no es "falta una función", sino **fragmentación de producto**: los devs no saben en qué "modo" están (Chat / Cowork / Claude Code) ni dónde vive su trabajo. Ejemplos textuales: *"I need to remember whether something was a Cowork or Code or chat session to find it"* (Arjun Raj), *"these three things should be merged into one product/interface to simplify the use"* (tongtongtongtongtong), *"Claude Chat/Cowork are confusing for non-technical staff. Claude Code is great"* (threadkillerokc).

Sobre eso se apilan problemas operativos concretos: no se puede mover un chat entre proyectos, la búsqueda está rota o fue removida, la sesión se cuelga en Windows, el diff/git no funciona bien dentro del Code Desktop, y la app consume demasiada RAM/disco (posiblemente por Electron).

## 2. Qué lo provoca el modelo cloud actual

Varias quejas apuntan directamente a la arquitectura "remoto primero" que Anthropic está empujando:

- **Remote control / Dispatch inconsistente**: *"Remote control is a pain to activate. I have to keep the terminal open"* (Adam Badɛr); *"Dispatch is really bad... No remote control. Just link and have access to everything on the desktop"* (CyberCoug); *"the unreliability of the remote connection is sometimes very frustrating"* (Lucas).
- **Falta de cómputo dedicado/persistente**: *"Would love to have dedicated computers that can stay logged into sessions similar to grok bot... specific tasks require a computer rather than cloud based connectors"* (Dustyn Haug); *"better cloud agents support: setup wizard, envs transfer, screen sharing with vnc, external files copy into sandbox"* (Marco D'Alia).
- **Desincronización local↔cloud↔móvil**: *"Archive is not synched sometimes between desktop and iPhone"*, *"usage in sessions lagging behind the real usage"* (Ilia Lopata); *"can not start a desktop session from my iPhone"* (Ant Ekşiler, Ilia Lopata).
- **Worktree/creación de archivos fuera del entorno local**: el error que ilustra Jon (@j1cmd) — Claude crea archivos fuera del worktree y después no puede enlazarlos — es un síntoma directo de que el agente cloud no tiene visibilidad fiel del filesystem local.

En síntesis: el modelo híbrido (agente corriendo en la nube, pero necesitando tocar máquina/filesystem local) genera fricción constante de sincronización, permisos y visibilidad de sesión.

## 3. Qué costo genera

- **Tiempo**: buscar sesiones/chats viejos ("session history is a pain to find past work", "the search is not working, at all"), reactivar remote control manualmente en cada sesión, tener que abrir terminal antes de cada prompt nuevo (Jonas), re-loguearse constantemente (Artem Klen: *"I hate how often it makes me log in again"*).
- **Dinero/recursos**: consumo de RAM/disco alto obliga a algunos a volver al browser o al CLI (*"I stopped using because I felt it was too heavy... Claude Code feels way lighter"* — EduardoCruz); comparaciones directas de costo-beneficio contra otras herramientas (*"i hate that its slow and expensive compared to pi"* — Peter Piekarczyk); límites de uso de 5 horas percibidos como muy restrictivos (Anthony Flores).
- **Complejidad cognitiva**: la falta de jerarquía visual y la mezcla de paneles obliga a mantener un modelo mental de "dónde estoy" constantemente (*"There is no hierarchy, everything is the same level"* — edingme).
- **Lock-in / portabilidad**: varias quejas sobre no poder compartir conversaciones completas con otra persona/cuenta, no poder usar skills locales desde la app de escritorio sin reimportarlas (Miguel), y no poder controlar/instanciar sesiones de subagentes de forma independiente (EC).

## 4. Infraestructura vs. desarrollo de producto

**Infraestructura (backend/arquitectura, más caro y lento de arreglar):**
- Sincronización remoto↔local↔móvil (Dispatch, remote control, worktree)
- Rendimiento/consumo de recursos (RAM, disco, Electron)
- Confiabilidad de conexión remota
- Search roto (probablemente indexación/backend, no solo UI)
- Autenticación multi-cuenta y persistencia de sesión

**Producto/UX (más barato, iterable en el front):**
- Jerarquía visual, tamaños de fuente, densidad del sidebar
- Reorganización de proyectos (drag & drop, mover chats, nested folders)
- Indicadores de uso/límites visibles
- Unificación de Chat/Cowork/Code en una sola navegación coherente
- Pestañas, split view, anotaciones sobre el output

La queja más repetida — "cluttered / incoherente / sin jerarquía" — es en el fondo un síntoma de deuda de producto (features agregadas sin una arquitectura de información unificada), no un problema de infraestructura. Pero las quejas sobre remote control, sync y performance sí son de infraestructura.

## 5. Problemas repetidos (mencionados por múltiples personas, independientemente)

1. **UI cluttered / incoherente / sin jerarquía visual** — el más citado, incluso reconocido por el propio Robert Bye en el hilo ("Totally agree! Lots of work to do here").
2. **Confusión entre Chat / Cowork / Claude Code** como productos separados.
3. **Gestión de proyectos y sesiones**: no se puede mover chats entre proyectos, sidebar ilegible con muchos proyectos, falta de carpetas anidadas.
4. **Búsqueda rota o eliminada**.
5. **Remote control / Dispatch poco confiable**, mala paridad con el móvil.
6. **Comparaciones desfavorables con Codex/ChatGPT**: drag-and-drop de chats, voice mode, auto-compactación, "el harness simplemente funciona mejor".
7. **Navegador integrado deficiente** (no importa logins de Chrome, no retiene sesión, zoom no configurable).
8. **Consumo de recursos** (RAM/disco/Electron) empuja a usuarios de vuelta al browser o al CLI.
9. **Re-login frecuente / falta de multi-cuenta fluida**.
10. **Manejo de archivos/artefactos**: rutas de archivo poco fiables, no se puede copiar texto de previews, adjuntar imágenes es incómodo.

## 6. Oportunidades de producto

- **Unificación de navegación** (Chat/Cowork/Code en una sola jerarquía coherente) — la oportunidad más grande, validada por el propio PM de Anthropic en el hilo.
- **Vista tipo Kanban** de chats/tareas/sesiones de Claude Code (pedida explícitamente por dos personas distintas, Steven Webster y Nuno Barreto) — encaja con el patrón "no sé en qué estado está cada tarea".
- **Multi-cuenta y multi-usuario real** dentro de una misma conversación (tongtongtongtongtong pide algo tipo "Claude Tag pero dentro de la app").
- **Buscador confiable con filtros** (por proyecto, fecha, texto exacto) — hay demanda clara y repetida.
- **Gestor de uso/límites visible** (barra de uso diario/semanal, por sub-agente) — pedido por al menos 4 personas distintas, con alto ROI percibido ("high ROI and easy UI" — Jedson Pinto).
- **Cómputo remoto/dedicado persistente** tipo "siempre logueado" para tareas que no pueden vivir solo en conectores cloud — nicho pero con demanda técnica fuerte.
- **Modo anotación/voz** para dar feedback visual sobre el output (pedido por varios, comparándolo con Codex).
- **Sincronización real entre desktop, browser extension y móvil** (sesiones, archivo, logins) — resolvería una cantidad grande de quejas de una sola vez.

---

# Texto del tweet y las respuestas recopiladas

**Tweet original — Robert Bye (@RobertJBye), PM en Anthropic, 21 sept. 2026, 13:47:**
"What are your thoughts on the Claude desktop app? What do you love/hate? What features should be added? What are some of your biggest frustrations with it?" (33,9 mil visualizaciones, 280 respuestas, 165 me gusta)

**Respuestas (autor: texto, orden aproximado por relevancia en X):**

- Revanth Krishna (@Revanthkrishna_): "Lacks UI coherence and the UI feels cluttered. Drawers are a mess, buttons/controls are all of different sizes, etc."
- Robert Bye (respuesta propia): "Totally agree! Lots of work to do here"
- Siddhant Mehta (@metasidd): "It's so busy. It comes across as an incoherent product with random feature placements and navigation patterns. Y'all need an IA refresh."
- Zyeine (@Zyeine_Art): "For the love of everything, please let us move chats between projects. Drag and drop and a 'move to' with existing groups listed."
- Ryan Brown (@Mrryanjbrown): "I'll open by saying it was pretty awesome a few months ago... feels a little bit incoherent sometimes and a little cluttered. I love ChatGPT's ability to drag and drop chats. I wish the browser was a little bit more like a pure browser so I could just work in Claude the whole time. I'd also like to see the voice mode pop up on the desktop."
- Steven Webster (@stevenjwebster): "I wonder whether the mental model should be a kanban board per project, with goals decomposed into issues and tasks, that can be assigned to different models, parallelized, and where issues move back and forth the kanban board with a sense of order, structure and progress."
- Michael Ryerse (@MichaelRyerse): "Cannot easily collaborate with others. Doesn't integrate well with Claude code in a folder. Would be nice to bounce between the apps in a common workspace/folder."
- Gibster Fairway (@BriefEpisode): "I love the Claude desktop app. Would love for some of the UI of CoWork to be available in Claude Code, and for the ease of permissioning in Claude Code to be available in CoWork (skills, etc.)."
- ohara (@fohara24): "The new Projects feature should only be limited to Claude Code. The new project model does not work for non-coding tasks. Threads lack so many features regular chats have."
- mrkoopie (@mrkoopie): "Would be great if browser support improved. Eg open in new tabs, loading indicators when clicking a link in chat."
- tongtongtongtongtong (@tongtongtongttt): "The feature that should be added is multi-user chat. I want to invite my colleague or friend to join the same Claude conversation. A bit like Claude Tag but within the app."
- Automa Dynamics (@automadynamics): "/Low-Priority is a great feature but only works 50% of the time. The /clear going into a loop on the remote iOS app is a pain too."
- joseamijares: "I really like the upgrade to have an interface from Claude code instead of only... add integrations autonomous from chrome open app to the GitHub app."
- Dustyn Haug (@dustynhaug): "Would love dedicated computers that stay logged into sessions similar to grok bot. Specific tasks require a computer rather than cloud based connectors."
- Sanzhar Alibekov (@AlibekovSanzhar): "It would be cool to render thumbnails for your projects. If there's a big list of projects and dialogues, it's hard to quickly jump between them."
- kefallrain (@kefallrain): "It would be better to enable turning off 'ready for review' without deactivating it, since sometimes I just want to see usage on the homepage instead of long-lasting PRs."
- Enaayet Khan (@EnaayetKhan): "Chats don't load completely. If you scroll down they just stop, on Windows. Also it's really hard to find a chat from a week ago. I don't want memory feature, just a good search feature."
- André Battagello: "Would be great to kickoff new sessions without the notification chip... would be great if Claude Code could introspect and setup itself for creating routines."
- Tim Akhimov (@tmr31337): "The bloated nature vs cli is the most concerning. There should be a switch to disable unused plugins/skills."
- Jon (@j1cmd): "#1 gripe: locally, when using the worktree option, you get an error when Claude creates things outside the worktree and links them in chat. Claude does this a lot on its own."
- tongtongtongtongtong: "I love the intelligence of Claude models. I hate the difference among Claude chat, cowork and Claude Code. These three should be merged into one product."
- JAKO (@Jskddysah): "We need tabs. Like google/mozilla/etc tabs, so it's easier to work on different things at the same time."
- Janis Vegis (@jvegis): "Just let me point at things on the screen with my mouse and yap about what I want changed. At least give me a decent annotation mode. Even voice mode would do."
- Caleb Hill (@thisiscalebhill): "Much too cluttered and the sidebar is much too compact. Needs breathing room."
- Numa (@numaausaumon): "The sidebar is hard to read if you have lots of projects. Copy the codex one with custom sections, icons, colors."
- Vlad (@invladwetrust): "In Claude Code: side chat is not very useful. Allow multiple 'replies' like Codex allows multiple annotations. Codex manages branches better. Compress more frequently."
- Kyle Sexton (@melodicsoftware): "A lot of features are Mac first — would be nice to have feature parity, gaps closed quicker. Particularly computer use."
- Matti (@thalrion1337): "Project organisation is a mess. Can't start a chat within a section. In ChatGPT I just start a chat from a Project."
- Cesar Chapa: "Time stamps for /remote-control."
- Dayton Davis: "Would be nice to see updates faster — you announced last week no more cowork and Chat just all in one, but I still don't have it."
- Anne Zoutsos (@annezoutsos): "I had to stop using it and go back to the website. It was flagging innocuous conversations and saying the chat was full."
- Alex (@AlexZadd): "It's a small thing but you removed the ability to view conversations by age — I found that really useful."
- Pawel Bielecki (@BieleckiPawel): "On Windows it sends notifications on turn end and when clicked the app freezes. Sometimes it pins itself to the top — only killing the app helps."
- remx (@softmaxing): "It feels bad to use compared to codex."
- Revo Laition: "Sort by projects by what needs my attention now."
- 窥基 (@wingedwork): [chino] queja sobre pérdida de tipografía serif para usuarios CJK tras un rediseño.
- edingme: "Needs a lot of UI/UX work. There is no hierarchy... Mixed with OPUS never ending slop answers. I love the branding and basic DS of Claude, but some color would be nice."
- doubledimple: [chino] "solo uso CLI, mi compu ya no puede instalar la app de escritorio porque es muy vieja."
- Charbs (@charbs_io): cita un feedback extenso anterior a @bcherny @amorriscode sobre uso intensivo de Claude Code desktop.
- agotpier: "It really needs a facelift, it's looked the same forever. The CLI would be amazing if it looked as slick as Opencode's."
- Artem Klen (@ArtemkaKlen): "I hate how often it makes me log in again — seriously so annoying."
- Eric (@ericthevil): "I have a bunch of stranded threads over time. Wish it could auto sort into new or existing projects."
- Godwin (@Godwin_UX): "Would love to leave contextually relevant annotated comments on Claude output & created assets/code."
- Raghav Sharma: "It doesn't have a voice mode comparable to codex."
- Shawn (@WaldoDev13): "Needs to be usable for builds front to back."
- brugt: "Remote control needs to catch up to Codex level asap."
- Columbia City: "Biggest pet peeve with Claude Code Desktop is session history. Tucking everything into groups makes it a pain to find past work. Want an optional flat list with newest at top, dates, project names, quick search."
- Leonard Briones (@SpaceAgeLender): "Would be great if the Claude chrome extension chats showed up when logging into Claude directly, and to start browser chats in any project. Like Comet browser does from Perplexity."
- yupp (@jamesndls): "I'd love a PDF review mode like Claude Docs: open the PDF, highlight, annotate, leave comments. Claude Docs should be more like a full word processor like Microsoft Word."
- Alphin Tom: "1. File preview broken at times. 2. In-app browsing experience is pathetic. 3. Browser/computer use basically non-existent. 4. Can't attach files/images easily except images and never know when that clogs context."
- Jedson Pinto: "Pin down usage for people to see. High ROI, easy UI. Enterprise UI still bad."
- 是小玉呀: "I was able to see my cc sessions from desktop app but seems not able anymore. Even resume can only see past sessions."
- EC (@ege02): "I would like agents to start their own stand-alone sessions. Right now they can only list sessions and read transcripts. Need a launch-session CCD skill."
- Eduardo Vidal: "Multi account login (openAI just added). Clearly show usage. Dispatch still there (anyone using it?). How do I use the new projects?"
- Diego Brmdz: "Ability to set zoom in/out in the in-app browser. Custom labels/tags for chats. Nested folders."
- Daniel Morgan: "Would be cool to have a highlighted artefact so you can see something relevant, like your daily agenda, without manually clicking."
- Matt (@consistentmedia): "The 'changes' tabs for diff never works when using Claude Code. I really like the improvements via desktop. The /btw opens a small window that could be improved."
- 0xinha: "Like most game apps, add a 'Notifications' button/category. Show update version with detailed patch notes."
- David Jayatillake: "Would be nice to have cmux style tile arrangement and splitting power. Looking forward to Projects being enabled on local."
- Kez: "I love it, use it every day, coach small businesses. 1500+ people attended our live sessions. Biggest gripes: speed — feels slow vs terminal."
- irvin: "Add cloud browser takeover like ChatGPT does."
- Charles Nischal: "It slows down my computer a lot, so I prefer using Claude in the browser (Mac Pro M1)."
- Bruce Barnett: "In the enterprise desktop app, the previous context windows randomly relocate in the list. Keeping the order would be great."
- Jonas (@panicunwrap): "No way to open a terminal before sending the first prompt in a new chat. No easy way to make the desktop experience match my CLI config."
- Jacob Miller: "Something that's been bugging me across all agents is computer use. This banner is a perpetual fixture — I don't know which agent is using it, given how many I'm running."
- CyberCoug: "Dispatch is really bad. Wish the mobile solution let me control the whole experience like Codex. No remote control, just link and access everything on desktop."
- MidMarketInfo: "Would love to be able to email Claude things."
- Andrew: "I never look at artifacts. Not sure if it's just me."
- Miguel: "I want my local skills useable via desktop. I can only use them with the Claude Code version and have to import them into the chat side."
- Lucas: "1. The unreliability of the remote connection is sometimes very frustrating. 2. The 'bible' that Claude writes before getting to the answer is insane — repeats itself like a draft."
- Dayton Davis: "Very clunky cowork tasks would be nicer included in an automations tab instead of being in cowork."
- threadkillerokc: "Claude Code is great. Claude Chat/Cowork are confusing for non-technical staff."
- Jinani: cita feedback extenso previo sobre usuaria no-dev y funciones no descubiertas.
- Chris Moore: "Too much fragmentation in siloed 'areas' (chat/cowork/code) and things crammed in the side panel (Code, new Project view)."
- Luke Curley: "Would love a way to create sessions on a remote host so my desktop can do the compiling."
- Fivefootfive: "Allow projects to update their own artifacts/project files."
- Michael Hedgpeth: "The app feels like 50 different side projects vibe coded together — needs something to pull it all together and enforce quality. Lots of paper cuts, not fun vs ChatGPT/Codex."
- Ilia Lopata: "1) Can't start a desktop session from iPhone. 2) Archive not synced between desktop/iPhone. 3) Usage lagging behind real usage. 4) Desktop Design and Code sessions should be more integrated."
- B (@McCrackTastic): "UI feels cluttered, can never find what you need quickly unless it's something you use daily. Not a development tool."
- Anthony Flores: "Just copy Codex. Better auto-compaction for master threads. I hit the 5-hr limit on every account, every session now after usage rollback."
- Thomas Walker: "Projects within projects. I have a larger project then sub-projects with niche context."
- Anton: "The search is not working. At all. Looking for a PR number like '456' results in wrong threads or nothing found."
- Harlley Oliveira: "Diff doesn't work right. I need to see my changes in @git_fork."
- DriftGauge: "Need a usage meter on main vs sifting through settings."
- James Lawley: "So many thoughts on the admin management aspects of the desktop app."
- Birgines: "More dynamic sidebar, tabs — I have multiple conversations going and would love different tabs instead of flicking through the sidebar."
- Nuno Barreto: "I'd like a Kanban view of all chats, tasks, and Claude Code sessions — running, waiting on input, waiting on review, archived."
- Dominic Meagher: "It's hard to find the project or chat I'm looking for."
- Stu Jordan: "When you click a file it made (.md), it opens a preview but you can't copy the text to paste it. Have to open it in default app, but now that option is gone too."
- Tony Severine: "Would love to move a chat from chat/Cowork to Claude Code."
- Andrew Luo: "Would be nice if you could open terminal in the new chat view."
- Neil Acquatella: "I really like it, 97% Cowork Projects, 3% Code. Would love the project's chat history sidebar better organized."
- Todd Fraser: "Pick one font size for everything and let us adjust it globally."
- Robinson Crusoe: "Doesn't add much from the web version. Expect more of an IDE experience. Search in chats is broken badly. Want regex search like VS Code."
- Pierre Dev3o: "Need to make it easier for non-developers to manage Git branches — they always ask me for help."
- Releve: "Love mostly everything, HATE all of the folder mounting issues."
- MoMo: "Having 2 separate environments to code in a project (Code and cowork)."
- deckl: "Switch between accounts, work/personal."
- Alex Brazh: "'Usage' keyboard shortcut."
- Marcin Dyguda: "Reorganizing the left sidebar in Claude Code desktop app... I can't easily remove the projects."
- Businessing with Pat Miller: "I'd love a Claude window open for each chat so I can more easily monitor multiple tasks at once."
- Adam Sandler: "I would like to pop out Cowork chats like I can with Claude Code."
- salmanneedsajob: "Terrible at organizing projects. Hard to find and return to sessions. Copy the folder view of Codex. Cloud sessions should steer a local session when there's a dependency."
- Peter Assentorp: "I really like the app! Hate: can't see which repo/project a session belongs to without clicking. GitHub status unreliable. Show usage on hover not click. Plugins fail (Linear works in terminal, not desktop). Features: better annotation support, add viewport size to browser."
- Oscar: "chat/code menu is annoying when working in both, would love separate windows without using cli."
- Josh: "I'd love login unified between Mac desktop and iOS. Login with Apple on iOS isn't an option on desktop."
- Vikas Raj Yadav: "Icons for selecting iOS/iPad simulator, separating iPhones and iPads."
- Thiago Brezinski: cita queja previa sobre automations que crean 'runs' en vez de threads como Codex, difícil de seguir.
- Tom Zarubin: "Shitty small fonts. Shitty 'side chat' via /btw. Remove the folders/projects from the left bar."
- Small Eyez: "Bring back document outputs in incognito mode. Insane step back for people who don't want sensitive info stored long term."
- Henry Sowell: "I would use cowork a lot but it can't grep across chat sessions. Makes me manually rebuild context already across sessions."
- Tim Gavin: "Claude Code transcript text is too small even at largest setting. Too hard to read, so I stick with terminal."
- Nightshade: "Multiple Claude accounts log in and easy switching between them, option to add multiple accounts on same MCP."
- Hibra: "Too much RAM use. Probably cause electron."
- diligentium: "I'd like the option... not a fan of projects, want to hide this category."
- Steve McNiven-Scott: "Very hard to keep track of work across multiple simultaneous projects with simultaneous threads."
- Mr Vibe: "It talks way too much and does way too little."
- Eric Leszkowicz: "Outputs and speed are difficult. Number one issue pushing me to other AI is very little TEAM in the teams plan."
- Adam Badɛr: "Remote control is a pain to activate — have to keep terminal open. Search icon hidden/hard to find. Browser doesn't import logins/sessions from Chrome or retain signed-in sessions."
- Griffin Chase: "Would love multi window similar to how I use CC in terminal vs the tab setup."
- Steve McNiven-Scott: "Slash commands like /mcp do different things on CLI vs desktop, very frustrating."
- Arjun Raj: "UI is quite nice overall, but a lot of confusion about what 'mode' I'm in. I need to remember whether something was a Cowork or Code or chat session to find it."
- EduardoCruz.com: "I stopped using it — too heavy, uses a lot of disk space. Claude Code feels way lighter."
- M: "Browser can't do passkey. Can't click a link that automatically opens a new tab."
- Christian Aguiar: "I would like the internal browser to have full functionality."
- Will: "I want it to honor AGENTS.md."
- Mr. Huber: "Biggest frustration: Claude Code on Desktop cannot reliably display the file path for output files."
- Maya: "I would like remote control for items being done on the local computer — can't open those conversations on the cellphone."
- Luis Mejia: "Improve computer use + the internal browser."
- Elmer van der Woude: "Switched from browser to app but not so sure — I think the browser was more stable."
- Peter Piekarczyk: "I hate that it's slow and expensive compared to Pi. The harness just does better, idk what it is."
- Marco D'Alia: "Better cloud agents support: setup wizard, envs transfer, screen sharing with VNC, external files copy into sandbox — like agentbox but integrated into Claude desktop."
- Max J: "Tabs, please. Split view. Panes. Whatever to switch quickly between sessions."
- Marshall Haas: "Search was removed. I needed that."
- SGK: "UI left panel is confusing."
- Sergey Kaplich: "It's fine, but I barely use it."
- KillerChip: "Would love a usage bar that gives you your limits for the day/week. Make it optional."
- Robin Ebers: "It has come a very long way... honestly right now, not many issues at all. Biggest improvements: split screens, full browser support, live artifacts connecting to MCPs, computer use. What's not going well: the cloud transition — there isn't a good way to mix local and cloud, feels like you're forcing them."
- Ralph J. Smit: "Love it! Only feature I need back: ability to toggle which projects show in the sidebar."
- Ant Ekşiler: "I hate that most tasks/projects are not available to pick up on mobile."
- Wikman: "The UI, design and structure. Fix that and you have a winner."
- Jose Moreno: "Pinned chat and create new for a group."
- Steve McNiven-Scott: "I shouldn't need to keep doing 'rc'. If the app is loaded on my PC I should be able to issue any chat to any folder."
- Katie Stone: "We need pop out tables like design has for chats/projects (like online poker tables)."

---

Este análisis está basado en una muestra amplia (~55% de las respuestas totales, priorizadas por relevancia/engagement en X), no en el hilo completo de 279 respuestas.