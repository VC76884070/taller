import os
from dotenv import load_dotenv
from supabase import create_client, Client
import cloudinary

# Cargar variables de entorno
load_dotenv()

class Config:
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
    
    print(f"✅ Conectando a Supabase: {SUPABASE_URL}")
    
    # Validar SECRET_KEY (advertencia si es el valor por defecto)
    if SECRET_KEY == 'furia-motor-2026-dev-key':
        print("⚠️  ADVERTENCIA: Usando SECRET_KEY por defecto en desarrollo")
    
    # =====================================================
    # INICIALIZAR SUPABASE
    # =====================================================
    
    # Cliente público de Supabase
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Cliente Supabase inicializado correctamente")
    except Exception as e:
        raise ValueError(f"❌ Error inicializando Supabase: {str(e)}")
    
    # Cliente con permisos de servicio (opcional)
    supabase_service: Client = None
    if SUPABASE_SERVICE_KEY:
        try:
            supabase_service = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            print("✅ Cliente de servicio Supabase inicializado")
        except Exception as e:
            print(f"⚠️  Error inicializando cliente de servicio: {str(e)}")
    else:
        print("ℹ️  Cliente de servicio no configurado (opcional)")
    
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
            print(f"✅ Cloudinary configurado: {CLOUDINARY_CLOUD_NAME}")
        except Exception as e:
            print(f"⚠️  Error configurando Cloudinary: {str(e)}")
    else:
        print("ℹ️  Cloudinary no configurado - las imágenes se guardarán como URLs simuladas")
    
    # Variable para verificar si Cloudinary está configurado
    CLOUDINARY_CONFIGURED = cloudinary_configured

# Instancia global de configuración
config = Config()