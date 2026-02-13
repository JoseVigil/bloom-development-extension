3# Especificación Técnica: Codebase Generator para Proyectos Android

## 1. Análisis del Sistema Actual

### 1.1 Archivos Utilizados en la Implementación Original

**Archivos Core del Sistema:**

- `extension.ts` - Punto de entrada del plugin, registra comandos
- `createCodebase.ts` - Orquestador del flujo de creación
- `codebaseGenerator.ts` - Motor de generación del formato .bl
- `markdownPreviewManager.ts` - Visualizador (no afecta generación)
- `fileSystem.ts` - Utilidades de sistema de archivos
- `outputChannel.ts` - Logging y debugging

### 1.2 Flujo de Uso Original

**Paso 1:** Usuario ejecuta comando `Bloom: Create Codebase` desde Command Palette

**Paso 2:** Sistema muestra diálogo de selección de archivos (multi-select)

**Paso 3:** Usuario selecciona manualmente archivos relevantes uno por uno

**Paso 4:** Sistema solicita nombre del codebase

**Paso 5:** Generador crea archivo `.codebase.bl` con estructura:

    # Bloom Codebase: {nombre}
    > Generated on {ISO-timestamp}

    ## Index
    - path/to/file1.kt
    - path/to/file2.xml

    ---

    ## File: path/to/file1.kt

        código aquí
        indentado 4 espacios
        línea por línea

**Paso 6:** Archivo guardado en `.bloom/{nombre}.codebase.bl`

### 1.3 Limitaciones Identificadas

- **Selección manual** ineficiente para proyectos grandes
- **No detecta** estructura de proyecto (Android, iOS, Web)
- **No filtra** archivos irrelevantes (build/, .gradle/)
- **No prioriza** archivos críticos vs secundarios
- **No agrupa** archivos por funcionalidad

---

## 2. Propuesta de Arquitectura Mejorada

### 2.1 Diseño de Interfaces

**Interface Principal:**

    export interface ICodebaseStrategy {
      name: string;
      detect(workspaceRoot: string): Promise<boolean>;
      getRelevantFiles(workspaceRoot: string): Promise<FileDescriptor[]>;
      generateIndex(files: FileDescriptor[]): string;
    }

**Descriptor de Archivo:**

    export interface FileDescriptor {
      absolutePath: string;
      relativePath: string;
      category: FileCategory;
      priority: number;
      size: number;
    }

**Categorías de Archivo:**

    export enum FileCategory {
      MANIFEST = 'manifest',
      BUILD_CONFIG = 'build-config',
      GRADLE = 'gradle',
      SOURCE_CODE = 'source',
      RESOURCE = 'resource',
      LAYOUT = 'layout',
      NAVIGATION = 'navigation',
      DEPENDENCY = 'dependency',
      TEST = 'test',
      ASSET = 'asset'
    }

### 2.2 Estrategia para Android

**Detector de Proyecto Android:**

    export class AndroidStrategy implements ICodebaseStrategy {
      name = 'Android';

      async detect(root: string): Promise<boolean> {
        const indicators = [
          'build.gradle',
          'settings.gradle',
          'app/src/main/AndroidManifest.xml'
        ];
        return indicators.some(f => fileExists(join(root, f)));
      }

      async getRelevantFiles(root: string): Promise<FileDescriptor[]> {
        return this.scanAndCategorize(root);
      }
    }

**Archivos Reconocidos para Android:**

    Prioridad 1 (Críticos):
    - app/build.gradle
    - settings.gradle
    - app/src/main/AndroidManifest.xml
    - gradle.properties

    Prioridad 2 (Configuración):
    - app/proguard-rules.pro
    - app/src/main/res/values/strings.xml
    - app/src/main/res/values/colors.xml
    - app/src/main/res/values/themes.xml

    Prioridad 3 (Código Fuente):
    - app/src/main/java/**/*.kt
    - app/src/main/java/**/*.java

    Prioridad 4 (Recursos):
    - app/src/main/res/layout/**/*.xml
    - app/src/main/res/drawable/**/*
    - app/src/main/res/navigation/**/*.xml

    Prioridad 5 (Tests):
    - app/src/test/**/*.kt
    - app/src/androidTest/**/*.kt

