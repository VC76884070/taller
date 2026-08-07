# config.py - Configuración por entorno usando APP_ENV (sin detección de rama)NUEVOOO
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
import cloudinary

# ============================================================
# 🌍 CARGAR .env SEGÚN APP_ENV
# ============================================================

def load_env_file():
    """
    Carga el archivo .env según APP_ENV.
    - APP_ENV=produccion → .env.produccion
    - APP_ENV=desarrollo → .env.desarrollo
    - APP_ENV no definido → .env (fallback)
    """
    # Obtener APP_ENV de las variables de entorno del sistema
    app_env = os.getenv('APP_ENV', '').lower()
    
    # Mapeo de entornos a archivos
    env_files = {
        'produccion': '.env.produccion',
        'production': '.env.produccion',
        'prod': '.env.produccion',
        'desarrollo': '.env.desarrollo',
        'development': '.env.desarrollo',
        'dev': '.env.desarrollo',
    }
    
    # Determinar qué archivo cargar
    env_filename = env_files.get(app_env, '.env')
    env_path = Path(__file__).parent / env_filename
    
    # Cargar el archivo correspondiente
    if env_path.exists():
        load_dotenv(env_path, override=True)
        print(f"✅ [config.py] Cargado: {env_filename} (APP_ENV={app_env})")
    else:
        # Fallback a .env normal
        load_dotenv()
        if app_env:
            print(f"⚠️ [config.py] No existe {env_filename}, usando .env (APP_ENV={app_env})")
        else:
            print(f"ℹ️ [config.py] APP_ENV no definido, usando .env (por defecto)")
    
    return app_env

# ============================================================
# 🚀 CARGAR VARIABLES DE ENTORNO
# ============================================================

# Cargar el archivo correcto según APP_ENV
APP_ENV = load_env_file()

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================
# 🔧 CLASE CONFIG
# ============================================================

class Config:
    """
    Configuración centralizada del sistema.
    Todas las variables se cargan desde el archivo .env correspondiente.
    """
    
    # ============================================================
    # 📌 INFORMACIÓN DEL AMBIENTE
    # ============================================================
    
    APP_ENV = APP_ENV
    IS_PRODUCTION = APP_ENV in ['produccion', 'production', 'prod']
    IS_DEVELOPMENT = APP_ENV in ['desarrollo', 'development', 'dev']
    
    # ============================================================
    # 🔗 SUPABASE
    # ============================================================
    
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY')
    SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
    
    # ============================================================
    # 🔐 FLASK / SEGURIDAD
    # ============================================================
    
    SECRET_KEY = os.getenv('SECRET_KEY')
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    DEBUG = IS_DEVELOPMENT  # Debug automático según entorno
    
    # ============================================================
    # ☁️ CLOUDINARY
    # ============================================================
    
    CLOUDINARY_CLOUD_NAME = os.getenv('CLOUDINARY_CLOUD_NAME')
    CLOUDINARY_API_KEY = os.getenv('CLOUDINARY_API_KEY')
    CLOUDINARY_API_SECRET = os.getenv('CLOUDINARY_API_SECRET')
    
    # ============================================================
    # 📁 GOOGLE DRIVE
    # ============================================================
    
    GOOGLE_DRIVE_TOKEN = os.getenv('GOOGLE_DRIVE_TOKEN')
    GOOGLE_DRIVE_REFRESH_TOKEN = os.getenv('GOOGLE_DRIVE_REFRESH_TOKEN')
    GOOGLE_DRIVE_CLIENT_ID = os.getenv('GOOGLE_DRIVE_CLIENT_ID')
    GOOGLE_DRIVE_CLIENT_SECRET = os.getenv('GOOGLE_DRIVE_CLIENT_SECRET')
    GOOGLE_DRIVE_FOLDER_ID = os.getenv('GOOGLE_DRIVE_FOLDER_ID')
    GOOGLE_DRIVE_CREDENTIALS_FILE = os.getenv('GOOGLE_DRIVE_CREDENTIALS_FILE')
    
    # ============================================================
    # 🌐 DOMINIOS Y SERVIDOR
    # ============================================================
    
    SERVER_NAME = os.getenv('SERVER_NAME', 'localhost')
    
    # ============================================================
    # ✅ VALIDACIONES CRÍTICAS
    # ============================================================
    
    if not SUPABASE_URL:
        raise ValueError("❌ Falta SUPABASE_URL en variables de entorno")
    
    if not SUPABASE_KEY:
        raise ValueError("❌ Falta SUPABASE_KEY en variables de entorno")
    
    if not SECRET_KEY:
        raise ValueError("❌ Falta SECRET_KEY en variables de entorno")
    
    # ============================================================
    # 📊 LOG DE CONFIGURACIÓN
    # ============================================================
    
    logger.info("=" * 60)
    logger.info("🚀 FURIA MOTOR - CONFIGURACIÓN")
    logger.info("=" * 60)
    logger.info(f"🌍 AMBIENTE: {APP_ENV.upper()}")
    logger.info(f"🐛 DEBUG: {DEBUG}")
    logger.info(f"🔗 SUPABASE_URL: {SUPABASE_URL}")
    logger.info(f"🌐 SERVER_NAME: {SERVER_NAME}")
    logger.info("=" * 60)
    
    # ============================================================
    # 🔌 INICIALIZAR SUPABASE
    # ============================================================
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("✅ Cliente Supabase inicializado correctamente")
    except Exception as e:
        logger.error(f"❌ Error al inicializar Supabase: {str(e)}")
        supabase = None
    
    # ============================================================
    # ☁️ INICIALIZAR CLOUDINARY
    # ============================================================
    
    cloudinary_configured = False
    if all([CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET]):
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
            logger.error(f"⚠️ Error al configurar Cloudinary: {str(e)}")
    else:
        logger.warning("⚠️ Cloudinary no configurado (faltan credenciales)")
    
    CLOUDINARY_CONFIGURED = cloudinary_configured

# ============================================================
# 📦 EXPORTAR INSTANCIA
# ============================================================

config = Config()
supabase = config.supabase

# ============================================================
# 🔧 FUNCIÓN ÚTIL PARA VER AMBIENTE ACTUAL
# ============================================================

def get_current_info():
    """Obtener información del ambiente actual"""
    return {
        'ambiente': APP_ENV,
        'supabase_url': config.SUPABASE_URL,
        'debug': config.DEBUG,
        'is_production': config.IS_PRODUCTION,
        'is_development': config.IS_DEVELOPMENT,
        'server_name': config.SERVER_NAME,
        'flask_env': config.FLASK_ENV
    }

# ============================================================
# 📤 EXPORTAR PARA IMPORTAR FÁCILMENTE
# ============================================================

__all__ = ['config', 'supabase', 'APP_ENV', 'get_current_info']

# ============================================================
# 🔍 DIAGNÓSTICO (se ejecuta al importar)
# ============================================================

if __name__ == '__main__':
    # Si se ejecuta directamente, mostrar información
    print("\n" + "=" * 60)
    print("📋 DIAGNÓSTICO DE CONFIGURACIÓN")
    print("=" * 60)
    info = get_current_info()
    for key, value in info.items():
        print(f"  {key}: {value}")
    print("=" * 60)
    print(f"✅ Cloudinary configurado: {config.CLOUDINARY_CONFIGURED}")
    print(f"✅ Supabase cliente: {'OK' if supabase else 'FALLÓ'}")
    print("=" * 60 + "\n")