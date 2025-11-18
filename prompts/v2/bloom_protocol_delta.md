# Protocolo de Modificación Delta - Bloom BTIP Snapshot

## Versión: 1.0

---

## OBJETIVO

Definir un formato estructurado para que Claude genere SOLO modificaciones incrementales (deltas) en lugar de archivos completos, permitiendo que scripts Python apliquen cambios quirúrgicos.

---

## FORMATO DELTA PARA SNAPSHOTS

### Estructura General del Snapshot

    # Bloom Snapshot - Implementación Delta
    
    **Versión del Protocolo:** 1.0
    **Fecha:** 2024-01-15T10:30:00Z
    **Intent:** fix-login-bug
    **Tipo de Cambios:** [CREAR_NUEVOS | MODIFICAR_EXISTENTES | MIXTO]
    
    ---
    
    ## OPERACIONES DE MODIFICACIÓN
    
    ### Archivo 1: src/core/intentSession.ts
    
    **Tipo:** MODIFICAR
    **Operaciones:** 3
    
    #### Operación 1.1: INSERT_AFTER
    
    **Anchor:**
    
        import { Logger } from '../utils/logger';
    
    **Contenido a Insertar:**
    
        import { ClaudeApiClient } from './claudeApiClient';
        import { PythonScriptRunner } from './pythonScriptRunner';
    
    #### Operación 1.2: INSERT_INSIDE_METHOD
    
    **Anchor:**
    
        async generateIntent(formData: IntentFormData): Promise<void> {
    
    **Posición:** INICIO_METODO
    
    **Contenido a Insertar:**
    
        this.logger.info('Generating intent with workflow support');
        
        if (!formData.name || formData.name.length < 3) {
          throw new Error('Invalid intent name');
        }
    
    #### Operación 1.3: REPLACE_METHOD
    
    **Anchor:**
    
        async updateWorkflow(updates: Partial<IntentWorkflow>): Promise<void> {
    
    **Contenido Completo del Método:**
    
        async updateWorkflow(updates: Partial<IntentWorkflow>): Promise<void> {
          this.state.workflow = {
            ...this.state.workflow,
            ...updates
          };
    
          await this.metadataManager.update(this.intentFolder, {
            workflow: this.state.workflow
          });
    
          this.emit('workflowChanged', this.state.workflow);
          this.logger.info(`Workflow updated to stage: ${updates.stage}`);
        }
    
    ---
    
    ### Archivo 2: src/models/intent.ts
    
    **Tipo:** MODIFICAR
    **Operaciones:** 2
    
    #### Operación 2.1: INSERT_BEFORE
    
    **Anchor:**
    
        export interface IntentMetadata {
    
    **Contenido a Insertar:**
    
        export type IntentWorkflowStage = 
          | 'draft'
          | 'intent-generated'
          | 'questions-ready'
          | 'answers-submitted'
          | 'snapshot-downloaded'
          | 'integrated'
          | 'archived';
        
        export interface Question {
          id: string;
          category: 'architecture' | 'design' | 'implementation' | 'testing' | 'security';
          priority: 'high' | 'medium' | 'low';
          text: string;
          answerType: 'multiple-choice' | 'free-text' | 'boolean' | 'code-snippet';
          options?: string[];
          userAnswer?: string;
        }
        
        export interface IntentWorkflow {
          stage: IntentWorkflowStage;
          questions?: Question[];
          questionsArtifactUrl?: string;
          snapshotPath?: string;
          integrationStatus?: 'pending' | 'success' | 'partial' | 'failed';
        }
    
    #### Operación 2.2: INSERT_INSIDE_INTERFACE
    
    **Anchor:**
    
        export interface IntentMetadata {
    
    **Campo a Agregar:**
    
        workflow: IntentWorkflow;
    
    **Posición:** ANTES_DE_CAMPO
    
    **Campo de Referencia:**
    
        stats: {
    
    ---
    
    ### Archivo 3: src/commands/generateQuestions.ts
    
    **Tipo:** CREAR_NUEVO
    
    **Contenido Completo:**
    
        import * as vscode from 'vscode';
        import { Logger } from '../utils/logger';
        import { IntentSession } from '../core/intentSession';
        import { ClaudeApiClient } from '../core/claudeApiClient';
        
        export function registerGenerateQuestions(
          context: vscode.ExtensionContext,
          logger: Logger
        ): void {
          const disposable = vscode.commands.registerCommand(
            'bloom.generateQuestions',
            async (session: IntentSession) => {
              logger.info('Generating questions with Claude');
        
              const state = session.getState();
              
              if (state.workflow?.stage !== 'intent-generated') {
                vscode.window.showErrorMessage(
                  'Debes generar el intent primero'
                );
                return;
              }
        
              await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generando preguntas con Claude...',
                cancellable: false
              }, async (progress) => {
                progress.report({ increment: 0 });
        
                const intentContent = await session.readIntentFile();
                const codebaseContent = await session.readCodebaseFile();
        
                progress.report({ increment: 30 });
        
                const claudeClient = new ClaudeApiClient(logger);
                const response = await claudeClient.requestQuestions({
                  intentContent,
                  codebaseContent,
                  projectType: state.metadata.projectType
                });
        
                progress.report({ increment: 60 });
        
                const questions = await claudeClient.parseQuestionsArtifact(
                  response.artifactUrl
                );
        
                progress.report({ increment: 90 });
        
                await session.updateWorkflow({
                  stage: 'questions-ready',
                  questions,
                  questionsArtifactUrl: response.artifactUrl
                });
        
                progress.report({ increment: 100 });
              });
        
              vscode.window.showInformationMessage(
                `Preguntas generadas: ${state.workflow.questions?.length || 0}`
              );
        
              vscode.commands.executeCommand('bloom.reloadIntentForm', session);
            }
          );
        
          context.subscriptions.push(disposable);
        }
    
    ---
    
    ## RESUMEN DE CAMBIOS
    
    **Archivos Modificados:** 2
    - src/core/intentSession.ts (3 operaciones)
    - src/models/intent.ts (2 operaciones)
    
    **Archivos Nuevos:** 1
    - src/commands/generateQuestions.ts
    
    **Total de Operaciones Delta:** 5

---

## TIPOS DE OPERACIONES SOPORTADAS

### 1. INSERT_AFTER

Inserta contenido inmediatamente después de un anchor único.

    #### Operación X.Y: INSERT_AFTER
    
    **Anchor:**
    
        [línea o bloque de código único que existe en el archivo]
    
    **Contenido a Insertar:**
    
        [nuevo código a insertar]

### 2. INSERT_BEFORE

Inserta contenido inmediatamente antes de un anchor.

    #### Operación X.Y: INSERT_BEFORE
    
    **Anchor:**
    
        [línea o bloque único]
    
    **Contenido a Insertar:**
    
        [nuevo código]

### 3. INSERT_INSIDE_METHOD

Inserta contenido dentro de un método existente.

    #### Operación X.Y: INSERT_INSIDE_METHOD
    
    **Anchor:**
    
        [firma completa del método]
    
    **Posición:** [INICIO_METODO | FIN_METODO]
    
    **Contenido a Insertar:**
    
        [código a insertar]

### 4. INSERT_INSIDE_INTERFACE

Agrega campos dentro de una interface/type existente.

    #### Operación X.Y: INSERT_INSIDE_INTERFACE
    
    **Anchor:**
    
        [nombre de la interface]
    
    **Campo a Agregar:**
    
        [nuevo campo con tipo]
    
    **Posición:** [INICIO | FIN | ANTES_DE_CAMPO]
    
    **Campo de Referencia:**
    
        [campo existente como referencia]

### 5. REPLACE_METHOD

Reemplaza un método completo.

    #### Operación X.Y: REPLACE_METHOD
    
    **Anchor:**
    
        [firma del método a reemplazar]
    
    **Contenido Completo del Método:**
    
        [nueva implementación completa]

### 6. REPLACE_BLOCK

Reemplaza un bloque de código específico.

    #### Operación X.Y: REPLACE_BLOCK
    
    **Anchor Inicio:**
    
        [primera línea del bloque]
    
    **Anchor Fin:**
    
        [última línea del bloque]
    
    **Nuevo Contenido:**
    
        [código de reemplazo]

### 7. DELETE_BLOCK

Elimina un bloque de código.

    #### Operación X.Y: DELETE_BLOCK
    
    **Anchor Inicio:**
    
        [primera línea]
    
    **Anchor Fin:**
    
        [última línea]

### 8. APPEND_TO_FILE

Agrega contenido al final del archivo.

    #### Operación X.Y: APPEND_TO_FILE
    
    **Contenido a Agregar:**
    
        [código al final del archivo]

---

## REGLAS DE ANCHORS

### Características de un Anchor Válido

1. **Único en el archivo**
   - Debe aparecer exactamente UNA vez
   - No debe ser código genérico

2. **Estable**
   - Preferir firmas de funciones
   - Imports específicos
   - Comentarios únicos
   - Nombres de clases/interfaces

3. **Completo**
   - Incluir toda la línea o bloque
   - Con espaciado exacto
   - Sin truncar

### Anchors Buenos

    // ✅ BUENO: Firma de función única
    async generateIntent(formData: IntentFormData): Promise<void> {
    
    // ✅ BUENO: Import específico
    import { Logger } from '../utils/logger';
    
    // ✅ BUENO: Interface única
    export interface IntentMetadata {
    
    // ✅ BUENO: Comentario único
    // ===== MANEJO DE PREGUNTAS =====

### Anchors Malos

    // ❌ MALO: Genérico
    }
    
    // ❌ MALO: Ambiguo
    const data = 
    
    // ❌ MALO: Truncado
    async update...

---

## INTEGRACIÓN CON SCRIPT PYTHON

### Actualización de codebase_snapshot_integration.py

El script debe parsear el formato delta:

    def parse_delta_snapshot(snapshot_content: str) -> List[DeltaOperation]:
        operations = []
        
        # Parsear cada operación
        file_blocks = re.split(r'### Archivo \d+:', snapshot_content)
        
        for block in file_blocks:
            file_path = extract_file_path(block)
            file_type = extract_type(block)  # MODIFICAR | CREAR_NUEVO
            
            if file_type == 'CREAR_NUEVO':
                # Extraer contenido completo
                content = extract_full_content(block)
                operations.append(CreateFileOp(file_path, content))
            
            elif file_type == 'MODIFICAR':
                # Extraer operaciones individuales
                ops = parse_operations(block)
                for op in ops:
                    operations.append(op)
        
        return operations
    
    def apply_insert_after(file_path: str, anchor: str, content: str):
        with open(file_path, 'r') as f:
            lines = f.readlines()
        
        # Buscar anchor
        anchor_index = find_unique_anchor(lines, anchor)
        
        if anchor_index == -1:
            raise ValueError(f"Anchor not found: {anchor}")
        
        # Insertar después
        lines.insert(anchor_index + 1, content + '\n')
        
        # Escribir archivo
        with open(file_path, 'w') as f:
            f.writelines(lines)
    
    def find_unique_anchor(lines: List[str], anchor: str) -> int:
        matches = []
        anchor_clean = anchor.strip()
        
        for i, line in enumerate(lines):
            if anchor_clean in line.strip():
                matches.append(i)
        
        if len(matches) == 0:
            return -1
        elif len(matches) > 1:
            raise ValueError(f"Anchor is not unique: found {len(matches)} matches")
        
        return matches[0]

---

## PLANTILLA PARA SOLICITAR SNAPSHOT DELTA A CLAUDE

### Template de Prompt

    Implementa {TAREA} según los documentos adjuntos.
    
    FORMATO DELTA OBLIGATORIO:
    
    1. DEVUÉLVEME UN ÚNICO ARCHIVO MARKDOWN EN ARTIFACT
    2. SIN TRIPLE BACKTICKS
    3. TODO CON INDENTACIÓN DE 4 ESPACIOS
    4. Usar PROTOCOLO DELTA versión 1.0
    
    ESTRUCTURA DELTA:
    
    Para archivos NUEVOS:
    - Marcar como "CREAR_NUEVO"
    - Incluir contenido completo
    
    Para archivos EXISTENTES:
    - Marcar como "MODIFICAR"
    - Listar operaciones delta:
      * INSERT_AFTER: con anchor único
      * INSERT_BEFORE: con anchor único
      * REPLACE_METHOD: con firma del método
      * INSERT_INSIDE_METHOD: con posición
      * etc.
    
    REGLAS DE ANCHORS:
    - Debe ser ÚNICO en el archivo
    - Incluir línea completa
    - Usar firmas de funciones o imports
    - NO usar código genérico
    
    EJEMPLO DE OPERACIÓN:
    
        ### Archivo 1: src/core/app.ts
        
        **Tipo:** MODIFICAR
        **Operaciones:** 2
        
        #### Operación 1.1: INSERT_AFTER
        
        **Anchor:**
        
            import { Logger } from './logger';
        
        **Contenido a Insertar:**
        
            import { Config } from './config';
        
        #### Operación 1.2: INSERT_INSIDE_METHOD
        
        **Anchor:**
        
            async initialize(): Promise<void> {
        
        **Posición:** INICIO_METODO
        
        **Contenido a Insertar:**
        
            this.logger.info('Initializing application');
    
    Al final incluir:
    
        ## RESUMEN DE CAMBIOS
        
        **Archivos Modificados:** X
        **Archivos Nuevos:** Y
        **Total de Operaciones:** Z

---

## PLANTILLA PARA SOLICITAR PREGUNTAS A CLAUDE

### Template de Prompt para Primera Iteración

    Analiza el siguiente intent de desarrollo y genera preguntas críticas para mejorar la implementación.
    
    CONTEXTO DEL INTENT:
    
    **Nombre:** {intent_name}
    **Problema:** {problem_description}
    **Output Esperado:** {expected_output}
    **Archivos Relevantes:** {files_list}
    **Tipo de Proyecto:** {project_type}
    
    CODEBASE ACTUAL:
    
    {codebase_content}
    
    FORMATO DE RESPUESTA OBLIGATORIO:
    
    Genera un artifact en Markdown con este formato EXACTO:
    
        <!-- BLOOM_QUESTIONS_V1 -->
        # Preguntas Críticas de Implementación
        
        **Intent:** {intent_name}
        **Fecha:** {timestamp}
        **Total Preguntas:** {count}
        
        ---
        
        ## Question 1: [Título descriptivo]
        
        **ID:** q1
        **Category:** [architecture | design | implementation | testing | security]
        **Priority:** [high | medium | low]
        **Question:** [Texto de la pregunta en detalle]
        **Answer_Type:** [multiple-choice | free-text | boolean | code-snippet]
        **Options:** [opt1, opt2, opt3]
        **Context:** [Archivos o componentes relacionados]
        
        ---
        
        ## Question 2: [Título]
        
        **ID:** q2
        ...
        
        ---
        
        (Continuar con 5-10 preguntas)
    
    CATEGORÍAS REQUERIDAS:
    - Al menos 1 pregunta de architecture
    - Al menos 2 preguntas de implementation
    - Al menos 1 pregunta de testing
    
    PRIORIDADES:
    - 30% high priority
    - 50% medium priority
    - 20% low priority
    
    Las preguntas deben:
    - Ser específicas al contexto del codebase
    - Referenciar archivos/componentes concretos
    - Ayudar a tomar decisiones de diseño
    - Considerar casos edge y errores
    - Abordar aspectos de mantenibilidad

---

## MODIFICACIONES AL SNAPSHOT ACTUAL

### Cambios Necesarios en el Prompt Original

    ANTES (Formato Completo):
    
        ## Archivo N: ruta/del/archivo.ext (CREAR NUEVO | MODIFICAR)
        
            [código completo indentado con 4 espacios]
    
    DESPUÉS (Formato Delta):
    
        ### Archivo N: ruta/del/archivo.ext
        
        **Tipo:** MODIFICAR
        **Operaciones:** X
        
        #### Operación N.1: INSERT_AFTER
        
        **Anchor:**
        
            [anchor único]
        
        **Contenido a Insertar:**
        
            [solo el código nuevo]

### Sección a Agregar en el Prompt

    PROTOCOLO DELTA:
    
    Para archivos EXISTENTES, NO envíes el contenido completo.
    Usa operaciones delta:
    
    - INSERT_AFTER: Insertar después de anchor
    - INSERT_BEFORE: Insertar antes de anchor
    - REPLACE_METHOD: Reemplazar método completo
    - INSERT_INSIDE_METHOD: Insertar dentro de método
    - INSERT_INSIDE_INTERFACE: Agregar campo a interface
    - DELETE_BLOCK: Eliminar bloque
    
    Cada operación debe incluir:
    1. Anchor único (línea o bloque existente)
    2. Contenido a insertar/reemplazar
    3. Posición si es necesario
    
    REGLA CRÍTICA: El anchor debe aparecer EXACTAMENTE UNA VEZ en el archivo objetivo.

### Actualización del FORMATO DE ENTREGA

    FORMATO DE ENTREGA OBLIGATORIO:
    
    1. UN ÚNICO ARCHIVO MARKDOWN EN ARTIFACT
    2. SIN TRIPLE BACKTICKS
    3. TODO CON INDENTACIÓN DE 4 ESPACIOS
    4. USAR PROTOCOLO DELTA versión 1.0
    5. Para archivos nuevos: contenido completo
    6. Para archivos existentes: operaciones delta
    7. Anchors deben ser únicos y completos
    8. Sección final: RESUMEN DE CAMBIOS con conteo de operaciones

---

## VALIDACIÓN DEL PROTOCOLO

### Checklist de Validación

Script Python debe verificar:

    def validate_delta_snapshot(snapshot: str) -> ValidationResult:
        errors = []
        warnings = []
        
        # 1. Verificar formato general
        if not snapshot.startswith('# Bloom Snapshot'):
            errors.append('Missing header')
        
        # 2. Verificar versión del protocolo
        if 'Versión del Protocolo: 1.0' not in snapshot:
            errors.append('Missing protocol version')
        
        # 3. Validar cada operación
        operations = parse_operations(snapshot)
        
        for op in operations:
            # Verificar anchor único
            if op.type in ['INSERT_AFTER', 'INSERT_BEFORE']:
                anchor_count = count_anchor_occurrences(
                    op.file_path, 
                    op.anchor
                )
                
                if anchor_count == 0:
                    errors.append(f"Anchor not found: {op.anchor}")
                elif anchor_count > 1:
                    errors.append(f"Anchor not unique: {op.anchor}")
            
            # Verificar contenido
            if not op.content or op.content.strip() == '':
                warnings.append(f"Empty content in operation {op.id}")
        
        return ValidationResult(errors, warnings)

---

## RESUMEN DE CAMBIOS AL PROMPT ORIGINAL

**Agregar Secciones:**

1. Definición del Protocolo Delta
2. Tipos de operaciones soportadas
3. Reglas de anchors
4. Template para preguntas
5. Validaciones requeridas

**Modificar Secciones:**

1. FORMATO DE ENTREGA → incluir protocolo delta
2. ESTRUCTURA DEL ARTIFACT → formato por operaciones
3. Ejemplos → mostrar deltas en lugar de archivos completos

**Eliminar:**

1. Instrucción de enviar archivos completos para modificaciones

**Total de Cambios:** 3 secciones nuevas, 3 secciones modificadas, 1 sección eliminada