**Patrones de Exclusión:**

    Ignorar Siempre:
    - build/
    - .gradle/
    - .idea/
    - local.properties
    - *.iml
    - .DS_Store
    - app/release/
    - captures/

### 2.3 Formato de Salida Mejorado

**Estructura del .codebase.bl:**

    # Bloom Codebase: {nombre}
    > Generated on {timestamp}
    > Project Type: Android
    > Total Files: 42
    > Total Size: 1.2 MB

    ## 📋 Project Structure

    ### Critical Files (5)
    - app/build.gradle
    - settings.gradle
    - app/src/main/AndroidManifest.xml
    - gradle.properties
    - app/proguard-rules.pro

    ### Configuration (8)
    - app/src/main/res/values/strings.xml
    - app/src/main/res/values/colors.xml
    ...

    ### Source Code (15)
    - app/src/main/java/com/example/MainActivity.kt
    - app/src/main/java/com/example/viewmodel/MainViewModel.kt
    ...

    ### Resources (10)
    - app/src/main/res/layout/activity_main.xml
    ...

    ### Tests (4)
    - app/src/test/java/com/example/MainViewModelTest.kt
    ...

    ---

    ## 🔧 Critical Files

    ### File: app/build.gradle
    Category: Build Configuration
    Size: 2.4 KB
    Priority: 1

        plugins {
            id 'com.android.application'
            id 'org.jetbrains.kotlin.android'
        }

    ---

    ### File: app/src/main/AndroidManifest.xml
    Category: Manifest
    Size: 1.8 KB
    Priority: 1

        <?xml version="1.0" encoding="utf-8"?>
        <manifest xmlns:android="...">
            ...
        </manifest>

    ---

    ## 📱 Source Code

    ### File: app/src/main/java/com/example/MainActivity.kt
    Category: Source Code
    Size: 3.2 KB
    Priority: 3

        package com.example

        import android.os.Bundle
        ...

---

## 3. Plan de Implementación

### 3.1 Nuevos Archivos a Crear

    src/
    ├── strategies/
    │   ├── ICodebaseStrategy.ts
    │   ├── AndroidStrategy.ts
    │   ├── iOSStrategy.ts (futuro)
    │   └── WebStrategy.ts (futuro)
    ├── core/
    │   ├── codebaseGenerator.ts (refactorizar)
    │   ├── fileScanner.ts (nuevo)
    │   ├── fileCategorizer.ts (nuevo)
    │   └── projectDetector.ts (nuevo)
    └── models/
        ├── FileDescriptor.ts
        └── FileCategory.ts

### 3.2 Refactorización de Archivos Existentes

**createCodebase.ts - Cambios:**

Antes (línea 14-24):

    const selectedUris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Select Files for Codebase',
        defaultUri: workspaceFolder.uri
    });

Después:

    const detector = new ProjectDetector();
    const strategy = await detector.detectStrategy(workspaceFolder.uri.fsPath);
    
    if (!strategy) {
        const useManual = await vscode.window.showQuickPick(
            ['Yes', 'No'],
            { placeHolder: 'Project type not detected. Select files manually?' }
        );
        if (useManual === 'Yes') {
            // Flujo manual original
        }
        return;
    }

    const relevantFiles = await strategy.getRelevantFiles(workspaceFolder.uri.fsPath);
    
    const quickPick = vscode.window.createQuickPick();
    quickPick.items = relevantFiles.map(f => ({
        label: f.relativePath,
        description: f.category,
        detail: `Priority: ${f.priority} | Size: ${formatSize(f.size)}`
    }));
    quickPick.canSelectMany = true;
    quickPick.selectedItems = quickPick.items; // Pre-seleccionados
    quickPick.show();

**codebaseGenerator.ts - Cambios:**

