# =====================================================
# GOOGLE DRIVE - CON OAUTH 2.0 (CUENTA PERSONAL)
# VERSIÓN CORREGIDA CON REINTENTOS Y TIMEOUTS
# =====================================================

import os
import io
import pickle
import mimetypes
import time
import socket
from datetime import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from googleapiclient.errors import HttpError
from flask import current_app
import logging

logger = logging.getLogger(__name__)

# =====================================================
# CONFIGURACIÓN
# =====================================================
MAX_RETRIES = 3
RETRY_DELAY = 2  # segundos entre reintentos
UPLOAD_TIMEOUT = 120  # segundos

# =====================================================
# CLASE PRINCIPAL
# =====================================================

class GoogleDriveService:
    """
    Servicio para interactuar con Google Drive
    Usa OAuth 2.0 con cuenta personal Gmail
    """
    
    def __init__(self, app=None):
        self.service = None
        self.folder_id = None
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """
        Inicializa el servicio con la configuración de la app Flask
        """
        try:
            creds_file = app.config.get('GOOGLE_DRIVE_CREDENTIALS_FILE')
            self.folder_id = app.config.get('GOOGLE_DRIVE_FOLDER_ID')
            
            if not creds_file:
                raise ValueError("GOOGLE_DRIVE_CREDENTIALS_FILE no configurado")
            
            if not os.path.exists(creds_file):
                raise FileNotFoundError(f"Archivo de credenciales no encontrado: {creds_file}")
            
            if not self.folder_id:
                raise ValueError("GOOGLE_DRIVE_FOLDER_ID no configurado")
            
            # =============================================
            # AUTENTICACIÓN CON OAUTH 2.0
            # =============================================
            SCOPES = ['https://www.googleapis.com/auth/drive.file']
            
            creds = None
            token_file = 'token.pickle'
            
            # Cargar token guardado (si existe)
            if os.path.exists(token_file):
                with open(token_file, 'rb') as token:
                    creds = pickle.load(token)
                logger.info("✅ Token OAuth 2.0 cargado desde archivo")
            
            # Si no hay token válido, iniciar flujo OAuth
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    logger.info("🔄 Token expirado, refrescando...")
                    creds.refresh(Request())
                else:
                    logger.info("🔐 Iniciando flujo OAuth 2.0...")
                    flow = InstalledAppFlow.from_client_secrets_file(
                        creds_file, SCOPES
                    )
                    creds = flow.run_local_server(port=0)
                
                # Guardar token para próximas veces
                with open(token_file, 'wb') as token:
                    pickle.dump(creds, token)
                logger.info(f"💾 Token guardado en {token_file}")
            
            self.service = build('drive', 'v3', credentials=creds)
            
            # Verificar carpeta
            self._verify_folder_access()
            
            logger.info(f"✅ Google Drive inicializado correctamente (OAuth 2.0)")
            logger.info(f"📁 Carpeta ID: {self.folder_id}")
            
        except Exception as e:
            logger.error(f"❌ Error inicializando Google Drive: {str(e)}")
            raise
    
    def _verify_folder_access(self):
        """
        Verifica que la carpeta existe y es accesible
        """
        try:
            folder = self.service.files().get(
                fileId=self.folder_id,
                fields='id, name, mimeType'
            ).execute()
            
            if folder.get('mimeType') != 'application/vnd.google-apps.folder':
                raise ValueError(f"El ID {self.folder_id} no corresponde a una carpeta")
            
            logger.info(f"📁 Carpeta verificada: {folder.get('name')}")
            
        except HttpError as e:
            if e.resp.status == 404:
                raise ValueError(f"Carpeta no encontrada: {self.folder_id}")
            elif e.resp.status == 403:
                raise ValueError(f"Sin permisos para acceder a la carpeta: {self.folder_id}")
            else:
                raise
    
    # =====================================================
    # FUNCIÓN PARA SUBIR ARCHIVOS CON REINTENTOS
    # =====================================================
    
    def upload_file(self, file_data, filename, folder_path=None, mime_type=None, 
                    public=True, share_email=None):
        """
        Sube un archivo a Google Drive con reintentos automáticos
        
        Args:
            file_data: bytes, file object o ruta de archivo
            filename: nombre del archivo
            folder_path: ruta de carpetas
            mime_type: tipo MIME (opcional)
            public: si es True, el archivo será público
            share_email: email para compartir específicamente (opcional)
        
        Returns:
            dict: { id, url, web_view_link, filename, folder_path }
        """
        # Configurar timeout de socket
        socket.setdefaulttimeout(UPLOAD_TIMEOUT)
        
        last_error = None
        
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                logger.info(f"📤 Intento {attempt}/{MAX_RETRIES} - Subiendo {filename}")
                
                # Determinar MIME type
                if not mime_type:
                    mime_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
                
                # Crear metadata
                file_metadata = {
                    'name': filename,
                    'parents': [self.folder_id]
                }
                
                # Si hay carpeta específica, crear o usar la ruta
                if folder_path:
                    folder_id = self._get_or_create_folder(folder_path)
                    file_metadata['parents'] = [folder_id]
                
                # =============================================
                # CORRECCIÓN: Manejar diferentes tipos de entrada
                # =============================================
                if isinstance(file_data, bytes):
                    media = MediaIoBaseUpload(io.BytesIO(file_data), mimetype=mime_type, resumable=True)
                elif hasattr(file_data, 'read'):
                    # Es un objeto de archivo (FileStorage de Flask)
                    file_data.seek(0)
                    media = MediaIoBaseUpload(file_data, mimetype=mime_type, resumable=True)
                elif isinstance(file_data, str):
                    # Es una ruta de archivo o URL
                    with open(file_data, 'rb') as f:
                        file_content = f.read()
                    media = MediaIoBaseUpload(io.BytesIO(file_content), mimetype=mime_type, resumable=True)
                else:
                    raise ValueError(f"Tipo de archivo no soportado: {type(file_data)}")
                
                # Subir archivo
                file = self.service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id, webViewLink, name, mimeType, parents'
                ).execute()
                
                file_id = file.get('id')
                
                # Hacer público si se solicita
                if public:
                    self._set_file_public(file_id)
                
                # Compartir con email específico si se solicita
                if share_email:
                    self._share_file_with_email(file_id, share_email)
                
                # Construir URL de visualización
                url = f"https://drive.google.com/uc?export=view&id={file_id}"
                
                logger.info(f"✅ Archivo subido: {filename} -> {file_id}")
                
                return {
                    'id': file_id,
                    'url': url,
                    'web_view_link': file.get('webViewLink'),
                    'filename': filename,
                    'folder_path': folder_path,
                    'mime_type': mime_type
                }
                
            except (HttpError, socket.timeout, ConnectionError, TimeoutError) as e:
                last_error = e
                logger.warning(f"⚠️ Intento {attempt} falló: {str(e)}")
                
                if attempt < MAX_RETRIES:
                    wait_time = RETRY_DELAY * attempt
                    logger.info(f"⏳ Esperando {wait_time}s antes de reintentar...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"❌ Todos los intentos fallaron para {filename}")
                    raise
        
        # Si llegamos aquí, todos los intentos fallaron
        raise last_error or Exception("Error desconocido al subir archivo")
    
    # =====================================================
    # FUNCIONES PARA MANEJAR CARPETAS
    # =====================================================
    
    def _get_or_create_folder(self, folder_path):
        """
        Obtiene o crea una carpeta por ruta con reintentos
        """
        last_error = None
        
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                current_parent = self.folder_id
                
                for folder_name in folder_path.split('/'):
                    if not folder_name:
                        continue
                    
                    # Buscar si la carpeta ya existe
                    query = (
                        f"name='{self._escape_string(folder_name)}' and "
                        f"mimeType='application/vnd.google-apps.folder' and "
                        f"'{current_parent}' in parents and trashed=false"
                    )
                    
                    results = self.service.files().list(
                        q=query,
                        fields="files(id, name)",
                        pageSize=1
                    ).execute()
                    
                    files = results.get('files', [])
                    
                    if files:
                        folder_id = files[0]['id']
                    else:
                        # Crear carpeta
                        folder_metadata = {
                            'name': folder_name,
                            'mimeType': 'application/vnd.google-apps.folder',
                            'parents': [current_parent]
                        }
                        folder = self.service.files().create(
                            body=folder_metadata,
                            fields='id'
                        ).execute()
                        folder_id = folder.get('id')
                        logger.debug(f"📁 Carpeta creada: {folder_name} -> {folder_id}")
                    
                    current_parent = folder_id
                
                return current_parent
                
            except (HttpError, socket.timeout, ConnectionError) as e:
                last_error = e
                logger.warning(f"⚠️ Error creando carpeta (intento {attempt}): {str(e)}")
                
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY * attempt)
                else:
                    raise
        
        raise last_error or Exception("Error creando carpetas")
    
    def _escape_string(self, value):
        """Escapa caracteres especiales para query de Google Drive"""
        value = value.replace("'", "\\'")
        value = value.replace('"', '\\"')
        return value
    
    # =====================================================
    # FUNCIONES PARA COMPARTIR
    # =====================================================
    
    def _set_file_public(self, file_id):
        """Hace un archivo público"""
        try:
            permission = {
                'type': 'anyone',
                'role': 'reader'
            }
            self.service.permissions().create(
                fileId=file_id,
                body=permission
            ).execute()
            logger.debug(f"🔓 Archivo hecho público: {file_id}")
        except HttpError as e:
            logger.warning(f"⚠️ No se pudo hacer público el archivo {file_id}: {str(e)}")
    
    def _share_file_with_email(self, file_id, email):
        """Comparte un archivo con un email específico"""
        try:
            permission = {
                'type': 'user',
                'role': 'reader',
                'emailAddress': email
            }
            self.service.permissions().create(
                fileId=file_id,
                body=permission,
                sendNotificationEmail=False
            ).execute()
            logger.debug(f"📧 Archivo compartido con: {email}")
        except HttpError as e:
            logger.warning(f"⚠️ No se pudo compartir el archivo con {email}: {str(e)}")
    
    # =====================================================
    # FUNCIONES PARA ELIMINAR ARCHIVOS
    # =====================================================
    
    def delete_file(self, file_id):
        """Elimina un archivo de Google Drive"""
        try:
            self.service.files().delete(fileId=file_id).execute()
            logger.info(f"🗑️ Archivo eliminado: {file_id}")
            return True
        except HttpError as e:
            logger.error(f"❌ Error eliminando archivo {file_id}: {str(e)}")
            return False
    
    def delete_file_by_url(self, url):
        """Elimina un archivo usando su URL"""
        file_id = self.extract_file_id_from_url(url)
        if not file_id:
            return False
        return self.delete_file(file_id)
    
    # =====================================================
    # FUNCIONES PARA GENERAR RUTAS
    # =====================================================
    
    def generate_folder_path(self, modulo, referencia_id=None, fecha=None, 
                             subcarpeta=None, tipo=None):
        """
        Genera una ruta de carpeta consistente
        """
        if not fecha:
            fecha = datetime.now()
        
        año = fecha.strftime('%Y')
        mes = fecha.strftime('%m')
        dia = fecha.strftime('%d')
        
        path_parts = [modulo, año, mes, dia]
        
        if referencia_id:
            if isinstance(referencia_id, int):
                if modulo in ['recepcion', 'diagnostico', 'avance']:
                    path_parts.append(f"orden_{referencia_id}")
                elif modulo == 'compras':
                    path_parts.append(f"compra_{referencia_id}")
                else:
                    path_parts.append(f"ref_{referencia_id}")
            else:
                path_parts.append(referencia_id)
        
        if subcarpeta:
            path_parts.append(subcarpeta)
        
        if tipo:
            tipo_map = {
                'imagen': 'imagenes',
                'audio': 'audios',
                'pdf': 'documentos',
                'video': 'videos'
            }
            path_parts.append(tipo_map.get(tipo, tipo))
        
        return '/'.join(path_parts)
    
    # =====================================================
    # FUNCIONES DE UTILIDAD
    # =====================================================
    
    @staticmethod
    def extract_file_id_from_url(url):
        """Extrae el ID de un archivo de Google Drive desde su URL"""
        if not url:
            return None
        
        if 'id=' in url:
            return url.split('id=')[-1].split('&')[0]
        
        if '/d/' in url:
            parts = url.split('/d/')
            if len(parts) > 1:
                return parts[1].split('/')[0]
        
        if 'open?id=' in url:
            return url.split('open?id=')[-1].split('&')[0]
        
        return None

# =====================================================
# INSTANCIA GLOBAL
# =====================================================

google_drive = GoogleDriveService()

def init_google_drive(app):
    """Función para inicializar desde app.py"""
    google_drive.init_app(app)
    return google_drive