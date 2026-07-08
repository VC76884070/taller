# =====================================================
# RECEPCION_JEFEOPERATIVO.PY - VERSIÓN NUEVA Y LIMPIA
# CON TODOS LOS ENDPOINTS CORREGIDOS
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging
from werkzeug.security import generate_password_hash
import uuid
import random
import string

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
recepcion_jefe_bp = Blueprint('recepcion_jefe', __name__, url_prefix='/api/jefe-operativo')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# ALMACENAMIENTO DE SESIONES COLABORATIVAS
# =====================================================
sesiones_activas = {}

# =====================================================
# DECORADOR DE AUTENTICACIÓN
# =====================================================

def jefe_operativo_required(f):
    """Decorador para verificar que el usuario es jefe operativo"""
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
# FUNCIONES AUXILIARES
# =====================================================

def generar_codigo_sesion():
    """Genera un código único para una sesión colaborativa"""
    caracteres = string.ascii_uppercase + string.digits
    codigo = ''.join(random.choices(caracteres, k=6))
    return f"S-{codigo}"

def guardar_sesion_en_db(sesion):
    """Guarda o actualiza una sesión en la base de datos"""
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

# =====================================================
# ENDPOINT 1: SESIONES ACTIVAS (CORREGIDO)
# =====================================================

@recepcion_jefe_bp.route('/sesiones-activas', methods=['GET'])
@jefe_operativo_required
def listar_sesiones_activas(current_user):
    """Lista todas las sesiones activas"""
    global sesiones_activas  # ← LÍNEA OBLIGATORIA
    try:
        # Limpiar sesiones finalizadas
        sesiones_a_eliminar = []
        for codigo, s in sesiones_activas.items():
            if s.get('estado') == 'finalizada':
                sesiones_a_eliminar.append(codigo)
        
        for codigo in sesiones_a_eliminar:
            if codigo in sesiones_activas:
                del sesiones_activas[codigo]
        
        # Construir lista de sesiones activas
        sesiones = []
        for codigo, s in sesiones_activas.items():
            if s.get('estado') == 'activa':
                sesiones.append({
                    'codigo': s['codigo'],
                    'creador_nombre': s.get('creador_nombre', ''),
                    'colaboradores': s.get('colaboradores', []),
                    'colaboradores_nombres': s.get('colaboradores_nombres', []),
                    'secciones_completadas': s.get('secciones_completadas', {}),
                    'fecha_creacion': s.get('fecha_creacion'),
                    'estado': s.get('estado', 'activa')
                })
        
        return jsonify({'success': True, 'sesiones': sesiones}), 200
    except Exception as e:
        logger.error(f"Error listando sesiones: {str(e)}")
        return jsonify({'success': True, 'sesiones': []}), 200

# =====================================================
# ENDPOINT 2: LISTAR RECEPCIONES
# =====================================================

@recepcion_jefe_bp.route('/listar-recepciones', methods=['GET'])
@jefe_operativo_required
def listar_recepciones(current_user):
    """Lista las recepciones guardadas"""
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .order('fecha_ingreso', desc=True) \
            .limit(50) \
            .execute()
        
        recepciones = []
        for orden in (resultado.data or []):
            vehiculo = {}
            if orden.get('id_vehiculo'):
                v_result = supabase.table('vehiculo') \
                    .select('placa, marca, modelo') \
                    .eq('id', orden['id_vehiculo']) \
                    .execute()
                if v_result.data:
                    vehiculo = v_result.data[0]
            
            recepciones.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'estado_global': orden['estado_global'],
                'placa': vehiculo.get('placa', ''),
                'marca': vehiculo.get('marca', ''),
                'modelo': vehiculo.get('modelo', '')
            })
        
        return jsonify({'success': True, 'recepciones': recepciones}), 200
    except Exception as e:
        logger.error(f"Error listando recepciones: {str(e)}")
        return jsonify({'success': True, 'recepciones': []}), 200

# =====================================================
# ENDPOINT 3: INICIAR SESIÓN
# =====================================================