Nuevo método:

    async generateCodebaseWithStrategy(
        name: string,
        files: FileDescriptor[],
        strategy: ICodebaseStrategy
    ): Promise<string> {
        const timestamp = new Date().toISOString();
        const grouped = this.groupByCategory(files);
        
        let content = `# Bloom Codebase: ${name}\n`;
        content += `> Generated on ${timestamp}\n`;
        content += `> Project Type: ${strategy.name}\n`;
        content += `> Total Files: ${files.length}\n\n`;

        content += strategy.generateIndex(files);
        content += `\n`;

        for (const [category, categoryFiles] of grouped) {
            content += `## ${this.getCategoryEmoji(category)} ${category}\n\n`;
            
            for (const file of categoryFiles) {
                content += `### File: ${file.relativePath}\n`;
                content += `Category: ${category}\n`;
                content += `Size: ${formatSize(file.size)}\n`;
                content += `Priority: ${file.priority}\n\n`;
                
                const fileContent = await this.readFile(file.absolutePath);
                content += this.indentContent(fileContent);
                content += `\n---\n\n`;
            }
        }

        return content;
    }

### 3.3 Implementación de AndroidStrategy

**Detector de archivos críticos:**

    private readonly CRITICAL_PATTERNS = [
        'build.gradle',
        'settings.gradle',
        'AndroidManifest.xml',
        'gradle.properties',
        'proguard-rules.pro'
    ];

    private readonly SOURCE_PATTERNS = [
        'app/src/main/java/**/*.kt',
        'app/src/main/java/**/*.java'
    ];

    private readonly RESOURCE_PATTERNS = [
        'app/src/main/res/layout/**/*.xml',
        'app/src/main/res/values/**/*.xml',
        'app/src/main/res/drawable/**/*',
        'app/src/main/res/navigation/**/*.xml'
    ];

**Categorizador inteligente:**

    private categorizeFile(relativePath: string): FileCategory {
        if (relativePath.includes('AndroidManifest.xml')) {
            return FileCategory.MANIFEST;
        }
        if (relativePath.endsWith('build.gradle')) {
            return FileCategory.BUILD_CONFIG;
        }
        if (relativePath.includes('/res/layout/')) {
            return FileCategory.LAYOUT;
        }
        if (relativePath.includes('/res/navigation/')) {
            return FileCategory.NAVIGATION;
        }
        if (relativePath.match(/\.(kt|java)$/)) {
            return FileCategory.SOURCE_CODE;
        }
        if (relativePath.includes('/res/values/')) {
            return FileCategory.RESOURCE;
        }
        if (relativePath.includes('/test/')) {
            return FileCategory.TEST;
        }
        return FileCategory.ASSET;
    }

**Asignador de prioridades:**

    private assignPriority(category: FileCategory, path: string): number {
        const priorityMap: Record<FileCategory, number> = {
            [FileCategory.MANIFEST]: 1,
            [FileCategory.BUILD_CONFIG]: 1,
            [FileCategory.GRADLE]: 1,
            [FileCategory.DEPENDENCY]: 2,
            [FileCategory.RESOURCE]: 2,
            [FileCategory.SOURCE_CODE]: 3,
            [FileCategory.LAYOUT]: 3,
            [FileCategory.NAVIGATION]: 3,
            [FileCategory.TEST]: 4,
            [FileCategory.ASSET]: 5
        };
        return priorityMap[category] || 5;
    }

---

## 4. Ejemplo de Uso Final

### 4.1 Workflow Usuario

**Paso 1:** Usuario abre proyecto Android en VS Code

**Paso 2:** Ejecuta comando `Bloom: Create Codebase`

**Paso 3:** Sistema detecta automáticamente: "✓ Android project detected"

**Paso 4:** Muestra Quick Pick con archivos pre-seleccionados por categoría:

    [✓] app/build.gradle (Build Config - Priority 1)
    [✓] AndroidManifest.xml (Manifest - Priority 1)
    [✓] MainActivity.kt (Source - Priority 3)
    [✓] activity_main.xml (Layout - Priority 3)
    [ ] MainViewModelTest.kt (Test - Priority 4)

**Paso 5:** Usuario ajusta selección si necesita y confirma

