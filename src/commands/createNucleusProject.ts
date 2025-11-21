// src/commands/createNucleusProject.ts
// Command to create a new Nucleus organizational project

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { 
    createNucleusConfig, 
    saveNucleusConfig,
    NucleusConfig 
} from '../models/bloomConfig';

export async function createNucleusProject(uri?: vscode.Uri): Promise<void> {
    try {
        // Get target directory
        let targetDir: string;
        
        if (uri && uri.fsPath) {
            targetDir = uri.fsPath;
        } else if (vscode.workspace.workspaceFolders) {
            targetDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
        } else {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }
        
        // Prompt for organization name
        const orgName = await vscode.window.showInputBox({
            prompt: 'Enter organization name',
            placeHolder: 'e.g., JoseVigil',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Organization name is required';
                }
                return null;
            }
        });
        
        if (!orgName) {
            return;
        }
        
        // Prompt for organization URL
        const orgUrl = await vscode.window.showInputBox({
            prompt: 'Enter organization GitHub URL',
            placeHolder: 'e.g., https://github.com/JoseVigil',
            value: `https://github.com/${orgName}`,
            validateInput: (value) => {
                if (!value || !value.startsWith('http')) {
                    return 'Please enter a valid URL';
                }
                return null;
            }
        });
        
        if (!orgUrl) {
            return;
        }
        
        // Generate nucleus name
        const nucleusName = `nucleus-${orgName.toLowerCase().replace(/\s+/g, '-')}`;
        
        // Prompt for repository URL
        const repoUrl = await vscode.window.showInputBox({
            prompt: 'Enter nucleus repository URL',
            placeHolder: 'e.g., https://github.com/JoseVigil/nucleus-josevigil.git',
            value: `${orgUrl}/${nucleusName}.git`,
            validateInput: (value) => {
                if (!value || !value.startsWith('http')) {
                    return 'Please enter a valid repository URL';
                }
                return null;
            }
        });
        
        if (!repoUrl) {
            return;
        }
        
        // Create nucleus directory
        const nucleusPath = path.join(targetDir, nucleusName);
        
        if (fs.existsSync(nucleusPath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `Directory ${nucleusName} already exists. Overwrite?`,
                'Yes', 'No'
            );
            
            if (overwrite !== 'Yes') {
                return;
            }
        }
        
        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creating Nucleus project...',
            cancellable: false
        }, async (progress) => {
            
            progress.report({ message: 'Creating directory structure...' });
            
            // Create directory structure
            fs.mkdirSync(nucleusPath, { recursive: true });
            
            const bloomPath = path.join(nucleusPath, '.bloom');
            const corePath = path.join(bloomPath, 'core');
            const orgPath = path.join(bloomPath, 'organization');
            const projectsPath = path.join(bloomPath, 'projects');
            
            fs.mkdirSync(corePath, { recursive: true });
            fs.mkdirSync(orgPath, { recursive: true });
            fs.mkdirSync(projectsPath, { recursive: true });
            
            progress.report({ message: 'Generating configuration...' });
            
            // Create nucleus-config.json
            const config = createNucleusConfig(orgName, orgUrl, repoUrl);
            saveNucleusConfig(bloomPath, config);
            
            progress.report({ message: 'Generating core files...' });
            
            // Create .rules.bl
            fs.writeFileSync(
                path.join(corePath, '.rules.bl'),
                getNucleusRules(orgName),
                'utf-8'
            );
            
            // Create .prompt.bl
            fs.writeFileSync(
                path.join(corePath, '.prompt.bl'),
                getNucleusPrompt(),
                'utf-8'
            );
            
            progress.report({ message: 'Generating organization files...' });
            
            // Create organization files
            fs.writeFileSync(
                path.join(orgPath, '.organization.bl'),
                getOrganizationTemplate(config),
                'utf-8'
            );
            
            fs.writeFileSync(
                path.join(orgPath, 'about.bl'),
                getAboutTemplate(config),
                'utf-8'
            );
            
            fs.writeFileSync(
                path.join(orgPath, 'business-model.bl'),
                getBusinessModelTemplate(config),
                'utf-8'
            );
            
            fs.writeFileSync(
                path.join(orgPath, 'policies.bl'),
                getPoliciesTemplate(config),
                'utf-8'
            );
            
            fs.writeFileSync(
                path.join(orgPath, 'protocols.bl'),
                getProtocolsTemplate(config),
                'utf-8'
            );
            
            progress.report({ message: 'Generating projects index...' });
            
            // Create projects index
            fs.writeFileSync(
                path.join(projectsPath, '_index.bl'),
                getProjectsIndexTemplate(config),
                'utf-8'
            );
            
            // Create README.md
            fs.writeFileSync(
                path.join(nucleusPath, 'README.md'),
                getReadmeTemplate(config),
                'utf-8'
            );
            
            progress.report({ message: 'Done!' });
        });
        
        // Show success message and open folder
        const openAction = await vscode.window.showInformationMessage(
            `✅ Nucleus project "${nucleusName}" created successfully!`,
            'Open Folder',
            'Cancel'
        );
        
        if (openAction === 'Open Folder') {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(nucleusPath), true);
        }
        
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error creating Nucleus project: ${error.message}`);
        console.error('Create Nucleus error:', error);
    }
}

// Template functions

function getNucleusRules(orgName: string): string {
    return `# BLOOM NUCLEUS RULES