@recepcion_jefe_bp.route('/iniciar-sesion', methods=['POST'])
@jefe_operativo_required
def iniciar_sesion(current_user):
    """Crea una nueva sesión colaborativa"""
    global sesiones_activas
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
        logger.error(f"Error iniciando sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 4: OBTENER SESIÓN
# =====================================================

@recepcion_jefe_bp.route('/obtener-sesion/<codigo>', methods=['GET'])
@jefe_operativo_required
def obtener_sesion(current_user, codigo):
    """Obtiene los datos de una sesión específica"""
    global sesiones_activas
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
        logger.error(f"Error obteniendo sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 5: GUARDAR SECCIÓN
# =====================================================

@recepcion_jefe_bp.route('/guardar-seccion', methods=['POST'])
@jefe_operativo_required
def guardar_seccion(current_user):
    """Guarda una sección específica de la sesión"""
    global sesiones_activas
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        seccion = data.get('seccion')
        datos_seccion = data.get('datos', {})
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        if codigo_sesion not in sesiones_activas:
            return jsonify({'error': 'Sesión no encontrada'}), 404
        
        sesion = sesiones_activas[codigo_sesion]
        
        if sesion.get('estado') != 'activa':
            return jsonify({'error': 'Sesión finalizada'}), 400
        
        # Guardar según la sección
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

# =====================================================
# ENDPOINT 6: UNIRSE A SESIÓN
# =====================================================

@recepcion_jefe_bp.route('/unirse-sesion', methods=['POST'])
@jefe_operativo_required
def unirse_sesion(current_user):
    """Permite a un jefe operativo unirse a una sesión existente"""
    global sesiones_activas
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        if codigo_sesion not in sesiones_activas:
            return jsonify({'error': 'Sesión no encontrada'}), 404
        
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
        logger.error(f"Error uniéndose a sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 7: FINALIZAR SESIÓN
# =====================================================

@recepcion_jefe_bp.route('/finalizar-sesion', methods=['POST'])
@jefe_operativo_required
def finalizar_sesion(current_user):
    """Finaliza una sesión y crea la orden de trabajo"""
    global sesiones_activas
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        if codigo_sesion not in sesiones_activas:
            return jsonify({'error': 'Sesión no encontrada'}), 404
        
        sesion = sesiones_activas[codigo_sesion]
        
        if sesion.get('estado') != 'activa':
            return jsonify({'error': 'Sesión no activa'}), 400
        
        # Validar secciones completadas
        secciones_faltantes = [s for s, c in sesion['secciones_completadas'].items() if not c]
        if secciones_faltantes:
            return jsonify({'error': f'Faltan: {", ".join(secciones_faltantes)}'}), 400
        
        # Crear orden de trabajo (simplificado)
        try:
            # Generar código único
            fecha = datetime.datetime.now()
            codigo_unico = f"OT-{fecha.strftime('%y%m%d')}-001"
            
            # Crear orden
            orden_data = {
                'codigo_unico': codigo_unico,
                'id_jefe_operativo': current_user['id'],
                'fecha_ingreso': datetime.datetime.now().isoformat(),
                'estado_global': 'EnRecepcion'
            }
            
            # Obtener o crear vehículo
            placa = sesion['datos'].get('vehiculo', {}).get('placa', '').upper()
            if placa:
                vehiculo_existente = supabase.table('vehiculo') \
                    .select('id') \
                    .eq('placa', placa) \
                    .execute()
                
                if vehiculo_existente.data:
                    orden_data['id_vehiculo'] = vehiculo_existente.data[0]['id']
                else:
                    # Crear vehículo
                    vehiculo_result = supabase.table('vehiculo').insert({
                        'placa': placa,
                        'marca': sesion['datos'].get('vehiculo', {}).get('marca', ''),
                        'modelo': sesion['datos'].get('vehiculo', {}).get('modelo', '')
                    }).execute()
                    if vehiculo_result.data:
                        orden_data['id_vehiculo'] = vehiculo_result.data[0]['id']
            
            orden_result = supabase.table('ordentrabajo').insert(orden_data).execute()
            
            if not orden_result.data:
                return jsonify({'error': 'Error creando orden'}), 500
            
            id_orden = orden_result.data[0]['id']
            
            # Guardar recepción
            recepcion_data = {
                'id_orden_trabajo': id_orden,
                'url_lateral_izquierda': sesion['datos'].get('fotos', {}).get('url_lateral_izquierda'),
                'url_lateral_derecha': sesion['datos'].get('fotos', {}).get('url_lateral_derecha'),
                'url_foto_frontal': sesion['datos'].get('fotos', {}).get('url_foto_frontal'),
                'url_foto_trasera': sesion['datos'].get('fotos', {}).get('url_foto_trasera'),
                'url_foto_superior': sesion['datos'].get('fotos', {}).get('url_foto_superior'),
                'url_foto_inferior': sesion['datos'].get('fotos', {}).get('url_foto_inferior'),
                'url_foto_tablero': sesion['datos'].get('fotos', {}).get('url_foto_tablero'),
                'transcripcion_problema': sesion['datos'].get('descripcion', {}).get('texto', '')
            }
            
            supabase.table('recepcion').insert(recepcion_data).execute()
            
            # Eliminar sesión
            if codigo_sesion in sesiones_activas:
                del sesiones_activas[codigo_sesion]
            
            return jsonify({
                'success': True,
                'codigo': codigo_unico,
                'id_orden': id_orden
            }), 200
            
        except Exception as e:
            logger.error(f"Error creando orden: {str(e)}")
            return jsonify({'error': str(e)}), 500
        
    except Exception as e:
        logger.error(f"Error finalizando: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 8: CANCELAR SESIÓN
# =====================================================

@recepcion_jefe_bp.route('/cancelar-sesion', methods=['DELETE'])
@jefe_operativo_required
def cancelar_sesion(current_user):
    """Cancela una sesión activa"""
    global sesiones_activas
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        if codigo_sesion in sesiones_activas:
            del sesiones_activas[codigo_sesion]
        
        # Eliminar de la base de datos
        supabase.table('sesion_colaborativa') \
            .delete() \
            .eq('codigo', codigo_sesion) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': f'Sesión {codigo_sesion} cancelada'
        }), 200
        
    except Exception as e:
        logger.error(f"Error cancelando sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 9: PING SESIÓN
# =====================================================

@recepcion_jefe_bp.route('/ping-sesion/<codigo>', methods=['GET'])
@jefe_operativo_required
def ping_sesion(current_user, codigo):
    """Mantiene activa una sesión"""
    global sesiones_activas
    try:
        if codigo in sesiones_activas:
            sesiones_activas[codigo]['ultima_actividad'] = datetime.datetime.now().isoformat()
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error en ping: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 10: VERIFICAR PLACA
# =====================================================

@recepcion_jefe_bp.route('/verificar-placa/<placa>', methods=['GET'])
@jefe_operativo_required
def verificar_placa(current_user, placa):
    """Verifica si una placa ya existe en el sistema"""
    try:
        placa = placa.upper()
        resultado = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo') \
            .eq('placa', placa) \
            .execute()
        
        if resultado.data:
            v = resultado.data[0]
            return jsonify({
                'exists': True,
                'vehiculo': {
                    'placa': v['placa'],
                    'marca': v.get('marca', ''),
                    'modelo': v.get('modelo', '')
                }
            }), 200
        return jsonify({'exists': False}), 200
    except Exception as e:
        logger.error(f"Error verificando placa: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@recepcion_jefe_bp.route('/ping', methods=['GET'])
def ping():
    """Endpoint de prueba"""
    return jsonify({
        'success': True,
        'message': '✅ Jefe Operativo Recepción funcionando correctamente',
        'endpoints': [
            '/sesiones-activas',
            '/listar-recepciones',
            '/iniciar-sesion',
            '/obtener-sesion/<codigo>',
            '/guardar-seccion',
            '/unirse-sesion',
            '/finalizar-sesion',
            '/cancelar-sesion',
            '/ping-sesion/<codigo>',
            '/verificar-placa/<placa>'
        ]
    }), 200