**Paso 6:** Ingresa nombre: "feature-login-module"

**Paso 7:** Sistema genera `.bloom/feature-login-module.codebase.bl`

### 4.2 Salida Generada

    # Bloom Codebase: feature-login-module
    > Generated on 2025-11-15T14:30:00.000Z
    > Project Type: Android
    > Total Files: 12
    > Total Size: 45.6 KB

    ## 📋 Project Structure

    ### 🔧 Critical Files (3)
    - app/build.gradle
    - app/src/main/AndroidManifest.xml
    - gradle.properties

    ### 📱 Source Code (5)
    - app/src/main/java/com/example/login/LoginActivity.kt
    - app/src/main/java/com/example/login/LoginViewModel.kt
    - app/src/main/java/com/example/login/LoginRepository.kt
    - app/src/main/java/com/example/login/AuthService.kt
    - app/src/main/java/com/example/login/TokenManager.kt

    ### 🎨 Resources (4)
    - app/src/main/res/layout/activity_login.xml
    - app/src/main/res/layout/fragment_login_form.xml
    - app/src/main/res/values/strings.xml
    - app/src/main/res/navigation/login_nav_graph.xml

    ---

    ## 🔧 Critical Files

    ### File: app/build.gradle
    Category: Build Configuration
    Size: 2.4 KB
    Priority: 1
    Dependencies: 15 packages

        plugins {
            id 'com.android.application'
            id 'org.jetbrains.kotlin.android'
            id 'kotlin-kapt'
        }

        android {
            namespace 'com.example.loginfeature'
            compileSdk 34

            defaultConfig {
                applicationId "com.example.loginfeature"
                minSdk 24
                targetSdk 34
                versionCode 1
                versionName "1.0"
            }

            buildFeatures {
                viewBinding true
            }
        }

        dependencies {
            implementation 'androidx.core:core-ktx:1.12.0'
            implementation 'androidx.appcompat:appcompat:1.6.1'
            implementation 'androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0'
            implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
        }

    ---

    ### File: app/src/main/AndroidManifest.xml
    Category: Manifest
    Size: 1.8 KB
    Priority: 1
    Permissions: 2
    Activities: 1

        <?xml version="1.0" encoding="utf-8"?>
        <manifest xmlns:android="http://schemas.android.com/apk/res/android"
            xmlns:tools="http://schemas.android.com/tools">

            <uses-permission android:name="android.permission.INTERNET" />
            <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

            <application
                android:allowBackup="true"
                android:icon="@mipmap/ic_launcher"
                android:label="@string/app_name"
                android:theme="@style/Theme.LoginFeature">
                
                <activity
                    android:name=".login.LoginActivity"
                    android:exported="true"
                    android:windowSoftInputMode="adjustResize">
                    <intent-filter>
                        <action android:name="android.intent.action.MAIN" />
                        <category android:name="android.intent.category.LAUNCHER" />
                    </intent-filter>
                </activity>

            </application>

        </manifest>

    ---

    ## 📱 Source Code

    ### File: app/src/main/java/com/example/login/LoginActivity.kt
    Category: Source Code
    Size: 3.2 KB
    Priority: 3
    Lines: 95

        package com.example.login

        import android.os.Bundle
        import androidx.activity.viewModels
        import androidx.appcompat.app.AppCompatActivity
        import androidx.lifecycle.lifecycleScope
        import com.example.loginfeature.databinding.ActivityLoginBinding
        import kotlinx.coroutines.launch

        class LoginActivity : AppCompatActivity() {

            private lateinit var binding: ActivityLoginBinding
            private val viewModel: LoginViewModel by viewModels()

            override fun onCreate(savedInstanceState: Bundle?) {
                super.onCreate(savedInstanceState)
                binding = ActivityLoginBinding.inflate(layoutInflater)
                setContentView(binding.root)

                setupUI()
                observeViewModel()
            }

            private fun setupUI() {
                binding.btnLogin.setOnClickListener {
                    val email = binding.etEmail.text.toString()
                    val password = binding.etPassword.text.toString()
                    viewModel.login(email, password)
                }
            }

            private fun observeViewModel() {
                lifecycleScope.launch {
                    viewModel.loginState.collect { state ->
                        when (state) {
                            is LoginState.Loading -> showLoading()
                            is LoginState.Success -> navigateToHome()
                            is LoginState.Error -> showError(state.message)
                        }
                    }
                }
            }

            private fun showLoading() {
                binding.progressBar.visibility = View.VISIBLE
                binding.btnLogin.isEnabled = false
            }

            private fun navigateToHome() {
                // Navigate to home screen
            }

            private fun showError(message: String) {
                binding.progressBar.visibility = View.GONE
                binding.btnLogin.isEnabled = true
                Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
            }
        }

