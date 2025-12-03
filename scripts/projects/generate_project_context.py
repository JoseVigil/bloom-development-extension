#!/usr/bin/env python3
"""
Bloom Context Generator
Genera la carpeta .bloom completa para diferentes estrategias de proyecto.
Uso: python generate_project_context.py --strategy=android [--root=.] [--output=.bloom]
"""

import argparse
import json
import re
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
from abc import ABC, abstractmethod
import xml.etree.ElementTree as ET


# =============================================================================
# TEMPLATES HARDCODED
# =============================================================================

def get_core_rules_bl(strategy: str) -> str:
    """Retorna el contenido de .rules.bl adaptado a la estrategia."""
    
    lifecycle_specs = {
        'android': """## ESPECIFICACIONES ANDROID
- Siempre considera el ciclo de vida de Activity/Fragment
- Manejo de configuración changes (rotación)
- Memory leaks (Context references)
- Background vs UI thread
- Permisos necesarios""",
        'ios': """## ESPECIFICACIONES iOS
- Siempre considera el ciclo de vida de UIViewController
- Manejo de App lifecycle (background/foreground)
- Memory management con ARC
- Main queue vs background queues
- Permisos necesarios en Info.plist""",
        'react-web': """## ESPECIFICACIONES REACT WEB
- Siempre considera el ciclo de vida de componentes (mount/unmount)
- Manejo de estado con hooks
- Performance optimization (memoization)
- Event listeners cleanup
- Responsive design considerations""",
        'node': """## ESPECIFICACIONES NODE
- Siempre considera async/await patterns
- Error handling con try/catch
- Manejo de streams y buffers
- Process management
- Environment variables""",
        'python-flask': """## ESPECIFICACIONES PYTHON FLASK
- Siempre considera el contexto de request/response
- Manejo de errores con decoradores
- Database session management
- Blueprint organization
- Environment configuration""",
        'php-laravel': """## ESPECIFICACIONES PHP LARAVEL
- Siempre considera el ciclo de request lifecycle
- Manejo de Eloquent ORM
- Middleware y validaciones
- Service providers
- Configuration y .env""",
        'generic': """## ESPECIFICACIONES GENERALES
- Siempre considera el ciclo de vida específico del framework
- Manejo de recursos y cleanup
- Error handling robusto
- Separación de concerns
- Configuración por ambiente"""
    }
    
    context_line = {
        'android': '3. Contexto: Proyecto Android en Java/Kotlin',
        'ios': '3. Contexto: Proyecto iOS en Swift/Objective-C',
        'react-web': '3. Contexto: Proyecto React Web',
        'node': '3. Contexto: Proyecto Node.js',
        'python-flask': '3. Contexto: Proyecto Python Flask',
        'php-laravel': '3. Contexto: Proyecto PHP Laravel',
        'generic': '3. Contexto: Proyecto de desarrollo de software'
    }
    
    return f"""# BLOOM CORE RULES

## META-INSTRUCCIONES
1. Lee TODOS los archivos .bl antes de responder
2. Si hay contradicción: core/ > project/ > intents/
{context_line.get(strategy, context_line['generic'])}

## PROHIBICIONES ABSOLUTAS
❌ NUNCA uses placeholders: "// Tu código aquí", "// Resto del código"
❌ NUNCA omitas imports, métodos lifecycle o bloques
❌ NUNCA digas "mantén el código existente"
❌ NUNCA omitas métodos críticos del framework

✅ SIEMPRE muestra archivos COMPLETOS desde package/import hasta el final
✅ SIEMPRE incluye TODOS los imports necesarios
✅ SIEMPRE marca cambios: // BLOOM_CHANGE: descripción
✅ SIEMPRE incluye TODOS los métodos del ciclo de vida

## FORMATO DE RESPUESTA

### 🎯 PROBLEMA
[Reformula en 1-2 líneas]

### 🔍 ANÁLISIS
[Qué archivos revisaste, qué detectaste]

### 💡 SOLUCIÓN
[Tu approach específico]

### 📝 CÓDIGO
[Archivos COMPLETOS, no fragmentos]
Estructura por archivo:

    // Archivo: ruta/completa/NombreArchivo.ext
    [imports/requires necesarios]
    
    [Implementación COMPLETA]

### ⚠️ CONSIDERACIONES
- Tests necesarios
- Cambios en configuración si aplica
- Dependencias nuevas si hace falta
- Side effects en otros módulos

## ANTE FALTA DE CONTEXTO
Si faltan archivos críticos:

"⚠️ CONTEXTO INSUFICIENTE
Necesito ver:
- [Archivo1] - Para entender [aspecto]
- [Archivo2] - Para ver [información]
- [Archivo3] - Para verificar [dependencia]

Puedo dar una solución parcial pero no será óptima."

{lifecycle_specs.get(strategy, lifecycle_specs['generic'])}
"""


