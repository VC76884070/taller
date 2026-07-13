import os
from datetime import datetime

# ==========================================
# CONFIGURACIÓN
# ==========================================

PROYECTO = os.path.abspath(os.path.dirname(__file__))
ARCHIVO_SALIDA = "estructura_completa.txt"

CARPETAS_IGNORAR = {
    "__pycache__",
    ".git",
    ".github",
    ".idea",
    ".vscode",
    "venv",
    ".venv",
    "env",
    "node_modules",
    ".pytest_cache",
    ".mypy_cache",
    "dist",
    "build"
}

ARCHIVOS_IGNORAR = {
    ".DS_Store",
    "Thumbs.db"
}

ICONOS = {
    ".py": "🐍",
    ".html": "🌐",
    ".css": "🎨",
    ".js": "📜",
    ".txt": "📄",
    ".md": "📘",
    ".json": "📦",
    ".png": "🖼️",
    ".jpg": "🖼️",
    ".jpeg": "🖼️",
    ".gif": "🖼️",
    ".svg": "🖼️",
    ".ico": "🖼️",
    ".pdf": "📕",
    ".sql": "🗄️",
    ".db": "🗄️",
    ".env": "⚙️",
    ".yml": "⚙️",
    ".yaml": "⚙️",
    ".xml": "📄",
    ".csv": "📊",
    ".xlsx": "📊",
    ".docx": "📄",
    ".zip": "🗜️",
    ".rar": "🗜️",
    ".exe": "⚙️"
}

CONTADORES = {
    "carpetas": 0,
    "python": 0,
    "html": 0,
    "css": 0,
    "js": 0,
    "imagenes": 0,
    "otros": 0
}


# ==========================================
# ICONO SEGÚN EXTENSIÓN
# ==========================================

def obtener_icono(nombre):
    ext = os.path.splitext(nombre)[1].lower()
    return ICONOS.get(ext, "📄")


# ==========================================
# CONTADORES
# ==========================================

def contar_archivo(nombre):
    ext = os.path.splitext(nombre)[1].lower()

    if ext == ".py":
        CONTADORES["python"] += 1
    elif ext == ".html":
        CONTADORES["html"] += 1
    elif ext == ".css":
        CONTADORES["css"] += 1
    elif ext == ".js":
        CONTADORES["js"] += 1
    elif ext in [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico"]:
        CONTADORES["imagenes"] += 1
    else:
        CONTADORES["otros"] += 1


# ==========================================
# ÁRBOL
# ==========================================

def generar_arbol(ruta, prefijo=""):
    lineas = []

    elementos = [
        e for e in os.listdir(ruta)
        if e not in CARPETAS_IGNORAR
        and e not in ARCHIVOS_IGNORAR
    ]

    carpetas = []
    archivos = []

    for e in elementos:
        ruta_completa = os.path.join(ruta, e)

        if os.path.isdir(ruta_completa):
            carpetas.append(e)
        else:
            archivos.append(e)

    carpetas.sort(key=str.lower)
    archivos.sort(key=str.lower)

    elementos = carpetas + archivos

    for i, elemento in enumerate(elementos):
        ruta_completa = os.path.join(ruta, elemento)

        ultimo = i == len(elementos) - 1

        rama = "└── " if ultimo else "├── "

        if os.path.isdir(ruta_completa):

            CONTADORES["carpetas"] += 1

            lineas.append(f"{prefijo}{rama}📁 {elemento}/")

            extension = "    " if ultimo else "│   "

            lineas.extend(
                generar_arbol(
                    ruta_completa,
                    prefijo + extension
                )
            )

        else:

            contar_archivo(elemento)

            icono = obtener_icono(elemento)

            lineas.append(
                f"{prefijo}{rama}{icono} {elemento}"
            )

    return lineas


# ==========================================
# GENERAR
# ==========================================

def generar():

    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lineas = []

    lineas.append("=" * 80)
    lineas.append("📊 ESTRUCTURA DEL PROYECTO FLASK")
    lineas.append("=" * 80)
    lineas.append(f"📅 Generado: {ahora}")
    lineas.append(f"📍 Ruta: {PROYECTO}")
    lineas.append("🐍 Framework: Flask")
    lineas.append("=" * 80)
    lineas.append("")

    nombre_raiz = os.path.basename(PROYECTO)

    lineas.append(f"📁 {nombre_raiz}/")

    lineas.extend(generar_arbol(PROYECTO))

    lineas.append("")
    lineas.append("=" * 80)
    lineas.append("📈 ESTADÍSTICAS")
    lineas.append("=" * 80)

    lineas.append(f"📁 Carpetas : {CONTADORES['carpetas']}")
    lineas.append(f"🐍 Python   : {CONTADORES['python']}")
    lineas.append(f"🌐 HTML     : {CONTADORES['html']}")
    lineas.append(f"🎨 CSS      : {CONTADORES['css']}")
    lineas.append(f"📜 JS       : {CONTADORES['js']}")
    lineas.append(f"🖼️ Imágenes : {CONTADORES['imagenes']}")
    lineas.append(f"📄 Otros    : {CONTADORES['otros']}")

    with open(
        os.path.join(PROYECTO, ARCHIVO_SALIDA),
        "w",
        encoding="utf-8"
    ) as f:
        f.write("\n".join(lineas))

    print("=" * 60)
    print("✅ estructura_completa.txt generado correctamente")
    print("=" * 60)


# ==========================================

if __name__ == "__main__":
    generar()