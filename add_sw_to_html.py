# add_sw_to_html.py - Agrega el script del Service Worker a todos los HTML
import os
from pathlib import Path

def add_sw_to_html():
    """Agrega el script del Service Worker a todos los HTML"""
    
    # Directorios a procesar
    directories = [
        'cliente',
        'encargado_rep_almacen',
        'jefe_operativo',
        'jefe_taller',
        'tecnico_mecanico',
        'login'
    ]
    
    modified = 0
    skipped = 0
    
    for directory in directories:
        if not Path(directory).exists():
            print(f"⚠️ Directorio no encontrado: {directory}")
            continue
        
        for html_file in Path(directory).rglob('*.html'):
            try:
                with open(html_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Verificar si ya tiene el script
                if 'register_sw.js' in content:
                    print(f"⏭️ Ya tiene SW: {html_file}")
                    skipped += 1
                    continue
                
                # Agregar antes de </body>
                if '</body>' in content:
                    new_content = content.replace(
                        '</body>',
                        '    <script src="/register_sw.js"></script>\n</body>'
                    )
                else:
                    print(f"⚠️ No se encontró </body> en: {html_file}")
                    continue
                
                with open(html_file, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                
                print(f"✅ Actualizado: {html_file}")
                modified += 1
                
            except Exception as e:
                print(f"❌ Error en {html_file}: {e}")
    
    print(f"\n📊 Resumen:")
    print(f"   ✅ Modificados: {modified}")
    print(f"   ⏭️ Ya tenían SW: {skipped}")

if __name__ == "__main__":
    print("🔧 Agregando Service Worker a todos los HTML...")
    add_sw_to_html()