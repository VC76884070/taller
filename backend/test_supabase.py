from supabase import create_client

url = "https://yqppdsjmwozfffmtseha.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxcHBkc2ptd296ZmZmbXRzZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDExMjcsImV4cCI6MjA4ODk3NzEyN30.FhAG9P3AGpC_HT2mdsCM0VUHgMJPm9wNWnolP5sWxzg"  # Reemplaza con la clave completa

try:
    supabase = create_client(url, key)
    # Probar una consulta simple
    result = supabase.table('rol').select('*').limit(1).execute()
    print("✅ Conexión exitosa!")
    print("Datos:", result.data)
except Exception as e:
    print("❌ Error:", e)