def get_core_standards_bl(strategy: str) -> str:
    """Retorna el contenido de .standards.bl adaptado a la estrategia."""
    
    if strategy == 'android':
        return """# BLOOM STANDARDS - ANDROID

## JAVA ANDROID

### Estructura de Activity COMPLETA

    package com.example.miapp;
    
    import android.os.Bundle;
    import android.view.View;
    import android.widget.Button;
    import android.widget.TextView;
    import android.widget.Toast;
    import androidx.appcompat.app.AppCompatActivity;
    
    public class MainActivity extends AppCompatActivity {
        
        private Button btnAction;
        private TextView tvResult;
        
        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            setContentView(R.layout.activity_main);
            
            initViews();
            setupListeners();
        }
        
        private void initViews() {
            btnAction = findViewById(R.id.btn_action);
            tvResult = findViewById(R.id.tv_result);
        }
        
        private void setupListeners() {
            btnAction.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    handleAction();
                }
            });
        }
        
        private void handleAction() {
            // Lógica COMPLETA
        }
        
        @Override
        protected void onResume() {
            super.onResume();
        }
        
        @Override
        protected void onPause() {
            super.onPause();
        }
        
        @Override
        protected void onDestroy() {
            super.onDestroy();
        }
    }

### Estructura de Fragment COMPLETA

    package com.example.miapp.fragments;
    
    import android.os.Bundle;
    import android.view.LayoutInflater;
    import android.view.View;
    import android.view.ViewGroup;
    import androidx.annotation.NonNull;
    import androidx.annotation.Nullable;
    import androidx.fragment.app.Fragment;
    
    public class MiFragment extends Fragment {
        
        @Nullable
        @Override
        public View onCreateView(@NonNull LayoutInflater inflater,
                                 @Nullable ViewGroup container,
                                 @Nullable Bundle savedInstanceState) {
            return inflater.inflate(R.layout.fragment_mi, container, false);
        }
        
        @Override
        public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
            super.onViewCreated(view, savedInstanceState);
        }
        
        @Override
        public void onDestroyView() {
            super.onDestroyView();
        }
    }

## REGLA CRÍTICA
TODO archivo debe ser copy-paste ready.
Compilar sin errores.
Sin placeholders.
"""
    
    elif strategy == 'ios':
        return """# BLOOM STANDARDS - iOS

## SWIFT iOS

### Estructura de UIViewController COMPLETA

    import UIKit
    
    class MainViewController: UIViewController {
        
        // MARK: - Properties
        private let actionButton: UIButton = {
            let button = UIButton(type: .system)
            button.translatesAutoresizingMaskIntoConstraints = false
            return button
        }()
        
        private let resultLabel: UILabel = {
            let label = UILabel()
            label.translatesAutoresizingMaskIntoConstraints = false
            return label
        }()
        
        // MARK: - Lifecycle
        override func viewDidLoad() {
            super.viewDidLoad()
            setupUI()
            setupConstraints()
        }
        
        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
        }
        
        override func viewDidDisappear(_ animated: Bool) {
            super.viewDidDisappear(animated)
        }
        
        // MARK: - Setup
        private func setupUI() {
            view.addSubview(actionButton)
            view.addSubview(resultLabel)
            actionButton.addTarget(self, action: #selector(handleAction), for: .touchUpInside)
        }
        
        private func setupConstraints() {
            // Constraints COMPLETAS
        }
        
        // MARK: - Actions
        @objc private func handleAction() {
            // Lógica COMPLETA
        }
    }

## REGLA CRÍTICA
TODO archivo debe ser copy-paste ready.
Compilar sin errores.
Sin placeholders.
"""
    
    elif strategy == 'react-web':
        return """# BLOOM STANDARDS - REACT WEB

## REACT COMPONENT

### Estructura de Componente Funcional COMPLETA

    import React, { useState, useEffect } from 'react';
    import './MainComponent.css';
    
    const MainComponent = () => {
        const [data, setData] = useState(null);
        const [loading, setLoading] = useState(false);
        
        useEffect(() => {
            // Setup
            fetchData();
            
            // Cleanup
            return () => {
                // Cleanup logic
            };
        }, []);
        
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch logic COMPLETA
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        
        const handleAction = () => {
            // Handler logic COMPLETA
        };
        
        if (loading) return <div>Loading...</div>;
        
        return (
            <div className="main-component">
                {/* JSX COMPLETO */}
            </div>
        );
    };
    
    export default MainComponent;

## REGLA CRÍTICA
TODO componente debe ser copy-paste ready.
Ejecutar sin errores.
Sin placeholders.
"""
    
    else:
        return f"""# BLOOM STANDARDS - {strategy.upper()}

## ESTRUCTURA GENERAL

### Archivo Completo de Ejemplo

    [Estructura de ejemplo completa para {strategy}]
    
    // TODO: Implementar ejemplos específicos para {strategy}

## REGLA CRÍTICA
TODO archivo debe ser copy-paste ready.
Ejecutar sin errores.
Sin placeholders.
"""


def get_intent_template() -> str:
    """Retorna el template genérico de intent.bl"""
    return """# INTENT - [Nombre descriptivo del intent]

## Problema
[Descripción clara y concisa del problema que se quiere resolver.
¿Qué no funciona? ¿Qué comportamiento inesperado ocurre?]


## Contexto
[¿Por qué existe este problema? ¿Qué lo causó? ¿Desde cuándo ocurre?
Información relevante del proyecto o historial que ayude a entender el problema.]


## Comportamiento Actual
[Describe paso a paso qué sucede ahora. Usa una lista numerada:]
1. 
2. 
3. 
4. 


## Comportamiento Deseado
[Describe paso a paso qué debería suceder. Usa una lista numerada:]
1. 
2. 
3. 
4. 


## Objetivo
[¿Qué resultado específico buscamos? ¿Qué debe producir el modelo de IA?
Ejemplos: "diagnosticar y corregir", "implementar nueva funcionalidad", 
"optimizar rendimiento", "refactorizar código"]


## Archivos incluidos en codebase.tar.gz
[Lista de archivos relevantes que están en el archivo comprimido:]
- 
- 
- 
- 


## Alcance y Restricciones
[¿Qué NO debe modificarse? ¿Qué limitaciones técnicas existen?]
- 
- 
- 


## Hipótesis / Consideraciones
[¿Qué crees que puede estar causando el problema? ¿Qué supones?
Esta sección es opcional pero útil para orientar el diagnóstico.]


## Tests / Validación Necesaria
[¿Cómo verificamos que la solución funciona? Lista de criterios de éxito:]
- [ ] 
- [ ] 
- [ ] 


## Salida Esperada del Modelo
[¿Qué debe generar la IA? Ejemplos: plan.bl con diagnóstico detallado,
report.bl con código corregido, análisis de arquitectura, etc.]


---
bloom/v1
includes_archive: "codebase.tar.gz"
"""