## META-INSTRUCCIONES
1. Lee TODOS los archivos .bl del nucleus antes de responder
2. Prioridad: organization/ > projects/ > intents/
3. Contexto: Documentación organizacional, NO código técnico

## PROPÓSITO DEL NUCLEUS
Este proyecto es el CENTRO DE CONOCIMIENTO de ${orgName}.
Contiene:
- Storytelling de cada proyecto
- Modelo de negocio
- Políticas y protocolos
- Índice de proyectos técnicos

## FORMATO DE RESPUESTA PARA ANÁLISIS

### 🎯 CONSULTA
[Reformula la pregunta del usuario]

### 📊 PROYECTOS INVOLUCRADOS
[Lista de proyectos relevantes para la consulta]

### 🔍 ANÁLISIS
[Análisis basado en la documentación del nucleus]

### 💡 RECOMENDACIONES
[Sugerencias basadas en políticas y protocolos]

### 🔗 REFERENCIAS
[Links a documentos específicos dentro del nucleus]

## PROHIBICIONES
❌ NO generes código técnico desde el nucleus
❌ NO modifiques archivos de proyectos hijo
❌ NO asumas información no documentada

✅ SÍ referencia documentos existentes
✅ SÍ sugiere consultar proyectos específicos para detalles técnicos
✅ SÍ mantén coherencia con políticas organizacionales

---
bloom/v1
nucleus_rules: true
`;
}

function getNucleusPrompt(): string {
    return `# BLOOM NUCLEUS PROMPT

## Orden de Lectura

### 1. Organization (.bloom/organization/)
Lee primero el contexto organizacional:
- .organization.bl - Visión general
- about.bl - Qué es la organización
- business-model.bl - Cómo genera valor
- policies.bl - Reglas de desarrollo
- protocols.bl - Procedimientos operativos

### 2. Projects Index (.bloom/projects/_index.bl)
Entiende el ecosistema de proyectos:
- Árbol completo de proyectos
- Relaciones entre proyectos
- Estado de cada uno

### 3. Project Overviews (.bloom/projects/{name}/overview.bl)
Para consultas específicas, lee el overview del proyecto relevante.

## Tipos de Consultas Soportadas

### Consulta de Contexto Global
"¿Qué proyectos tiene la organización?"
→ Lee _index.bl y responde con el árbol

### Consulta de Proyecto Específico
"¿Para qué sirve [proyecto-x]?"
→ Lee projects/[proyecto-x]/overview.bl

### Consulta de Políticas
"¿Cuál es el protocolo de deployment?"
→ Lee organization/protocols.bl

### Consulta Cross-Proyecto
"¿Cómo se relaciona [proyecto-a] con [proyecto-b]?"
→ Lee overviews de ambos proyectos y analiza

