# test_env.py - Probar la configuración automática
from config import config, supabase, APP_ENV, get_current_info

print("=" * 60)
print("🔍 INFORMACIÓN DEL AMBIENTE")
print("=" * 60)

info = get_current_info()
print(f"🌍 Ambiente: {info['ambiente'].upper()}")
print(f"🔗 Supabase: {info['supabase_url']}")
print(f"🐛 Debug: {info['debug']}")

print("\n📋 Probando conexión a Supabase...")
try:
    response = supabase.table('rol').select('*').execute()
    print(f"✅ Conexión exitosa! {len(response.data)} roles encontrados")
    for rol in response.data:
        print(f"   - {rol['nombre_rol']}")
except Exception as e:
    print(f"❌ Error: {e}")

print("=" * 60)