def get_app_context_template(strategy: str, project_data: Dict[str, Any]) -> str:
    """Retorna el template de .app-context.bl con datos básicos inferidos."""
    
    app_name = project_data.get('name', '[Nombre de la Aplicación]')
    version = project_data.get('version', '[X.X.X]')
    
    return f"""# APP CONTEXT - {app_name}

## Información General
**Nombre:** {app_name}
**Propósito:** [Descripción en 1-2 líneas de qué problema resuelve]
**Target:** [Tipo de usuario: emprendedores, estudiantes, público general, etc.]
**Versión:** {version}
**Estado:** [Beta / Producción / En desarrollo]


---

## 🎯 ¿Qué hace esta aplicación?

[Descripción detallada del propósito principal de la app.
Completar manualmente con el propósito del proyecto]


---

## 📄 Flujo Principal del Usuario

### Paso 1: [Nombre del paso]
[Descripción de qué hace el usuario y qué sucede en la app]

### Paso 2: [Nombre del paso]
[Descripción de qué hace el usuario y qué sucede en la app]

### Paso 3: [Nombre del paso]
[Descripción de qué hace el usuario y qué sucede en la app]


---

## 📱 Módulos / Features Principales

### 1. [Nombre del Módulo]
**Descripción:** [Qué hace este módulo]

**Funcionalidades clave:**
- [Funcionalidad 1]
- [Funcionalidad 2]

**Archivos involucrados:**
- [Archivo principal]


---

## 🗂️ Estructura de Datos Principal

### [Entidad Principal 1]
**Descripción:** [Qué representa en el negocio]

**Campos clave:**
- [campo1] - [Descripción]


---

## 🔗 Integraciones Externas

[Completar con servicios externos detectados o agregar manualmente]


---

## 🎨 Filosofía / Principios del Producto

[Describe los principios de diseño o filosofía detrás de la app]

**Valores clave:**
- [Valor 1]
- [Valor 2]


---

## 📚 Glosario de Términos

[Define términos específicos del dominio]

- **[Término 1]:** [Definición]


---

bloom/v1
context_type: "application"
version: "1.0"
"""