---

## 5. Ventajas de la Nueva Arquitectura

### 5.1 Para el Usuario

- **Detección automática** del tipo de proyecto
- **Pre-selección inteligente** de archivos relevantes
- **Visualización categorizada** en el Quick Pick
- **Índice organizado** por prioridad y categoría
- **Metadata enriquecida** (tamaño, líneas, dependencias)

### 5.2 Para el Desarrollador

- **Extensible** a nuevos tipos de proyecto (iOS, React, Flutter)
- **Testeable** por separación de responsabilidades
- **Mantenible** por arquitectura modular
- **Reutilizable** entre diferentes comandos

### 5.3 Comparación

**Antes:**

    Manual selection
    → 42 clicks para seleccionar archivos
    → Sin categorización
    → Sin metadata
    → Índice plano

**Después:**

    Auto-detection
    → 0 clicks (pre-seleccionado)
    → Categorizado por tipo
    → Metadata completa
    → Índice jerárquico

---

## 6. Próximos Pasos

### 6.1 Fase 1: Implementación Base

- [ ] Crear interfaces `ICodebaseStrategy` y `FileDescriptor`
- [ ] Implementar `ProjectDetector`
- [ ] Implementar `AndroidStrategy`
- [ ] Refactorizar `CodebaseGenerator`

### 6.2 Fase 2: Integración

- [ ] Modificar `createCodebase.ts` para usar estrategias
- [ ] Agregar Quick Pick con pre-selección
- [ ] Mejorar formato de salida .bl

### 6.3 Fase 3: Testing

- [ ] Tests unitarios para `AndroidStrategy`
- [ ] Tests de integración para flujo completo
- [ ] Validación con proyectos reales

### 6.4 Fase 4: Extensiones Futuras

- [ ] `iOSStrategy` para proyectos Swift/Objective-C
- [ ] `ReactStrategy` para proyectos React/Next.js
- [ ] `FlutterStrategy` para proyectos Flutter
- [ ] Exportación a formato TAR.GZ

---

## 7. Notas de Implementación

### 7.1 Dependencias Adicionales

    package.json:
    {
      "dependencies": {
        "glob": "^10.3.10",
        "minimatch": "^9.0.3"
      }
    }

### 7.2 Configuración Recomendada

Agregar en `package.json` del plugin:

    "contributes": {
      "configuration": {
        "title": "Bloom Codebase",
        "properties": {
          "bloom.android.includeTests": {
            "type": "boolean",
            "default": false,
            "description": "Include test files in Android codebases"
          },
          "bloom.android.maxFileSize": {
            "type": "number",
            "default": 1048576,
            "description": "Maximum file size in bytes (default: 1MB)"
          }
        }
      }
    }

### 7.3 Consideraciones de Performance

- Usar streams para archivos grandes
- Implementar cache para detección de proyecto
- Limitar lectura concurrente de archivos
- Agregar timeout para operaciones lentas

---

## 8. Conclusión

La arquitectura propuesta transforma el plugin de una herramienta de selección manual a un sistema inteligente de análisis de proyectos. Para Android específicamente, la detección automática y categorización por tipo de archivo (manifest, gradle, kotlin, resources) mejora significativamente la experiencia del usuario y la calidad del output generado.

El formato `.codebase.bl` resultante es más estructurado, navegable y útil para documentación o transferencia de conocimiento de proyectos Android.