import os
import time
import logging
from dotenv import load_dotenv
from supabase import create_client, Client
import cloudinary
from functools import wraps
from datetime import datetime, timedelta

# Cargar variables de entorno
load_dotenv()

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SupabaseClient:
    """Cliente de Supabase con manejo de rate limits y reintentos"""
    
    def __init__(self, url, key, service_key=None):
        self.url = url
        self.key = key
        self.service_key = service_key
        self._client = None
        self._service_client = None
        
        # Caché para consultas comunes
        self._cache = {}
        self._cache_ttl = 300  # 5 minutos por defecto
        
        # Rate limiting
        self._rate_limit_calls = []
        self._rate_limit_period = 60  # 1 minuto
        self._rate_limit_max = 30  # máximo 30 llamadas por minuto
        
        # Inicializar clientes
        self._init_clients()
    
    def _init_clients(self):
        """Inicializar clientes de Supabase con manejo de errores"""
        try:
            self._client = create_client(self.url, self.key)
            logger.info("✅ Cliente Supabase inicializado correctamente")
        except Exception as e:
            logger.error(f"❌ Error inicializando Supabase: {str(e)}")
            self._client = None
        
        if self.service_key:
            try:
                self._service_client = create_client(self.url, self.service_key)
                logger.info("✅ Cliente de servicio Supabase inicializado")
            except Exception as e:
                logger.error(f"⚠️ Error inicializando cliente de servicio: {str(e)}")
    
    def _check_rate_limit(self):
        """Verificar rate limit antes de hacer una consulta"""
        now = datetime.now()
        
        # Limpiar llamadas antiguas
        self._rate_limit_calls = [
            call for call in self._rate_limit_calls 
            if call > now - timedelta(seconds=self._rate_limit_period)
        ]
        
        if len(self._rate_limit_calls) >= self._rate_limit_max:
            wait_time = (self._rate_limit_calls[0] + timedelta(seconds=self._rate_limit_period) - now).total_seconds()
            if wait_time > 0:
                logger.warning(f"⚠️ Rate limit alcanzado. Esperando {wait_time:.1f} segundos")
                time.sleep(wait_time)
        
        self._rate_limit_calls.append(now)
    
    def _get_from_cache(self, key):
        """Obtener datos del caché"""
        if key in self._cache:
            data, timestamp = self._cache[key]
            age = (datetime.now() - timestamp).total_seconds()
            if age < self._cache_ttl:
                logger.info(f"📦 Usando caché para: {key} (edad: {age:.0f}s)")
                return data
            else:
                # Cache expirado
                del self._cache[key]
        return None
    
    def _set_cache(self, key, data):
        """Guardar datos en caché"""
        self._cache[key] = (data, datetime.now())
        logger.info(f"💾 Guardado en caché: {key}")
    
    def execute_with_retry(self, query_func, cache_key=None, use_cache=True, max_retries=3):
        """
        Ejecutar una consulta con reintentos y caché
        
        Args:
            query_func: Función que ejecuta la consulta
            cache_key: Clave para caché (si se quiere cachear)
            use_cache: Si se debe usar caché
            max_retries: Número máximo de reintentos
        """
        # Verificar caché
        if use_cache and cache_key:
            cached_data = self._get_from_cache(cache_key)
            if cached_data is not None:
                return cached_data
        
        # Intentar la consulta
        for attempt in range(max_retries):
            try:
                # Verificar rate limit
                self._check_rate_limit()
                
                # Ejecutar la consulta
                result = query_func()
                
                # Si llegamos aquí, la consulta fue exitosa
                if use_cache and cache_key and result:
                    self._set_cache(cache_key, result)
                
                return result
                
            except Exception as e:
                error_msg = str(e).lower()
                
                # Si es timeout o 503, reintentar
                if "timeout" in error_msg or "503" in error_msg or "slowdown" in error_msg:
                    wait_time = (2 ** attempt)  # Backoff exponencial: 1, 2, 4 segundos
                    logger.warning(f"⚠️ Error temporal en intento {attempt + 1}/{max_retries}: {e}")
                    logger.info(f"Esperando {wait_time} segundos antes de reintentar...")
                    time.sleep(wait_time)
                else:
                    # Error no recuperable
                    logger.error(f"❌ Error no recuperable: {e}")
                    raise
        
        # Si llegamos aquí, todos los reintentos fallaron
        logger.error(f"❌ Todos los reintentos fallaron para: {cache_key}")
        return None
    
    def get_table(self, table_name, columns="*", filters=None, use_cache=True):
        """Obtener datos de una tabla con caché"""
        cache_key = f"table_{table_name}_{columns}_{str(filters)}"
        
        def query():
            query_builder = self._client.table(table_name).select(columns)
            if filters:
                for key, value in filters.items():
                    query_builder = query_builder.eq(key, value)
            return query_builder.execute().data
        
        return self.execute_with_retry(query, cache_key, use_cache)
    
    def get_roles(self, use_cache=True):
        """Obtener roles (método específico)"""
        return self.get_table('rol', '*', use_cache=use_cache)
    
    def invalidate_cache(self, pattern=None):
        """Invalidar caché"""
        if pattern is None:
            self._cache.clear()
            logger.info("🗑️ Caché completamente limpiado")
        else:
            keys_to_delete = [k for k in self._cache.keys() if pattern in k]
            for key in keys_to_delete:
                del self._cache[key]
            logger.info(f"🗑️ Limpiadas {len(keys_to_delete)} entradas de caché con patrón: {pattern}")