def get_prompt_bl() -> str:
    """Retorna el contenido del archivo .prompt.bl con preguntas exploratorias integradas."""
    return """# BLOOM PROMPT - Instrucciones de Lectura Secuencial

## Orden de Lectura de Archivos .bl

Para responder correctamente a cualquier consulta en el contexto de Bloom, debes seguir este orden de lectura secuencial:

### 1. Core Rules (.bloom/core/.rules.bl)
Lee primero las reglas fundamentales de Bloom. Estas establecen:
- Meta-instrucciones generales
- Prohibiciones absolutas
- Formato de respuesta esperado
- Especificaciones técnicas del stack

### 2. Standards (.bloom/core/.standards.bl)
Luego revisa los estándares de código. Contienen:
- Estructuras completas de archivos
- Ejemplos copy-paste ready
- Convenciones de nombrado
- Patrones recomendados

### 3. Project Context (.bloom/project/.context.bl)
A continuación analiza el contexto técnico del proyecto:
- Stack tecnológico
- Arquitectura implementada
- Estructura de carpetas
- Dependencias y configuración

### 4. App Context (.bloom/project/.app-context.bl)
Entiende el contexto de negocio:
- Propósito de la aplicación
- Flujo de usuario
- Módulos principales
- Entidades de datos

### 5. Intent Actual (.bloom/intents/intent.bl)
Finalmente lee el intent específico que debes resolver:
- Problema planteado
- Contexto del issue
- Comportamiento esperado
- Archivos involucrados

## Reglas de Prioridad

En caso de contradicción entre archivos:
1. **core/.rules.bl** tiene máxima prioridad
2. **project/.context.bl** tiene segunda prioridad
3. **intents/intent.bl** tiene menor prioridad

## Recuerda

**Archivos COMPLETOS:** Nunca uses placeholders ni omitas secciones.
**Marca cambios:** Usa // BLOOM_CHANGE: [descripción] en código modificado.
**Imports completos:** Incluye todos los imports necesarios.
**Lifecycle completo:** Incluye todos los métodos del ciclo de vida.

---

## 🔍 Proceso de Preguntas Exploratorias

**Antes de generar cualquier solución**, debes alcanzar un nivel de certeza ≥99% sobre qué implementar. Para ello:

### Paso 1: Analizar la Solicitud Críticamente

- **Replantea el problema** desde la perspectiva de un experto del 0.1% superior en el campo
- **Identifica supuestos implícitos** en la solicitud del usuario
- **Detecta ambigüedades** que podrían llevar a múltiples interpretaciones
- **Cuestiona restricciones** que pueden ser flexibles

### Paso 2: Generar Preguntas Aclaratorias (Máx. 5)

Usa el siguiente template para estructurar tus preguntas:

#### Template de Pregunta

**Pregunta [N]: [Categoría: Arquitectura/Alcance/Integración/Estado/Comportamiento/etc.]**

Pregunta principal:
[Enunciado claro y directo]

Sub-preguntas:
- [N.1] [Sub-pregunta específica relacionada]
- [N.2] [Sub-pregunta que explora casos extremos o alternativas]
- [N.3] [Sub-pregunta sobre prioridades o trade-offs]

**Impacto si no se aclara:**
[Consecuencias de proceder sin esta información]

---

### Categorías Comunes de Preguntas

1. **Arquitectura/Diseño:** Patrones, módulos, separación de concerns
2. **Alcance/Límites:** Qué incluir/excluir, fases de implementación
3. **Integración/Dependencias:** Interacción con otros componentes/servicios
4. **Estado/Persistencia:** Dónde y cómo almacenar datos
5. **Comportamiento/UX:** Flujos de usuario, casos extremos, feedback
6. **Restricciones/Performance:** Límites técnicos, escalabilidad, compatibilidad
7. **Entregables/Testing:** Criterios de aceptación, pruebas necesarias
8. **Mantenibilidad:** Documentación, extensibilidad futura

### Paso 3: Evaluar Nivel de Certeza

Después de formular preguntas, indica:

**Certeza estimada actual:** [XX]%

**Áreas con mayor incertidumbre:**
- [Área 1 que requiere aclaración urgente]
- [Área 2 con múltiples interpretaciones posibles]
- [Área 3 con dependencias críticas no especificadas]

### Paso 4: Formato de Respuesta Esperado

Para facilitar el procesamiento, pide al usuario que responda en este formato:

```
P1: [Respuesta a pregunta 1]
P1.1: [Respuesta a sub-pregunta 1.1]
P1.2: [Respuesta a sub-pregunta 1.2]
P1.3: [Respuesta a sub-pregunta 1.3]

P2: [Respuesta a pregunta 2]
...
```

### Paso 5: Solo Después de ≥99% Certeza

Una vez tengas las respuestas necesarias:

1. **Valida coherencia** entre respuestas
2. **Identifica dependencias** cruzadas
3. **Genera el artifact** según PLANTILLA ESTANDARIZADA de Bloom
4. **Aplica mejores prácticas** del 0.1% superior del campo
5. **Marca cambios** con // BLOOM_CHANGE
6. **Incluye archivos COMPLETOS** sin placeholders

---

## Ejemplo de Aplicación

**Usuario solicita:** "Agrega un botón para exportar datos a CSV"

**Tu respuesta debe ser:**

### Contexto Analizado

#### Problema Replanteado
El usuario solicita funcionalidad de exportación, pero no especifica:
- Fuente de datos a exportar
- Formato exacto del CSV (delimitadores, encoding)
- Ubicación del botón en la UI
- Manejo de grandes volúmenes de datos

#### Supuestos Identificados
1. Los datos ya están disponibles en memoria
2. El CSV será pequeño (< 1MB)
3. La exportación es síncrona
4. Se usa el formato CSV estándar (UTF-8, comas)

---

### Preguntas Aclaratorias

**Pregunta 1: [Alcance de Datos]**

Pregunta principal:
¿Qué datos exactamente deben incluirse en el CSV exportado?

1.1. ¿Se exporta toda la tabla visible o solo filas seleccionadas?
1.2. ¿Se incluyen columnas ocultas o calculadas?
1.3. ¿Hay filtros activos que deban respetarse?

Impacto si no se aclara:
Podría exportarse información incorrecta o incompleta, generando confusión en usuarios.

**Pregunta 2: [Comportamiento/UX]**

Pregunta principal:
¿Dónde debe ubicarse el botón y cómo debe comportarse?

2.1. ¿Toolbar superior, menú contextual, o acción flotante?
2.2. ¿Debe haber confirmación antes de exportar?
2.3. ¿Qué feedback debe ver el usuario durante la exportación?

Impacto si no se aclara:
Puede resultar en una UX inconsistente con el resto de la app.

[... continuar con 3-5 preguntas máximo]

---

### Nivel de Certeza Actual

Certeza estimada: 40%

Áreas con mayor incertidumbre:
- Fuente y estructura exacta de los datos
- Ubicación y estilo del botón (Material Design, custom, etc.)
- Manejo de errores y casos extremos (sin datos, sin permisos)

---

**Nota:** Solo después de recibir tus respuestas procederé a generar el código COMPLETO siguiendo los estándares de Bloom.

---

bloom/v1
prompt_type: "sequential_reading"
version: "2.0"
includes_exploratory_questions: true
"""


# =============================================================================
# BASE ANALYZER
# =============================================================================

class BaseAnalyzer(ABC):
    """Clase base para analizar proyectos de diferentes estrategias."""
    
    def __init__(self, project_root: Path):
        self.project_root = project_root
        
    @abstractmethod
    def analyze(self) -> Dict[str, Any]:
        """Analiza el proyecto y retorna datos estructurados."""
        pass
    
    def _count_files_by_extension(self, extensions: List[str]) -> Dict[str, int]:
        """Cuenta archivos por extensión."""
        counts = {}
        for ext in extensions:
            pattern = f"**/*{ext}"
            counts[ext] = len(list(self.project_root.glob(pattern)))
        return counts
    
    def _get_directory_tree(self, max_depth: int = 3) -> str:
        """Genera un árbol de directorios."""
        lines = []
        
        def walk_tree(path: Path, prefix: str = "", depth: int = 0):
            if depth > max_depth:
                return
            
            try:
                entries = sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name))
                for i, entry in enumerate(entries):
                    is_last = i == len(entries) - 1
                    current_prefix = "└── " if is_last else "├── "
                    lines.append(f"{prefix}{current_prefix}{entry.name}")
                    
                    if entry.is_dir() and not entry.name.startswith('.'):
                        extension = "    " if is_last else "│   "
                        walk_tree(entry, prefix + extension, depth + 1)
            except PermissionError:
                pass
        
        walk_tree(self.project_root)
        return "\n".join(lines)


# =============================================================================
# STRATEGY ANALYZERS
# =============================================================================

