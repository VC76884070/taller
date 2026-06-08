from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging
from werkzeug.security import generate_password_hash, check_password_hash
import cloudinary
import cloudinary.uploader
import cloudinary.api
import base64
import io
import requests
import re
import uuid
import os
import tempfile
import time
import random
import string

# Importar decoradores desde decorators.py
from decorators import jefe_operativo_required

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_operativo_recepcion_bp = Blueprint('jefe_operativo_recepcion', __name__, url_prefix='/api/jefe-operativo')

# Configuración desde config.py
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# COORDENADAS DEL TALLER (CAMBIAR SEGÚN UBICACIÓN REAL)
# =====================================================
TALLER_LAT = -17.3895   # Latitud del taller (ejemplo: Cochabamba)
TALLER_LNG = -66.1568   # Longitud del taller

# =====================================================
# CONFIGURACIÓN DE CLOUDINARY
# =====================================================
CLOUDINARY_CONFIGURED = False
try:
    if hasattr(config, 'CLOUDINARY_CLOUD_NAME') and config.CLOUDINARY_CLOUD_NAME:
        cloudinary.config(
            cloud_name=config.CLOUDINARY_CLOUD_NAME,
            api_key=config.CLOUDINARY_API_KEY,
            api_secret=config.CLOUDINARY_API_SECRET,
            secure=True
        )
        CLOUDINARY_CONFIGURED = True
        logger.info(f"✅ Cloudinary configurado correctamente: {config.CLOUDINARY_CLOUD_NAME}")
    else:
        logger.warning("⚠️ Cloudinary no configurado - faltan variables de entorno")
except Exception as e:
    logger.error(f"❌ Error configurando Cloudinary: {str(e)}")

# Intentar importar Whisper
try:
    import whisper
    WHISPER_AVAILABLE = True
    logger.info("✅ Whisper disponible para transcripción")
except ImportError:
    WHISPER_AVAILABLE = False
    logger.warning("⚠️ Whisper no instalado, transcripción deshabilitada")

# =====================================================
# CLASE PARA TRANSCRIPCIÓN CON WHISPER
# =====================================================

class WhisperTranscriber:
    """Clase singleton para manejar transcripción con Whisper local"""
    
    _instance = None
    _model = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def get_model(self, model_size="base"):
        if not WHISPER_AVAILABLE:
            logger.error("Whisper no está disponible")
            return None
            
        if self._model is None:
            logger.info(f"Cargando modelo Whisper '{model_size}'...")
            try:
                self._model = whisper.load_model(model_size)
                logger.info(f"✅ Modelo Whisper '{model_size}' cargado correctamente")
            except Exception as e:
                logger.error(f"Error cargando modelo Whisper: {e}")
                return None
        return self._model
    
    def transcribir_desde_bytes(self, audio_bytes, idioma="es", model_size="base"):
        if not WHISPER_AVAILABLE:
            logger.error("Whisper no está disponible")
            return None
            
        modelo = self.get_model(model_size)
        if not modelo:
            return None
        
        temp_path = None
        try:
            temp_dir = tempfile.gettempdir()
            temp_path = os.path.join(temp_dir, f"whisper_audio_{uuid.uuid4().hex}.wav")
            
            with open(temp_path, 'wb') as f:
                f.write(audio_bytes)
            
            if os.path.getsize(temp_path) == 0:
                logger.error("Archivo de audio vacío")
                return None
            
            logger.info(f"Audio guardado temporalmente en: {temp_path}")
            
            resultado = modelo.transcribe(
                temp_path,
                language=idioma,
                task="transcribe",
                verbose=False,
                fp16=False
            )
            
            texto = resultado["text"].strip()
            logger.info(f"✅ Transcripción completada: {len(texto)} caracteres")
            return texto
            
        except Exception as e:
            logger.error(f"Error en transcripción: {str(e)}")
            return None
            
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception as e:
                    logger.warning(f"Error eliminando archivo temporal: {e}")


transcriber = WhisperTranscriber()

def transcribir_audio_bytes(audio_bytes, idioma="es", model_size="base"):
    if not audio_bytes:
        logger.info("No hay audio para transcribir")
        return None
    
    if not WHISPER_AVAILABLE:
        logger.warning("Whisper no disponible, transcripción omitida")
        return None
    
    try:
        texto = transcriber.transcribir_desde_bytes(audio_bytes, idioma, model_size)
        return texto
    except Exception as e:
        logger.error(f"Error en transcribir_audio_bytes: {str(e)}")
        return None

# =====================================================
# ALMACENAMIENTO DE SESIONES COLABORATIVAS
# =====================================================
sesiones_activas = {}

# =====================================================
# FUNCIONES DE PERSISTENCIA DE SESIONES EN SUPABASE
# =====================================================

def guardar_sesion_en_db(sesion):
    """Guardar o actualizar sesión en Supabase"""
    try:
        # Verificar si la sesión ya existe
        existente = supabase.table('sesion_colaborativa') \
            .select('codigo') \
            .eq('codigo', sesion['codigo']) \
            .execute()
        
        if existente.data:
            # Actualizar sesión existente
            supabase.table('sesion_colaborativa') \
                .update({
                    'colaboradores_ids': sesion.get('colaboradores', []),
                    'colaboradores_nombres': sesion.get('colaboradores_nombres', []),
                    'datos': sesion.get('datos', {}),
                    'secciones_completadas': sesion.get('secciones_completadas', {}),
                    'secciones_editando': sesion.get('secciones_editando', {}),
                    'ultima_actividad': datetime.datetime.now().isoformat()
                }) \
                .eq('codigo', sesion['codigo']) \
                .execute()
            logger.info(f"✅ Sesión {sesion['codigo']} actualizada en BD")
        else:
            # Insertar nueva sesión
            supabase.table('sesion_colaborativa') \
                .insert({
                    'codigo': sesion['codigo'],
                    'creador_id': sesion['creador'],
                    'creador_nombre': sesion['creador_nombre'],
                    'colaboradores_ids': sesion.get('colaboradores', []),
                    'colaboradores_nombres': sesion.get('colaboradores_nombres', []),
                    'datos': sesion.get('datos', {}),
                    'secciones_completadas': sesion.get('secciones_completadas', {}),
                    'secciones_editando': sesion.get('secciones_editando', {}),
                    'estado': sesion.get('estado', 'activa'),
                    'fecha_creacion': sesion.get('fecha_creacion', datetime.datetime.now().isoformat())
                }) \
                .execute()
            logger.info(f"✅ Sesión {sesion['codigo']} guardada en BD")
        
        return True
    except Exception as e:
        logger.error(f"❌ Error guardando sesión en BD: {str(e)}")
        return False

