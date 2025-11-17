import os
import sys

def build_tree(path, prefix="", is_last=True):
    name = os.path.basename(path.rstrip(os.sep))
    connector = "└── " if is_last else "├── "

    tree_str = prefix + connector + name
    if os.path.isdir(path):
        tree_str += "/"
    tree_str += "\n"

    if not os.path.isdir(path):
        return tree_str

    try:
        entries = sorted(os.listdir(path))
    except Exception:
        return tree_str

    new_prefix = prefix + ("    " if is_last else "│   ")

    for i, entry in enumerate(entries):
        full = os.path.join(path, entry)
        is_last_entry = (i == len(entries) - 1)
        tree_str += build_tree(full, new_prefix, is_last_entry)

    return tree_str


def generate_tree(output_file, paths):
    final_output = ""

    # Solo el nombre del directorio actual
    root = os.path.basename(os.getcwd())
    final_output += root + "/\n"

    for i, p in enumerate(paths):
        is_last = (i == len(paths) - 1)
        final_output += build_tree(p, prefix="", is_last=is_last)

    # Limpia dobles saltos (si existiera alguno)
    final_output = "\n".join([line for line in final_output.split("\n")])

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(final_output)

    print(f"Archivo generado: {output_file}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python tree_custom.py <archivo_salida.txt> <ruta1> <ruta2> ...")
        sys.exit(1)

    output_file = sys.argv[1]
    paths = sys.argv[2:]

    generate_tree(output_file, paths)