class AndroidAnalyzer(BaseAnalyzer):
    """Analizador para proyectos Android."""
    
    def analyze(self) -> Dict[str, Any]:
        print("🔍 Analizando proyecto Android...")
        
        data = {
            'name': '[Nombre del Proyecto Android]',
            'version': '[X.X.X]',
            'type': 'Mobile App',
            'platform': 'Android',
            'package': '[com.ejemplo.app]',
            'description': 'Aplicación Android',
            'language': 'Java/Kotlin',
            'sdk_info': {},
            'dependencies': [],
            'structure': '',
            'file_counts': {}
        }
        
        # Analizar build.gradle
        build_gradle = self.project_root / 'app' / 'build.gradle'
        if build_gradle.exists():
            data.update(self._parse_build_gradle(build_gradle))
        
        # Analizar AndroidManifest.xml
        manifest = self.project_root / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
        if manifest.exists():
            data.update(self._parse_manifest(manifest))
        
        # Estructura de directorios
        data['structure'] = self._get_directory_tree(max_depth=4)
        
        # Contar archivos
        data['file_counts'] = self._count_files_by_extension(['.java', '.kt', '.xml'])
        
        return data
    
    def _parse_build_gradle(self, path: Path) -> Dict[str, Any]:
        """Parsea build.gradle para extraer información."""
        result = {}
        
        try:
            content = path.read_text(encoding='utf-8')
            
            # SDK versions
            min_sdk = re.search(r'minSdkVersion\s+(\d+)', content)
            target_sdk = re.search(r'targetSdkVersion\s+(\d+)', content)
            compile_sdk = re.search(r'compileSdkVersion\s+(\d+)', content)
            
            result['sdk_info'] = {
                'min': min_sdk.group(1) if min_sdk else '[XX]',
                'target': target_sdk.group(1) if target_sdk else '[XX]',
                'compile': compile_sdk.group(1) if compile_sdk else '[XX]'
            }
            
            # Version
            version_name = re.search(r'versionName\s+"([^"]+)"', content)
            if version_name:
                result['version'] = version_name.group(1)
            
            # Dependencies
            deps = re.findall(r'implementation\s+["\']([^"\']+)["\']', content)
            result['dependencies'] = deps[:10]  # Primeras 10
            
        except Exception as e:
            print(f"⚠️  Error parseando build.gradle: {e}")
        
        return result
    
    def _parse_manifest(self, path: Path) -> Dict[str, Any]:
        """Parsea AndroidManifest.xml."""
        result = {}
        
        try:
            tree = ET.parse(path)
            root = tree.getroot()
            
            # Package name
            package = root.attrib.get('package', '[com.ejemplo.app]')
            result['package'] = package
            
            # App name de label
            app_elem = root.find('./application')
            if app_elem is not None:
                label = app_elem.attrib.get('{http://schemas.android.com/apk/res/android}label', '')
                if label.startswith('@string/'):
                    result['name'] = '[Nombre del Proyecto]'
                else:
                    result['name'] = label or '[Nombre del Proyecto]'
            
        except Exception as e:
            print(f"⚠️  Error parseando AndroidManifest.xml: {e}")
        
        return result


class iOSAnalyzer(BaseAnalyzer):
    """Analizador para proyectos iOS."""
    
    def analyze(self) -> Dict[str, Any]:
        print("🔍 Analizando proyecto iOS...")
        
        data = {
            'name': '[Nombre del Proyecto iOS]',
            'version': '[X.X.X]',
            'type': 'Mobile App',
            'platform': 'iOS',
            'bundle_id': '[com.ejemplo.app]',
            'description': 'Aplicación iOS',
            'language': 'Swift/Objective-C',
            'dependencies': [],
            'structure': '',
            'file_counts': {}
        }
        
        # Buscar Info.plist
        info_plist_paths = list(self.project_root.glob('**/Info.plist'))
        if info_plist_paths:
            data.update(self._parse_info_plist(info_plist_paths[0]))
        
        # Buscar Podfile
        podfile = self.project_root / 'Podfile'
        if podfile.exists():
            data['dependencies'] = self._parse_podfile(podfile)
        
        # Estructura
        data['structure'] = self._get_directory_tree(max_depth=4)
        data['file_counts'] = self._count_files_by_extension(['.swift', '.m', '.h'])
        
        return data
    
    def _parse_info_plist(self, path: Path) -> Dict[str, Any]:
        """Parsea Info.plist."""
        result = {}
        try:
            tree = ET.parse(path)
            root = tree.getroot()
            
            # Buscar CFBundleVersion y CFBundleIdentifier
            plist_dict = root.find('dict')
            if plist_dict is not None:
                keys = plist_dict.findall('key')
                for i, key in enumerate(keys):
                    if key.text == 'CFBundleShortVersionString':
                        version_elem = plist_dict[i + 1]
                        result['version'] = version_elem.text or '[X.X.X]'
                    elif key.text == 'CFBundleIdentifier':
                        bundle_elem = plist_dict[i + 1]
                        result['bundle_id'] = bundle_elem.text or '[com.ejemplo.app]'
                    elif key.text == 'CFBundleName':
                        name_elem = plist_dict[i + 1]
                        result['name'] = name_elem.text or '[Nombre del Proyecto iOS]'
        except Exception as e:
            print(f"⚠️  Error parseando Info.plist: {e}")
        
        return result
    
    def _parse_podfile(self, path: Path) -> List[str]:
        """Parsea Podfile para obtener dependencias."""
        deps = []
        try:
            content = path.read_text(encoding='utf-8')
            pods = re.findall(r"pod\s+['\"]([^'\"]+)['\"]", content)
            deps = pods[:10]
        except Exception as e:
            print(f"⚠️  Error parseando Podfile: {e}")
        
        return deps


