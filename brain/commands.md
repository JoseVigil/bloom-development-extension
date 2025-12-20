# Brain Commands - Inventario

# Activa el modo debug (logs detallados de lo que hace el core)
```python
python -m brain --verbose [comando]
```

# Activa el modo máquina (Salida JSON estricta, sin emojis ni texto plano)
```python
python -m brain --json [comando]
```

## tree
```python
# Modo estándar (sin hashes, crea tree.txt del raiz)
python brain tree

# Genera estructura visual filtrada por carpetas/archivos específicos guardando en ruta personalizada con logs activos.
python -m brain filesystem tree src installer webview brain package.json tsconfig.json -o tree/plugin_tree.txt

# Añade cálculo de hashes MD5 (por archivo y global) al reporte para control de integridad y detección de cambios.
python -m brain --verbose tree --hash -o tree/plugin_tree_hashed.txt src installer webview brain core package.json tsconfig.json
```

## nucleus

# Crear estructura básica en la carpeta actual (output default: .bloom)
```python
# Crear (Subcomando explícito)
python -m brain nucleus create --org "Bloom"

# Verificar estado
python -m brain nucleus status
```

# Crear en una carpeta específica con nombre personalizado
```python
# --path: Dónde ubicarlo | --output: Nombre de la carpeta
python -m brain nucleus --org "Acme Inc" --path "D:\Proyectos" --output documentation-v1

# Crear con URL de organización (para metadatos)
python -m brain --verbose nucleus --org "My Startup" --url "https://github.com/start"

# Crear un proyecto de prueba
python -m brain --verbose nucleus --org "Bloom Corp" --output bloom-nucleus-test

# --path define la carpeta padre
# --output define el nombre de la carpeta nueva
python -m brain nucleus --org "Acme" --path "D:\Backups\2024" --output nucleus-v1
```

## project

```python
# Auto-detectar stack y generar contexto en .bloom/
python -m brain context

# Analizar un proyecto en otra ruta
python -m brain context --path ../legacy-app

# Forzar una estrategia específica (ignorando detección automática)
# Útil para proyectos que no siguen estructuras estándar
python -m brain context --strategy android --output .bloom-mobile

# Modo integración (VS Code): Generar silenciosamente y reportar en JSON
python -m brain --json context --path .
# Inspeccionar el proyecto en el directorio actual
python -m brain load

# Inspeccionar un proyecto en una ruta específica
python -m brain load --path "C:\Repos\mi-app-react"

# Modo VS Code: Obtener identidad del proyecto en JSON
python -m brain --json load --path ./backend-api
```




🛠️ Resumen de Argumentos Comunes
Argumento	Alias	Descripción
--path	-p	Ruta raíz del proyecto a analizar/modificar.
--output	-o	Nombre de la carpeta o archivo de salida.
--strategy	-s	Fuerza una tecnología específica (android, python, etc.).
--json	N/A	(Global) Forza salida JSON pura en stdout.
--verbose	N/A	(Global) Muestra logs de depuración en stderr.