---
bloom/v1
prompt_type: "nucleus_reading"
version: "1.0"
`;
}

function getOrganizationTemplate(config: NucleusConfig): string {
    return `# ${config.organization.displayName} - Centro de Conocimiento

## 🎯 Visión

[Descripción de la visión de la organización en 2-3 párrafos.
¿Qué problema resuelve? ¿Para quién? ¿Cuál es el impacto esperado?]


## 🏢 Sobre Nosotros

**Nombre:** ${config.organization.name}
**Fundación:** [Fecha]
**Ubicación:** [Ciudad, País]
**Equipo:** [Tamaño del equipo]


## 🌳 Ecosistema de Proyectos

Este nucleus documenta y coordina los siguientes proyectos:

| Proyecto | Tipo | Estado | Descripción |
|----------|------|--------|-------------|
| [nombre] | [mobile/backend/web] | [active/development/archived] | [descripción corta] |


## 📖 Cómo Usar Este Nucleus

### Para Nuevos Miembros del Equipo
1. Lee \`organization/about.bl\` para entender la empresa
2. Revisa \`organization/policies.bl\` para conocer las reglas
3. Explora \`projects/_index.bl\` para ver el ecosistema
4. Consulta el overview del proyecto asignado

### Para AI/Modelos de Lenguaje
1. Procesa primero este archivo como contexto base
2. Usa \`projects/_index.bl\` para entender relaciones
3. Consulta overviews específicos según la consulta
4. Respeta las políticas en \`organization/policies.bl\`


## 🔗 Links Importantes

- **GitHub:** ${config.organization.url}
- **Documentación:** [URL si existe]
- **Contacto:** [Email/Slack]


---
bloom/v1
document_type: "organization_header"
version: "1.0"
generated_at: "${new Date().toISOString()}"
`;
}

function getAboutTemplate(config: NucleusConfig): string {
    return `# About ${config.organization.displayName}

## ¿Quiénes Somos?

[Descripción detallada de la organización. Historia, origen, motivación.]


## Misión

[Declaración de misión en 1-2 oraciones]


## Valores

- **[Valor 1]:** [Descripción]
- **[Valor 2]:** [Descripción]
- **[Valor 3]:** [Descripción]


## Equipo

### Roles Principales
- **[Rol]:** [Responsabilidades]


## Stack Tecnológico General

| Área | Tecnologías |
|------|-------------|
| Mobile | [Android/iOS/Flutter/etc] |
| Backend | [Node/Python/Go/etc] |
| Frontend | [React/Vue/Angular/etc] |
| Infraestructura | [AWS/GCP/Azure/etc] |


---
bloom/v1
document_type: "about"
`;
}

function getBusinessModelTemplate(config: NucleusConfig): string {
    return `# Modelo de Negocio - ${config.organization.displayName}

## Propuesta de Valor

[¿Qué valor único ofrece la organización?]


## Segmentos de Cliente

### Segmento 1: [Nombre]
- **Perfil:** [Descripción del cliente]
- **Necesidades:** [Qué buscan]
- **Cómo los servimos:** [Solución]


## Flujo de Valor

\`\`\`
[Usuario] → [Proyecto A] → [Proyecto B] → [Resultado]
\`\`\`


## Modelo de Ingresos

[Cómo genera dinero la organización]


## Métricas Clave

- **[Métrica 1]:** [Descripción y objetivo]
- **[Métrica 2]:** [Descripción y objetivo]


---
bloom/v1
document_type: "business_model"
`;
}

function getPoliciesTemplate(config: NucleusConfig): string {
    return `# Políticas de Desarrollo - ${config.organization.displayName}

## Política de Código

### Estándares Generales
- Todo código debe pasar linting antes de commit
- Coverage mínimo de tests: [X]%
- Documentación obligatoria para APIs públicas

### Convenciones de Naming
- **Variables:** camelCase
- **Clases:** PascalCase
- **Constantes:** UPPER_SNAKE_CASE
- **Archivos:** kebab-case

### Git Flow
- **main:** Producción estable
- **develop:** Integración continua
- **feature/xxx:** Nuevas funcionalidades
- **hotfix/xxx:** Correcciones urgentes


## Política de Seguridad

- No commitear secrets/API keys
- Usar variables de entorno
- Revisar dependencias vulnerables mensualmente


## Política de Documentación

- Todo proyecto debe tener README.md actualizado
- Cambios significativos requieren entrada en CHANGELOG
- APIs deben tener documentación OpenAPI/Swagger


---
bloom/v1
document_type: "policies"
`;
}