class ReactWebAnalyzer(BaseAnalyzer):
    """Analizador para proyectos React Web."""
    
    def analyze(self) -> Dict[str, Any]:
        print("🔍 Analizando proyecto React Web...")
        
        data = {
            'name': '[Nombre del Proyecto]',
            'version': '[X.X.X]',
            'type': 'Web App',
            'platform': 'Web',
            'description': 'Aplicación React Web',
            'language': 'JavaScript/TypeScript',
            'framework': 'React',
            'dependencies': [],
            'structure': '',
            'file_counts': {}
        }
        
        # Parsear package.json
        package_json = self.project_root / 'package.json'
        if package_json.exists():
            data.update(self._parse_package_json(package_json))
        
        # Detectar bundler
        if (self.project_root / 'vite.config.js').exists() or (self.project_root / 'vite.config.ts').exists():
            data['bundler'] = 'Vite'
        elif (self.project_root / 'webpack.config.js').exists():
            data['bundler'] = 'Webpack'
        else:
            data['bundler'] = '[Bundler no detectado]'
        
        data['structure'] = self._get_directory_tree(max_depth=3)
        data['file_counts'] = self._count_files_by_extension(['.js', '.jsx', '.ts', '.tsx', '.css'])
        
        return data
    
    def _parse_package_json(self, path: Path) -> Dict[str, Any]:
        """Parsea package.json."""
        result = {}
        try:
            content = json.loads(path.read_text(encoding='utf-8'))
            result['name'] = content.get('name', '[Nombre del Proyecto]')
            result['version'] = content.get('version', '[X.X.X]')
            result['description'] = content.get('description', 'Aplicación React Web')
            
            # Dependencies
            deps = content.get('dependencies', {})
            result['dependencies'] = [f"{k}:{v}" for k, v in list(deps.items())[:10]]
            
        except Exception as e:
            print(f"⚠️  Error parseando package.json: {e}")
        
        return result


class NodeAnalyzer(BaseAnalyzer):
    """Analizador para proyectos Node.js."""
    
    def analyze(self) -> Dict[str, Any]:
        print("🔍 Analizando proyecto Node.js...")
        
        data = {
            'name': '[Nombre del Proyecto]',
            'version': '[X.X.X]',
            'type': 'Backend API',
            'platform': 'Node.js',
            'description': 'API Node.js',
            'language': 'JavaScript/TypeScript',
            'framework': 'Express/Fastify/etc',
            'dependencies': [],
            'structure': '',
            'file_counts': {}
        }
        
        package_json = self.project_root / 'package.json'
        if package_json.exists():
            data.update(self._parse_package_json(package_json))
        
        # Detectar framework
        if (self.project_root / 'app.js').exists() or (self.project_root / 'server.js').exists():
            data['entry_point'] = 'app.js o server.js detectado'
        
        data['structure'] = self._get_directory_tree(max_depth=3)
        data['file_counts'] = self._count_files_by_extension(['.js', '.ts'])
        
        return data
    
    def _parse_package_json(self, path: Path) -> Dict[str, Any]:
        """Parsea package.json."""
        result = {}
        try:
            content = json.loads(path.read_text(encoding='utf-8'))
            result['name'] = content.get('name', '[Nombre del Proyecto]')
            result['version'] = content.get('version', '[X.X.X]')
            result['description'] = content.get('description', 'API Node.js')
            
            deps = content.get('dependencies', {})
            result['dependencies'] = [f"{k}:{v}" for k, v in list(deps.items())[:10]]
            
            # Detectar framework
            if 'express' in deps:
                result['framework'] = 'Express'
            elif 'fastify' in deps:
                result['framework'] = 'Fastify'
            elif 'koa' in deps:
                result['framework'] = 'Koa'
            
        except Exception as e:
            print(f"⚠️  Error parseando package.json: {e}")
        
        return result


class PythonFlaskAnalyzer(BaseAnalyzer):
    """Analizador para proyectos Python Flask."""
    
    def analyze(self) -> Dict[str, Any]:
        print("🔍 Analizando proyecto Python Flask...")
        
        data = {
            'name': '[Nombre del Proyecto]',
            'version': '[X.X.X]',
            'type': 'Backend API',
            'platform': 'Python Flask',
            'description': 'API Python Flask',
            'language': 'Python',
            'framework': 'Flask',
            'dependencies': [],
            'structure': '',
            'file_counts': {}
        }
        
        # Parsear requirements.txt
        requirements = self.project_root / 'requirements.txt'
        if requirements.exists():
            data['dependencies'] = self._parse_requirements(requirements)
        
        # Buscar app.py
        app_py = self.project_root / 'app.py'
        if app_py.exists():
            data['entry_point'] = 'app.py detectado'
        
        data['structure'] = self._get_directory_tree(max_depth=3)
        data['file_counts'] = self._count_files_by_extension(['.py'])
        
        return data
    
    def _parse_requirements(self, path: Path) -> List[str]:
        """Parsea requirements.txt."""
        deps = []
        try:
            content = path.read_text(encoding='utf-8')
            lines = [line.strip() for line in content.split('\n') if line.strip() and not line.startswith('#')]
            deps = lines[:10]
        except Exception as e:
            print(f"⚠️  Error parseando requirements.txt: {e}")
        
        return deps


class PHPLaravelAnalyzer(BaseAnalyzer):
    """Analizador para proyectos PHP Laravel."""
    
    def analyze(self) -> Dict[str, Any]:
        print("🔍 Analizando proyecto PHP Laravel...")
        
        data = {
            'name': '[Nombre del Proyecto]',
            'version': '[X.X.X]',
            'type': 'Web App',
            'platform': 'PHP Laravel',
            'description': 'Aplicación PHP Laravel',
            'language': 'PHP',
            'framework': 'Laravel',
            'dependencies': [],
            'structure': '',
            'file_counts': {}
        }
        
        # Parsear composer.json
        composer_json = self.project_root / 'composer.json'
        if composer_json.exists():
            data.update(self._parse_composer_json(composer_json))
        
        data['structure'] = self._get_directory_tree(max_depth=3)
        data['file_counts'] = self._count_files_by_extension(['.php'])
        
        return data
    
    def _parse_composer_json(self, path: Path) -> Dict[str, Any]:
        """Parsea composer.json."""
        result = {}
        try:
            content = json.loads(path.read_text(encoding='utf-8'))
            result['name'] = content.get('name', '[Nombre del Proyecto]')
            result['description'] = content.get('description', 'Aplicación PHP Laravel')
            
            deps = content.get('require', {})
            result['dependencies'] = [f"{k}:{v}" for k, v in list(deps.items())[:10]]
            
        except Exception as e:
            print(f"⚠️  Error parseando composer.json: {e}")
        
        return result


