import os
import sys

def create_file(path, content=""):
    """Crea un archivo con el contenido especificado"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Creado: {path}")

def create_structure():
    """Crea la estructura completa del proyecto"""
    base_dir = "nucleus"
    
    # Archivos raíz
    create_file(f"{base_dir}/VERSION")
    create_file(f"{base_dir}/build_number.txt")
    create_file(f"{base_dir}/go.mod")
    
    # scripts/
    create_file(f"{base_dir}/scripts/build.bat")
    
    # cmd/nucleus/main.go
    create_file(f"{base_dir}/cmd/nucleus/main.go")
    
    # internal/cli/
    create_file(f"{base_dir}/internal/cli/config.go")
    create_file(f"{base_dir}/internal/cli/help_renderer.go")
    
    # internal/core/
    create_file(f"{base_dir}/internal/core/core.go")
    create_file(f"{base_dir}/internal/core/registry.go")
    create_file(f"{base_dir}/internal/core/version.go")
    create_file(f"{base_dir}/internal/core/metadata.go")
    create_file(f"{base_dir}/internal/core/build_info.go")
    
    # internal/governance/
    create_file(f"{base_dir}/internal/governance/roles.go")
    
    # internal/commands/system/
    create_file(f"{base_dir}/internal/commands/system/version.go")
    create_file(f"{base_dir}/internal/commands/system/info.go")

def main():
    """Función principal"""
    print("Creando estructura del proyecto nucleus...")
    
    try:
        create_structure()
        print("\nEstructura creada exitosamente en: nucleus/")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()