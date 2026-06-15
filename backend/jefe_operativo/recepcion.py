# =====================================================
# RECEPCION.PY - JEFE OPERATIVO
# VERSIÓN CORREGIDA - CON MANEJO DE SESIONES FINALIZADAS
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
import random
import string

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
# COORDENADAS DEL TALLER
# =====================================================
TALLER_LAT = -17.3895
TALLER_LNG = -66.1568

# =====================================================
# ALMACENAMIENTO DE SESIONES COLABORATIVAS
# =====================================================
sesiones_activas = {}

# =====================================================
# FUNCIONES DE PERSISTENCIA
# =====================================================

def guardar_sesion_en_db(sesion):
    try:
        existente = supabase.table('sesion_colaborativa') \
            .select('codigo') \
            .eq('codigo', sesion['codigo']) \
            .execute()
        
        if existente.data:
            supabase.table('sesion_colaborativa') \
                .update({
                    'colaboradores_ids': sesion.get('colaboradores', []),
                    'colaboradores_nombres': sesion.get('colaboradores_nombres', []),
                    'datos': sesion.get('datos', {}),
                    'secciones_completadas': sesion.get('secciones_completadas', {}),
                    'secciones_editando': sesion.get('secciones_editando', {}),
                    'estado': sesion.get('estado', 'activa'),
                    'ultima_actividad': datetime.datetime.now().isoformat()
                }) \
                .eq('codigo', sesion['codigo']) \
                .execute()
        else:
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
        return True
    except Exception as e:
        logger.error(f"Error guardando sesión: {str(e)}")
        return False

def cargar_sesiones_activas_db():
    try:
        # Marcar como inactivas las sesiones que llevan más de 1 hora sin actividad
        limite = datetime.datetime.now() - datetime.timedelta(hours=1)
        supabase.table('sesion_colaborativa') \
            .update({'estado': 'inactiva'}) \
            .eq('estado', 'activa') \
            .lt('ultima_actividad', limite.isoformat()) \
            .execute()
        
        # Cargar solo sesiones activas
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
                'fecha_creacion': s['fecha_creacion'],
                'ultima_actividad': s.get('ultima_actividad', s['fecha_creacion'])
            }
        logger.info(f"📋 Cargadas {len(sesiones)} sesiones activas")
        return sesiones
    except Exception as e:
        logger.error(f"Error cargando sesiones: {str(e)}")
        return {}

def eliminar_sesion_db(codigo):
    try:
        supabase.table('sesion_colaborativa').delete().eq('codigo', codigo).execute()
        return True
    except Exception as e:
        logger.error(f"Error eliminando sesión: {str(e)}")
        return False

def actualizar_actividad_sesion(codigo):
    try:
        supabase.table('sesion_colaborativa') \
            .update({'ultima_actividad': datetime.datetime.now().isoformat()}) \
            .eq('codigo', codigo) \
            .execute()
        return True
    except Exception as e:
        return False

# Cargar sesiones al inicio
try:
    sesiones_activas = cargar_sesiones_activas_db()
    logger.info(f"🚀 {len(sesiones_activas)} sesiones activas cargadas")
