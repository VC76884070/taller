# config.py - Con detección automática de rama
import os
import time
import logging
import subprocess
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
import cloudinary

# ============================================================
# 🌍 DETECTAR RAMA Y AMBIENTE AUTOMÁTICAMENTE
# ============================================================

def get_current_branch():
    """Obtener la rama actual de Git"""
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except:
        return None

def get_environment_from_branch(branch):
    """Mapear rama a ambiente"""
    env_mapping = {
        'master': 'produccion',
        'main': 'produccion',
        'production': 'produccion',
        'ia-desarrollo': 'desarrollo',
        'desarrollo': 'desarrollo',
        'develop': 'desarrollo',
        'dev': 'desarrollo'
    }
    return env_mapping.get(branch, 'desarrollo')

def load_env_file():
    """Cargar el archivo .env según la rama"""
    branch = get_current_branch()
    
    if branch:
        environment = get_environment_from_branch(branch)
        env_file = f'.env.{environment}'
    else:
        # Si no está en Git, usar variable de entorno o desarrollo por defecto
        environment = os.getenv('APP_ENV', 'desarrollo')
        env_file = f'.env.{environment}'
    
    # Buscar el archivo .env correspondiente
    env_path = Path(__file__).parent / env_file
    
    if env_path.exists():
        load_dotenv(env_path)
        print(f"🌿 Rama: {branch or 'Desconocida'} → 📄 Cargando: {env_file}")
    else:
        # Fallback: cargar .env normal
        load_dotenv()
        print(f"⚠️ No existe {env_file}, usando .env (por defecto)")
    
    return environment

# Cargar el archivo correcto
APP_ENV = load_env_file()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Config:
    # Información del ambiente
    APP_ENV = APP_ENV
    
    # Supabase
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY')
    SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
    
    # Flask
    SECRET_KEY = os.getenv('SECRET_KEY', 'furia-motor-2026-dev-key')
    
    # Cloudinary
    CLOUDINARY_CLOUD_NAME = os.getenv('CLOUDINARY_CLOUD_NAME')
    CLOUDINARY_API_KEY = os.getenv('CLOUDINARY_API_KEY')
    CLOUDINARY_API_SECRET = os.getenv('CLOUDINARY_API_SECRET')
    
    # Google Drive
    GOOGLE_DRIVE_TOKEN = os.getenv('GOOGLE_DRIVE_TOKEN')
    GOOGLE_DRIVE_REFRESH_TOKEN = os.getenv('GOOGLE_DRIVE_REFRESH_TOKEN')
    GOOGLE_DRIVE_CLIENT_ID = os.getenv('GOOGLE_DRIVE_CLIENT_ID')
    GOOGLE_DRIVE_CLIENT_SECRET = os.getenv('GOOGLE_DRIVE_CLIENT_SECRET')
    GOOGLE_DRIVE_FOLDER_ID = os.getenv('GOOGLE_DRIVE_FOLDER_ID')
    
    # Debug (desarrollo = True, producción = False)
    DEBUG = APP_ENV == 'desarrollo'
    
    # ============================================================
    # VALIDACIONES
    # ============================================================
    
    if not SUPABASE_URL:
        raise ValueError("❌ Falta SUPABASE_URL")
    
    if not SUPABASE_KEY:
        raise ValueError("❌ Falta SUPABASE_KEY")
    
    logger.info(f"🌍 Ambiente: {APP_ENV.upper()}")
    logger.info(f"🔗 Supabase: {SUPABASE_URL}")
    logger.info(f"🐛 Debug: {DEBUG}")
    
    # ============================================================
    # INICIALIZAR SUPABASE
    # ============================================================
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("✅ Cliente Supabase inicializado")
    except Exception as e:
        logger.error(f"❌ Error Supabase: {str(e)}")
        supabase = None
    
    # ============================================================
    # INICIALIZAR CLOUDINARY
    # ============================================================
    
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
            logger.error(f"⚠️ Error Cloudinary: {str(e)}")
    
    CLOUDINARY_CONFIGURED = cloudinary_configured

config = Config()
supabase = config.supabase if hasattr(config, 'supabase') else None

# ============================================================
# FUNCIÓN ÚTIL PARA VER AMBIENTE ACTUAL
# ============================================================

def get_current_info():
    """Obtener información del ambiente actual"""
    return {
        'ambiente': APP_ENV,
        'supabase_url': config.SUPABASE_URL,
        'debug': config.DEBUG
    }

# Para importar fácilmente
__all__ = ['config', 'supabase', 'APP_ENV', 'get_current_info']