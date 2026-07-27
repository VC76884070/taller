# =====================================================
# GOOGLE DRIVE - CON OAUTH 2.0 VÍA VARIABLES DE ENTORNO
# ESTRUCTURA: {codigo_orden}/{modulo}/{subcarpeta}
# VERSIÓN COMPLETA CON SOPORTE PARA COTIZACIONES
# =====================================================

import os
import io
import pickle
import mimetypes
import time
import socket
import ssl
import re
import tempfile
from datetime import datetime
from pathlib import Path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from googleapiclient.errors import HttpError
from flask import current_app
import logging
import torch

logger = logging.getLogger(__name__)

# =====================================================
# WHISPER - TRANSCRIPCIÓN DE AUDIO (OPTIMIZADO PARA RENDER)
# =====================================================
try:
    import whisper
    import requests as http_requests
    WHISPER_AVAILABLE = True
    logger.info("✅ Whisper importado correctamente")
except ImportError as e:
    logger.warning(f"⚠️ Whisper no disponible: {e}. Instalar con: pip install openai-whisper")
    WHISPER_AVAILABLE = False

# =====================================================
# DESACTIVAR SSL PARA PRUEBAS (OPCIONAL)
# =====================================================
ssl._create_default_https_context = ssl._create_unverified_context

# =====================================================
# CONFIGURACIÓN
# =====================================================
MAX_RETRIES = 3
RETRY_DELAY = 2
UPLOAD_TIMEOUT = 120

# =====================================================
# CONFIGURACIÓN DE WHISPER - OPTIMIZADA PARA RENDER
# =====================================================
CACHE_DIR = os.getenv('WHISPER_CACHE_DIR', '/app/.cache/whisper')
os.makedirs(CACHE_DIR, exist_ok=True)

os.environ['XDG_CACHE_HOME'] = '/app/.cache'

WHISPER_MODEL = os.getenv('WHISPER_MODEL', 'tiny')
WHISPER_LANGUAGE = os.getenv('WHISPER_LANGUAGE', 'es')
WHISPER_USE_FP16 = os.getenv('WHISPER_USE_FP16', 'true').lower() == 'true'
WHISPER_DEVICE = os.getenv('WHISPER_DEVICE', 'cpu')

_whisper_model = None
_whisper_model_loaded = False
_whisper_load_error = None

logger.info(f"🎙️ Configuración Whisper:")
logger.info(f"   📁 Caché: {CACHE_DIR}")
logger.info(f"   📦 Modelo: {WHISPER_MODEL}")
logger.info(f"   🔢 FP16: {WHISPER_USE_FP16}")
logger.info(f"   💻 Dispositivo: {WHISPER_DEVICE}")


def get_whisper_model():
    """Carga el modelo Whisper UNA SOLA VEZ y lo mantiene en memoria."""
    global _whisper_model, _whisper_model_loaded, _whisper_load_error
    
    if not WHISPER_AVAILABLE:
        logger.warning("⚠️ Whisper no está disponible")
        return None
    
    if _whisper_model_loaded and _whisper_model is not None:
        logger.debug("🎙️ Modelo Whisper ya cargado, reutilizando...")
        return _whisper_model
    
    if _whisper_load_error:
        logger.warning(f"⚠️ Modelo Whisper falló previamente: {_whisper_load_error}")
        return None
    
    try:
        logger.info(f"🎙️ Cargando modelo Whisper '{WHISPER_MODEL}' por primera vez...")
        logger.info(f"   📁 Desde caché: {CACHE_DIR}")
        logger.info(f"   🔢 FP16: {WHISPER_USE_FP16}")
        logger.info(f"   💻 Dispositivo: {WHISPER_DEVICE}")
        
        _whisper_model = whisper.load_model(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            download_root=CACHE_DIR
        )
        
        if WHISPER_USE_FP16:
            try:
                _whisper_model = _whisper_model.half()
                logger.info("✅ Modelo convertido a FP16 (mitad de memoria)")
            except Exception as e:
                logger.warning(f"⚠️ No se pudo convertir a FP16: {e}")
        
        _whisper_model_loaded = True
        _whisper_load_error = None
        
        try:
            if WHISPER_DEVICE == 'cuda' and torch.cuda.is_available():
                mem = torch.cuda.memory_allocated() / (1024**3)
                logger.info(f"💾 Memoria GPU usada: {mem:.2f} GB")
            else:
                logger.info(f"💾 Modelo cargado en CPU (memoria: ~150-200 MB)")
        except:
            pass
        
        logger.info(f"✅ Modelo Whisper '{WHISPER_MODEL}' listo para usar")
        return _whisper_model
        
    except Exception as e:
        _whisper_load_error = str(e)
        logger.error(f"❌ Error cargando modelo Whisper: {str(e)}")
        return None