except Exception as e:
    logger.error(f"Error: {str(e)}")

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def generar_codigo_unico():
    """
    Genera un código único para orden de trabajo
    Maneja correctamente los reintentos y evita duplicados
    """
    try:
        fecha = datetime.datetime.now()
        año = fecha.strftime('%y')
        mes = fecha.strftime('%m')
        dia = fecha.strftime('%d')
        
        # Buscar el máximo número de secuencia para hoy
        inicio_dia = datetime.datetime.combine(fecha.date(), datetime.time.min)
        fin_dia = datetime.datetime.combine(fecha.date(), datetime.time.max)
        
        # Obtener todas las órdenes de hoy
        ordenes_hoy = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .gte('fecha_ingreso', inicio_dia.isoformat()) \
            .lte('fecha_ingreso', fin_dia.isoformat()) \
            .execute()
        
        # Extraer los números de secuencia existentes
        secuencias_existentes = []
        for orden in (ordenes_hoy.data or []):
            codigo = orden.get('codigo_unico', '')
            try:
                # Formato esperado: OT-YYMMDD-XXX
                partes = codigo.split('-')
                if len(partes) == 3:
                    secuencia = int(partes[2])
                    secuencias_existentes.append(secuencia)
            except (ValueError, IndexError):
                pass
        
        # Determinar la siguiente secuencia disponible
        siguiente = 1
        while siguiente in secuencias_existentes:
            siguiente += 1
        
        secuencia = str(siguiente).zfill(3)
        nuevo_codigo = f"OT-{año}{mes}{dia}-{secuencia}"
        
        logger.info(f"📝 Código generado: {nuevo_codigo}")
        return nuevo_codigo
        
    except Exception as e:
        logger.error(f"Error generando código: {str(e)}")
        # Fallback con timestamp
        timestamp = datetime.datetime.now().strftime('%y%m%d%H%M%S%f')
        return f"OT-{timestamp}"

def generar_codigo_sesion():
    caracteres = string.ascii_uppercase + string.digits
    codigo = ''.join(random.choices(caracteres, k=6))
    return f"S-{codigo}"

def obtener_o_crear_cliente(nombre, telefono, ubicacion, latitud=None, longitud=None):
    id_cliente = None
    id_usuario = None
    
    try:
        if telefono:
            usuario_existente = supabase.table('usuario') \
                .select('id, nombre, ubicacion') \
                .eq('contacto', telefono) \
                .execute()
            
            if usuario_existente.data and len(usuario_existente.data) > 0:
                id_usuario = usuario_existente.data[0]['id']
                
                supabase.table('usuario') \
                    .update({'nombre': nombre, 'ubicacion': ubicacion}) \
                    .eq('id', id_usuario) \
                    .execute()
                
                cliente_existente = supabase.table('cliente') \
                    .select('id') \
                    .eq('id_usuario', id_usuario) \
                    .execute()
                
                if cliente_existente.data and len(cliente_existente.data) > 0:
                    id_cliente = cliente_existente.data[0]['id']
                    
                    cliente_update = {}
                    if latitud is not None:
                        cliente_update['latitud'] = latitud
                    if longitud is not None:
                        cliente_update['longitud'] = longitud
                    if cliente_update:
                        supabase.table('cliente').update(cliente_update).eq('id', id_cliente).execute()
                
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
                return None, None
            
            id_usuario = user_result.data[0]['id']
            
            supabase.table('usuario_rol').insert({
                'id_usuario': id_usuario,
                'id_rol': 5,
                'fecha_asignacion': datetime.datetime.now().isoformat()
            }).execute()
            
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
            
            cliente_result = supabase.table('cliente').insert(cliente_data).execute()
            
            if not cliente_result.data:
                supabase.table('usuario_rol').delete().eq('id_usuario', id_usuario).execute()
                supabase.table('usuario').delete().eq('id', id_usuario).execute()
                return None, None
            
            id_cliente = cliente_result.data[0]['id']
        
        return id_cliente, id_usuario
        
    except Exception as e:
        logger.error(f"Error en obtener_o_crear_cliente: {str(e)}")
        return None, None

