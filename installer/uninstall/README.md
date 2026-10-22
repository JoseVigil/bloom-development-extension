# Bloom Uninstall (Windows)

Fuente: `installer/uninstall/`. Destino acordado para el binario Windows: `installer/native/bin/win64/uninstall/bloom-uninstall.exe`; destino productivo previsto: `%LOCALAPPDATA%\BloomNucleus\bin\uninstall\bloom-uninstall.exe`. La integración con Build, Metamorph y el empaquetado de Setup corresponde a esos proyectos y queda pendiente de sus works respectivos.

## Versión

`VERSION` contiene la versión de producto (`1.0.0`) y se incorpora al binario Go. `scripts/build_number.txt` es el contador base y `scripts/build_number.{windows,linux,darwin}.txt` son los ajustes por plataforma; todos empiezan en cero. El build efectivo es base + ajuste. Build deberá incrementar la base una vez e inyectar `buildNumber`, `BuildDate` y `BuildTime` con `-ldflags` sobre `main.buildNumber`, `main.BuildDate` y `main.BuildTime`. Un `go build` directo informa build 0 y fecha/hora desconocidas. `bloom-uninstall.exe version` y `--version` consultan estos datos sin sistema de help ni acceso a la instalación.

Para compilar y probar localmente desde `installer/uninstall`: `go test ./...`; luego `go build -buildvcs=false -o bloom-uninstall.exe .` y `.\bloom-uninstall.exe --version`. `-buildvcs=false` evita que Go dependa del estado Git del checkout. La integración de Build deberá dirigir la salida al destino Windows acordado.

## Inventario de Setup

`installer/conductor/shared/global_paths.js` fija la raíz Windows en `%LOCALAPPDATA%\BloomNucleus`. `installer/conductor/setup/install/installer.js` crea `bin/`, `config/`, `profiles/`, `logs/`, `hooks/` y despliega componentes dentro de la raíz. `installer/conductor/setup/install/service-installer-{brain,nucleus,ollama,opencode}.js` registra `BloomBrainService`, `BloomNucleusService`, `BloomOllamaService` y `BloomOpencodeService` con NSSM. `service-installer-sensor.js` llama a Sensor, que crea `HKCU\...\Run\BloomSensor` (`installer/sensor/internal/startup/startup_windows.go`). `installer/conductor/setup/utils/repair-tools.js` puede registrar `com.bloom.nucleus.bridge` en HKLM o HKCU. `registry-scripts/hkcu.ps1` puede crear políticas de Chrome por ID de extensión; su `cleanup.ps1` borra claves compartidas y **no** se usa. Setup también puede instalar `bloom-extension.vsix` mediante VS Code; no conserva una constancia fiable del ID instalado.

El programa pide la ruta absoluta de un workspace y exige que su `.bloom` contenga una identidad Nucleus cuyo `rootPath` y `path` coincidan exactamente con ese workspace y su Nucleus. Rechaza redirecciones de ruta. Muestra el inventario y advierte que se perderán identidad local, recibos y Mandates; después exige `SI`. El worker vuelve a verificar el workspace antes de quitar `.bloom`. Los archivos del proyecto fuera de `.bloom` permanecen. La operación no es reversible: backup/restore de Nucleus es trabajo separado aún no implementado ni verificado.

Solo controla servicios cuya definición apunte a la raíz esperada y entradas de registro cuyos valores apunten a ella. Incluye `BloomSensor`/`BloomLauncher`, hosts nativos `com.bloom.*`, extensiones Chrome y políticas de extensión identificables por ruta. Las claves padre compartidas de Chrome no se borran. Para un test descartable, `BLOOM_UNINSTALL_TEST_ROOT` exige un archivo `.bloom-uninstall-test` en esa raíz; en ese modo no toca servicios ni registro. Fuera del test, requiere la raíz canónica de `%LOCALAPPDATA%`. El worker se ejecuta desde una copia en `%TEMP%` para borrar su propio directorio de instalación.

## Límites

No infiere identificadores Backend/D1. Tampoco borra perfiles globales de Chrome, extensiones globales de VS Code ni claves Chrome compartidas sin identificar con certeza el recurso Bloom. Un valor genérico como `ExtensionInstallSources= file:///*` no demuestra propiedad de Bloom y se conserva. No promete limpiar todas las entradas desconocidas de instalaciones históricas. Una instalación con procesos bloqueados o servicios no eliminables deja restos y devuelve error.

La limpieza externa de Backend/D1 requiere cuenta/proyecto/identificador D1 y comprobante de pertenencia a Bloom. No hay hoy una fuente confiable de esos identificadores en Setup, por lo que este binario no ofrece esa operación. Un Setup distribuido mediante NSIS puede haber creado su propia entrada de desinstalación y accesos directos fuera de `BloomNucleus`; son artefactos del empaquetador y deben retirarse con su desinstalador NSIS, no mediante borrado de claves inferidas.