def cargar_sesiones_activas_db():
    """Cargar todas las sesiones activas desde Supabase"""
    try:
        # Cambiado: 24 horas en lugar de 8 para que no se borren tan rápido
        limite = datetime.datetime.now() - datetime.timedelta(hours=24)
        
        supabase.table('sesion_colaborativa') \
            .update({'estado': 'inactiva'}) \
            .eq('estado', 'activa') \
            .lt('ultima_actividad', limite.isoformat()) \
            .execute()
        
        # Cargar sesiones activas
        resultado = supabase.table('sesion_colaborativa') \
            .select('*') \
            .eq('estado', 'activa') \
            .execute()
        
        sesiones = {}
        for s in resultado.data:
            sesiones[s['codigo']] = {
                'codigo': s['codigo'],
                'creador': s['creador_id'],
                'creador_nombre': s['creador_nombre'],
                'colaboradores': s['colaboradores_ids'],
                'colaboradores_nombres': s['colaboradores_nombres'],
                'datos': s['datos'],
                'secciones_completadas': s['secciones_completadas'],
                'secciones_editando': s.get('secciones_editando', {}),
                'estado': s['estado'],
                'fecha_creacion': s['fecha_creacion']
            }
        
        logger.info(f"📋 Cargadas {len(sesiones)} sesiones activas desde BD")
        return sesiones
    except Exception as e:
        logger.error(f"❌ Error cargando sesiones desde BD: {str(e)}")
        return {}

def eliminar_sesion_db(codigo):
    """Eliminar una sesión de la base de datos"""
    try:
        supabase.table('sesion_colaborativa') \
            .delete() \
            .eq('codigo', codigo) \
            .execute()
        logger.info(f"🗑️ Sesión {codigo} eliminada de BD")
        return True
    except Exception as e:
        logger.error(f"❌ Error eliminando sesión {codigo}: {str(e)}")
        return False

def actualizar_actividad_sesion(codigo):
    """Actualizar timestamp de última actividad"""
    try:
        supabase.table('sesion_colaborativa') \
            .update({'ultima_actividad': datetime.datetime.now().isoformat()}) \
            .eq('codigo', codigo) \
            .execute()
        return True
    except Exception as e:
        logger.error(f"❌ Error actualizando actividad: {str(e)}")
        return False

# Cargar sesiones activas al iniciar el módulo
try:
    sesiones_activas = cargar_sesiones_activas_db()
    logger.info(f"🚀 Módulo iniciado con {len(sesiones_activas)} sesiones activas")
except Exception as e:
    logger.error(f"❌ Error cargando sesiones al inicio: {str(e)}")

# =====================================================
# FUNCIONES DE CLOUDINARY Y UTILIDADES
# =====================================================

def subir_imagen_a_cloudinary(base64_data, carpeta, nombre):
    """Subir imagen a Cloudinary y retornar URL"""
    try:
        if not base64_data:
            return None
            
        if not CLOUDINARY_CONFIGURED:
            logger.warning("Cloudinary no configurado, usando almacenamiento local")
            return guardar_imagen_local(base64_data, carpeta, nombre)
        
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        image_data = base64.b64decode(base64_data)
        image_file = io.BytesIO(image_data)
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S%f')
        image_file.name = f"{nombre}_{timestamp}.jpg"
        
        resultado = cloudinary.uploader.upload(
            image_file,
            folder=f"furia_motor/{carpeta}",
            public_id=f"{nombre}_{timestamp}",
            resource_type="image"
        )
        
        url = resultado.get('secure_url')
        logger.info(f"✅ Imagen subida a Cloudinary: {url}")
        return url
        
    except Exception as e:
        logger.error(f"Error subiendo imagen a Cloudinary: {str(e)}")
        return guardar_imagen_local(base64_data, carpeta, nombre)
    
