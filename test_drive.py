# test_drive.py
import os
import pickle
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# === CONFIGURACIÓN ===
creds_file = "backend/credentials/oauth-credentials.json"
SCOPES = ['https://www.googleapis.com/auth/drive.file']

# === AUTENTICACIÓN CON OAUTH 2.0 ===
creds = None
token_file = 'backend/token.pickle'

# Cargar token guardado
if os.path.exists(token_file):
    with open(token_file, 'rb') as token:
        creds = pickle.load(token)

# Si no hay token válido, iniciar flujo OAuth
if not creds or not creds.valid:
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        flow = InstalledAppFlow.from_client_secrets_file(creds_file, SCOPES)
        creds = flow.run_local_server(port=0)
    
    # Guardar token para próximas veces
    with open(token_file, 'wb') as token:
        pickle.dump(creds, token)

service = build('drive', 'v3', credentials=creds)

print("🔑 Autenticado correctamente con OAuth 2.0.")

# === CREAR CARPETA ===
try:
    folder_metadata = {
        'name': 'TallerMecanico_Archivos',
        'mimeType': 'application/vnd.google-apps.folder'
    }
    folder = service.files().create(body=folder_metadata, fields='id').execute()
    folder_id = folder.get('id')
    
    print(f"✅ Carpeta CREADA por la cuenta de servicio.")
    print(f"📁 ID de la carpeta: {folder_id}")
    print(f"🔗 URL: https://drive.google.com/drive/folders/{folder_id}")
    print("\n🎯 ¡YA ESTÁ! Ahora actualiza tu .env con este ID.")
    print(f"GOOGLE_DRIVE_FOLDER_ID={folder_id}")

except HttpError as error:
    print(f"❌ Error al crear la carpeta: {error}")