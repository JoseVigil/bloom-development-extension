# UNIVERSAL_CODEBASE_TEMPLATE.md
### Plantilla Universal para Representación de Codebases

---

## ÃRBOL DE DIRECTORIOS

```
project-root/
â"‚
â"œâ"€â"€ .github/
â"‚   â""â"€â"€ workflows/
â"‚       â"œâ"€â"€ ci.yml
â"‚       â""â"€â"€ deploy.yml
â"‚
â"œâ"€â"€ frontend/
â"‚   â"œâ"€â"€ public/
â"‚   â"‚   â"œâ"€â"€ index.html
â"‚   â"‚   â""â"€â"€ favicon.ico
â"‚   â"œâ"€â"€ src/
â"‚   â"‚   â"œâ"€â"€ components/
â"‚   â"‚   â"‚   â"œâ"€â"€ Header.jsx
â"‚   â"‚   â"‚   â"œâ"€â"€ VideoPlayer.jsx
â"‚   â"‚   â"‚   â""â"€â"€ Sidebar.jsx
â"‚   â"‚   â"œâ"€â"€ hooks/
â"‚   â"‚   â"‚   â"œâ"€â"€ useAuth.js
â"‚   â"‚   â"‚   â""â"€â"€ useWebSocket.js
â"‚   â"‚   â"œâ"€â"€ services/
â"‚   â"‚   â"‚   â"œâ"€â"€ api.js
â"‚   â"‚   â"‚   â""â"€â"€ websocket.js
â"‚   â"‚   â"œâ"€â"€ utils/
â"‚   â"‚   â"‚   â"œâ"€â"€ formatters.js
â"‚   â"‚   â"‚   â""â"€â"€ validators.js
â"‚   â"‚   â"œâ"€â"€ App.jsx
â"‚   â"‚   â"œâ"€â"€ index.js
â"‚   â"‚   â""â"€â"€ styles.css
â"‚   â"œâ"€â"€ package.json
â"‚   â"œâ"€â"€ package-lock.json
â"‚   â""â"€â"€ vite.config.js
â"‚
â"œâ"€â"€ backend/
â"‚   â"œâ"€â"€ src/
â"‚   â"‚   â"œâ"€â"€ controllers/
â"‚   â"‚   â"‚   â"œâ"€â"€ authController.js
â"‚   â"‚   â"‚   â"œâ"€â"€ videoController.js
â"‚   â"‚   â"‚   â""â"€â"€ userController.js
â"‚   â"‚   â"œâ"€â"€ models/
â"‚   â"‚   â"‚   â"œâ"€â"€ User.js
â"‚   â"‚   â"‚   â"œâ"€â"€ Video.js
â"‚   â"‚   â"‚   â""â"€â"€ Session.js
â"‚   â"‚   â"œâ"€â"€ routes/
â"‚   â"‚   â"‚   â"œâ"€â"€ auth.js
â"‚   â"‚   â"‚   â"œâ"€â"€ videos.js
â"‚   â"‚   â"‚   â""â"€â"€ users.js
â"‚   â"‚   â"œâ"€â"€ middleware/
â"‚   â"‚   â"‚   â"œâ"€â"€ authMiddleware.js
â"‚   â"‚   â"‚   â"œâ"€â"€ errorHandler.js
â"‚   â"‚   â"‚   â""â"€â"€ rateLimiter.js
â"‚   â"‚   â"œâ"€â"€ utils/
â"‚   â"‚   â"‚   â"œâ"€â"€ database.js
â"‚   â"‚   â"‚   â"œâ"€â"€ logger.js
â"‚   â"‚   â"‚   â""â"€â"€ validation.js
â"‚   â"‚   â"œâ"€â"€ config/
â"‚   â"‚   â"‚   â""â"€â"€ config.js
â"‚   â"‚   â""â"€â"€ server.js
â"‚   â"œâ"€â"€ tests/
â"‚   â"‚   â"œâ"€â"€ unit/
â"‚   â"‚   â"‚   â""â"€â"€ user.test.js
â"‚   â"‚   â""â"€â"€ integration/
â"‚   â"‚       â""â"€â"€ api.test.js
â"‚   â"œâ"€â"€ package.json
â"‚   â""â"€â"€ .env.example
â"‚
â"œâ"€â"€ ml-service/
â"‚   â"œâ"€â"€ src/
â"‚   â"‚   â"œâ"€â"€ models/
â"‚   â"‚   â"‚   â"œâ"€â"€ video_classifier.py
â"‚   â"‚   â"‚   â""â"€â"€ audio_processor.py
â"‚   â"‚   â"œâ"€â"€ api/
â"‚   â"‚   â"‚   â"œâ"€â"€ routes.py
â"‚   â"‚   â"‚   â""â"€â"€ schemas.py
â"‚   â"‚   â"œâ"€â"€ utils/
â"‚   â"‚   â"‚   â"œâ"€â"€ preprocessing.py
â"‚   â"‚   â"‚   â""â"€â"€ postprocessing.py
â"‚   â"‚   â""â"€â"€ main.py
â"‚   â"œâ"€â"€ tests/
â"‚   â"‚   â""â"€â"€ test_classifier.py
â"‚   â"œâ"€â"€ requirements.txt
â"‚   â""â"€â"€ Dockerfile
â"‚
â"œâ"€â"€ mobile/
â"‚   â"œâ"€â"€ android/
â"‚   â"‚   â"œâ"€â"€ app/
â"‚   â"‚   â"‚   â"œâ"€â"€ src/
â"‚   â"‚   â"‚   â"‚   â"œâ"€â"€ main/
â"‚   â"‚   â"‚   â"‚   â"‚   â"œâ"€â"€ java/
â"‚   â"‚   â"‚   â"‚   â"‚   â"‚   â""â"€â"€ com/example/
â"‚   â"‚   â"‚   â"‚   â"‚   â"‚       â"œâ"€â"€ MainActivity.kt
â"‚   â"‚   â"‚   â"‚   â"‚   â"‚       â"œâ"€â"€ CameraManager.kt
â"‚   â"‚   â"‚   â"‚   â"‚   â"‚       â""â"€â"€ VideoUploader.kt
â"‚   â"‚   â"‚   â"‚   â"‚   â"œâ"€â"€ res/
â"‚   â"‚   â"‚   â"‚   â"‚   â"‚   â"œâ"€â"€ layout/
â"‚   â"‚   â"‚   â"‚   â"‚   â"‚   â"‚   â""â"€â"€ activity_main.xml
â"‚   â"‚   â"‚   â"‚   â"‚   â"‚   â""â"€â"€ values/
â"‚   â"‚   â"‚   â"‚   â"‚   â"‚       â""â"€â"€ strings.xml
â"‚   â"‚   â"‚   â"‚   â"‚   â""â"€â"€ AndroidManifest.xml
â"‚   â"‚   â"‚   â""â"€â"€ build.gradle
â"‚   â"‚   â""â"€â"€ build.gradle
â"‚   â""â"€â"€ ios/
â"‚       â"œâ"€â"€ App/
â"‚       â"‚   â"œâ"€â"€ Views/
â"‚       â"‚   â"‚   â""â"€â"€ MainView.swift
â"‚       â"‚   â"œâ"€â"€ ViewModels/
â"‚       â"‚   â"‚   â""â"€â"€ CameraViewModel.swift
â"‚       â"‚   â""â"€â"€ Models/
â"‚       â"‚       â""â"€â"€ Video.swift
â"‚       â""â"€â"€ App.xcodeproj
â"‚
â"œâ"€â"€ database/
â"‚   â"œâ"€â"€ migrations/
â"‚   â"‚   â"œâ"€â"€ 001_initial_schema.sql
â"‚   â"‚   â""â"€â"€ 002_add_sessions.sql
â"‚   â""â"€â"€ seeds/
â"‚       â""â"€â"€ sample_data.sql
â"‚
â"œâ"€â"€ infrastructure/
â"‚   â"œâ"€â"€ terraform/
â"‚   â"‚   â"œâ"€â"€ main.tf
â"‚   â"‚   â"œâ"€â"€ variables.tf
â"‚   â"‚   â""â"€â"€ outputs.tf
â"‚   â"œâ"€â"€ kubernetes/
â"‚   â"‚   â"œâ"€â"€ deployment.yaml
â"‚   â"‚   â"œâ"€â"€ service.yaml
â"‚   â"‚   â""â"€â"€ ingress.yaml
â"‚   â""â"€â"€ docker/
â"‚       â"œâ"€â"€ Dockerfile.backend
â"‚       â"œâ"€â"€ Dockerfile.frontend
â"‚       â""â"€â"€ docker-compose.yml
â"‚
â"œâ"€â"€ docs/
â"‚   â"œâ"€â"€ architecture.md
â"‚   â"œâ"€â"€ api-reference.md
â"‚   â""â"€â"€ deployment.md
â"‚
â"œâ"€â"€ scripts/
â"‚   â"œâ"€â"€ setup.sh
â"‚   â"œâ"€â"€ deploy.sh
â"‚   â""â"€â"€ backup.sh
â"‚
â"œâ"€â"€ .gitignore
â"œâ"€â"€ .env.example
â"œâ"€â"€ README.md
â"œâ"€â"€ LICENSE
â""â"€â"€ CONTRIBUTING.md
```

