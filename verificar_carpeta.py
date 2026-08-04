# verificar_carpeta.py
import os
import pickle
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Cargar credenciales
with open('backend/token.pickle', 'rb') as f:
    creds = pickle.load(f)

service = build('drive', 'v3', credentials=creds)

# Buscar la carpeta
results = service.files().list(
    q="mimeType='application/vnd.google-apps.folder' and name='TallerMecanico_Archivos'",
    fields='files(id, name, createdTime)',
    pageSize=5
).execute()

files = results.get('files', [])

if files:
    print("📁 Carpetas encontradas:")
    for folder in files:
        print(f"   • {folder.get('name')} - ID: {folder.get('id')}")
        print(f"     Creada: {folder.get('createdTime')}")
else:
    print("❌ No se encontró la carpeta 'TallerMecanico_Archivos'")
    print("💡 Ejecuta el script de creación de carpeta")