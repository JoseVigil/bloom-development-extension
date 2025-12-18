# Brain Commands - Inventario


## tree.py
```python
# Modo estándar (sin hashes, crea tree.txt del raiz)
python brain tree

# Genera estructura visual filtrada por carpetas/archivos específicos guardando en ruta personalizada con logs activos.
python -m brain --verbose tree -o tree/plugin_tree.txt src installer webview brain package.json tsconfig.json

# Añade cálculo de hashes MD5 (por archivo y global) al reporte para control de integridad y detección de cambios.
python -m brain --verbose tree --hash -o tree/plugin_tree_hashed.txt src installer webview brain package.json tsconfig.json
```

## compress.py
```python
# Código completo aquí
```