class GenericAnalyzer(BaseAnalyzer):
    """Analizador genérico para proyectos desconocidos."""
    
    def analyze(self) -> Dict[str, Any]:
        print("🔍 Analizando proyecto genérico...")
        
        data = {
            'name': '[Nombre del Proyecto]',
            'version': '[X.X.X]',
            'type': 'Proyecto de Software',
            'platform': 'Multiplataforma',
            'description': 'Proyecto de desarrollo de software',
            'language': '[Lenguaje principal]',
            'dependencies': [],
            'structure': '',
            'file_counts': {}
        }
        
        # Contar archivos por extensiones comunes
        extensions = ['.java', '.kt', '.swift', '.js', '.ts', '.py', '.php', '.rb', '.go', '.rs']
        data['file_counts'] = self._count_files_by_extension(extensions)
        
        # Detectar lenguaje predominante
        if data['file_counts']:
            max_ext = max(data['file_counts'].items(), key=lambda x: x[1])
            lang_map = {
                '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift',
                '.js': 'JavaScript', '.ts': 'TypeScript', '.py': 'Python',
                '.php': 'PHP', '.rb': 'Ruby', '.go': 'Go', '.rs': 'Rust'
            }
            data['language'] = lang_map.get(max_ext[0], '[Lenguaje principal]')
        
        data['structure'] = self._get_directory_tree(max_depth=3)
        
        return data


# =============================================================================
# CONTEXT GENERATOR
# =============================================================================

class ContextGenerator:
    """Genera el archivo .context.bl con los datos analizados."""
    
    def __init__(self, strategy: str, data: Dict[str, Any]):
        self.strategy = strategy
        self.data = data
    
    def generate(self) -> str:
        """Genera el contenido completo de .context.bl."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        return f"""# CONTEXT - {self.data['name']}

## Información General del Proyecto
**Nombre:** {self.data['name']}
**Versión:** {self.data['version']}
**Tipo:** {self.data['type']}
**Plataforma:** {self.data['platform']}
{self._get_platform_specific_fields()}

**Descripción:**
{self.data['description']}


## Stack Tecnológico

### Lenguaje Principal
- {self.data['language']}

{self._get_sdk_section()}

### Frameworks / Librerías Core
{self._get_framework_info()}

### Dependencias Principales
{self._get_dependencies_section()}


## Arquitectura del Proyecto

### Patrón de Arquitectura
[Completar manualmente con el patrón implementado: MVC / MVVM / Clean Architecture / etc.]

### Estructura de Carpetas Principal
```
{self.data.get('structure', '[Completar manualmente]')}
```

### Conteo de Archivos por Tipo
{self._get_file_counts()}


## Convenciones de Código

### Nomenclatura
[Completar manualmente con las convenciones del proyecto]

### Estándares de Formato
[Completar manualmente]


## Base de Datos / Persistencia

### Tipo
[Completar manualmente: Local / Cloud / Híbrido / Ninguna]


## Assets

**Total de archivos:** [Completar manualmente]


## APIs / Servicios Externos

[Completar manualmente con las APIs integradas]


## Configuración del Manifest / Environment

[Completar manualmente según la plataforma]


## Testing

### Framework de Testing
[Completar manualmente]


## Documentación Adicional
[Links o referencias a documentación externa]


## Notas Importantes
[Cualquier información crítica que el modelo de IA debe saber]


---
bloom/v1
context_type: "technical"
context_version: "1.0"
Generado automáticamente: {timestamp}
"""
    
    def _get_platform_specific_fields(self) -> str:
        """Retorna campos específicos según la plataforma."""
        if self.strategy == 'android':
            return f"**Package:** {self.data.get('package', '[com.ejemplo.app]')}"
        elif self.strategy == 'ios':
            return f"**Bundle ID:** {self.data.get('bundle_id', '[com.ejemplo.app]')}"
        return ""
    
    def _get_sdk_section(self) -> str:
        """Retorna la sección de SDK si aplica."""
        if self.strategy == 'android' and 'sdk_info' in self.data:
            sdk = self.data['sdk_info']
            return f"""### SDK (Android)
