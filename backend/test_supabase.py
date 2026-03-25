# test_connection.py
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

url = "https://yqppdsjmwozfffmtseha.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxcHBkc2ptd296ZmZmbXRzZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDExMjcsImV4cCI6MjA4ODk3NzEyN30.FhAG9P3AGpC_HT2mdsCM0VUHgMJPm9wNWnolP5sWxzg"

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}"
}

# Configurar sesión con reintentos
session = requests.Session()
retry_strategy = Retry(
    total=3,
    backoff_factor=1,
    status_forcelist=[429, 500, 502, 503, 504],
)
adapter = HTTPAdapter(max_retries=retry_strategy)
session.mount("https://", adapter)

print("Probando diferentes configuraciones...")

# Prueba 1: Sin timeout
try:
    print("\n1. Sin timeout...")
    response = session.get(f"{url}/rest/v1/rol", headers=headers, timeout=None)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✅ Éxito!")
        print(f"   Datos: {response.text[:200]}")
    elif response.status_code == 401:
        print("   ⚠️ Error de autenticación - la clave podría ser incorrecta")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Prueba 2: Con timeout muy alto
try:
    print("\n2. Con timeout de 60 segundos...")
    response = session.get(f"{url}/rest/v1/rol", headers=headers, timeout=60)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✅ Éxito!")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Prueba 3: Usando solo la URL base
try:
    print("\n3. Probando URL base...")
    response = session.get(url, timeout=10)
    print(f"   Status: {response.status_code}")
    if response.status_code == 404:
        print("   ✅ URL base accesible (404 es normal)")
except Exception as e:
    print(f"   ❌ Error: {e}")