function getProtocolsTemplate(config: NucleusConfig): string {
    return `# Protocolos Operativos - ${config.organization.displayName}

## Protocolo de Deployment

### Pre-requisitos
1. [ ] Tests pasando en CI
2. [ ] Code review aprobado
3. [ ] Documentación actualizada

### Pasos
1. Merge a develop
2. QA en ambiente staging
3. Aprobación de QA
4. Merge a main
5. Deploy automático


## Protocolo de Incidentes

### Severidad Alta (P1)
- Tiempo de respuesta: < 15 minutos
- Notificar a: [Lista de contactos]
- Canal: [Slack/Discord/etc]

### Severidad Media (P2)
- Tiempo de respuesta: < 2 horas
- Notificar a: [Lista]


## Protocolo de Onboarding

### Día 1
1. Acceso a repositorios
2. Lectura de este nucleus
3. Setup de ambiente local

### Semana 1
1. Familiarización con proyecto asignado
2. Primera tarea pequeña
3. Code review de senior


---
bloom/v1
document_type: "protocols"
`;
}

function getProjectsIndexTemplate(config: NucleusConfig): string {
    return `# Índice de Proyectos - ${config.organization.displayName}

## Árbol de Proyectos

\`\`\`
${config.organization.name}/
├── 🏢 ${config.nucleus.name}           [Este proyecto - Centro de conocimiento]
│
├── 📱 MOBILE
│   └── [agregar proyectos]
│
├── ⚙️ BACKEND
│   └── [agregar proyectos]
│
├── 🌐 WEB
│   └── [agregar proyectos]
│
└── 🔧 TOOLS
    └── [agregar proyectos]
\`\`\`


## Proyectos Activos

| Proyecto | Estrategia | Estado | Última Actualización |
|----------|------------|--------|---------------------|
| [nombre] | [estrategia] | ✅ Active | [fecha] |


## Relaciones Entre Proyectos

\`\`\`
[proyecto-a] ──────► [proyecto-b] ──────► [proyecto-c]
   (captura)            (procesa)              (almacena)
\`\`\`


## Proyectos Planificados

- [ ] [proyecto futuro 1]
- [ ] [proyecto futuro 2]


---
bloom/v1
document_type: "projects_index"
auto_generated: true
`;
}

function getReadmeTemplate(config: NucleusConfig): string {
    return `# ${config.nucleus.name}

Centro de conocimiento organizacional para **${config.organization.displayName}**.

## 🎯 Propósito

Este repositorio es el **Nucleus** de ${config.organization.name} - un proyecto organizacional que documenta, indexa y vincula todos los proyectos técnicos de la organización.

## 📁 Estructura

\`\`\`
.bloom/
├── core/
│   ├── nucleus-config.json  🔑 (Identificador de Nucleus)
│   ├── .rules.bl
│   └── .prompt.bl
├── organization/
│   ├── .organization.bl
│   ├── about.bl
│   ├── business-model.bl
│   ├── policies.bl
│   └── protocols.bl
└── projects/
    ├── _index.bl
    └── {project-name}/
        └── overview.bl
\`\`\`

## 🚀 Proyectos Vinculados

Ver \`.bloom/projects/_index.bl\` para el árbol completo de proyectos.

## 📖 Documentación

- **Organización:** \`.bloom/organization/\`
- **Proyectos:** \`.bloom/projects/\`
- **Políticas:** \`.bloom/organization/policies.bl\`
- **Protocolos:** \`.bloom/organization/protocols.bl\`

## 🔗 Links

- **GitHub:** ${config.organization.url}
- **Repositorio:** ${config.nucleus.repoUrl}

---

Generado con Bloom BTIP Plugin
`;
}