def guardar_imagen_local(base64_data, carpeta, nombre):
    """Guardar imagen localmente cuando Cloudinary no está disponible"""
    try:
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        image_data = base64.b64decode(base64_data)
        
        upload_dir = os.path.join('uploads', carpeta)
        os.makedirs(upload_dir, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{nombre}_{timestamp}.jpg"
        filepath = os.path.join(upload_dir, filename)
        
        with open(filepath, 'wb') as f:
            f.write(image_data)
        
        logger.info(f"✅ Imagen guardada localmente: {filepath}")
        return f"/uploads/{carpeta}/{filename}"
        
    except Exception as e:
        logger.error(f"Error guardando imagen local: {e}")
        return None

def subir_audio_a_cloudinary(audio_base64, carpeta, nombre):
    """Subir audio a Cloudinary y retornar URL"""
    try:
        if not audio_base64:
            return None
            
        if not CLOUDINARY_CONFIGURED:
            logger.warning("Cloudinary no configurado, usando almacenamiento local")
            if 'base64,' in audio_base64:
                audio_base64_clean = audio_base64.split('base64,')[1]
            else:
                audio_base64_clean = audio_base64
            audio_bytes = base64.b64decode(audio_base64_clean)
            return guardar_audio_local(audio_bytes, carpeta, nombre)
        
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        
        audio_bytes = base64.b64decode(audio_base64)
        audio_file = io.BytesIO(audio_bytes)
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S%f')
        audio_file.name = f"{nombre}_{timestamp}.wav"
        
        resultado = cloudinary.uploader.upload(
            audio_file,
            folder=f"furia_motor/{carpeta}",
            public_id=f"{nombre}_{timestamp}",
            resource_type="video"
        )
        
        url = resultado.get('secure_url')
        logger.info(f"✅ Audio subido a Cloudinary: {url}")
        return url
        
    except Exception as e:
        logger.error(f"Error subiendo audio a Cloudinary: {str(e)}")
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        audio_bytes = base64.b64decode(audio_base64)
        return guardar_audio_local(audio_bytes, carpeta, nombre)

def guardar_audio_local(audio_bytes, carpeta, nombre):
    """Guardar audio localmente"""
    try:
        upload_dir = os.path.join('uploads', 'audios', carpeta)
        os.makedirs(upload_dir, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{nombre}_{timestamp}.wav"
        filepath = os.path.join(upload_dir, filename)
        
        with open(filepath, 'wb') as f:
            f.write(audio_bytes)
        
        logger.info(f"✅ Audio guardado localmente: {filepath}")
        return f"/uploads/audios/{carpeta}/{filename}"
        
    except Exception as e:
        logger.error(f"Error guardando audio local: {e}")
        return None

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def generar_codigo_unico():
    """Generar código único para orden de trabajo"""
    try:
        fecha = datetime.datetime.now()
        año = fecha.strftime('%y')
        mes = fecha.strftime('%m')
        dia = fecha.strftime('%d')
        
        inicio_dia = datetime.datetime.combine(fecha.date(), datetime.time.min)
        fin_dia = datetime.datetime.combine(fecha.date(), datetime.time.max)
        
        ultimos = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .gte('fecha_ingreso', inicio_dia.isoformat()) \
            .lte('fecha_ingreso', fin_dia.isoformat()) \
            .execute()
        
        contador = len(ultimos.data) if ultimos.data else 0
        secuencia = str(contador + 1).zfill(3)
        
        return f"OT-{año}{mes}{dia}-{secuencia}"
        
    except Exception as e:
        logger.error(f"Error generando código: {str(e)}")
        timestamp = datetime.datetime.now().strftime('%y%m%d%H%M%S')
        return f"OT-{timestamp}"

def generar_codigo_sesion():
    """Generar código único para sesión colaborativa"""
    caracteres = string.ascii_uppercase + string.digits
    codigo = ''.join(random.choices(caracteres, k=6))
    return f"S-{codigo}"

def obtener_o_crear_cliente(nombre, telefono, ubicacion, latitud=None, longitud=None):
    """
    Obtener un cliente existente o crear uno nuevo.
    Ahora también guarda coordenadas si se proporcionan.
    """
    id_cliente = None
    id_usuario = None
    
    try:
        # Buscar por teléfono
        if telefono:
            usuario_existente = supabase.table('usuario') \
                .select('id, nombre, ubicacion') \
                .eq('contacto', telefono) \
                .execute()
            
            if usuario_existente.data and len(usuario_existente.data) > 0:
                id_usuario = usuario_existente.data[0]['id']
                
                # Actualizar datos del usuario
                update_data = {
                    'nombre': nombre,
                    'ubicacion': ubicacion
                }
                
                supabase.table('usuario') \
                    .update(update_data) \
                    .eq('id', id_usuario) \
                    .execute()
                
                # Buscar en tabla cliente
                cliente_existente = supabase.table('cliente') \
                    .select('id') \
                    .eq('id_usuario', id_usuario) \
                    .execute()
                
                if cliente_existente.data and len(cliente_existente.data) > 0:
                    id_cliente = cliente_existente.data[0]['id']
                    
                    # Actualizar cliente con coordenadas
                    cliente_update = {}
                    if latitud is not None:
                        cliente_update['latitud'] = latitud
                    if longitud is not None:
                        cliente_update['longitud'] = longitud
                    if ubicacion and latitud is not None and longitud is not None:
                        cliente_update['ubicacion_confirmada'] = True
                    
                    if cliente_update:
                        supabase.table('cliente') \
                            .update(cliente_update) \
                            .eq('id', id_cliente) \
                            .execute()
                        logger.info(f"✅ Coordenadas actualizadas para cliente {nombre}: lat={latitud}, lng={longitud}")
                
                # Verificar si ya tiene rol de cliente
                rol_result = supabase.table('usuario_rol') \
                    .select('id_rol') \
                    .eq('id_usuario', id_usuario) \
                    .eq('id_rol', 5) \
                    .execute()
                
                if not rol_result.data:
                    supabase.table('usuario_rol').insert({
                        'id_usuario': id_usuario,
                        'id_rol': 5,
                        'fecha_asignacion': datetime.datetime.now().isoformat()
                    }).execute()
        
        # Si no existe, crear nuevo usuario
        if not id_cliente:
            email_cliente = f"cliente_{uuid.uuid4().hex[:8]}@furia.com"
            contrasenia = generate_password_hash(telefono if telefono else '123456')
            
            user_result = supabase.table('usuario').insert({
                'nombre': nombre,
                'contacto': telefono,
                'ubicacion': ubicacion,
                'contrasenia': contrasenia,
                'fecha_registro': datetime.datetime.now().isoformat(),
                'email': email_cliente
            }).execute()
            
            if not user_result.data:
                logger.error("Error creando usuario cliente")
                return None, None
            
            id_usuario = user_result.data[0]['id']
            
            # Asignar rol de cliente
            supabase.table('usuario_rol').insert({
                'id_usuario': id_usuario,
                'id_rol': 5,
                'fecha_asignacion': datetime.datetime.now().isoformat()
            }).execute()
            
            # Crear registro en tabla cliente con coordenadas
            numero_documento = f"TEMP-{int(datetime.datetime.now().timestamp())}"
            cliente_data = {
                'id_usuario': id_usuario,
                'tipo_documento': 'CI',
                'numero_documento': numero_documento,
                'email': email_cliente
            }
            
            if latitud is not None:
                cliente_data['latitud'] = latitud
            if longitud is not None:
                cliente_data['longitud'] = longitud
            if latitud is not None and longitud is not None:
                cliente_data['ubicacion_confirmada'] = True
            
            cliente_result = supabase.table('cliente').insert(cliente_data).execute()
            
            if not cliente_result.data:
                # Rollback
                supabase.table('usuario_rol').delete().eq('id_usuario', id_usuario).execute()
                supabase.table('usuario').delete().eq('id', id_usuario).execute()
                logger.error("Error creando cliente")
                return None, None
            
            id_cliente = cliente_result.data[0]['id']
            logger.info(f"✅ Nuevo cliente creado con coordenadas: {nombre}")
        
        return id_cliente, id_usuario
        
    except Exception as e:
        logger.error(f"Error en obtener_o_crear_cliente: {str(e)}")
        import traceback
        traceback.print_exc()
        return None, None

# =====================================================
# ENDPOINTS DE SESIONES COLABORATIVAS
# =====================================================

@jefe_operativo_recepcion_bp.route('/iniciar-sesion', methods=['POST'])
@jefe_operativo_required
def iniciar_sesion(current_user):
    try:
        codigo_sesion = generar_codigo_sesion()
        
        sesion = {
            'codigo': codigo_sesion,
            'creador': current_user['id'],
            'creador_nombre': current_user.get('nombre', 'Técnico'),
            'colaboradores': [current_user['id']],
            'colaboradores_nombres': [current_user.get('nombre', 'Técnico')],
            'datos': {
                'cliente': {'nombre': '', 'telefono': '', 'ubicacion': '', 'latitud': None, 'longitud': None},
                'vehiculo': {'placa': '', 'marca': '', 'modelo': '', 'anio': None, 'kilometraje': None},
                'fotos': {
                    'url_lateral_izquierda': None, 'url_lateral_derecha': None,
                    'url_foto_frontal': None, 'url_foto_trasera': None,
                    'url_foto_superior': None, 'url_foto_inferior': None, 'url_foto_tablero': None
                },
                'descripcion': {'texto': '', 'audio_url': None}
            },
            'secciones_completadas': {'cliente': False, 'vehiculo': False, 'fotos': False, 'descripcion': False},
            'secciones_editando': {},
            'estado': 'activa',
            'fecha_creacion': datetime.datetime.now().isoformat()
        }
        
        # Guardar en BD primero
        if not guardar_sesion_en_db(sesion):
            return jsonify({'error': 'Error guardando sesión en base de datos'}), 500
        
        # Luego en memoria
        sesiones_activas[codigo_sesion] = sesion
        
        logger.info(f"✅ Sesión iniciada: {codigo_sesion}")
        
        return jsonify({'success': True, 'codigo': codigo_sesion, 'sesion': sesion}), 200
        
    except Exception as e:
        logger.error(f"❌ Error iniciando sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/unirse-sesion', methods=['POST'])
@jefe_operativo_required
def unirse_sesion(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        
        if not codigo_sesion:
            return jsonify({'error': 'Código de sesión requerido'}), 400
        
        # Intentar cargar desde BD si no está en memoria
        if codigo_sesion not in sesiones_activas:
            sesiones_recuperadas = cargar_sesiones_activas_db()
            if codigo_sesion in sesiones_recuperadas:
                sesiones_activas[codigo_sesion] = sesiones_recuperadas[codigo_sesion]
                logger.info(f"🔄 Sesión {codigo_sesion} recuperada desde BD")
            else:
                return jsonify({'error': 'Sesión no encontrada'}), 404
        
        sesion = sesiones_activas[codigo_sesion]
        
        if sesion['estado'] != 'activa':
            return jsonify({'error': 'Sesión ya finalizada'}), 400
        
        if len(sesion['colaboradores']) >= 2:
            return jsonify({'error': 'La sesión ya tiene el máximo de 2 colaboradores permitidos'}), 400
        
        if current_user['id'] not in sesion['colaboradores']:
            sesion['colaboradores'].append(current_user['id'])
            sesion['colaboradores_nombres'].append(current_user.get('nombre', 'Técnico'))
            
            # Persistir en BD
            guardar_sesion_en_db(sesion)
            
            logger.info(f"👤 Usuario {current_user.get('nombre')} se unió a sesión {codigo_sesion}")
        
        return jsonify({'success': True, 'sesion': sesion}), 200
        
    except Exception as e:
        logger.error(f"Error uniéndose a sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/guardar-seccion', methods=['POST'])
@jefe_operativo_required
def guardar_seccion(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        seccion = data.get('seccion')
        datos_seccion = data.get('datos', {})
        usuario_id = data.get('usuario_id')
        
        if not codigo_sesion:
            return jsonify({'error': 'Código de sesión requerido'}), 400
        
        # Intentar cargar desde BD si no está en memoria
        if codigo_sesion not in sesiones_activas:
            sesiones_recuperadas = cargar_sesiones_activas_db()
            if codigo_sesion in sesiones_recuperadas:
                sesiones_activas[codigo_sesion] = sesiones_recuperadas[codigo_sesion]
                logger.info(f"🔄 Sesión {codigo_sesion} recuperada desde BD")
            else:
                return jsonify({'error': 'Sesión no encontrada'}), 404
        
        sesion = sesiones_activas[codigo_sesion]
        
        if sesion['estado'] != 'activa':
            return jsonify({'error': 'Sesión ya finalizada'}), 400
        
        # Marcar quién está editando
        if usuario_id:
            sesion.setdefault('secciones_editando', {})
            sesion['secciones_editando'][seccion] = usuario_id
        
        # Actualizar datos según sección
        if seccion == 'cliente':
            sesion['datos']['cliente'] = {
                'nombre': datos_seccion.get('nombre', ''),
                'telefono': datos_seccion.get('telefono', ''),
                'ubicacion': datos_seccion.get('ubicacion', ''),
                'latitud': datos_seccion.get('latitud'),
                'longitud': datos_seccion.get('longitud')
            }
            sesion['secciones_completadas']['cliente'] = bool(
                datos_seccion.get('nombre') and datos_seccion.get('telefono')
            )
            
        elif seccion == 'vehiculo':
            sesion['datos']['vehiculo'] = {
                'placa': datos_seccion.get('placa', '').upper(),
                'marca': datos_seccion.get('marca', ''),
                'modelo': datos_seccion.get('modelo', ''),
                'anio': datos_seccion.get('anio'),
                'kilometraje': datos_seccion.get('kilometraje', 0)
            }
            sesion['secciones_completadas']['vehiculo'] = bool(
                datos_seccion.get('placa') and 
                datos_seccion.get('marca') and 
                datos_seccion.get('modelo')
            )
            
        elif seccion == 'fotos':
            fotos_procesadas = {}
            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            carpeta = f"sesion/{codigo_sesion}"
            
            campos_fotos = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal',
                           'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero']
            
            for campo in campos_fotos:
                valor = datos_seccion.get(campo)
                if valor and isinstance(valor, str) and valor.startswith('data:image'):
                    logger.info(f"Subiendo foto {campo} a Cloudinary")
                    url = subir_imagen_a_cloudinary(valor, carpeta, campo.replace('url_', ''))
                    fotos_procesadas[campo] = url
                elif valor and isinstance(valor, str) and (valor.startswith('http') or valor.startswith('/uploads/')):
                    fotos_procesadas[campo] = valor
                else:
                    fotos_procesadas[campo] = None
            
            sesion['datos']['fotos'] = fotos_procesadas
            todas_completas = all(fotos_procesadas.get(foto) for foto in campos_fotos)
            sesion['secciones_completadas']['fotos'] = todas_completas
            
        elif seccion == 'descripcion':
            sesion['datos']['descripcion']['texto'] = datos_seccion.get('texto', '')
            
            audio_data = datos_seccion.get('audio_url')
            if audio_data and isinstance(audio_data, str) and audio_data.startswith('data:audio'):
                try:
                    logger.info(f"Subiendo audio a Cloudinary para sesión {codigo_sesion}")
                    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
                    carpeta = f"sesion/{codigo_sesion}"
                    
                    url_audio = subir_audio_a_cloudinary(audio_data, carpeta, f"audio_{timestamp}")
                    sesion['datos']['descripcion']['audio_url'] = url_audio
                    logger.info(f"✅ Audio subido: {url_audio}")
                    
                except Exception as e:
                    logger.error(f"Error procesando audio: {str(e)}")
            elif audio_data and isinstance(audio_data, str) and (audio_data.startswith('http') or audio_data.startswith('/uploads/')):
                sesion['datos']['descripcion']['audio_url'] = audio_data
            
            sesion['secciones_completadas']['descripcion'] = bool(datos_seccion.get('texto'))
        
        # Actualizar timestamp de actividad
        sesion['ultima_actividad'] = datetime.datetime.now().isoformat()
        
        # Persistir en base de datos
        if not guardar_sesion_en_db(sesion):
            logger.warning(f"⚠️ No se pudo guardar sesión {codigo_sesion} en BD, pero continúa en memoria")
        
        return jsonify({'success': True, 'sesion': sesion}), 200
        
    except Exception as e:
        logger.error(f"Error guardando sección: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/obtener-sesion/<codigo>', methods=['GET'])
@jefe_operativo_required
def obtener_sesion(current_user, codigo):
    try:
        # Buscar en memoria primero
        if codigo in sesiones_activas:
            sesion = sesiones_activas[codigo]
            # Actualizar actividad
            actualizar_actividad_sesion(codigo)
            return jsonify({'success': True, 'sesion': sesion}), 200
        
        # Si no está en memoria, buscar en BD
        resultado = supabase.table('sesion_colaborativa') \
            .select('*') \
            .eq('codigo', codigo) \
            .eq('estado', 'activa') \
            .execute()
        
        if resultado.data:
            s = resultado.data[0]
            sesion = {
                'codigo': s['codigo'],
                'creador': s['creador_id'],
                'creador_nombre': s['creador_nombre'],
                'colaboradores': s['colaboradores_ids'],
                'colaboradores_nombres': s['colaboradores_nombres'],
                'datos': s['datos'],
                'secciones_completadas': s['secciones_completadas'],
                'secciones_editando': s.get('secciones_editando', {}),
                'estado': s['estado'],
                'fecha_creacion': s['fecha_creacion']
            }
            # Restaurar en memoria
            sesiones_activas[codigo] = sesion
            logger.info(f"🔄 Sesión {codigo} restaurada desde BD a memoria")
            return jsonify({'success': True, 'sesion': sesion}), 200
        
        return jsonify({'error': 'Sesión no encontrada'}), 404
        
    except Exception as e:
        logger.error(f"Error obteniendo sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/finalizar-sesion', methods=['POST'])
@jefe_operativo_required
def finalizar_sesion(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        datos_directos = data.get('datos')
        
        if not codigo_sesion:
            return jsonify({'error': 'Código de sesión requerido'}), 400
        
        # Intentar cargar desde BD si no está en memoria
        if codigo_sesion not in sesiones_activas:
            sesiones_recuperadas = cargar_sesiones_activas_db()
            if codigo_sesion in sesiones_recuperadas:
                sesiones_activas[codigo_sesion] = sesiones_recuperadas[codigo_sesion]
            else:
                return jsonify({'error': 'Sesión no encontrada'}), 404
        
        sesion = sesiones_activas[codigo_sesion]
        
        if datos_directos:
            sesion['datos'] = datos_directos
            logger.info(f"Datos actualizados directamente en sesión {codigo_sesion}")
        
        secciones_faltantes = [s for s, completada in sesion['secciones_completadas'].items() if not completada]
        
        if secciones_faltantes:
            return jsonify({'error': f'Faltan completar: {", ".join(secciones_faltantes)}'}), 400
        
        resultado = crear_orden_desde_sesion(sesion['datos'], current_user)
        
        if not resultado['success']:
            return jsonify({'error': resultado['error']}), 500
        
        sesion['estado'] = 'finalizada'
        
        # Persistir en BD
        guardar_sesion_en_db(sesion)
        
        # Limpiar de memoria
        del sesiones_activas[codigo_sesion]
        
        logger.info(f"✅ Sesión {codigo_sesion} finalizada por {current_user.get('nombre')}")
        
        return jsonify({
            'success': True, 
            'codigo': resultado['codigo'], 
            'id_orden': resultado['id_orden'],
            'sesion_finalizada': True
        }), 200
        
    except Exception as e:
        logger.error(f"Error finalizando sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500
    

def crear_orden_desde_sesion(datos, current_user):
    try:
        cliente_data = datos.get('cliente', {})
        vehiculo_data = datos.get('vehiculo', {})
        descripcion_data = datos.get('descripcion', {})
        fotos = datos.get('fotos', {})
        
        telefono_cliente = cliente_data.get('telefono', '')
        nombre_cliente = cliente_data.get('nombre', '')
        ubicacion_cliente = cliente_data.get('ubicacion', '')
        latitud = cliente_data.get('latitud')
        longitud = cliente_data.get('longitud')
        
        # Crear o obtener cliente con coordenadas
        id_cliente, id_usuario = obtener_o_crear_cliente(
            nombre_cliente, 
            telefono_cliente, 
            ubicacion_cliente,
            latitud,
            longitud
        )
        
        if not id_cliente:
            return {'success': False, 'error': 'Error creando cliente'}
        
        # Gestionar vehículo
        placa = vehiculo_data.get('placa', '').upper()
        id_vehiculo = None
        
        if placa:
            vehiculo_existente = supabase.table('vehiculo') \
                .select('id') \
                .eq('placa', placa) \
                .execute()
            
            if vehiculo_existente.data and len(vehiculo_existente.data) > 0:
                id_vehiculo = vehiculo_existente.data[0]['id']
                supabase.table('vehiculo') \
                    .update({
                        'marca': vehiculo_data.get('marca', ''),
                        'modelo': vehiculo_data.get('modelo', ''),
                        'anio': vehiculo_data.get('anio'),
                        'kilometraje': vehiculo_data.get('kilometraje', 0)
                    }) \
                    .eq('id', id_vehiculo) \
                    .execute()
            else:
                vehiculo_result = supabase.table('vehiculo').insert({
                    'id_cliente': id_cliente,
                    'placa': placa,
                    'marca': vehiculo_data.get('marca', ''),
                    'modelo': vehiculo_data.get('modelo', ''),
                    'anio': vehiculo_data.get('anio'),
                    'kilometraje': vehiculo_data.get('kilometraje', 0)
                }).execute()
                
                if not vehiculo_result.data:
                    return {'success': False, 'error': 'Error creando vehículo'}
                
                id_vehiculo = vehiculo_result.data[0]['id']
        
        codigo_unico = generar_codigo_unico()
        
        # Obtener segundo jefe operativo de la sesión
        segundo_jefe_id = None
        for codigo_sesion, sesion in sesiones_activas.items():
            if sesion.get('estado') == 'activa' and len(sesion.get('colaboradores', [])) > 1:
                colaboradores = sesion.get('colaboradores', [])
                if current_user['id'] in colaboradores:
                    for colab_id in colaboradores:
                        if colab_id != current_user['id']:
                            segundo_jefe_id = colab_id
                            break
                    break
        
        logger.info(f"Segundo jefe operativo ID: {segundo_jefe_id}")
        
        # Crear orden de trabajo
        orden_data = {
            'codigo_unico': codigo_unico,
            'id_vehiculo': id_vehiculo,
            'id_jefe_operativo': current_user['id'],
            'fecha_ingreso': datetime.datetime.now().isoformat(),
            'estado_global': 'EnRecepcion'
        }
        
        if segundo_jefe_id:
            orden_data['id_jefe_operativo_2'] = segundo_jefe_id
            logger.info(f"✅ Guardando segundo jefe operativo: {segundo_jefe_id}")
        
        orden_result = supabase.table('ordentrabajo').insert(orden_data).execute()
        
        if not orden_result.data:
            return {'success': False, 'error': 'Error creando orden de trabajo'}
        
        id_orden = orden_result.data[0]['id']
        
        # Crear recepción
        recepcion_data = {
            'id_orden_trabajo': id_orden,
            'url_lateral_izquierda': fotos.get('url_lateral_izquierda'),
            'url_lateral_derecha': fotos.get('url_lateral_derecha'),
            'url_foto_frontal': fotos.get('url_foto_frontal'),
            'url_foto_trasera': fotos.get('url_foto_trasera'),
            'url_foto_superior': fotos.get('url_foto_superior'),
            'url_foto_inferior': fotos.get('url_foto_inferior'),
            'url_foto_tablero': fotos.get('url_foto_tablero'),
            'url_grabacion_problema': descripcion_data.get('audio_url'),
            'transcripcion_problema': descripcion_data.get('texto', '')
        }
        
        recepcion_result = supabase.table('recepcion').insert(recepcion_data).execute()
        
        if not recepcion_result.data:
            supabase.table('ordentrabajo').delete().eq('id', id_orden).execute()
            return {'success': False, 'error': 'Error guardando recepción'}
        
        return {'success': True, 'codigo': codigo_unico, 'id_orden': id_orden}
        
    except Exception as e:
        logger.error(f"Error creando orden desde sesión: {str(e)}")
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': str(e)}


@jefe_operativo_recepcion_bp.route('/verificar-placa/<placa>', methods=['GET'])
@jefe_operativo_required
def verificar_placa(current_user, placa):
    try:
        placa = placa.upper()
        
        resultado = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, id_cliente, cliente!inner(id_usuario), usuario:cliente!inner(id_usuario)!inner(nombre, contacto)') \
            .eq('placa', placa) \
            .execute()
        
        if resultado.data and len(resultado.data) > 0:
            vehiculo = resultado.data[0]
            
            cliente_data = {}
            if 'usuario' in vehiculo:
                cliente_data = vehiculo['usuario']
            
            return jsonify({
                'exists': True,
                'vehiculo': {
                    'placa': vehiculo['placa'],
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'cliente': cliente_data.get('nombre', ''),
                    'telefono': cliente_data.get('contacto', '')
                }
            }), 200
        else:
            return jsonify({'exists': False}), 200
            
    except Exception as e:
        logger.error(f"Error verificando placa: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# TRANSCRIPCIÓN DE AUDIO
# =====================================================
@jefe_operativo_recepcion_bp.route('/transcribir-audio', methods=['POST'])
@jefe_operativo_required
def transcribir_audio_endpoint(current_user):
    try:
        data = request.get_json()
        audio_base64 = data.get('audio')
        
        if not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        if not WHISPER_AVAILABLE:
            return jsonify({'error': 'Whisper no está disponible en el servidor'}), 500
        
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        
        audio_bytes = base64.b64decode(audio_base64)
        
        logger.info(f"Audio recibido: {len(audio_bytes)} bytes")
        
        texto = transcribir_audio_bytes(audio_bytes, idioma="es", model_size="base")
        
        if not texto:
            return jsonify({'error': 'No se pudo transcribir el audio'}), 500
        
        return jsonify({'success': True, 'transcripcion': texto}), 200
        
    except Exception as e:
        logger.error(f"Error en transcripción: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# CANCELAR SESIÓN
# =====================================================
@jefe_operativo_recepcion_bp.route('/cancelar-sesion', methods=['DELETE'])
@jefe_operativo_required
def cancelar_sesion(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        
        if not codigo_sesion:
            return jsonify({'error': 'Código de sesión requerido'}), 400
        
        # Eliminar de memoria
        if codigo_sesion in sesiones_activas:
            del sesiones_activas[codigo_sesion]
        
        # Eliminar de BD
        eliminar_sesion_db(codigo_sesion)
        
        logger.info(f"🗑️ Sesión {codigo_sesion} cancelada")
        
        return jsonify({'success': True, 'message': 'Sesión cancelada exitosamente'}), 200
        
    except Exception as e:
        logger.error(f"Error cancelando sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# PING PARA MANTENER SESIÓN ACTIVA
# =====================================================
@jefe_operativo_recepcion_bp.route('/ping-sesion/<codigo>', methods=['GET'])
@jefe_operativo_required
def ping_sesion(current_user, codigo):
    """Mantener sesión activa - actualiza timestamp"""
    try:
        if codigo in sesiones_activas:
            sesiones_activas[codigo]['ultima_actividad'] = datetime.datetime.now().isoformat()
        
        actualizar_actividad_sesion(codigo)
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error en ping: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# LISTAR SESIONES ACTIVAS
# =====================================================
@jefe_operativo_recepcion_bp.route('/sesiones-activas', methods=['GET'])
@jefe_operativo_required
def listar_sesiones_activas(current_user):
    try:
        sesiones = []
        for codigo, sesion in sesiones_activas.items():
            if sesion['estado'] == 'activa':
                sesiones.append({
                    'codigo': sesion['codigo'],
                    'creador_nombre': sesion['creador_nombre'],
                    'colaboradores': sesion['colaboradores'],
                    'colaboradores_nombres': sesion['colaboradores_nombres'],
                    'secciones_completadas': sesion['secciones_completadas'],
                    'fecha_creacion': sesion['fecha_creacion'],
                    'estado': sesion['estado']
                })
        
        return jsonify({'success': True, 'sesiones': sesiones}), 200
        
    except Exception as e:
        logger.error(f"Error listando sesiones activas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# LISTAR RECEPCIONES GUARDADAS
# =====================================================
@jefe_operativo_recepcion_bp.route('/listar-recepciones', methods=['GET'])
@jefe_operativo_required
def listar_recepciones(current_user):
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo, vehiculo!inner(placa, marca, modelo, cliente!inner(id_usuario, usuario!inner(nombre, contacto, ubicacion)))') \
            .order('fecha_ingreso', desc=True) \
            .limit(10) \
            .execute()
        
        recepciones = []
        if resultado.data:
            for orden in resultado.data:
                vehiculo = orden.get('vehiculo', {})
                cliente = vehiculo.get('cliente', {}) if vehiculo else {}
                usuario = cliente.get('usuario', {}) if cliente else {}
                
                recepciones.append({
                    'id': orden['id'],
                    'codigo_unico': orden['codigo_unico'],
                    'fecha_ingreso': orden['fecha_ingreso'],
                    'estado_global': orden['estado_global'],
                    'placa': vehiculo.get('placa', ''),
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'cliente_nombre': usuario.get('nombre', ''),
                    'cliente_telefono': usuario.get('contacto', ''),
                    'cliente_ubicacion': usuario.get('ubicacion', '')
                })
        
        return jsonify({'success': True, 'recepciones': recepciones}), 200
        
    except Exception as e:
        logger.error(f"Error listando recepciones: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# DETALLE DE RECEPCIÓN
# =====================================================
@jefe_operativo_recepcion_bp.route('/detalle-recepcion/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def detalle_recepcion(current_user, id_orden):
    try:
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo, id_jefe_operativo, id_jefe_operativo_2') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data
        
        jefe_principal = {}
        if orden.get('id_jefe_operativo'):
            jefe1 = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .eq('id', orden['id_jefe_operativo']) \
                .execute()
            if jefe1.data:
                jefe_principal = jefe1.data[0]
        
        jefe_secundario = {}
        if orden.get('id_jefe_operativo_2'):
            jefe2 = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .eq('id', orden['id_jefe_operativo_2']) \
                .execute()
            if jefe2.data:
                jefe_secundario = jefe2.data[0]
        
        vehiculo_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente, cliente!inner(id_usuario, usuario!inner(nombre, contacto, ubicacion, latitud, longitud))') \
            .eq('id', orden['id_vehiculo']) \
            .single() \
            .execute()
        
        vehiculo = vehiculo_result.data if vehiculo_result.data else {}
        cliente = vehiculo.get('cliente', {}) if vehiculo else {}
        usuario = cliente.get('usuario', {}) if cliente else {}
        
        recepcion_result = supabase.table('recepcion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .single() \
            .execute()
        
        recepcion = recepcion_result.data if recepcion_result.data else {}
        
        detalle = {
            'id': orden['id'],
            'codigo_unico': orden['codigo_unico'],
            'fecha_ingreso': orden['fecha_ingreso'],
            'estado_global': orden['estado_global'],
            'jefe_operativo': jefe_principal,
            'jefe_operativo_2': jefe_secundario,
            'placa': vehiculo.get('placa', ''),
            'marca': vehiculo.get('marca', ''),
            'modelo': vehiculo.get('modelo', ''),
            'anio': vehiculo.get('anio'),
            'kilometraje': vehiculo.get('kilometraje'),
            'cliente_nombre': usuario.get('nombre', ''),
            'cliente_telefono': usuario.get('contacto', ''),
            'cliente_ubicacion': usuario.get('ubicacion', ''),
            'latitud': usuario.get('latitud'),      # ← NUEVO: latitud del cliente
            'longitud': usuario.get('longitud'),    # ← NUEVO: longitud del cliente
            'fotos': {
                'url_lateral_izquierda': recepcion.get('url_lateral_izquierda'),
                'url_lateral_derecha': recepcion.get('url_lateral_derecha'),
                'url_foto_frontal': recepcion.get('url_foto_frontal'),
                'url_foto_trasera': recepcion.get('url_foto_trasera'),
                'url_foto_superior': recepcion.get('url_foto_superior'),
                'url_foto_inferior': recepcion.get('url_foto_inferior'),
                'url_foto_tablero': recepcion.get('url_foto_tablero')
            },
            'audio_url': recepcion.get('url_grabacion_problema'),
            'transcripcion_problema': recepcion.get('transcripcion_problema', '')
        }
        
        return jsonify({'success': True, 'detalle': detalle}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ELIMINAR RECEPCIÓN
# =====================================================
@jefe_operativo_recepcion_bp.route('/eliminar-recepcion/<int:id_orden>', methods=['DELETE'])
@jefe_operativo_required
def eliminar_recepcion(current_user, id_orden):
    try:
        orden_result = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Recepción no encontrada'}), 404
        
        orden = orden_result.data[0]
        
        if orden['estado_global'] != 'EnRecepcion':
            return jsonify({'error': 'No se puede eliminar una recepción que ya está en proceso o finalizada'}), 400
        
        supabase.table('recepcion') \
            .delete() \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        supabase.table('ordentrabajo') \
            .delete() \
            .eq('id', id_orden) \
            .execute()
        
        logger.info(f"Recepción {id_orden} eliminada por {current_user.get('nombre')}")
        
        return jsonify({'success': True, 'message': 'Recepción eliminada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error eliminando recepción: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# ACTUALIZAR RECEPCIÓN (EDITAR)
# =====================================================
@jefe_operativo_recepcion_bp.route('/actualizar-recepcion/<int:id_orden>', methods=['PUT'])
@jefe_operativo_required
def actualizar_recepcion(current_user, id_orden):
    try:
        data = request.get_json()
        
        orden_result = supabase.table('ordentrabajo') \
            .select('id, estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Recepción no encontrada'}), 404
        
        cliente_data = data.get('cliente', {})
        telefono_cliente = cliente_data.get('telefono', '')
        nombre_cliente = cliente_data.get('nombre', '')
        ubicacion_cliente = cliente_data.get('ubicacion', '')
        latitud = cliente_data.get('latitud')
        longitud = cliente_data.get('longitud')
        
        # Usar la misma función para obtener/crear cliente con coordenadas
        id_cliente, id_usuario = obtener_o_crear_cliente(
            nombre_cliente, 
            telefono_cliente, 
            ubicacion_cliente,
            latitud,
            longitud
        )
        
        if not id_cliente:
            return jsonify({'error': 'Error procesando cliente'}), 500
        
        vehiculo_data = data.get('vehiculo', {})
        placa = vehiculo_data.get('placa', '').upper()
        
        orden_actual = supabase.table('ordentrabajo') \
            .select('id_vehiculo') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if orden_actual.data:
            id_vehiculo_actual = orden_actual.data['id_vehiculo']
            
            supabase.table('vehiculo') \
                .update({
                    'id_cliente': id_cliente,
                    'placa': placa,
                    'marca': vehiculo_data.get('marca', ''),
                    'modelo': vehiculo_data.get('modelo', ''),
                    'anio': vehiculo_data.get('anio'),
                    'kilometraje': vehiculo_data.get('kilometraje', 0)
                }) \
                .eq('id', id_vehiculo_actual) \
                .execute()
        
        fotos = data.get('fotos', {})
        descripcion = data.get('descripcion', {})
        
        fotos_procesadas = {}
        if fotos:
            carpeta = f"recepcion/{id_orden}"
            campos_fotos = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal',
                           'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero']
            
            for campo in campos_fotos:
                valor = fotos.get(campo)
                if valor and isinstance(valor, str) and valor.startswith('data:image'):
                    url = subir_imagen_a_cloudinary(valor, carpeta, campo.replace('url_', ''))
                    fotos_procesadas[campo] = url
                elif valor and isinstance(valor, str) and (valor.startswith('http') or valor.startswith('/uploads/')):
                    fotos_procesadas[campo] = valor
                else:
                    fotos_procesadas[campo] = None
        
        audio_url = descripcion.get('audio_url')
        if audio_url and isinstance(audio_url, str) and audio_url.startswith('data:audio'):
            try:
                carpeta = f"recepcion/{id_orden}"
                timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
                audio_url = subir_audio_a_cloudinary(audio_url, carpeta, f"audio_{timestamp}")
            except Exception as e:
                logger.error(f"Error procesando audio: {str(e)}")
        
        recepcion_update = {
            'url_lateral_izquierda': fotos_procesadas.get('url_lateral_izquierda'),
            'url_lateral_derecha': fotos_procesadas.get('url_lateral_derecha'),
            'url_foto_frontal': fotos_procesadas.get('url_foto_frontal'),
            'url_foto_trasera': fotos_procesadas.get('url_foto_trasera'),
            'url_foto_superior': fotos_procesadas.get('url_foto_superior'),
            'url_foto_inferior': fotos_procesadas.get('url_foto_inferior'),
            'url_foto_tablero': fotos_procesadas.get('url_foto_tablero'),
            'url_grabacion_problema': audio_url or descripcion.get('audio_url'),
            'transcripcion_problema': descripcion.get('texto', '')
        }
        
        supabase.table('recepcion') \
            .update(recepcion_update) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        logger.info(f"Recepción {id_orden} actualizada por {current_user.get('nombre')}")
        
        return jsonify({
            'success': True,
            'message': 'Recepción actualizada correctamente',
            'id_orden': id_orden
        }), 200
        
    except Exception as e:
        logger.error(f"Error actualizando recepción: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# MARCAR EDICIÓN DE SECCIÓN
# =====================================================
@jefe_operativo_recepcion_bp.route('/marcar-editando', methods=['POST'])
@jefe_operativo_required
def marcar_editando(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        seccion = data.get('seccion')
        usuario_id = data.get('usuario_id')
        usuario_nombre = data.get('usuario_nombre')
        
        if not codigo_sesion or codigo_sesion not in sesiones_activas:
            return jsonify({'error': 'Sesión no encontrada'}), 404
        
        sesion = sesiones_activas[codigo_sesion]
        sesion.setdefault('secciones_editando', {})
        sesion['secciones_editando'][seccion] = usuario_id
        
        # Persistir en BD
        guardar_sesion_en_db(sesion)
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        logger.error(f"Error marcando edición: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/liberar-edicion', methods=['POST'])
@jefe_operativo_required
def liberar_edicion(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        seccion = data.get('seccion')
        usuario_id = data.get('usuario_id')
        
        if not codigo_sesion or codigo_sesion not in sesiones_activas:
            return jsonify({'error': 'Sesión no encontrada'}), 404
        
        sesion = sesiones_activas[codigo_sesion]
        
        if sesion.get('secciones_editando', {}).get(seccion) == usuario_id:
            sesion['secciones_editando'][seccion] = None
            # Persistir en BD
            guardar_sesion_en_db(sesion)
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        logger.error(f"Error liberando edición: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT PARA OBTENER COORDENADAS DEL TALLER
# =====================================================
@jefe_operativo_recepcion_bp.route('/taller-coordenadas', methods=['GET'])
@jefe_operativo_required
def obtener_coordenadas_taller(current_user):
    """Retorna las coordenadas del taller para usar en el frontend"""
    return jsonify({
        'success': True,
        'lat': TALLER_LAT,
        'lng': TALLER_LNG
    }), 200