- Min SDK: API {sdk.get('min', '[XX]')}
- Target SDK: API {sdk.get('target', '[XX]')}
- Compile SDK: API {sdk.get('compile', '[XX]')}
"""
        return ""
    
    def _get_framework_info(self) -> str:
        """Retorna información del framework."""
        framework = self.data.get('framework', '[Framework no detectado]')
        return f"- {framework}"
    
    def _get_dependencies_section(self) -> str:
        """Retorna la lista de dependencias."""
        deps = self.data.get('dependencies', [])
        if not deps:
            return "[Completar manualmente]"
        
        lines = []
        for dep in deps[:10]:
            lines.append(f"- {dep}")
        
        if len(self.data.get('dependencies', [])) > 10:
            lines.append("- [... más dependencias]")
        
        return "\n".join(lines)
    
    def _get_file_counts(self) -> str:
        """Retorna el conteo de archivos."""
        counts = self.data.get('file_counts', {})
        if not counts:
            return "[No disponible]"
        
        lines = []
        for ext, count in counts.items():
            if count > 0:
                lines.append(f"- **{ext}:** {count} archivos")
        
        return "\n".join(lines) if lines else "[No disponible]"


# =============================================================================
# FACTORY
# =============================================================================

def get_analyzer(strategy: str, project_root: Path) -> BaseAnalyzer:
    """Factory para obtener el analyzer según la estrategia."""
    analyzers = {
        'android': AndroidAnalyzer,
        'ios': iOSAnalyzer,
        'react-web': ReactWebAnalyzer,
        'node': NodeAnalyzer,
        'python-flask': PythonFlaskAnalyzer,
        'php-laravel': PHPLaravelAnalyzer,
        'generic': GenericAnalyzer
    }
    
    analyzer_class = analyzers.get(strategy, GenericAnalyzer)
    return analyzer_class(project_root)


# =============================================================================
# MAIN SCRIPT
# =============================================================================

def create_bloom_folder(project_root: Path, output_path: Path, strategy: str):
    """Crea la carpeta .bloom completa."""
    
    print(f"🚀 Generando carpeta .bloom para estrategia: {strategy}")
    print(f"📁 Root del proyecto: {project_root}")
    print(f"📂 Output: {output_path}")
    print()
    
    # Crear estructura de carpetas
    bloom_dir = output_path
    bloom_dir.mkdir(parents=True, exist_ok=True)
    
    core_dir = bloom_dir / 'core'
    intents_dir = bloom_dir / 'intents'
    project_dir = bloom_dir / 'project'
    
    core_dir.mkdir(exist_ok=True)
    intents_dir.mkdir(exist_ok=True)
    project_dir.mkdir(exist_ok=True)
    
    print("✅ Estructura de carpetas creada")
    
    # Generar core/.rules.bl
    print("📝 Generando core/.rules.bl...")
    rules_content = get_core_rules_bl(strategy)
    (core_dir / '.rules.bl').write_text(rules_content, encoding='utf-8')
    
    # Generar core/.standards.bl
    print("📝 Generando core/.standards.bl...")
    standards_content = get_core_standards_bl(strategy)
    (core_dir / '.standards.bl').write_text(standards_content, encoding='utf-8')
    
    # Generar core/.prompt.bl
    print("📝 Generando core/.prompt.bl...")
    prompt_content = get_prompt_bl()
    (core_dir / '.prompt.bl').write_text(prompt_content, encoding='utf-8')
    
    # Generar intents/intent.bl
    print("📝 Generando intents/intent.bl...")
    intent_content = get_intent_template()
    (intents_dir / 'intent.bl').write_text(intent_content, encoding='utf-8')
    
    # Crear intents/intent.btip (placeholder vacío)
    (intents_dir / 'intent.btip').touch()
    
    # Analizar proyecto
    analyzer = get_analyzer(strategy, project_root)
    data = analyzer.analyze()
    
    print("✅ Análisis del proyecto completado")
    
    # Generar project/.app-context.bl
    print("📝 Generando project/.app-context.bl...")
    app_context_content = get_app_context_template(strategy, data)
    (project_dir / '.app-context.bl').write_text(app_context_content, encoding='utf-8')
    
    # Generar project/.context.bl
    print("📝 Generando project/.context.bl...")
    context_gen = ContextGenerator(strategy, data)
    context_content = context_gen.generate()
    (project_dir / '.context.bl').write_text(context_content, encoding='utf-8')
    
    print()
    print("=" * 60)
    print("✅ Carpeta .bloom generada exitosamente!")
    print("=" * 60)
    print()
    print(f"📂 Ubicación: {bloom_dir.absolute()}")
    print()
    print("Archivos generados:")
    print(f"  ✓ core/.rules.bl")
    print(f"  ✓ core/.standards.bl")
    print(f"  ✓ core/.prompt.bl")
    print(f"  ✓ intents/intent.bl")
    print(f"  ✓ intents/intent.btip")
    print(f"  ✓ project/.app-context.bl")
    print(f"  ✓ project/.context.bl")
    print()
    print("💡 Próximos pasos:")
    print("  1. Revisa y completa los placeholders en los archivos .bl")
    print("  2. Personaliza .app-context.bl con la información de tu app")
    print("  3. Verifica que .context.bl tenga la información correcta")
    print("  4. Crea intents específicos en intents/ según necesites")
    print()


def main():
    parser = argparse.ArgumentParser(
        description='Genera la carpeta .bloom para proyectos Bloom',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Estrategias disponibles:
  android       - Proyecto Android (Java/Kotlin)
  ios           - Proyecto iOS (Swift/Objective-C)
  react-web     - Proyecto React Web
  node          - Proyecto Node.js backend
  python-flask  - Proyecto Python Flask
  php-laravel   - Proyecto PHP Laravel
  generic       - Proyecto genérico

Ejemplos:
  python generate_project_context.py --strategy=android
  python generate_project_context.py --strategy=react-web --root=./my-project
  python generate_project_context.py --strategy=node --output=.bloom-custom
        """
    )
    
    parser.add_argument(
        '--strategy',
        required=True,
        choices=['android', 'ios', 'react-web', 'node', 'python-flask', 'php-laravel', 'generic'],
        help='Estrategia de proyecto (requerido)'
    )
    
    parser.add_argument(
        '--root',
        default='.',
        help='Root del proyecto (default: directorio actual)'
    )
    
    parser.add_argument(
        '--output',
        default='.bloom',
        help='Carpeta de output (default: .bloom)'
    )
    
    args = parser.parse_args()
    
    # Resolver paths
    project_root = Path(args.root).resolve()
    
    # Si output es relativo, hacerlo relativo al project_root
    if not Path(args.output).is_absolute():
        output_path = project_root / args.output
    else:
        output_path = Path(args.output)
    
    # Validar que el root existe
    if not project_root.exists():
        print(f"❌ Error: El directorio {project_root} no existe")
        sys.exit(1)
    
    # Ejecutar generación
    try:
        create_bloom_folder(project_root, output_path, args.strategy)
    except Exception as e:
        print(f"❌ Error durante la generación: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()