def limpiar_modelo_whisper():
    """Libera el modelo de memoria si es necesario"""
    global _whisper_model, _whisper_model_loaded
    if _whisper_model is not None:
        try:
            del _whisper_model
            if WHISPER_DEVICE == 'cuda':
                torch.cuda.empty_cache()
            _whisper_model = None
            _whisper_model_loaded = False
            logger.info("🧹 Modelo Whisper liberado de memoria")
        except:
            pass


# =====================================================
# CONSTANTES PARA MÓDULOS DE COTIZACIONES
# =====================================================

SUBMODULOS_COTIZACION = {
    'SOLICITUD_COTIZACION': 'SOLICITUD_COTIZACION',
    'COTIZACION_CLIENTE': 'COTIZACION_CLIENTE',
    'SOLICITUD_COMPRA': 'SOLICITUD_COMPRA',
}

TIPOS_ARCHIVO_COTIZACION = {
    # Para SOLICITUD_COTIZACION
    'foto_item': 'fotos',
    'foto_repuesto': 'fotos',
    'imagen_item': 'fotos',
    'fotos': 'fotos',
    'imagenes': 'fotos',
    
    # Para COTIZACION_CLIENTE
    'cotizacion_pdf': 'documentos',
    'cotizacion_word': 'documentos',
    'documentos': 'documentos',
    'pdf': 'documentos',
    'word': 'documentos',
    
    # Para SOLICITUD_COMPRA
    'comprobante': 'comprobantes',
    'factura': 'comprobantes',
    'foto_compra': 'fotos',
    'documento_compra': 'documentos',
    'comprobantes': 'comprobantes',
}

TIPOS_ARCHIVO_GENERAL = {
    'imagen': 'fotos',
    'imagenes': 'fotos',
    'audio': 'audios',
    'audios': 'audios',
    'pdf': 'documentos',
    'documento': 'documentos',
    'documentos': 'documentos',
    'video': 'videos',
    'videos': 'videos'
}


# =====================================================
# CLASE PRINCIPAL
# =====================================================

