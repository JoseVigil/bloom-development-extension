import os

# Configuración de la estructura
structure = {
    "electron-app": [
        "main.js",
        "preload.js",
        "index.html",
        "assets"
    ],
    "native/bin": [
        "win32",
        "darwin", 
        "linux"
    ],
    "vscode-plugin": [
        "bloom-nucleus.vsix"
    ],
    "chrome-extension": [],
    "scripts": [],
    ".": [
        "package.json",
        "README.md"
    ]
}

# Crear la estructura
for folder, contents in structure.items():
    # Crear carpeta principal
    if folder != ".":
        os.makedirs(folder, exist_ok=True)
        print(f"📁 {folder}/")
    
    # Crear contenidos
    for item in contents:
        path = os.path.join(folder, item) if folder != "." else item
        
        if '.' in item:  # Es un archivo
            with open(path, 'w') as f:
                pass
            print(f"    📄 {item}")
        else:  # Es una carpeta
            os.makedirs(path, exist_ok=True)
            print(f"    📁 {item}/")

print("\n✅ Estructura creada exitosamente!")