def crear_orden_desde_sesion(datos, current_user, sesion_codigo=None, reintentos=3):
    """
    Crea una orden de trabajo desde los datos de la sesión
    Con manejo de reintentos para evitar conflictos de código único
    """
    ultimo_error = None
    
    for intento in range(reintentos):
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
            
            id_cliente, id_usuario = obtener_o_crear_cliente(
                nombre_cliente, telefono_cliente, ubicacion_cliente, latitud, longitud
            )
            
            if not id_cliente:
                return {'success': False, 'error': 'Error creando cliente'}
            
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
            
            # Generar código único (con reintento si falla)
            codigo_unico = generar_codigo_unico()
            
            segundo_jefe_id = None
            if sesion_codigo and sesion_codigo in sesiones_activas:
                sesion = sesiones_activas[sesion_codigo]
                if len(sesion.get('colaboradores', [])) > 1:
                    for colab_id in sesion.get('colaboradores', []):
                        if colab_id != current_user['id']:
                            segundo_jefe_id = colab_id
                            break
            
            orden_data = {
                'codigo_unico': codigo_unico,
                'id_vehiculo': id_vehiculo,
                'id_jefe_operativo': current_user['id'],
                'fecha_ingreso': datetime.datetime.now().isoformat(),
                'estado_global': 'EnRecepcion'
            }
            
            if segundo_jefe_id:
                orden_data['id_jefe_operativo_2'] = segundo_jefe_id
            
            orden_result = supabase.table('ordentrabajo').insert(orden_data).execute()
            
            if not orden_result.data:
                if intento < reintentos - 1:
                    logger.warning(f"⚠️ Intento {intento + 1} falló, reintentando...")
                    continue
                return {'success': False, 'error': 'Error creando orden de trabajo'}
            
            id_orden = orden_result.data[0]['id']
            
            # Guardar recepción
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
            
            logger.info(f"✅ Orden creada: {codigo_unico}")
            return {'success': True, 'codigo': codigo_unico, 'id_orden': id_orden}
            
        except Exception as e:
            ultimo_error = str(e)
            logger.error(f"Error en intento {intento + 1}: {ultimo_error}")
            if intento < reintentos - 1:
                continue
    
    return {'success': False, 'error': ultimo_error or 'Error desconocido'}

# =====================================================
# DECORADOR DE AUTENTICACIÓN
# =====================================================

def jefe_operativo_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            return jsonify({'error': 'Token no proporcionado'}), 401
        
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            
            if 'user' in payload:
                user_data = payload['user']
            else:
                user_data = payload
            
            user_id = user_data.get('id')
            if not user_id:
                return jsonify({'error': 'Token inválido'}), 401
            
            # Obtener usuario
            user_result = supabase.table('usuario') \
                .select('id, nombre, email, contacto') \
                .eq('id', user_id) \
                .execute()
            
            if not user_result.data:
                return jsonify({'error': 'Usuario no encontrado'}), 401
            
            usuario = user_result.data[0]
            
            # Obtener roles
            roles_result = supabase.table('usuario_rol') \
                .select('id_rol, rol!inner(nombre_rol)') \
                .eq('id_usuario', user_id) \
                .execute()
            
            roles = []
            for ur in (roles_result.data or []):
                if 'rol' in ur and 'nombre_rol' in ur['rol']:
                    roles.append(ur['rol']['nombre_rol'])
            
            if 'jefe_operativo' not in roles and 'admin_general' not in roles:
                return jsonify({'error': 'Acceso no autorizado'}), 403
            
            current_user = {
                'id': user_id,
                'nombre': usuario.get('nombre', ''),
                'email': usuario.get('email', ''),
                'roles': roles
            }
            
            return f(current_user, *args, **kwargs)
            
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            return jsonify({'error': str(e)}), 401
    
    return decorated_function