class Config:
    """Configuración principal de la aplicación"""
    
    # =====================================================
    # CONFIGURACIÓN DE SUPABASE
    # =====================================================
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY')
    SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
    SECRET_KEY = os.getenv('SECRET_KEY', 'furia-motor-2026-dev-key')
    
    # =====================================================
    # CONFIGURACIÓN DE CLOUDINARY
    # =====================================================
    CLOUDINARY_CLOUD_NAME = os.getenv('CLOUDINARY_CLOUD_NAME')
    CLOUDINARY_API_KEY = os.getenv('CLOUDINARY_API_KEY')
    CLOUDINARY_API_SECRET = os.getenv('CLOUDINARY_API_SECRET')
    
    # =====================================================
    # VALIDACIONES
    # =====================================================
    
    # Validar Supabase
    if not SUPABASE_URL:
        raise ValueError("❌ Falta SUPABASE_URL en variables de entorno")
    
    if not SUPABASE_KEY:
        raise ValueError("❌ Falta SUPABASE_KEY en variables de entorno")
    
    logger.info(f"✅ Conectando a Supabase: {SUPABASE_URL}")
    
    # Validar SECRET_KEY (advertencia si es el valor por defecto)
    if SECRET_KEY == 'furia-motor-2026-dev-key':
        logger.warning("⚠️ ADVERTENCIA: Usando SECRET_KEY por defecto en desarrollo")
    
    # =====================================================
    # INICIALIZAR CLIENTE SUPABASE MEJORADO
    # =====================================================
    
    try:
        # Usar nuestro cliente mejorado en lugar del cliente directo
        supabase_client = SupabaseClient(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY)
        
        # Para mantener compatibilidad con código existente,
        # exponemos el cliente tradicional
        supabase = supabase_client._client
        
        # También exponemos nuestro cliente mejorado
        supabase_enhanced = supabase_client
        
        logger.info("✅ Cliente Supabase mejorado inicializado correctamente")
        
    except Exception as e:
        logger.error(f"❌ Error inicializando Supabase: {str(e)}")
        # No lanzamos excepción, permitimos que la app arranque pero sin Supabase
        supabase = None
        supabase_client = None
        supabase_enhanced = None
    
    # =====================================================
    # CONFIGURAR CLOUDINARY
    # =====================================================
    
    cloudinary_configured = False
    if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
        try:
            cloudinary.config(
                cloud_name=CLOUDINARY_CLOUD_NAME,
                api_key=CLOUDINARY_API_KEY,
                api_secret=CLOUDINARY_API_SECRET,
                secure=True
            )
            cloudinary_configured = True
            logger.info(f"✅ Cloudinary configurado: {CLOUDINARY_CLOUD_NAME}")
        except Exception as e:
            logger.error(f"⚠️ Error configurando Cloudinary: {str(e)}")
    else:
        logger.info("ℹ️ Cloudinary no configurado - las imágenes se guardarán como URLs simuladas")
    
    # Variable para verificar si Cloudinary está configurado
    CLOUDINARY_CONFIGURED = cloudinary_configured

# Instancia global de configuración
config = Config()

# Exportar para fácil acceso
supabase = config.supabase
supabase_enhanced = config.supabase_enhanced