---

## ÃNDICE

### **A. ConfiguraciÃ³n y CI/CD**
- [A.1 - .github/workflows/ci.yml](#a1-githubworkflowsciyml)
- [A.2 - .github/workflows/deploy.yml](#a2-githubworkflowsdeployyml)

### **B. Frontend (React)**
- [B.1 - frontend/public/index.html](#b1-frontendpublicindexhtml)
- [B.2 - frontend/src/components/Header.jsx](#b2-frontendsrccomponentsheaderjsx)
- [B.3 - frontend/src/components/VideoPlayer.jsx](#b3-frontendsrccomponentsvideoplayer)
- [B.4 - frontend/src/components/Sidebar.jsx](#b4-frontendsrccomponentssidebar)
- [B.5 - frontend/src/hooks/useAuth.js](#b5-frontendsrchooksuseauthjs)
- [B.6 - frontend/src/hooks/useWebSocket.js](#b6-frontendsrchooksusewebsocketjs)
- [B.7 - frontend/src/services/api.js](#b7-frontendsrcservicesapijs)
- [B.8 - frontend/src/services/websocket.js](#b8-frontendsrcserviceswebsocketjs)
- [B.9 - frontend/src/utils/formatters.js](#b9-frontendsrcutilsformattersjs)
- [B.10 - frontend/src/utils/validators.js](#b10-frontendsrcutilsvalidatorsjs)
- [B.11 - frontend/src/App.jsx](#b11-frontendsrcappjsx)
- [B.12 - frontend/src/index.js](#b12-frontendsrcindexjs)
- [B.13 - frontend/src/styles.css](#b13-frontendsrcstylescss)
- [B.14 - frontend/package.json](#b14-frontendpackagejson)
- [B.15 - frontend/vite.config.js](#b15-frontendviteconfigjs)

### **C. Backend (Node.js/Express)**
- [C.1 - backend/src/controllers/authController.js](#c1-backendsrccontrollersauthcontrollerjs)
- [C.2 - backend/src/controllers/videoController.js](#c2-backendsrccontrollersvideocontrollerjs)
- [C.3 - backend/src/controllers/userController.js](#c3-backendsrccontrollersusercontrollerjs)
- [C.4 - backend/src/models/User.js](#c4-backendsrcmodelsuserjs)
- [C.5 - backend/src/models/Video.js](#c5-backendsrcmodelsvideojs)
- [C.6 - backend/src/models/Session.js](#c6-backendsrcmodelssessionjs)
- [C.7 - backend/src/routes/auth.js](#c7-backendsrcroutesauthjs)
- [C.8 - backend/src/routes/videos.js](#c8-backendsrcroutesvideosjs)
- [C.9 - backend/src/routes/users.js](#c9-backendsrcroutesusersjs)
- [C.10 - backend/src/middleware/authMiddleware.js](#c10-backendsrcmiddlewareauthmiddlewarejs)
- [C.11 - backend/src/middleware/errorHandler.js](#c11-backendsrcmiddlewareerrorhandlerjs)
- [C.12 - backend/src/middleware/rateLimiter.js](#c12-backendsrcmiddlewareratelimiterjs)
- [C.13 - backend/src/utils/database.js](#c13-backendsrcutilsdatabasejs)
- [C.14 - backend/src/utils/logger.js](#c14-backendsrcutilsloggerjs)
- [C.15 - backend/src/utils/validation.js](#c15-backendsrcutilsvalidationjs)
- [C.16 - backend/src/config/config.js](#c16-backendsrcconfigconfigjs)
- [C.17 - backend/src/server.js](#c17-backendsrcserverjs)
- [C.18 - backend/tests/unit/user.test.js](#c18-backendtestsunitusertestjs)
- [C.19 - backend/tests/integration/api.test.js](#c19-backendtestsintegrationapitestjs)
- [C.20 - backend/package.json](#c20-backendpackagejson)
- [C.21 - backend/.env.example](#c21-backendenvexample)

### **D. ML Service (Python/FastAPI)**
- [D.1 - ml-service/src/models/video_classifier.py](#d1-ml-servicesrcmodelsvideo_classifierpy)
- [D.2 - ml-service/src/models/audio_processor.py](#d2-ml-servicesrcmodelsaudio_processorpy)
- [D.3 - ml-service/src/api/routes.py](#d3-ml-servicesrcapiroutespy)
- [D.4 - ml-service/src/api/schemas.py](#d4-ml-servicesrcapischemaspyy)
- [D.5 - ml-service/src/utils/preprocessing.py](#d5-ml-servicesrcutilspreprocessingpy)
- [D.6 - ml-service/src/utils/postprocessing.py](#d6-ml-servicesrcutilspostprocessingpy)
- [D.7 - ml-service/src/main.py](#d7-ml-servicesrcmainpy)
- [D.8 - ml-service/tests/test_classifier.py](#d8-ml-serviceteststest_classifierpy)
- [D.9 - ml-service/requirements.txt](#d9-ml-servicerequirementstxt)
- [D.10 - ml-service/Dockerfile](#d10-ml-servicedockerfile)

### **E. Mobile (Android/Kotlin)**
- [E.1 - mobile/android/app/src/main/java/com/example/MainActivity.kt](#e1-mobileandroidappsrcmainjavacomexamplemainactivitykt)
- [E.2 - mobile/android/app/src/main/java/com/example/CameraManager.kt](#e2-mobileandroidappsrcmainjavacomexamplecameramanagerkt)
- [E.3 - mobile/android/app/src/main/java/com/example/VideoUploader.kt](#e3-mobileandroidappsrcmainjavacomexamplevideouploaderkt)
- [E.4 - mobile/android/app/src/main/res/layout/activity_main.xml](#e4-mobileandroidappsrcmainreslayoutactivity_mainxml)
- [E.5 - mobile/android/app/src/main/res/values/strings.xml](#e5-mobileandroidappsrcmainresvaluesstringsxml)
- [E.6 - mobile/android/app/src/main/AndroidManifest.xml](#e6-mobileandroidappsrcmainandroidmanifestxml)
- [E.7 - mobile/android/app/build.gradle](#e7-mobileandroidappbuildgradle)
- [E.8 - mobile/android/build.gradle](#e8-mobileandroidbuildgradle)

### **F. Mobile (iOS/Swift)**
- [F.1 - mobile/ios/App/Views/MainView.swift](#f1-mobileiosappviewsmainviewswift)
- [F.2 - mobile/ios/App/ViewModels/CameraViewModel.swift](#f2-mobileiosappviewmodelscameraviewmodelswift)
- [F.3 - mobile/ios/App/Models/Video.swift](#f3-mobileiosappmodelsvideoswift)

### **G. Database**
- [G.1 - database/migrations/001_initial_schema.sql](#g1-databasemigrations001_initial_schemasql)
- [G.2 - database/migrations/002_add_sessions.sql](#g2-databasemigrations002_add_sessionssql)
- [G.3 - database/seeds/sample_data.sql](#g3-databaseseedssample_datasql)

### **H. Infrastructure**
- [H.1 - infrastructure/terraform/main.tf](#h1-infrastructureterraformmaintf)
- [H.2 - infrastructure/terraform/variables.tf](#h2-infrastructureterraformvariablestf)
- [H.3 - infrastructure/terraform/outputs.tf](#h3-infrastructureterraformoutputstf)
- [H.4 - infrastructure/kubernetes/deployment.yaml](#h4-infrastructurekubernetesdeploymentyaml)
- [H.5 - infrastructure/kubernetes/service.yaml](#h5-infrastructurekubernetesserviceyaml)
- [H.6 - infrastructure/kubernetes/ingress.yaml](#h6-infrastructurekubernetesingressyaml)
- [H.7 - infrastructure/docker/Dockerfile.backend](#h7-infrastructuredockerdockerfilebackend)
- [H.8 - infrastructure/docker/Dockerfile.frontend](#h8-infrastructuredockerdockerfilefrontend)
- [H.9 - infrastructure/docker/docker-compose.yml](#h9-infrastructuredockerdocker-composeyml)

### **I. DocumentaciÃ³n**
- [I.1 - docs/architecture.md](#i1-docsarchitecturemd)
- [I.2 - docs/api-reference.md](#i2-docsapi-referencemd)
- [I.3 - docs/deployment.md](#i3-docsdeploymentmd)

### **J. Scripts de AutomatizaciÃ³n**
- [J.1 - scripts/setup.sh](#j1-scriptssetupsh)
- [J.2 - scripts/deploy.sh](#j2-scriptsdeploysh)
- [J.3 - scripts/backup.sh](#j3-scriptsbackupsh)

### **K. Archivos RaÃ­z**
- [K.1 - .gitignore](#k1-gitignore)
- [K.2 - .env.example](#k2-envexample)
- [K.3 - README.md](#k3-readmemd)
- [K.4 - LICENSE](#k4-license)
- [K.5 - CONTRIBUTING.md](#k5-contributingmd)

---

## CONTENIDO DE ARCHIVOS

---

### **A. ConfiguraciÃ³n y CI/CD**

#### A.1 - .github/workflows/ci.yml
```yaml
# AquÃ­ va el archivo YAML de GitHub Actions para CI
# Incluye: triggers de push/PR, jobs de testing, linting, build
# Configura runners, cache de dependencias, tests paralelos
# Integra con servicios de coverage (Codecov, Coveralls)
```

#### A.2 - .github/workflows/deploy.yml
```yaml
# AquÃ­ va el archivo YAML para deployment automatizado
# Incluye: triggers de release/tag, staging/production environments
# Builds de Docker images, push a registry (ECR, GCR, DockerHub)
# Deploy a Kubernetes/ECS, notificaciones post-deploy
```

---

### **B. Frontend (React)**

#### B.1 - frontend/public/index.html
```html
<!-- AquÃ­ va el HTML base del frontend -->
<!-- Incluye: meta tags, title, root div, noscript fallback -->
<!-- Enlaces a CDNs externos si son necesarios -->
<!-- ConfiguraciÃ³n de PWA manifest y service workers -->
```

#### B.2 - frontend/src/components/Header.jsx
```jsx
// AquÃ­ va el componente Header de React
// Incluye: navegaciÃ³n principal, logo, menÃº usuario
// ManejO de autenticaciÃ³n (login/logout buttons)
// Responsive design con breakpoints para mobile
```

#### B.3 - frontend/src/components/VideoPlayer.jsx
```jsx
// AquÃ­ va el componente VideoPlayer
// Incluye: integraciÃ³n con video.js o React Player
// Controles personalizados, subtÃ­tulos, calidad adaptativa
// Tracking de analytics (play, pause, complete)
```

#### B.4 - frontend/src/components/Sidebar.jsx
```jsx
// AquÃ­ va el componente Sidebar
// Incluye: navegaciÃ³n lateral, filtros, categorÃ­as
// Estado colapsable, animaciones de transiciÃ³n
// Badge counts y notificaciones visuales
```

#### B.5 - frontend/src/hooks/useAuth.js
```javascript
// AquÃ­ va el custom hook para autenticaciÃ³n
// Incluye: login, logout, refresh token logic
// Context provider para estado global de auth
// Manejo de redirecciones y rutas protegidas
```

#### B.6 - frontend/src/hooks/useWebSocket.js
```javascript
// AquÃ­ va el custom hook para WebSocket connections
// Incluye: auto-reconnect logic, heartbeat pings
// Event listeners y callbacks para mensajes
// ManejO de errores y fallback strategies
```

#### B.7 - frontend/src/services/api.js
```javascript
// AquÃ­ va el cliente de API (axios/fetch wrapper)
// Incluye: base URLs, interceptors para auth headers
// Error handling centralizado, retry logic
// Request/response transformers y caching
```

#### B.8 - frontend/src/services/websocket.js
```javascript
// AquÃ­ va el servicio de WebSocket
// Incluye: singleton pattern, connection pooling
// Message queuing para offline support
// Protocol handling (JSON, binary, custom formats)
```

#### B.9 - frontend/src/utils/formatters.js
```javascript
// AquÃ­ van funciones de formateo de datos
// Incluye: fechas, nÃºmeros, monedas, tiempos
// InternacionalizaciÃ³n (i18n) y localizaciÃ³n
// Formatters para display de durations, sizes, etc.
```

#### B.10 - frontend/src/utils/validators.js
```javascript
// AquÃ­ van funciones de validaciÃ³n
// Incluye: email, phone, URLs, passwords
// Custom validators para formularios complejos
// Mensajes de error traducibles
```

#### B.11 - frontend/src/App.jsx
```jsx
// AquÃ­ va el componente principal App
// Incluye: routing setup (React Router), global providers
// Layout structure, error boundaries
// Theme providers, modal managers
```

#### B.12 - frontend/src/index.js
```javascript
// AquÃ­ va el entry point de React
// Incluye: ReactDOM.render, StrictMode setup
// Service worker registration para PWA
// Global error handlers y monitoring setup
```

#### B.13 - frontend/src/styles.css
```css
/* AquÃ­ van los estilos globales */
/* Incluye: CSS reset/normalize, custom properties (variables) */
/* Typography system, color palette, spacing scale */
/* Utility classes, responsive breakpoints */
```

#### B.14 - frontend/package.json
```json
{
  // AquÃ­ van las dependencias del frontend
  // Incluye: react, react-dom, react-router, axios
  // Build tools: vite/webpack, babel, postcss
  // Testing: jest, testing-library, cypress
  // Linting: eslint, prettier
}
```

#### B.15 - frontend/vite.config.js
```javascript
// AquÃ­ va la configuraciÃ³n de Vite
// Incluye: plugins (react, svg), alias paths
// Build optimization, code splitting strategies
// Dev server proxy para backend API
```

---

### **C. Backend (Node.js/Express)**

#### C.1 - backend/src/controllers/authController.js
```javascript
// AquÃ­ van los controllers de autenticaciÃ³n
// Incluye: register, login, logout, refreshToken
// Password hashing (bcrypt), JWT generation
// OAuth integration (Google, Facebook, etc.)
```

#### C.2 - backend/src/controllers/videoController.js
```javascript
// AquÃ­ van los controllers de videos
// Incluye: upload, list, get, update, delete
// Video processing triggers (transcoding, thumbnails)
// Permissions checking, analytics tracking
```

#### C.3 - backend/src/controllers/userController.js
```javascript
// AquÃ­ van los controllers de usuarios
// Incluye: profile CRUD, preferences, settings
// Avatar upload, email verification flows
// Account deletion, data export (GDPR)
```

#### C.4 - backend/src/models/User.js
```javascript
// Aquí va el modelo de datos User
// Incluye: schema definition (Sequelize/Mongoose/Prisma)
// Relationships (hasMany videos, sessions)
// Hooks para password hashing, validations
// Instance methods (comparePassword, generateToken)
```

#### C.5 - backend/src/models/Video.js
```javascript
// Aquí va el modelo de datos Video
// Incluye: schema con metadata (title, description, duration)
// Relationships (belongsTo user, hasMany comments)
// Status tracking (uploading, processing, ready, failed)
// Scopes para queries comunes (published, draft)
```

#### C.6 - backend/src/models/Session.js
```javascript
// Aquí va el modelo de datos Session
// Incluye: schema para sesiones de usuario
// Campos: userId, token, expiresAt, deviceInfo
// Methods para limpiar sesiones expiradas
// Indexes para performance en queries frecuentes
```

#### C.7 - backend/src/routes/auth.js
```javascript
// Aquí van las rutas de autenticación
// Incluye: POST /register, POST /login, POST /logout
// POST /refresh-token, POST /forgot-password
// GET /verify-email/:token
// Middleware de validación de inputs
```

#### C.8 - backend/src/routes/videos.js
```javascript
// Aquí van las rutas de videos
// Incluye: GET /videos (list), POST /videos (upload)
// GET /videos/:id, PUT /videos/:id, DELETE /videos/:id
// POST /videos/:id/like, GET /videos/:id/analytics
// Query params para paginación, filtrado, ordenamiento
```

#### C.9 - backend/src/routes/users.js
```javascript
// Aquí van las rutas de usuarios
// Incluye: GET /users/me, PUT /users/me
// POST /users/avatar, DELETE /users/me
// GET /users/:id/public-profile
// Privacy controls y data export endpoints
```

#### C.10 - backend/src/middleware/authMiddleware.js
```javascript
// Aquí va el middleware de autenticación
// Incluye: JWT verification, token extraction
// User loading desde DB, role checking
// Error handling para tokens inválidos/expirados
// Optional auth para rutas públicas con auth opcional
```

#### C.11 - backend/src/middleware/errorHandler.js
```javascript
// Aquí va el middleware de manejo de errores
// Incluye: error normalization, status code mapping
// Logging de errores con stack traces
// Response formatting para diferentes tipos de error
// Modo desarrollo vs producción (info expuesta)
```

#### C.12 - backend/src/middleware/rateLimiter.js
```javascript
// Aquí va el middleware de rate limiting
// Incluye: configuración por endpoint (express-rate-limit)
// Redis store para clusters distribuidos
// Custom key generators (IP, user ID, API key)
// Headers de feedback (X-RateLimit-*)
```

#### C.13 - backend/src/utils/database.js
```javascript
// Aquí van las utilidades de base de datos
// Incluye: connection pooling, retry logic
// Health check functions, migration runners
// Query builders helpers, transaction wrappers
// Performance monitoring y slow query logging
```

#### C.14 - backend/src/utils/logger.js
```javascript
// Aquí va la configuración de logging
// Incluye: winston/pino setup, log levels
// Transports (console, file, cloud services)
// Request ID tracking, structured logging
// Sensitive data masking (passwords, tokens)
```

#### C.15 - backend/src/utils/validation.js
```javascript
// Aquí van las utilidades de validación
// Incluye: Joi/Yup schemas, custom validators
// Sanitization functions, type coercion
// Error message formatting i18n-ready
// Reusable validation chains
```

#### C.16 - backend/src/config/config.js
```javascript
// Aquí va la configuración centralizada
// Incluye: environment variables loading (dotenv)
// Config validation, default values
// Secrets management, feature flags
// Database URLs, API keys, service endpoints
```

#### C.17 - backend/src/server.js
```javascript
// Aquí va el servidor principal
// Incluye: Express app setup, middleware chain
// Route mounting, error handlers
// Graceful shutdown handlers (SIGTERM, SIGINT)
// Server startup, port binding, health checks
```

#### C.18 - backend/tests/unit/user.test.js
```javascript
// Aquí van los tests unitarios de User
// Incluye: model validation tests, method tests
// Mocking de database calls
// Password hashing verification
// Edge cases y error scenarios
```

#### C.19 - backend/tests/integration/api.test.js
```javascript
// Aquí van los tests de integración
// Incluye: API endpoint testing (supertest)
// Database seeding/cleanup entre tests
// Authentication flows, happy paths
// Error responses, edge cases
```

#### C.20 - backend/package.json
```json
{
  // Aquí van las dependencias del backend
  // Incluye: express, cors, helmet, compression
  // Database: sequelize/mongoose/prisma, drivers
  // Auth: jsonwebtoken, bcrypt, passport
  // Utils: dotenv, joi, winston, multer
  // Testing: jest, supertest, faker
}
```

#### C.21 - backend/.env.example
```bash
# Aquí van las variables de entorno ejemplo
# Incluye: DATABASE_URL, JWT_SECRET, PORT
# REDIS_URL, AWS_* credentials, SMTP_* config
# NODE_ENV, LOG_LEVEL, API_* keys
# Comentarios explicativos para cada variable
```

---

### **D. ML Service (Python/FastAPI)**

#### D.1 - ml-service/src/models/video_classifier.py
```python
# Aquí va el modelo de clasificación de videos
# Incluye: PyTorch/TensorFlow model loading
# Inference pipeline, preprocessing steps
# Batch prediction support, GPU utilization
# Model versioning, A/B testing support
```

#### D.2 - ml-service/src/models/audio_processor.py
```python
# Aquí va el procesador de audio
# Incluye: speech-to-text, audio feature extraction
# Noise reduction, normalization
# Multiple format support (wav, mp3, aac)
# Chunking para archivos grandes
```

#### D.3 - ml-service/src/api/routes.py
```python
# Aquí van las rutas FastAPI del servicio ML
# Incluye: POST /predict, POST /classify
# GET /health, GET /models (lista modelos disponibles)
# File upload endpoints con validación
# Async processing con background tasks
```

#### D.4 - ml-service/src/api/schemas.py
```python
# Aquí van los schemas Pydantic
# Incluye: request/response models, validation
# Custom validators, serializers
# Examples para documentación automática
# Nested schemas para objetos complejos
```

#### D.5 - ml-service/src/utils/preprocessing.py
```python
# Aquí van las funciones de preprocessing
# Incluye: video frame extraction, resizing
# Normalization, data augmentation
# Format conversions, codec handling
# Error recovery para archivos corruptos
```

#### D.6 - ml-service/src/utils/postprocessing.py
```python
# Aquí van las funciones de postprocessing
# Incluye: confidence thresholding, NMS
# Result formatting, ranking algorithms
# Aggregation de predictions múltiples
# Visualization generation (heatmaps, etc)
```

#### D.7 - ml-service/src/main.py
```python
# Aquí va el entry point de FastAPI
# Incluye: app initialization, CORS setup
# Router mounting, middleware chain
# Exception handlers, startup/shutdown events
# Model preloading, health checks
```

#### D.8 - ml-service/tests/test_classifier.py
```python
# Aquí van los tests del clasificador
# Incluye: pytest fixtures, test data loading
# Model inference tests, accuracy checks
# Performance benchmarks, memory profiling
# Integration tests con API endpoints
```

#### D.9 - ml-service/requirements.txt
```text
# Aquí van las dependencias Python
# Incluye: fastapi, uvicorn, pydantic
# torch/tensorflow, numpy, opencv-python
# pillow, scikit-learn, pandas
# pytest, black, flake8
```

#### D.10 - ml-service/Dockerfile
```dockerfile
# Aquí va el Dockerfile del servicio ML
# Incluye: base image (nvidia/cuda si GPU)
# Python environment setup, dependencies install
# Model files copying, optimization
# Multi-stage build para size reduction
# Entrypoint con uvicorn
```

---

### **E. Mobile (Android/Kotlin)**

#### E.1 - mobile/android/app/src/main/java/com/example/MainActivity.kt
```kotlin
// Aquí va la Activity principal de Android
// Incluye: UI initialization, navigation setup
// Permission handling (camera, storage, location)
// Lifecycle management, state restoration
// Intent handling para deep links
```

#### E.2 - mobile/android/app/src/main/java/com/example/CameraManager.kt
```kotlin
// Aquí va el gestor de cámara
// Incluye: CameraX implementation, preview setup
// Video recording, photo capture
// Face detection, QR scanning
// Resolution handling, orientation changes
```

#### E.3 - mobile/android/app/src/main/java/com/example/VideoUploader.kt
```kotlin
// Aquí va el uploader de videos
// Incluye: multipart upload implementation
// Progress tracking, resume capability
// Background service para uploads largos
// Retry logic, error handling
// Compression antes de upload
```

#### E.4 - mobile/android/app/src/main/res/layout/activity_main.xml
```xml
<!-- Aquí va el layout XML principal -->
<!-- Incluye: ConstraintLayout structure, views -->
<!-- Camera preview surface, controls overlay -->
<!-- RecyclerView para lista de videos -->
<!-- Material Design components integration -->
```

#### E.5 - mobile/android/app/src/main/res/values/strings.xml
```xml
<!-- Aquí van los strings resources -->
<!-- Incluye: app name, labels, error messages -->
<!-- Permission rationales, button texts -->
<!-- Placeholders, format strings -->
<!-- Soporte para múltiples idiomas -->
```

#### E.6 - mobile/android/app/src/main/AndroidManifest.xml
```xml
<!-- Aquí va el manifest de Android -->
<!-- Incluye: permissions (CAMERA, STORAGE, INTERNET) -->
<!-- Activities declaration, intent filters -->
<!-- Service declarations, receivers -->
<!-- Application class, metadata -->
```

#### E.7 - mobile/android/app/build.gradle
```gradle
// Aquí va el build.gradle del módulo app
// Incluye: android config (compileSdk, minSdk)
// Dependencies (androidx, material, retrofit)
// Build variants (debug, release)
// Signing configs, proguard rules
```

#### E.8 - mobile/android/build.gradle
```gradle
// Aquí va el build.gradle del proyecto
// Incluye: buildscript repositories, dependencies
// Plugin versions (android, kotlin)
// AllProjects repositories
// Task configurations globales
```

---

### **F. Mobile (iOS/Swift)**

#### F.1 - mobile/ios/App/Views/MainView.swift
```swift
// Aquí va la vista principal de SwiftUI
// Incluye: NavigationView, TabView structure
// Camera view integration, video list
// State management con @State, @StateObject
// Bindings y data flow
```

#### F.2 - mobile/ios/App/ViewModels/CameraViewModel.swift
```swift
// Aquí va el ViewModel de la cámara
// Incluye: AVFoundation setup, capture session
// ObservableObject con @Published properties
// Camera permissions, photo/video capture
// Face detection integration (Vision framework)
```

#### F.3 - mobile/ios/App/Models/Video.swift
```swift
// Aquí va el modelo de datos Video
// Incluye: struct/class definition, Codable
// Computed properties, custom init
// Equatable, Hashable implementations
// Preview data para SwiftUI previews
```

---

### **G. Database**

#### G.1 - database/migrations/001_initial_schema.sql
```sql
-- Aquí va la migración inicial del schema
-- Incluye: CREATE TABLE statements para users, videos
-- Indexes para performance, foreign keys
-- Constraints (UNIQUE, NOT NULL, CHECK)
-- Initial admin user seed
```

#### G.2 - database/migrations/002_add_sessions.sql
```sql
-- Aquí va la migración para añadir sessions
-- Incluye: CREATE TABLE sessions
-- ALTER TABLE para añadir columnas relacionadas
-- Indexes para queries frecuentes
-- Data migration si es necesaria
```

#### G.3 - database/seeds/sample_data.sql
```sql
-- Aquí van los datos de prueba
-- Incluye: INSERT statements para dev/testing
-- Sample users, videos, comments
-- Realistic data con Faker-style values
-- Scripts de cleanup (DELETE FROM)
```

---

### **H. Infrastructure**

#### H.1 - infrastructure/terraform/main.tf
```hcl
# Aquí va la configuración principal de Terraform
# Incluye: provider config (AWS, GCP, Azure)
# Resource definitions (VPC, subnets, instances)
# Security groups, IAM roles, policies
# Load balancers, auto-scaling groups
```

#### H.2 - infrastructure/terraform/variables.tf
```hcl
# Aquí van las variables de Terraform
# Incluye: variable definitions con types
# Default values, descriptions
# Validation rules, sensitive flags
# Environment-specific overrides
```

#### H.3 - infrastructure/terraform/outputs.tf
```hcl
# Aquí van los outputs de Terraform
# Incluye: resource IDs, endpoints URLs
# Connection strings, sensitive outputs
# Values para consumo de otros módulos
# Export para CI/CD pipelines
```

#### H.4 - infrastructure/kubernetes/deployment.yaml
```yaml
# Aquí va el Deployment de Kubernetes
# Incluye: replicas, container specs
# Resource limits/requests, probes
# Environment variables, secrets mounting
# Rolling update strategy, annotations
```

#### H.5 - infrastructure/kubernetes/service.yaml
```yaml
# Aquí va el Service de Kubernetes
# Incluye: type (ClusterIP, LoadBalancer, NodePort)
# Selector para pods, ports mapping
# Session affinity, health checks
# Annotations para cloud providers
```

#### H.6 - infrastructure/kubernetes/ingress.yaml
```yaml
# Aquí va el Ingress de Kubernetes
# Incluye: host rules, path routing
# TLS configuration, cert-manager annotations
# Backend services mapping
# Rate limiting, CORS annotations
```

#### H.7 - infrastructure/docker/Dockerfile.backend
```dockerfile
# Aquí va el Dockerfile del backend
# Incluye: Node base image, working directory
# Package files copy, npm install
# Source code copy, build step
# Multi-stage para optimizar size
# Non-root user, health check
```

#### H.8 - infrastructure/docker/Dockerfile.frontend
```dockerfile
# Aquí va el Dockerfile del frontend
# Incluye: Node build stage, npm run build
# Nginx serve stage, optimized config
# Gzip compression, cache headers
# Security headers, fallback routing
```

#### H.9 - infrastructure/docker/docker-compose.yml
```yaml
# Aquí va el docker-compose para desarrollo
# Incluye: services (backend, frontend, db, redis)
# Networks, volumes, environment variables
# Depends_on, health checks, restart policies
# Port mappings, build contexts
```

---

### **I. Documentación**

#### I.1 - docs/architecture.md
```markdown
# Aquí va la documentación de arquitectura
# Incluye: system overview, component diagrams
# Data flow, integration patterns
# Technology stack justifications
# Scalability considerations, trade-offs
```

#### I.2 - docs/api-reference.md
```markdown
# Aquí va la referencia de API
# Incluye: endpoints documentation con examples
# Request/response formats, status codes
# Authentication, rate limits
# SDKs, code samples en múltiples lenguajes
```

#### I.3 - docs/deployment.md
```markdown
# Aquí va la guía de deployment
# Incluye: prerequisites, step-by-step instructions
# Environment configurations, secrets management
# Rollback procedures, monitoring setup
# Troubleshooting common issues
```

---

### **J. Scripts de Automatización**

#### J.1 - scripts/setup.sh
```bash
#!/bin/bash
# Aquí va el script de setup inicial
# Incluye: dependencies installation checks
# Database creation, migrations running
# Environment files creation
# Initial seed data loading
```

#### J.2 - scripts/deploy.sh
```bash
#!/bin/bash
# Aquí va el script de deployment
# Incluye: build steps, tests running
# Docker image building/pushing
# Kubernetes apply, rolling update
# Health checks, rollback si falla
```

#### J.3 - scripts/backup.sh
```bash
#!/bin/bash
# Aquí va el script de backup
# Incluye: database dump con timestamp
# File uploads a S3/GCS
# Rotation policy (mantener últimos N backups)
# Notifications on success/failure
```

---

### **K. Archivos Raíz**

#### K.1 - .gitignore
```text
# Aquí van los patterns de archivos a ignorar
# Incluye: node_modules/, .env, *.log
# IDE configs (.idea, .vscode)
# OS files (.DS_Store, Thumbs.db)
# Build artifacts (dist/, build/, *.pyc)
```

#### K.2 - .env.example
```bash
# Aquí va el template de variables de entorno
# Incluye: todas las variables necesarias
# Valores de ejemplo (no reales)
# Comentarios explicativos
# Sección por servicio (Backend, Frontend, ML)
```

#### K.3 - README.md
```markdown
# Aquí va el README principal del proyecto
# Incluye: project description, features
# Quick start guide, installation instructions
# Architecture overview, tech stack
# Contributing guidelines, license info
# Badges (build status, coverage, version)
```

#### K.4 - LICENSE
```text
# Aquí va la licencia del proyecto
# Incluye: MIT, Apache 2.0, GPL, etc.
# Copyright holders, year
# Full license text
# Permissions, limitations, conditions
```

#### K.5 - CONTRIBUTING.md
```markdown
# Aquí va la guía de contribución
# Incluye: code of conduct, pull request process
# Coding standards, commit conventions
# Testing requirements, documentation
# Issue reporting guidelines
```

---

## INSTRUCCIONES DE USO PARA IA

**Para generar un codebase a partir de este template:**

1. **Analizar el árbol de directorios** proporcionado por el usuario
2. **Mapear cada archivo** del árbol a su sección correspondiente en el índice
3. **Generar el contenido real** basándose en:
   - La descripción del archivo en los comentarios
   - El contexto del proyecto proporcionado
   - Las convenciones del lenguaje/framework correspondiente
4. **Mantener consistencia** entre archivos relacionados (imports, exports, interfaces)
5. **Incluir todos los archivos** listados en el árbol sin omisiones

**Formato de salida esperado:**
- Árbol de directorios completo
- Índice con enlaces a cada archivo
- Código completo para cada archivo (no placeholders)
- Comentarios explicativos donde sea necesario