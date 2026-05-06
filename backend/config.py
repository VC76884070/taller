# config.py - Versión original (simple)
import os
import time
import logging
from dotenv import load_dotenv
from supabase import create_client, Client
import cloudinary

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Config:
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY')
    SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
    SECRET_KEY = os.getenv('SECRET_KEY', 'furia-motor-2026-dev-key')
    
    CLOUDINARY_CLOUD_NAME = os.getenv('CLOUDINARY_CLOUD_NAME')
    CLOUDINARY_API_KEY = os.getenv('CLOUDINARY_API_KEY')
    CLOUDINARY_API_SECRET = os.getenv('CLOUDINARY_API_SECRET')
    
    if not SUPABASE_URL:
        raise ValueError("❌ Falta SUPABASE_URL")
    
    if not SUPABASE_KEY:
        raise ValueError("❌ Falta SUPABASE_KEY")
    
    logger.info(f"✅ Conectando a Supabase: {SUPABASE_URL}")
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("✅ Cliente Supabase inicializado correctamente")
    except Exception as e:
        logger.error(f"❌ Error: {str(e)}")
        supabase = None
    
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
supabase = config.supabase