class GoogleDriveService:
    """
    Servicio para interactuar con Google Drive
    Usa OAuth 2.0 con variables de entorno
    INCLUYE RENOVACIÓN AUTOMÁTICA DE TOKENS
    Y TRANSCRIPCIÓN DE AUDIO CON WHISPER
    """
    
    def __init__(self, app=None):
        self.service = None
        self.folder_id = None
        self._creds = None
        self._token_file = Path(__file__).parent / 'token.pickle'
        if app:
            self.init_app(app)
    
    # =====================================================
    # GESTIÓN DE TOKENS
    # =====================================================
    
    def _ensure_valid_token(self):
        """Verifica y renueva el token si es necesario"""
        try:
            if not self._creds:
                logger.warning("⚠️ No hay credenciales, recargando...")
                self._reload_credentials()
                return
            
            if self._creds.expired and self._creds.refresh_token:
                logger.info("🔄 Token expirado, renovando automáticamente...")
                try:
                    self._creds.refresh(Request())
                    self._save_token()
                    logger.info("✅ Token renovado exitosamente")
                    self.service = build('drive', 'v3', credentials=self._creds)
                except Exception as e:
                    logger.error(f"❌ Error renovando token: {str(e)}")
                    self._reload_credentials()
            
            if self._creds and hasattr(self._creds, 'expiry') and self._creds.expiry:
                tiempo_restante = (self._creds.expiry - datetime.now()).total_seconds()
                if tiempo_restante < 300:
                    logger.info(f"⏰ Token expira en {tiempo_restante:.0f} segundos, renovando preventivamente...")
                    try:
                        self._creds.refresh(Request())
                        self._save_token()
                        self.service = build('drive', 'v3', credentials=self._creds)
                        logger.info("✅ Token renovado preventivamente")
                    except Exception as e:
                        logger.warning(f"⚠️ No se pudo renovar preventivamente: {str(e)}")
            
        except Exception as e:
            logger.error(f"❌ Error verificando token: {str(e)}")
            self._reload_credentials()
    
    def _reload_credentials(self):
        """Recarga credenciales desde variables de entorno"""
        try:
            logger.info("🔄 Recargando credenciales desde variables de entorno...")
            
            token = os.getenv('GOOGLE_DRIVE_TOKEN')
            refresh_token = os.getenv('GOOGLE_DRIVE_REFRESH_TOKEN')
            client_id = os.getenv('GOOGLE_DRIVE_CLIENT_ID')
            client_secret = os.getenv('GOOGLE_DRIVE_CLIENT_SECRET')
            
            if not all([token, refresh_token, client_id, client_secret]):
                missing = []
                if not token: missing.append('GOOGLE_DRIVE_TOKEN')
                if not refresh_token: missing.append('GOOGLE_DRIVE_REFRESH_TOKEN')
                if not client_id: missing.append('GOOGLE_DRIVE_CLIENT_ID')
                if not client_secret: missing.append('GOOGLE_DRIVE_CLIENT_SECRET')
                raise ValueError(f"Faltan variables de entorno: {', '.join(missing)}")
            
            self._creds = Credentials(
                token=token,
                refresh_token=refresh_token,
                client_id=client_id,
                client_secret=client_secret,
                token_uri='https://oauth2.googleapis.com/token',
                scopes=['https://www.googleapis.com/auth/drive.file']
            )
            
            if self._creds.expired and self._creds.refresh_token:
                logger.info("🔄 Token expirado, refrescando...")
                self._creds.refresh(Request())
                self._save_token()
            
            self.service = build('drive', 'v3', credentials=self._creds)
            logger.info("✅ Credenciales recargadas correctamente")
            
            if self._creds and hasattr(self._creds, 'expiry'):
                logger.info(f"📅 Token expira: {self._creds.expiry}")
            
        except Exception as e:
            logger.error(f"❌ Error recargando credenciales: {str(e)}")
            raise
    
    def _save_token(self):
        """Guarda el token actualizado para persistencia"""
        try:
            if self._creds:
                with open(self._token_file, 'wb') as token_file:
                    pickle.dump(self._creds, token_file)
                logger.debug("💾 Token guardado en archivo")
        except Exception as e:
            logger.warning(f"⚠️ No se pudo guardar token: {str(e)}")
    
    # =====================================================
    # INICIALIZACIÓN
    # =====================================================
    
    def init_app(self, app):
        """Inicializa el servicio con variables de entorno"""
        try:
            token = os.getenv('GOOGLE_DRIVE_TOKEN')
            refresh_token = os.getenv('GOOGLE_DRIVE_REFRESH_TOKEN')
            client_id = os.getenv('GOOGLE_DRIVE_CLIENT_ID')
            client_secret = os.getenv('GOOGLE_DRIVE_CLIENT_SECRET')
            self.folder_id = app.config.get('GOOGLE_DRIVE_FOLDER_ID')
            
            if not all([token, refresh_token, client_id, client_secret]):
                missing = []
                if not token: missing.append('GOOGLE_DRIVE_TOKEN')
                if not refresh_token: missing.append('GOOGLE_DRIVE_REFRESH_TOKEN')
                if not client_id: missing.append('GOOGLE_DRIVE_CLIENT_ID')
                if not client_secret: missing.append('GOOGLE_DRIVE_CLIENT_SECRET')
                raise ValueError(f"Faltan variables de entorno: {', '.join(missing)}")
            
            if not self.folder_id:
                raise ValueError("GOOGLE_DRIVE_FOLDER_ID no configurado")
            
            self._creds = Credentials(
                token=token,
                refresh_token=refresh_token,
                client_id=client_id,
                client_secret=client_secret,
                token_uri='https://oauth2.googleapis.com/token',
                scopes=['https://www.googleapis.com/auth/drive.file']
            )
            
            if self._creds.expired and self._creds.refresh_token:
                logger.info("🔄 Token expirado, refrescando...")
                self._creds.refresh(Request())
                self._save_token()
                logger.info("✅ Token refrescado correctamente")
            
            self.service = build('drive', 'v3', credentials=self._creds)
            self._verify_folder_access()
            
            logger.info(f"✅ Google Drive inicializado correctamente (OAuth 2.0 vía variables de entorno)")
            logger.info(f"📁 Carpeta ID: {self.folder_id}")
            if self._creds and hasattr(self._creds, 'expiry'):
                logger.info(f"📅 Token expira: {self._creds.expiry}")
            
        except Exception as e:
            logger.error(f"❌ Error inicializando Google Drive: {str(e)}")
            raise
    
    def _verify_folder_access(self):
        """Verifica que la carpeta existe y es accesible"""
        try:
            self._ensure_valid_token()
            
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
    # SUBIR ARCHIVOS
    # =====================================================
    
    def upload_file(self, file_data, filename, folder_path=None, mime_type=None, 
                    public=True, share_email=None):
        """
        Sube un archivo a Google Drive con reintentos automáticos
        
        Args:
            file_data: bytes o FileStorage
            filename: nombre del archivo
            folder_path: ruta completa (ej: 'OT-20260723-001/DIAGNOSTICO_JEFE_TALLER/audios')
            mime_type: tipo MIME
            public: hacer público
            share_email: compartir con email
        
        Returns:
            dict: {id, url, web_view_link, filename, folder_path}
        """
        self._ensure_valid_token()
        socket.setdefaulttimeout(UPLOAD_TIMEOUT)
        
        last_error = None
        
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                logger.info(f"📤 Intento {attempt}/{MAX_RETRIES} - Subiendo {filename}")
                
                if not mime_type:
                    mime_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
                
                file_metadata = {
                    'name': filename,
                    'parents': [self.folder_id]
                }
                
                if folder_path:
                    folder_id = self._get_or_create_folder(folder_path)
                    file_metadata['parents'] = [folder_id]
                
                if hasattr(file_data, 'read'):
                    file_data.seek(0)
                    media = MediaIoBaseUpload(file_data, mimetype=mime_type, resumable=True)
                elif isinstance(file_data, bytes):
                    media = MediaIoBaseUpload(io.BytesIO(file_data), mimetype=mime_type, resumable=True)
                elif isinstance(file_data, str):
                    with open(file_data, 'rb') as f:
                        file_content = f.read()
                    media = MediaIoBaseUpload(io.BytesIO(file_content), mimetype=mime_type, resumable=True)
                else:
                    raise ValueError(f"Tipo de archivo no soportado: {type(file_data)}")
                
                file = self.service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id, webViewLink, name, mimeType, parents'
                ).execute()
                
                file_id = file.get('id')
                
                if public:
                    self._set_file_public(file_id)
                
                if share_email:
                    self._share_file_with_email(file_id, share_email)
                
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
                
                if isinstance(e, HttpError) and e.resp.status in [401, 403]:
                    logger.info("🔄 Error de autenticación, renovando token...")
                    self._ensure_valid_token()
                
                if attempt < MAX_RETRIES:
                    wait_time = RETRY_DELAY * attempt
                    logger.info(f"⏳ Esperando {wait_time}s antes de reintentar...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"❌ Todos los intentos fallaron para {filename}")
                    raise
        
        raise last_error or Exception("Error desconocido al subir archivo")
    
    # =====================================================
    # GESTIÓN DE CARPETAS
    # =====================================================
    
    def _get_or_create_folder(self, folder_path):
        """Obtiene o crea una carpeta por ruta con reintentos"""
        self._ensure_valid_token()
        
        last_error = None
        
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                current_parent = self.folder_id
                
                for folder_name in folder_path.split('/'):
                    if not folder_name:
                        continue
                    
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
                
                if isinstance(e, HttpError) and e.resp.status in [401, 403]:
                    self._ensure_valid_token()
                
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
    # MÉTODOS DE RUTAS (EXISTENTES)
    # =====================================================
    
    def get_orden_folder_path(self, codigo_orden, subcarpeta=None, tipo=None):
        """
        Obtiene la ruta de la carpeta de una orden de trabajo.
        ESTRUCTURA: {codigo_orden}/{subcarpeta}/{tipo}
        
        Args:
            codigo_orden: Código de la orden (ej: 'OT-20260723-001')
            subcarpeta: 'RECEPCION', 'DIAGNOSTICO_JEFE_TALLER', 'AVANCES', etc.
            tipo: 'fotos', 'audios', 'documentos', 'videos'
        """
        path_parts = [codigo_orden]
        
        if subcarpeta:
            path_parts.append(subcarpeta)
        
        if tipo:
            tipo_map = TIPOS_ARCHIVO_GENERAL
            path_parts.append(tipo_map.get(tipo.lower(), tipo))
        
        return '/'.join(path_parts)
    
    def generate_folder_path(self, modulo, codigo_orden=None, referencia_id=None, 
                             fecha=None, subcarpeta=None, tipo=None):
        """Genera una ruta de carpeta (legacy - para compatibilidad)"""
        path_parts = []
        
        if codigo_orden:
            path_parts.append(codigo_orden)
        elif referencia_id:
            path_parts.append(referencia_id)
        else:
            if not fecha:
                fecha = datetime.now()
            path_parts.append(f"orden_{fecha.strftime('%Y%m%d_%H%M%S')}")
        
        path_parts.append(modulo)
        
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
    # 🆕 MÉTODOS PARA COTIZACIONES
    # =====================================================
    
    def get_ruta_cotizacion(self, codigo_orden, submodulo, tipo=None):
        """
        Genera la ruta para archivos del módulo de cotizaciones
        
        ESTRUCTURA: {codigo_orden}/COTIZACION/{submodulo}/{tipo}
        
        ARGS:
            codigo_orden: 'OT-20260723-001'
            submodulo: 'SOLICITUD_COTIZACION', 'COTIZACION_CLIENTE', 'SOLICITUD_COMPRA'
            tipo: 'fotos', 'documentos', 'comprobantes'
        """
        path_parts = [codigo_orden, 'COTIZACION']
        
        if submodulo:
            submodulo_normalizado = SUBMODULOS_COTIZACION.get(submodulo, submodulo)
            path_parts.append(submodulo_normalizado)
        
        if tipo:
            tipo_normalizado = TIPOS_ARCHIVO_COTIZACION.get(tipo.lower(), tipo)
            path_parts.append(tipo_normalizado)
        
        return '/'.join(path_parts)
    
    def get_ruta_solicitud_cotizacion(self, codigo_orden, tipo='fotos'):
        """
        {codigo_orden}/COTIZACION/SOLICITUD_COTIZACION/{tipo}
        Tipo por defecto: 'fotos' (para fotos de items)
        """
        return self.get_ruta_cotizacion(codigo_orden, 'SOLICITUD_COTIZACION', tipo)
    
    def get_ruta_cotizacion_cliente(self, codigo_orden, tipo='documentos'):
        """
        {codigo_orden}/COTIZACION/COTIZACION_CLIENTE/{tipo}
        Tipo por defecto: 'documentos' (para PDF/Word)
        """
        return self.get_ruta_cotizacion(codigo_orden, 'COTIZACION_CLIENTE', tipo)
    
    def get_ruta_solicitud_compra(self, codigo_orden, tipo='comprobantes'):
        """
        {codigo_orden}/COTIZACION/SOLICITUD_COMPRA/{tipo}
        Tipo por defecto: 'comprobantes' (para facturas)
        """
        return self.get_ruta_cotizacion(codigo_orden, 'SOLICITUD_COMPRA', tipo)
    
    def get_ruta_items_cotizacion(self, codigo_orden):
        """
        {codigo_orden}/COTIZACION/SOLICITUD_COTIZACION/fotos/
        Atajo para fotos de items de solicitud de cotización
        """
        return self.get_ruta_solicitud_cotizacion(codigo_orden, 'fotos')
    
    # =====================================================
    # 🆕 MÉTODOS PARA SUBIR ARCHIVOS DE COTIZACIÓN
    # =====================================================
    
    def upload_cotizacion_file(self, file_data, filename, codigo_orden, 
                               submodulo, tipo, public=True):
        """
        Sube un archivo al módulo de cotizaciones
        
        ARGS:
            file_data: bytes o FileStorage
            filename: nombre del archivo
            codigo_orden: 'OT-20260723-001'
            submodulo: 'SOLICITUD_COTIZACION', 'COTIZACION_CLIENTE', 'SOLICITUD_COMPRA'
            tipo: 'fotos', 'documentos', 'comprobantes'
            public: True para que sea público
        """
        folder_path = self.get_ruta_cotizacion(codigo_orden, submodulo, tipo)
        return self.upload_file(
            file_data=file_data,
            filename=filename,
            folder_path=folder_path,
            public=public
        )
    
    def upload_foto_item_cotizacion(self, file_data, filename, codigo_orden, public=True):
        """
        Sube una foto de un item para solicitud de cotización
        Ruta: {codigo_orden}/COTIZACION/SOLICITUD_COTIZACION/fotos/
        """
        folder_path = self.get_ruta_items_cotizacion(codigo_orden)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        nombre_final = f"{timestamp}_{filename}"
        
        return self.upload_file(
            file_data=file_data,
            filename=nombre_final,
            folder_path=folder_path,
            public=public
        )
    
    def upload_cotizacion_cliente(self, file_data, filename, codigo_orden, public=True):
        """
        Sube el documento de cotización para el cliente
        Ruta: {codigo_orden}/COTIZACION/COTIZACION_CLIENTE/documentos/
        """
        folder_path = self.get_ruta_cotizacion_cliente(codigo_orden, 'documentos')
        return self.upload_file(
            file_data=file_data,
            filename=filename,
            folder_path=folder_path,
            public=public
        )
    
    def upload_comprobante_compra(self, file_data, filename, codigo_orden, public=False):
        """
        Sube un comprobante de compra (factura, ticket, etc.)
        Ruta: {codigo_orden}/COTIZACION/SOLICITUD_COMPRA/comprobantes/
        """
        folder_path = self.get_ruta_solicitud_compra(codigo_orden, 'comprobantes')
        return self.upload_file(
            file_data=file_data,
            filename=filename,
            folder_path=folder_path,
            public=public
        )
    
    # =====================================================
    # RENOMBRAR CARPETAS
    # =====================================================
    
    def rename_folder(self, folder_id, new_name):
        """Renombra una carpeta en Google Drive"""
        try:
            self._ensure_valid_token()
            
            folder_metadata = {
                'name': new_name
            }
            self.service.files().update(
                fileId=folder_id,
                body=folder_metadata,
                fields='id, name'
            ).execute()
            logger.info(f"📁 Carpeta renombrada: {folder_id} -> {new_name}")
            return True
        except HttpError as e:
            logger.error(f"❌ Error renombrando carpeta {folder_id}: {str(e)}")
            return False
    
    # =====================================================
    # BUSCAR CARPETAS
    # =====================================================
    
    def get_folder_id_by_name(self, folder_name, parent_id=None):
        """Busca una carpeta por nombre"""
        try:
            self._ensure_valid_token()
            
            if parent_id:
                query = f"name='{self._escape_string(folder_name)}' and mimeType='application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed=false"
            else:
                query = f"name='{self._escape_string(folder_name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
            
            results = self.service.files().list(
                q=query,
                fields="files(id, name)",
                pageSize=10
            ).execute()
            
            files = results.get('files', [])
            if files:
                return files[0]['id']
            
            if not parent_id:
                all_folders = self.service.files().list(
                    q="mimeType='application/vnd.google-apps.folder' and trashed=false",
                    fields="files(id, name, parents)",
                    pageSize=100
                ).execute()
                
                for folder in all_folders.get('files', []):
                    if folder.get('name') == folder_name:
                        return folder.get('id')
            
            return None
        except HttpError as e:
            logger.error(f"❌ Error buscando carpeta: {str(e)}")
            return None
    
    # =====================================================
    # ELIMINAR CARPETAS Y ARCHIVOS
    # =====================================================
    
    def delete_folder(self, folder_id):
        """Elimina una carpeta y todo su contenido"""
        try:
            self._ensure_valid_token()
            
            results = self.service.files().list(
                q=f"'{folder_id}' in parents and trashed=false",
                fields="files(id, name)",
                pageSize=100
            ).execute()
            
            files = results.get('files', [])
            
            for file in files:
                try:
                    self.service.files().delete(fileId=file['id']).execute()
                    logger.debug(f"🗑️ Archivo eliminado: {file['name']}")
                except Exception as e:
                    logger.warning(f"⚠️ No se pudo eliminar archivo {file['name']}: {str(e)}")
            
            self.service.files().delete(fileId=folder_id).execute()
            logger.info(f"🗑️ Carpeta eliminada: {folder_id}")
            return True
            
        except HttpError as e:
            logger.error(f"❌ Error eliminando carpeta {folder_id}: {str(e)}")
            return False
    
    def delete_file(self, file_id):
        """Elimina un archivo de Google Drive por su ID"""
        try:
            self._ensure_valid_token()
            self.service.files().delete(fileId=file_id).execute()
            logger.info(f"🗑️ Archivo eliminado de Drive: {file_id}")
            return True
        except HttpError as e:
            if e.resp.status == 404:
                logger.warning(f"⚠️ Archivo no encontrado (ya eliminado): {file_id}")
                return True
            logger.error(f"❌ Error eliminando archivo {file_id}: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"❌ Error eliminando archivo {file_id}: {str(e)}")
            return False
    
    def delete_file_by_url(self, url):
        """Elimina un archivo usando su URL de Google Drive"""
        file_id = self.extract_file_id_from_url(url)
        if not file_id:
            logger.warning(f"⚠️ No se pudo extraer ID de: {url[:50]}...")
            return False
        return self.delete_file(file_id)
    
    # =====================================================
    # EXTRAER FILE_ID DE URL
    # =====================================================
    
    def extract_file_id_from_url(self, url):
        """Extrae el file_id de una URL de Google Drive"""
        if not url:
            return None
        
        url = url.strip()
        
        # Formato 1: https://drive.google.com/uc?export=view&id=XXX
        match = re.search(r'[?&]id=([a-zA-Z0-9_-]+)', url)
        if match:
            return match.group(1)
        
        # Formato 2: https://drive.google.com/file/d/XXX/view
        match = re.search(r'/file/d/([a-zA-Z0-9_-]+)', url)
        if match:
            return match.group(1)
        
        # Formato 3: https://drive.google.com/open?id=XXX
        match = re.search(r'open\?id=([a-zA-Z0-9_-]+)', url)
        if match:
            return match.group(1)
        
        # Formato 4: https://drive.google.com/thumbnail?id=XXX&sz=w800
        match = re.search(r'id=([a-zA-Z0-9_-]+)', url)
        if match:
            return match.group(1)
        
        # Formato 5: ID directo
        if re.match(r'^[a-zA-Z0-9_-]{10,}$', url):
            return url
        
        return None
    
    # =====================================================
    # VERIFICAR EXISTENCIA DE ARCHIVOS
    # =====================================================
    
    def file_exists(self, file_id):
        """Verifica si un archivo existe en Google Drive"""
        try:
            self._ensure_valid_token()
            self.service.files().get(fileId=file_id, fields='id').execute()
            return True
        except HttpError as e:
            if e.resp.status == 404:
                return False
            logger.warning(f"⚠️ Error verificando archivo {file_id}: {str(e)}")
            return False
        except Exception as e:
            logger.warning(f"⚠️ Error verificando archivo {file_id}: {str(e)}")
            return False
    
    def get_file_metadata(self, file_id):
        """Obtiene los metadatos de un archivo en Google Drive"""
        try:
            self._ensure_valid_token()
            file = self.service.files().get(
                fileId=file_id,
                fields='id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents'
            ).execute()
            return file
        except HttpError as e:
            logger.error(f"❌ Error obteniendo metadatos {file_id}: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"❌ Error obteniendo metadatos {file_id}: {str(e)}")
            return None
    
    # =====================================================
    # TRANSCRIPCIÓN DE AUDIO CON WHISPER
    # =====================================================
    
    def transcribir_audio(self, url_audio, language=None, model_name=None):
        """Descarga un audio desde una URL y lo transcribe usando Whisper."""
        if not WHISPER_AVAILABLE:
            return {
                'success': False,
                'error': 'Whisper no está instalado. Ejecuta: pip install openai-whisper'
            }
        
        if not url_audio:
            return {
                'success': False,
                'error': 'URL de audio no proporcionada'
            }
        
        file_id = self.extract_file_id_from_url(url_audio)
        if not file_id:
            return {
                'success': False,
                'error': f'No se pudo extraer el ID del archivo de: {url_audio[:50]}...'
            }
        
        download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
        language = language or WHISPER_LANGUAGE
        model_name = model_name or WHISPER_MODEL
        
        model = get_whisper_model()
        if model is None:
            return {
                'success': False,
                'error': 'No se pudo cargar el modelo Whisper'
            }
        
        temp_file = None
        
        try:
            logger.info(f"🎙️ Descargando audio desde: {download_url}")
            
            response = http_requests.get(download_url, timeout=60)
            response.raise_for_status()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                tmp.write(response.content)
                temp_file = tmp.name
            
            logger.info(f"🎙️ Audio descargado: {temp_file} ({len(response.content)} bytes)")
            logger.info(f"🎙️ Transcribiendo con modelo '{model_name}', idioma '{language}'...")
            
            result = model.transcribe(
                temp_file,
                language=language,
                task='transcribe',
                verbose=False,
                fp16=WHISPER_USE_FP16
            )
            
            texto = result.get('text', '').strip()
            
            logger.info(f"✅ Transcripción completada: '{texto[:50]}...'")
            
            return {
                'success': True,
                'transcripcion': texto,
                'idioma': language,
                'modelo': model_name,
                'duracion': result.get('segments', [{}])[-1].get('end', 0) if result.get('segments') else 0
            }
            
        except http_requests.exceptions.RequestException as e:
            logger.error(f"❌ Error descargando audio: {str(e)}")
            return {
                'success': False,
                'error': f'Error descargando audio: {str(e)}'
            }
        except Exception as e:
            logger.error(f"❌ Error durante la transcripción: {str(e)}")
            return {
                'success': False,
                'error': f'Error transcribiendo audio: {str(e)}'
            }
        finally:
            if temp_file and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                    logger.debug(f"🗑️ Archivo temporal eliminado: {temp_file}")
                except Exception as e:
                    logger.warning(f"⚠️ No se pudo eliminar archivo temporal: {str(e)}")
    
    def transcribir_audio_desde_file(self, file_data, filename=None, language=None, model_name=None):
        """Transcribe un audio directamente desde un objeto de archivo"""
        if not WHISPER_AVAILABLE:
            return {
                'success': False,
                'error': 'Whisper no está instalado'
            }
        
        model = get_whisper_model()
        if model is None:
            return {
                'success': False,
                'error': 'No se pudo cargar el modelo Whisper'
            }
        
        language = language or WHISPER_LANGUAGE
        model_name = model_name or WHISPER_MODEL
        
        temp_file = None
        
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                if hasattr(file_data, 'read'):
                    file_data.seek(0)
                    tmp.write(file_data.read())
                elif isinstance(file_data, bytes):
                    tmp.write(file_data)
                else:
                    return {
                        'success': False,
                        'error': 'Tipo de archivo no soportado'
                    }
                temp_file = tmp.name
            
            logger.info(f"🎙️ Archivo temporal creado: {temp_file}")
            
            result = model.transcribe(
                temp_file,
                language=language,
                task='transcribe',
                verbose=False,
                fp16=WHISPER_USE_FP16
            )
            
            texto = result.get('text', '').strip()
            
            logger.info(f"✅ Transcripción completada: '{texto[:50]}...'")
            
            return {
                'success': True,
                'transcripcion': texto,
                'idioma': language,
                'modelo': model_name
            }
            
        except Exception as e:
            logger.error(f"❌ Error transcribiendo audio: {str(e)}")
            return {
                'success': False,
                'error': f'Error transcribiendo audio: {str(e)}'
            }
        finally:
            if temp_file and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                except:
                    pass
    
    # =====================================================
    # COMPARTIR ARCHIVOS
    # =====================================================
    
    def _set_file_public(self, file_id):
        """Hace un archivo público"""
        try:
            self._ensure_valid_token()
            
            permission = {
                'type': 'anyone',
                'role': 'reader'
            }
            self.service.permissions().create(
                fileId=file_id,
                body=permission
            ).execute()
            logger.info(f"🔓 Archivo hecho público: {file_id}")
        except HttpError as e:
            logger.warning(f"⚠️ No se pudo hacer público el archivo {file_id}: {str(e)}")
    
    def _share_file_with_email(self, file_id, email):
        """Comparte un archivo con un email específico"""
        try:
            self._ensure_valid_token()
            
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
    # ESTADO DEL TOKEN Y WHISPER
    # =====================================================
    
    def get_token_status(self):
        """Retorna el estado actual del token"""
        if not self._creds:
            return {
                'valid': False,
                'expiry': None,
                'has_refresh_token': False,
                'error': 'No hay credenciales'
            }
        
        return {
            'valid': self._creds.valid,
            'expiry': self._creds.expiry.isoformat() if self._creds.expiry else None,
            'has_refresh_token': bool(self._creds.refresh_token),
            'expired': self._creds.expired
        }
    
    def get_whisper_status(self):
        """Retorna el estado de Whisper"""
        global _whisper_model_loaded, _whisper_load_error
        
        return {
            'available': WHISPER_AVAILABLE,
            'model_loaded': _whisper_model_loaded,
            'model_name': WHISPER_MODEL if WHISPER_AVAILABLE else None,
            'language': WHISPER_LANGUAGE if WHISPER_AVAILABLE else None,
            'device': WHISPER_DEVICE if WHISPER_AVAILABLE else None,
            'fp16': WHISPER_USE_FP16 if WHISPER_AVAILABLE else None,
            'cache_dir': CACHE_DIR if WHISPER_AVAILABLE else None,
            'error': _whisper_load_error
        }


# =====================================================
# INSTANCIA GLOBAL
# =====================================================

google_drive = GoogleDriveService()

def init_google_drive(app):
    """Función para inicializar desde app.py"""
    google_drive.init_app(app)
    return google_drive