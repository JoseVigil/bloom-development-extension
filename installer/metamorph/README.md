# 🦋 Metamorph - System State Reconciler

**Metamorph** es un reconciliador declarativo de estado para el ecosistema Bloom. No es un updater tradicional: es un sistema que garantiza que el estado actual del sistema coincida con el estado deseado especificado en un manifest.

## 📖 Documentación

- **[Binary Audit Guide](../METAMORPH_BINARY_AUDIT_GUIDE.md)** - Guía de auditoría de binarios y contrato `--info`
- **[Master Implementation Guide](../METAMORPH_MASTER_IMPLEMENTATION_GUIDE.md)** - Especificación completa de arquitectura y implementación

## 🏗️ Arquitectura

Metamorph implementa un reconciliation loop inspirado en Kubernetes:

```
Estado Deseado (Manifest) → Metamorph → Estado Actual (Sistema)
                                ↑              ↓
                                └──── Drift? ──┘
```

### Componentes Principales

- **State Inspector**: Construye el estado actual consultando todos los binarios
- **Reconciliation Engine**: Calcula diferencias y planea actualizaciones
- **Staging Manager**: Descarga y valida artefactos
- **Service Manager**: Maneja servicios Windows de forma segura
- **Rollback Manager**: Garantiza recuperación ante fallos

## 🚀 Quick Start

### Compilación

```bash
cd metamorph/scripts
build.bat
```

El binario se genera en:
```
bloom-development-extension\native\bin\win64\metamorph\metamorph.exe
```

### Uso Básico

```bash
# Ver versión
metamorph version

# Ver estado del sistema
metamorph status

# Inspeccionar binarios
metamorph inspect

# Reconciliar contra manifest
metamorph reconcile --manifest manifest.json

# Generar manifest del estado actual
metamorph generate-manifest > current.json
```

## 📂 Estructura del Proyecto

```
metamorph/
├── internal/
│   ├── cli/           # CLI commands y help
│   ├── core/          # Core functionality (paths, logger, version)
│   ├── inspector/     # Binary inspection y state building
│   ├── manifest/      # Manifest loading y validation
│   ├── reconciler/    # Reconciliation engine
│   ├── staging/       # Download y staging
│   ├── services/      # Windows service management
│   └── rollback/      # Rollback y snapshot management
├── scripts/
│   └── build.bat      # Build script
├── main.go
├── go.mod
└── VERSION
```

## 🔧 Integración con Nucleus

Metamorph es invocado por Nucleus después de que este valida el manifest firmado recibido de Bartcave:

```go
// En Nucleus
nucleus.InvokeMetamorph(manifestPath)

// Nucleus ejecuta:
metamorph reconcile --manifest /path/to/manifest.json --json
```

Metamorph reporta resultados en JSON via stdout para que Nucleus pueda procesarlos.

## 📝 Sistema de Logging

Metamorph sigue la especificación de logging de Bloom:

```
%LOCALAPPDATA%\BloomNucleus\logs\
└── metamorph\
    ├── metamorph_reconcile_20260213.log
    ├── metamorph_inspector_20260213.log
    └── metamorph_staging_20260213.log
```

Todos los streams se registran automáticamente en `telemetry.json` usando Nucleus CLI.

## 🎯 Estado del Proyecto

**Versión**: 1.0.0 (en desarrollo)  
**Estado**: Base Infrastructure Completada

### Completado ✅
- [x] Estructura del proyecto
- [x] Sistema de logging homologado
- [x] CLI framework
- [x] Help system
- [x] Build system
- [x] Path management
- [x] Telemetry registration

### En Desarrollo 🚧
- [ ] Binary Inspector
- [ ] State Builder
- [ ] Manifest Parser
- [ ] Reconciliation Engine
- [ ] Staging Manager
- [ ] Service Manager
- [ ] Rollback System

## 📋 Comandos Disponibles

| Comando | Descripción | Estado |
|---------|-------------|--------|
| `version` | Muestra versión y build info | ✅ |
| `info` | Información del sistema | ✅ |
| `status` | Estado actual del sistema | 🚧 |
| `inspect` | Inspeccionar binarios | 🚧 |
| `reconcile` | Reconciliar contra manifest | 🚧 |
| `generate-manifest` | Generar manifest | 🚧 |
| `rollback` | Rollback a snapshot | 🚧 |
| `cleanup` | Limpiar staging | 🚧 |

## 🔒 Seguridad

- Metamorph **NUNCA** valida firmas (responsabilidad de Nucleus)
- Solo acepta manifests ya validados
- Implementa rollback automático ante fallos
- Validación SHA256 de todos los artefactos
- Manejo seguro de servicios Windows

## 🤝 Contributing

Este proyecto sigue los estándares de código del ecosistema Bloom. Ver documentación completa en las guías maestras.

## 📄 License

Proprietary - Bloom Labs

---

**Metamorph v1.0.0** - System State Reconciler  
Built with ❤️ for the Bloom Ecosystem