# =====================================================
# ENDPOINTS
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
            'fecha_creacion': datetime.datetime.now().isoformat(),
            'ultima_actividad': datetime.datetime.now().isoformat()
        }
        
        guardar_sesion_en_db(sesion)
        sesiones_activas[codigo_sesion] = sesion
        
        return jsonify({'success': True, 'codigo': codigo_sesion, 'sesion': sesion}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/unirse-sesion', methods=['POST'])
@jefe_operativo_required
def unirse_sesion(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        # Buscar en memoria o base de datos
        if codigo_sesion not in sesiones_activas:
            sesion_db = supabase.table('sesion_colaborativa') \
                .select('*') \
                .eq('codigo', codigo_sesion) \
                .eq('estado', 'activa') \
                .execute()
            
            if sesion_db.data:
                s = sesion_db.data[0]
                sesiones_activas[codigo_sesion] = {
                    'codigo': s['codigo'],
                    'creador': s['creador_id'],
                    'creador_nombre': s['creador_nombre'],
                    'colaboradores': s['colaboradores_ids'],
                    'colaboradores_nombres': s['colaboradores_nombres'],
                    'datos': s['datos'],
                    'secciones_completadas': s['secciones_completadas'],
                    'secciones_editando': s.get('secciones_editando', {}),
                    'estado': s['estado'],
                    'fecha_creacion': s['fecha_creacion'],
                    'ultima_actividad': s.get('ultima_actividad', s['fecha_creacion'])
                }
            else:
                return jsonify({'error': 'Sesión no encontrada o finalizada'}), 404
        
        sesion = sesiones_activas[codigo_sesion]
        
        if sesion.get('estado') != 'activa':
            return jsonify({'error': 'Sesión no activa'}), 400
        
        if len(sesion.get('colaboradores', [])) >= 2:
            return jsonify({'error': 'Máximo 2 colaboradores'}), 400
        
        if current_user['id'] not in sesion.get('colaboradores', []):
            sesion['colaboradores'].append(current_user['id'])
            sesion['colaboradores_nombres'].append(current_user.get('nombre', 'Técnico'))
            sesion['ultima_actividad'] = datetime.datetime.now().isoformat()
            guardar_sesion_en_db(sesion)
        
        return jsonify({'success': True, 'sesion': sesion}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/guardar-seccion', methods=['POST'])
@jefe_operativo_required
def guardar_seccion(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        seccion = data.get('seccion')
        datos_seccion = data.get('datos', {})
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        if codigo_sesion not in sesiones_activas:
            sesion_db = supabase.table('sesion_colaborativa') \
                .select('*') \
                .eq('codigo', codigo_sesion) \
                .eq('estado', 'activa') \
                .execute()
            
            if sesion_db.data:
                s = sesion_db.data[0]
                sesiones_activas[codigo_sesion] = {
                    'codigo': s['codigo'],
                    'creador': s['creador_id'],
                    'creador_nombre': s['creador_nombre'],
                    'colaboradores': s['colaboradores_ids'],
                    'colaboradores_nombres': s['colaboradores_nombres'],
                    'datos': s['datos'],
                    'secciones_completadas': s['secciones_completadas'],
                    'secciones_editando': s.get('secciones_editando', {}),
                    'estado': s['estado'],
                    'fecha_creacion': s['fecha_creacion'],
                    'ultima_actividad': s.get('ultima_actividad', s['fecha_creacion'])
                }
            else:
                return jsonify({'error': 'Sesión no encontrada'}), 404
        
        sesion = sesiones_activas[codigo_sesion]
        
        if sesion.get('estado') != 'activa':
            return jsonify({'error': 'Sesión finalizada'}), 400
        
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
                datos_seccion.get('placa') and datos_seccion.get('marca') and datos_seccion.get('modelo')
            )
            
        elif seccion == 'fotos':
            sesion['datos']['fotos'] = datos_seccion
            fotos_validas = sum(1 for url in datos_seccion.values() if url and url != 'null')
            sesion['secciones_completadas']['fotos'] = fotos_validas == 7
            
        elif seccion == 'descripcion':
            sesion['datos']['descripcion']['texto'] = datos_seccion.get('texto', '')
            audio_url = datos_seccion.get('audio_url')
            if audio_url and audio_url.startswith('http'):
                sesion['datos']['descripcion']['audio_url'] = audio_url
            sesion['secciones_completadas']['descripcion'] = bool(datos_seccion.get('texto'))
        
        sesion['ultima_actividad'] = datetime.datetime.now().isoformat()
        guardar_sesion_en_db(sesion)
        
        return jsonify({'success': True, 'sesion': sesion}), 200
        
    except Exception as e:
        logger.error(f"Error guardando sección: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/obtener-sesion/<codigo>', methods=['GET'])
@jefe_operativo_required
def obtener_sesion(current_user, codigo):
    try:
        if codigo in sesiones_activas:
            return jsonify({'success': True, 'sesion': sesiones_activas[codigo]}), 200
        
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
                'fecha_creacion': s['fecha_creacion'],
                'ultima_actividad': s.get('ultima_actividad', s['fecha_creacion'])
            }
            sesiones_activas[codigo] = sesion
            return jsonify({'success': True, 'sesion': sesion}), 200
        
        return jsonify({'error': 'Sesión no encontrada'}), 404
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/finalizar-sesion', methods=['POST'])
@jefe_operativo_required
def finalizar_sesion(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        datos_directos = data.get('datos')
        
        logger.info(f"📝 Finalizando sesión: {codigo_sesion}")
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        # Buscar en memoria o base de datos
        sesion = None
        if codigo_sesion in sesiones_activas:
            sesion = sesiones_activas[codigo_sesion]
        else:
            sesion_db = supabase.table('sesion_colaborativa') \
                .select('*') \
                .eq('codigo', codigo_sesion) \
                .execute()
            
            if sesion_db.data:
                s = sesion_db.data[0]
                # Si ya está finalizada, solo limpiar
                if s.get('estado') == 'finalizada':
                    if codigo_sesion in sesiones_activas:
                        del sesiones_activas[codigo_sesion]
                    return jsonify({'error': 'La sesión ya fue finalizada'}), 400
                
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
                    'fecha_creacion': s['fecha_creacion'],
                    'ultima_actividad': s.get('ultima_actividad', s['fecha_creacion'])
                }
            else:
                return jsonify({'error': 'Sesión no encontrada'}), 404
        
        if sesion.get('estado') != 'activa':
            return jsonify({'error': 'La sesión no está activa'}), 400
        
        if datos_directos:
            sesion['datos'] = datos_directos
        
        # Validar secciones completadas
        secciones_faltantes = [s for s, c in sesion['secciones_completadas'].items() if not c]
        if secciones_faltantes:
            return jsonify({'error': f'Faltan: {", ".join(secciones_faltantes)}'}), 400
        
        # Crear orden de trabajo
        resultado = crear_orden_desde_sesion(sesion['datos'], current_user, codigo_sesion, reintentos=3)
        
        if not resultado['success']:
            logger.error(f"❌ Error creando orden: {resultado.get('error')}")
            return jsonify({'error': resultado.get('error', 'Error desconocido')}), 500
        
        # Cambiar estado a 'finalizada' en base de datos
        supabase.table('sesion_colaborativa') \
            .update({'estado': 'finalizada'}) \
            .eq('codigo', codigo_sesion) \
            .execute()
        
        # Eliminar de la memoria (sesiones_activas)
        if codigo_sesion in sesiones_activas:
            del sesiones_activas[codigo_sesion]
        
        logger.info(f"✅ Sesión {codigo_sesion} finalizada y eliminada de activas. Orden: {resultado['codigo']}")
        
        return jsonify({
            'success': True,
            'codigo': resultado['codigo'],
            'id_orden': resultado['id_orden']
        }), 200
        
    except Exception as e:
        logger.error(f"Error finalizando: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/verificar-placa/<placa>', methods=['GET'])
@jefe_operativo_required
def verificar_placa(current_user, placa):
    try:
        placa = placa.upper()
        resultado = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, id_cliente, cliente!inner(id_usuario), usuario:cliente!inner(id_usuario)!inner(nombre, contacto)') \
            .eq('placa', placa) \
            .execute()
        
        if resultado.data:
            v = resultado.data[0]
            cliente_data = v.get('usuario', {})
            return jsonify({
                'exists': True,
                'vehiculo': {
                    'placa': v['placa'],
                    'marca': v.get('marca', ''),
                    'modelo': v.get('modelo', ''),
                    'cliente': cliente_data.get('nombre', ''),
                    'telefono': cliente_data.get('contacto', '')
                }
            }), 200
        return jsonify({'exists': False}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/cancelar-sesion', methods=['DELETE'])
@jefe_operativo_required
def cancelar_sesion(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        if codigo_sesion in sesiones_activas:
            del sesiones_activas[codigo_sesion]
        
        eliminar_sesion_db(codigo_sesion)
        
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/ping-sesion/<codigo>', methods=['GET'])
@jefe_operativo_required
def ping_sesion(current_user, codigo):
    try:
        if codigo in sesiones_activas:
            sesiones_activas[codigo]['ultima_actividad'] = datetime.datetime.now().isoformat()
        actualizar_actividad_sesion(codigo)
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/sesiones-activas', methods=['GET'])
@jefe_operativo_required
def listar_sesiones_activas(current_user):
    try:
        # Limpiar sesiones finalizadas de memoria
        sesiones_a_eliminar = []
        for codigo, s in sesiones_activas.items():
            if s.get('estado') == 'finalizada':
                sesiones_a_eliminar.append(codigo)
        
        for codigo in sesiones_a_eliminar:
            if codigo in sesiones_activas:
                del sesiones_activas[codigo]
        
        # Construir lista de sesiones activas (solo estado 'activa')
        sesiones = []
        for codigo, s in sesiones_activas.items():
            if s.get('estado') == 'activa':
                sesiones.append({
                    'codigo': s['codigo'],
                    'creador_nombre': s['creador_nombre'],
                    'colaboradores': s.get('colaboradores', []),
                    'colaboradores_nombres': s.get('colaboradores_nombres', []),
                    'secciones_completadas': s.get('secciones_completadas', {}),
                    'fecha_creacion': s.get('fecha_creacion'),
                    'estado': s.get('estado', 'activa')
                })
        
        return jsonify({'success': True, 'sesiones': sesiones}), 200
    except Exception as e:
        logger.error(f"Error listando sesiones: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/listar-recepciones', methods=['GET'])
@jefe_operativo_required
def listar_recepciones(current_user):
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo, vehiculo!inner(placa, marca, modelo, cliente!inner(id_usuario, usuario!inner(nombre, contacto, ubicacion)))') \
            .order('fecha_ingreso', desc=True) \
            .limit(50) \
            .execute()
        
        recepciones = []
        for orden in (resultado.data or []):
            vehiculo = orden.get('vehiculo', {})
            cliente = vehiculo.get('cliente', {})
            usuario = cliente.get('usuario', {})
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
        return jsonify({'error': str(e)}), 500


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
            j1 = supabase.table('usuario').select('id, nombre, contacto, email').eq('id', orden['id_jefe_operativo']).execute()
            if j1.data:
                jefe_principal = j1.data[0]
        
        jefe_secundario = {}
        if orden.get('id_jefe_operativo_2'):
            j2 = supabase.table('usuario').select('id, nombre, contacto, email').eq('id', orden['id_jefe_operativo_2']).execute()
            if j2.data:
                jefe_secundario = j2.data[0]
        
        vehiculo_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('id', orden['id_vehiculo']) \
            .single() \
            .execute()
        
        vehiculo = vehiculo_result.data if vehiculo_result.data else {}
        
        usuario = {}
        cliente_data = {}
        if vehiculo.get('id_cliente'):
            c_result = supabase.table('cliente').select('id, id_usuario, latitud, longitud').eq('id', vehiculo['id_cliente']).single().execute()
            if c_result.data:
                cliente_data = c_result.data
                if cliente_data.get('id_usuario'):
                    u_result = supabase.table('usuario').select('nombre, contacto, ubicacion, email').eq('id', cliente_data['id_usuario']).single().execute()
                    if u_result.data:
                        usuario = u_result.data
        
        recepcion_result = supabase.table('recepcion').select('*').eq('id_orden_trabajo', id_orden).single().execute()
        recepcion = recepcion_result.data if recepcion_result.data else {}
        
        return jsonify({
            'success': True,
            'detalle': {
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
                'latitud': cliente_data.get('latitud'),
                'longitud': cliente_data.get('longitud'),
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
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/eliminar-recepcion/<int:id_orden>', methods=['DELETE'])
@jefe_operativo_required
def eliminar_recepcion(current_user, id_orden):
    try:
        orden_result = supabase.table('ordentrabajo').select('id, estado_global').eq('id', id_orden).execute()
        if not orden_result.data:
            return jsonify({'error': 'Recepción no encontrada'}), 404
        
        if orden_result.data[0]['estado_global'] != 'EnRecepcion':
            return jsonify({'error': 'No se puede eliminar'}), 400
        
        supabase.table('recepcion').delete().eq('id_orden_trabajo', id_orden).execute()
        supabase.table('ordentrabajo').delete().eq('id', id_orden).execute()
        
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/actualizar-recepcion/<int:id_orden>', methods=['PUT'])
@jefe_operativo_required
def actualizar_recepcion(current_user, id_orden):
    try:
        data = request.get_json()
        
        cliente_data = data.get('cliente', {})
        id_cliente, _ = obtener_o_crear_cliente(
            cliente_data.get('nombre', ''),
            cliente_data.get('telefono', ''),
            cliente_data.get('ubicacion', ''),
            cliente_data.get('latitud'),
            cliente_data.get('longitud')
        )
        
        if not id_cliente:
            return jsonify({'error': 'Error procesando cliente'}), 500
        
        vehiculo_data = data.get('vehiculo', {})
        orden_actual = supabase.table('ordentrabajo').select('id_vehiculo').eq('id', id_orden).single().execute()
        
        if orden_actual.data:
            supabase.table('vehiculo').update({
                'id_cliente': id_cliente,
                'placa': vehiculo_data.get('placa', '').upper(),
                'marca': vehiculo_data.get('marca', ''),
                'modelo': vehiculo_data.get('modelo', ''),
                'anio': vehiculo_data.get('anio'),
                'kilometraje': vehiculo_data.get('kilometraje', 0)
            }).eq('id', orden_actual.data['id_vehiculo']).execute()
        
        fotos = data.get('fotos', {})
        descripcion = data.get('descripcion', {})
        
        supabase.table('recepcion').update({
            'url_lateral_izquierda': fotos.get('url_lateral_izquierda'),
            'url_lateral_derecha': fotos.get('url_lateral_derecha'),
            'url_foto_frontal': fotos.get('url_foto_frontal'),
            'url_foto_trasera': fotos.get('url_foto_trasera'),
            'url_foto_superior': fotos.get('url_foto_superior'),
            'url_foto_inferior': fotos.get('url_foto_inferior'),
            'url_foto_tablero': fotos.get('url_foto_tablero'),
            'url_grabacion_problema': descripcion.get('audio_url'),
            'transcripcion_problema': descripcion.get('texto', '')
        }).eq('id_orden_trabajo', id_orden).execute()
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/marcar-editando', methods=['POST'])
@jefe_operativo_required
def marcar_editando(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        seccion = data.get('seccion')
        usuario_id = data.get('usuario_id')
        
        if codigo_sesion in sesiones_activas:
            sesiones_activas[codigo_sesion].setdefault('secciones_editando', {})
            sesiones_activas[codigo_sesion]['secciones_editando'][seccion] = usuario_id
            guardar_sesion_en_db(sesiones_activas[codigo_sesion])
        
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/liberar-edicion', methods=['POST'])
@jefe_operativo_required
def liberar_edicion(current_user):
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        seccion = data.get('seccion')
        usuario_id = data.get('usuario_id')
        
        if codigo_sesion in sesiones_activas:
            if sesiones_activas[codigo_sesion].get('secciones_editando', {}).get(seccion) == usuario_id:
                sesiones_activas[codigo_sesion]['secciones_editando'][seccion] = None
                guardar_sesion_en_db(sesiones_activas[codigo_sesion])
        
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@jefe_operativo_recepcion_bp.route('/taller-coordenadas', methods=['GET'])
@jefe_operativo_required
def obtener_coordenadas_taller(current_user):
    return jsonify({'success': True, 'lat': TALLER_LAT, 'lng': TALLER_LNG}), 200