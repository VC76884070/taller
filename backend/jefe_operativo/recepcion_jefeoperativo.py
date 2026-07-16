# =====================================================
# RECEPCION_JEFEOPERATIVO.PY - VERSIÓN COMPLETA
# CON TODOS LOS ENDPOINTS
# =====================================================

from flask import Blueprint, request, jsonify, current_app
from functools import wraps
from config import config
import jwt
import datetime
import logging
from werkzeug.security import generate_password_hash
import uuid
import random
import string
import re
import tempfile
import os
import requests
from io import BytesIO

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
# FUNCIÓN PARA NORMALIZAR URLS DE GOOGLE DRIVE
# =====================================================
def normalizar_url_drive(url):
    if not url:
        return None
    if url == 'null' or url == 'None' or url == '':
        return None
    if 'uc?export=view' in url or 'export=download' in url or 'uc?export=download' in url:
        return url
    match = re.search(r'/file/d/([a-zA-Z0-9_-]+)', url)
    if match:
        file_id = match.group(1)
        if '.wav' in url or '.mp3' in url or '.m4a' in url or 'audio' in url.lower():
            return f"https://drive.google.com/uc?export=download&id={file_id}"
        return f"https://drive.google.com/uc?export=view&id={file_id}"
    match = re.search(r'open\?id=([a-zA-Z0-9_-]+)', url)
    if match:
        file_id = match.group(1)
        if '.wav' in url or '.mp3' in url or '.m4a' in url or 'audio' in url.lower():
            return f"https://drive.google.com/uc?export=download&id={file_id}"
        return f"https://drive.google.com/uc?export=view&id={file_id}"
    if 'id=' in url:
        file_id = url.split('id=')[-1].split('&')[0]
        if '.wav' in url or '.mp3' in url or '.m4a' in url or 'audio' in url.lower():
            return f"https://drive.google.com/uc?export=download&id={file_id}"
        return f"https://drive.google.com/uc?export=view&id={file_id}"
    return url

def obtener_file_id_drive(url):
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

def verificar_url_audio(url):
    if not url:
        return False
    try:
        response = requests.head(url, timeout=5)
        return response.status_code == 200
    except:
        return False

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
            user_result = supabase.table('usuario') \
                .select('id, nombre, email, contacto') \
                .eq('id', user_id) \
                .execute()
            if not user_result.data:
                return jsonify({'error': 'Usuario no encontrado'}), 401
            usuario = user_result.data[0]
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
    caracteres = string.ascii_uppercase + string.digits
    codigo = ''.join(random.choices(caracteres, k=6))
    return f"S-{codigo}"

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

def cargar_sesion_de_db(codigo):
    try:
        resultado = supabase.table('sesion_colaborativa') \
            .select('*') \
            .eq('codigo', codigo) \
            .execute()
        if resultado.data:
            s = resultado.data[0]
            return {
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
        return None
    except Exception as e:
        logger.error(f"Error cargando sesión: {str(e)}")
        return None

# =====================================================
# ENDPOINT 1: PING
# =====================================================
@recepcion_jefe_bp.route('/ping', methods=['GET'])
def ping():
    return jsonify({
        'success': True,
        'message': '✅ Jefe Operativo Recepción funcionando correctamente',
        'endpoints': [
            '/sesiones-activas',
            '/listar-recepciones',
            '/listar-recepciones-simple',
            '/iniciar-sesion',
            '/obtener-sesion/<codigo>',
            '/guardar-seccion',
            '/unirse-sesion',
            '/finalizar-sesion',
            '/cancelar-sesion',
            '/ping-sesion/<codigo>',
            '/verificar-placa/<placa>',
            '/upload-foto',
            '/upload-audio',
            '/renombrar-carpeta',
            '/imagen-base64',
            '/actualizar-foto-sesion',
            '/verificar-fotos/<codigo>',
            '/verificar-carpeta/<nombre>',
            '/detalle-recepcion/<int:id_orden>',
            '/obtener-audio/<int:id_orden>',
            '/eliminar-recepcion/<int:id_orden>',
            '/generar-pdf-recepcion/<int:id_orden>',
            '/descargar-pdf-recepcion/<int:id_orden>',
            '/proxy-audio',
            '/actualizar-recepcion/<int:id_orden>'
        ]
    }), 200

# =====================================================
# ENDPOINT 2: SESIONES ACTIVAS
# =====================================================
@recepcion_jefe_bp.route('/sesiones-activas', methods=['GET'])
@jefe_operativo_required
def listar_sesiones_activas(current_user):
    global sesiones_activas
    try:
        sesiones_a_eliminar = []
        for codigo, s in sesiones_activas.items():
            if s.get('estado') == 'finalizada':
                sesiones_a_eliminar.append(codigo)
        for codigo in sesiones_a_eliminar:
            if codigo in sesiones_activas:
                del sesiones_activas[codigo]
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
# ENDPOINT 3: LISTAR RECEPCIONES
# =====================================================
@recepcion_jefe_bp.route('/listar-recepciones', methods=['GET'])
@jefe_operativo_required
def listar_recepciones(current_user):
    try:
        limit = request.args.get('limit', 5, type=int)
        offset = request.args.get('offset', 0, type=int)
        if limit > 50:
            limit = 50
        try:
            resultado = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
                .order('fecha_ingreso', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()
        except AttributeError:
            start = offset
            end = offset + limit
            resultado = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
                .order('fecha_ingreso', desc=True) \
                .range(start, end - 1) \
                .execute()
        total_result = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .execute()
        total_ordenes = total_result.count if hasattr(total_result, 'count') else len(total_result.data or [])
        recepciones = []
        for orden in (resultado.data or []):
            recepcion = {
                'id': orden.get('id'),
                'codigo_unico': orden.get('codigo_unico', 'OT-N/A'),
                'fecha_ingreso': orden.get('fecha_ingreso'),
                'estado_global': orden.get('estado_global', 'EnRecepcion'),
                'cliente_nombre': 'N/A',
                'cliente_telefono': 'N/A',
                'cliente_email': 'N/A',
                'cliente_ubicacion': '',
                'latitud': None,
                'longitud': None,
                'placa': 'N/A',
                'marca': '',
                'modelo': '',
                'anio': None,
                'kilometraje': 0
            }
            id_vehiculo = orden.get('id_vehiculo')
            if id_vehiculo:
                try:
                    v_result = supabase.table('vehiculo') \
                        .select('placa, marca, modelo, anio, kilometraje, id_cliente') \
                        .eq('id', id_vehiculo) \
                        .execute()
                    if v_result.data:
                        v = v_result.data[0]
                        recepcion['placa'] = v.get('placa') or 'N/A'
                        recepcion['marca'] = v.get('marca') or ''
                        recepcion['modelo'] = v.get('modelo') or ''
                        recepcion['anio'] = v.get('anio')
                        recepcion['kilometraje'] = v.get('kilometraje') or 0
                        id_cliente = v.get('id_cliente')
                        if id_cliente:
                            try:
                                c_result = supabase.table('cliente') \
                                    .select('id_usuario, latitud, longitud, ubicacion_confirmada') \
                                    .eq('id', id_cliente) \
                                    .execute()
                                if c_result.data:
                                    c = c_result.data[0]
                                    recepcion['latitud'] = c.get('latitud')
                                    recepcion['longitud'] = c.get('longitud')
                                    id_usuario = c.get('id_usuario')
                                    if id_usuario:
                                        u_result = supabase.table('usuario') \
                                            .select('nombre, contacto, email, ubicacion') \
                                            .eq('id', id_usuario) \
                                            .execute()
                                        if u_result.data:
                                            u = u_result.data[0]
                                            recepcion['cliente_nombre'] = u.get('nombre') or 'N/A'
                                            recepcion['cliente_telefono'] = u.get('contacto') or 'N/A'
                                            recepcion['cliente_email'] = u.get('email') or 'N/A'
                                            recepcion['cliente_ubicacion'] = u.get('ubicacion') or ''
                            except Exception as e:
                                logger.warning(f"⚠️ Error obteniendo cliente: {e}")
                except Exception as e:
                    logger.warning(f"⚠️ Error obteniendo vehículo: {e}")
            recepciones.append(recepcion)
        return jsonify({
            'success': True,
            'recepciones': recepciones,
            'paginacion': {
                'total': total_ordenes,
                'limit': limit,
                'offset': offset,
                'has_more': (offset + limit) < total_ordenes
            }
        }), 200
    except Exception as e:
        logger.error(f"❌ Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e), 'recepciones': []}), 500

# =====================================================
# ENDPOINT 4: LISTAR RECEPCIONES (SIMPLE)
# =====================================================
@recepcion_jefe_bp.route('/listar-recepciones-simple', methods=['GET'])
@jefe_operativo_required
def listar_recepciones_simple(current_user):
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .order('fecha_ingreso', desc=True) \
            .limit(50) \
            .execute()
        recepciones = []
        for orden in (resultado.data or []):
            recepcion = {
                'id': orden.get('id'),
                'codigo_unico': orden.get('codigo_unico', 'OT-N/A'),
                'fecha_ingreso': orden.get('fecha_ingreso'),
                'estado_global': orden.get('estado_global', 'EnRecepcion'),
                'cliente_nombre': 'N/A',
                'cliente_telefono': 'N/A',
                'cliente_email': 'N/A',
                'cliente_ubicacion': '',
                'latitud': None,
                'longitud': None,
                'placa': 'N/A',
                'marca': '',
                'modelo': '',
                'anio': None,
                'kilometraje': 0
            }
            id_vehiculo = orden.get('id_vehiculo')
            if id_vehiculo:
                try:
                    v_result = supabase.table('vehiculo') \
                        .select('placa, marca, modelo, anio, kilometraje, id_cliente') \
                        .eq('id', id_vehiculo) \
                        .execute()
                    if v_result.data:
                        v = v_result.data[0]
                        recepcion['placa'] = v.get('placa') or 'N/A'
                        recepcion['marca'] = v.get('marca') or ''
                        recepcion['modelo'] = v.get('modelo') or ''
                        recepcion['anio'] = v.get('anio')
                        recepcion['kilometraje'] = v.get('kilometraje') or 0
                        id_cliente = v.get('id_cliente')
                        if id_cliente:
                            try:
                                c_result = supabase.table('cliente') \
                                    .select('id_usuario, latitud, longitud, ubicacion_confirmada') \
                                    .eq('id', id_cliente) \
                                    .execute()
                                if c_result.data:
                                    c = c_result.data[0]
                                    recepcion['latitud'] = c.get('latitud')
                                    recepcion['longitud'] = c.get('longitud')
                                    id_usuario = c.get('id_usuario')
                                    if id_usuario:
                                        u_result = supabase.table('usuario') \
                                            .select('nombre, contacto, email, ubicacion') \
                                            .eq('id', id_usuario) \
                                            .execute()
                                        if u_result.data:
                                            u = u_result.data[0]
                                            recepcion['cliente_nombre'] = u.get('nombre') or 'N/A'
                                            recepcion['cliente_telefono'] = u.get('contacto') or 'N/A'
                                            recepcion['cliente_email'] = u.get('email') or 'N/A'
                                            recepcion['cliente_ubicacion'] = u.get('ubicacion') or ''
                            except Exception as e:
                                logger.warning(f"⚠️ Error obteniendo cliente: {e}")
                except Exception as e:
                    logger.warning(f"⚠️ Error obteniendo vehículo: {e}")
            recepciones.append(recepcion)
        return jsonify({'success': True, 'recepciones': recepciones}), 200
    except Exception as e:
        logger.error(f"❌ Error: {str(e)}")
        return jsonify({'success': True, 'recepciones': []}), 200

# =====================================================
# ENDPOINT 5: INICIAR SESIÓN
# =====================================================
@recepcion_jefe_bp.route('/iniciar-sesion', methods=['POST'])
@jefe_operativo_required
def iniciar_sesion(current_user):
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
# ENDPOINT 6: OBTENER SESIÓN
# =====================================================
@recepcion_jefe_bp.route('/obtener-sesion/<codigo>', methods=['GET'])
@jefe_operativo_required
def obtener_sesion(current_user, codigo):
    global sesiones_activas
    try:
        if codigo in sesiones_activas:
            return jsonify({'success': True, 'sesion': sesiones_activas[codigo]}), 200
        sesion = cargar_sesion_de_db(codigo)
        if sesion:
            sesiones_activas[codigo] = sesion
            return jsonify({'success': True, 'sesion': sesion}), 200
        return jsonify({'error': 'Sesión no encontrada'}), 404
    except Exception as e:
        logger.error(f"Error obteniendo sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 7: GUARDAR SECCIÓN
# =====================================================
@recepcion_jefe_bp.route('/guardar-seccion', methods=['POST'])
@jefe_operativo_required
def guardar_seccion(current_user):
    global sesiones_activas
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        seccion = data.get('seccion')
        datos_seccion = data.get('datos', {})
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        if codigo_sesion not in sesiones_activas:
            sesion = cargar_sesion_de_db(codigo_sesion)
            if not sesion:
                return jsonify({'error': 'Sesión no encontrada'}), 404
            sesiones_activas[codigo_sesion] = sesion
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
            if 'datos' not in sesion:
                sesion['datos'] = {}
            if 'fotos' not in sesion['datos']:
                sesion['datos']['fotos'] = {}
            for campo, valor in datos_seccion.items():
                if valor and valor != 'null' and valor != '':
                    sesion['datos']['fotos'][campo] = valor
            fotos = sesion['datos']['fotos']
            fotos_validas = sum(1 for v in fotos.values() if v and v != 'null' and v != '')
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
# ENDPOINT 8: UNIRSE A SESIÓN
# =====================================================
@recepcion_jefe_bp.route('/unirse-sesion', methods=['POST'])
@jefe_operativo_required
def unirse_sesion(current_user):
    global sesiones_activas
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        if codigo_sesion not in sesiones_activas:
            sesion = cargar_sesion_de_db(codigo_sesion)
            if not sesion:
                return jsonify({'error': 'Sesión no encontrada'}), 404
            sesiones_activas[codigo_sesion] = sesion
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
# ENDPOINT 9: FINALIZAR SESIÓN (CORREGIDO)
# =====================================================
@recepcion_jefe_bp.route('/finalizar-sesion', methods=['POST'])
@jefe_operativo_required
def finalizar_sesion(current_user):
    global sesiones_activas
    try:
        from google_drive import google_drive
        
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        datos_directos = data.get('datos', {})
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        if codigo_sesion not in sesiones_activas:
            sesion = cargar_sesion_de_db(codigo_sesion)
            if not sesion:
                return jsonify({'error': 'Sesión no encontrada'}), 404
            sesiones_activas[codigo_sesion] = sesion
        
        sesion = sesiones_activas[codigo_sesion]
        
        if sesion.get('estado') != 'activa':
            return jsonify({'error': 'Sesión no activa'}), 400
        
        # COMBINAR DATOS
        if datos_directos:
            if 'fotos' in datos_directos:
                sesion['datos']['fotos'] = datos_directos['fotos']
            if 'cliente' in datos_directos:
                sesion['datos']['cliente'] = datos_directos['cliente']
            if 'vehiculo' in datos_directos:
                sesion['datos']['vehiculo'] = datos_directos['vehiculo']
            if 'descripcion' in datos_directos:
                sesion['datos']['descripcion'] = datos_directos['descripcion']
        
        # RECONTAR FOTOS
        fotos = sesion['datos'].get('fotos', {})
        fotos_validas = sum(1 for v in fotos.values() if v and v != 'null' and v != '')
        logger.info(f"📸 Fotos en sesión: {fotos_validas}/7")
        
        # VALIDAR SECCIONES
        secciones_faltantes = []
        if not sesion['secciones_completadas'].get('cliente'):
            secciones_faltantes.append('Cliente')
        if not sesion['secciones_completadas'].get('vehiculo'):
            secciones_faltantes.append('Vehículo')
        if fotos_validas < 7:
            secciones_faltantes.append(f'Fotos ({fotos_validas}/7)')
        if not sesion['secciones_completadas'].get('descripcion'):
            secciones_faltantes.append('Descripción')
        
        # PERMITIR CONTINUAR CON 7 FOTOS EN DOM
        if fotos_validas >= 7:
            sesion['secciones_completadas']['fotos'] = True
            secciones_faltantes = [s for s in secciones_faltantes if 'Fotos' not in s]
        
        if secciones_faltantes:
            return jsonify({
                'error': f'Faltan secciones: {", ".join(secciones_faltantes)}',
                'fotos_encontradas': fotos_validas
            }), 400
        
        # CREAR ORDEN DE TRABAJO
        try:
            cliente_data = sesion['datos'].get('cliente', {})
            vehiculo_data = sesion['datos'].get('vehiculo', {})
            descripcion_data = sesion['datos'].get('descripcion', {})
            
            # Obtener o crear cliente
            id_cliente = None
            id_usuario = None
            telefono = cliente_data.get('telefono', '')
            nombre = cliente_data.get('nombre', '')
            ubicacion = cliente_data.get('ubicacion', '')
            latitud = cliente_data.get('latitud')
            longitud = cliente_data.get('longitud')
            
            if telefono:
                usuario_existente = supabase.table('usuario') \
                    .select('id') \
                    .eq('contacto', telefono) \
                    .execute()
                if usuario_existente.data:
                    id_usuario = usuario_existente.data[0]['id']
                    cliente_existente = supabase.table('cliente') \
                        .select('id') \
                        .eq('id_usuario', id_usuario) \
                        .execute()
                    if cliente_existente.data:
                        id_cliente = cliente_existente.data[0]['id']
            
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
                if user_result.data:
                    id_usuario = user_result.data[0]['id']
                    supabase.table('usuario_rol').insert({
                        'id_usuario': id_usuario,
                        'id_rol': 5,
                        'fecha_asignacion': datetime.datetime.now().isoformat()
                    }).execute()
                    cliente_result = supabase.table('cliente').insert({
                        'id_usuario': id_usuario,
                        'tipo_documento': 'CI',
                        'numero_documento': f"TEMP-{int(datetime.datetime.now().timestamp())}",
                        'email': email_cliente,
                        'latitud': latitud,
                        'longitud': longitud
                    }).execute()
                    if cliente_result.data:
                        id_cliente = cliente_result.data[0]['id']
            
            if not id_cliente:
                return jsonify({'error': 'Error creando cliente'}), 500
            
            # Obtener o crear vehículo
            placa = vehiculo_data.get('placa', '').upper()
            id_vehiculo = None
            
            if placa:
                vehiculo_existente = supabase.table('vehiculo') \
                    .select('id') \
                    .eq('placa', placa) \
                    .execute()
                if vehiculo_existente.data:
                    id_vehiculo = vehiculo_existente.data[0]['id']
                    supabase.table('vehiculo') \
                        .update({
                            'marca': vehiculo_data.get('marca', ''),
                            'modelo': vehiculo_data.get('modelo', ''),
                            'anio': vehiculo_data.get('anio'),
                            'kilometraje': vehiculo_data.get('kilometraje', 0),
                            'id_cliente': id_cliente
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
                    if vehiculo_result.data:
                        id_vehiculo = vehiculo_result.data[0]['id']
            
            if not id_vehiculo:
                return jsonify({'error': 'Error creando vehículo'}), 500
            
            # Generar código único
            fecha = datetime.datetime.now()
            inicio_dia = datetime.datetime.combine(fecha.date(), datetime.time.min)
            fin_dia = datetime.datetime.combine(fecha.date(), datetime.time.max)
            ordenes_hoy = supabase.table('ordentrabajo') \
                .select('codigo_unico') \
                .gte('fecha_ingreso', inicio_dia.isoformat()) \
                .lte('fecha_ingreso', fin_dia.isoformat()) \
                .execute()
            secuencias_existentes = []
            for orden in (ordenes_hoy.data or []):
                codigo = orden.get('codigo_unico', '')
                try:
                    partes = codigo.split('-')
                    if len(partes) == 3:
                        secuencia = int(partes[2])
                        secuencias_existentes.append(secuencia)
                except (ValueError, IndexError):
                    pass
            siguiente = 1
            while siguiente in secuencias_existentes:
                siguiente += 1
            codigo_unico = f"OT-{fecha.strftime('%y%m%d')}-{str(siguiente).zfill(3)}"
            
            # Crear orden de trabajo
            orden_data = {
                'codigo_unico': codigo_unico,
                'id_vehiculo': id_vehiculo,
                'id_jefe_operativo': current_user['id'],
                'fecha_ingreso': datetime.datetime.now().isoformat(),
                'estado_global': 'EnRecepcion'
            }
            if len(sesion.get('colaboradores', [])) > 1:
                for colab_id in sesion.get('colaboradores', []):
                    if colab_id != current_user['id']:
                        orden_data['id_jefe_operativo_2'] = colab_id
                        break
            
            orden_result = supabase.table('ordentrabajo').insert(orden_data).execute()
            if not orden_result.data:
                return jsonify({'error': 'Error creando orden de trabajo'}), 500
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
            supabase.table('recepcion').insert(recepcion_data).execute()
            
            # RENOMBRAR CARPETA EN DRIVE
            carpeta_renombrada = False
            try:
                folder_id = google_drive.get_folder_id_by_name(codigo_sesion)
                if folder_id:
                    rename_result = google_drive.rename_folder(folder_id, codigo_unico)
                    if rename_result:
                        carpeta_renombrada = True
                        logger.info(f"✅ Carpeta renombrada: {codigo_sesion} -> {codigo_unico}")
                    else:
                        logger.warning(f"⚠️ No se pudo renombrar la carpeta {codigo_sesion}")
                else:
                    logger.warning(f"⚠️ No se encontró la carpeta: {codigo_sesion}")
            except Exception as e:
                logger.error(f"❌ Error renombrando carpeta: {str(e)}")
            
            # Marcar sesión como finalizada
            sesion['estado'] = 'finalizada'
            guardar_sesion_en_db(sesion)
            
            if codigo_sesion in sesiones_activas:
                del sesiones_activas[codigo_sesion]
            
            logger.info(f"✅ Sesión {codigo_sesion} finalizada. Orden: {codigo_unico}")
            
            return jsonify({
                'success': True,
                'codigo': codigo_unico,
                'id_orden': id_orden,
                'carpeta_renombrada': carpeta_renombrada,
                'message': 'Recepción guardada exitosamente'
            }), 200
            
        except Exception as e:
            logger.error(f"Error creando orden: {str(e)}")
            return jsonify({'error': str(e)}), 500
        
    except Exception as e:
        logger.error(f"Error finalizando: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 10: CANCELAR SESIÓN
# =====================================================
@recepcion_jefe_bp.route('/cancelar-sesion', methods=['DELETE'])
@jefe_operativo_required
def cancelar_sesion(current_user):
    global sesiones_activas
    try:
        from google_drive import google_drive
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        logger.info(f"🗑️ Cancelando sesión: {codigo_sesion}")
        carpeta_eliminada = False
        try:
            folder_id = google_drive.get_folder_id_by_name(codigo_sesion)
            if folder_id:
                delete_result = google_drive.delete_folder(folder_id)
                if delete_result:
                    carpeta_eliminada = True
                    logger.info(f"✅ Carpeta eliminada de Drive: {codigo_sesion}")
                else:
                    logger.warning(f"⚠️ No se pudo eliminar la carpeta: {codigo_sesion}")
            else:
                logger.warning(f"⚠️ Carpeta NO encontrada en Drive: {codigo_sesion}")
        except Exception as e:
            logger.error(f"❌ Error eliminando carpeta de Drive: {str(e)}")
        try:
            supabase.table('sesion_colaborativa') \
                .delete() \
                .eq('codigo', codigo_sesion) \
                .execute()
        except Exception as e:
            logger.error(f"❌ Error eliminando de Supabase: {str(e)}")
        if codigo_sesion in sesiones_activas:
            del sesiones_activas[codigo_sesion]
        return jsonify({
            'success': True,
            'message': f'Sesión {codigo_sesion} cancelada',
            'carpeta_eliminada': carpeta_eliminada
        }), 200
    except Exception as e:
        logger.error(f"❌ Error cancelando sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 11: PING SESIÓN
# =====================================================
@recepcion_jefe_bp.route('/ping-sesion/<codigo>', methods=['GET'])
@jefe_operativo_required
def ping_sesion(current_user, codigo):
    global sesiones_activas
    try:
        if codigo in sesiones_activas:
            sesiones_activas[codigo]['ultima_actividad'] = datetime.datetime.now().isoformat()
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error en ping: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 12: VERIFICAR PLACA
# =====================================================
@recepcion_jefe_bp.route('/verificar-placa/<placa>', methods=['GET'])
@jefe_operativo_required
def verificar_placa(current_user, placa):
    try:
        placa = placa.upper()
        resultado = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, cliente!inner(id_usuario, usuario!inner(nombre, contacto))') \
            .eq('placa', placa) \
            .execute()
        if resultado.data:
            v = resultado.data[0]
            cliente = v.get('cliente', {})
            usuario = cliente.get('usuario', {})
            return jsonify({
                'exists': True,
                'vehiculo': {
                    'placa': v['placa'],
                    'marca': v.get('marca', ''),
                    'modelo': v.get('modelo', ''),
                    'cliente': usuario.get('nombre', ''),
                    'telefono': usuario.get('contacto', '')
                }
            }), 200
        return jsonify({'exists': False}), 200
    except Exception as e:
        logger.error(f"Error verificando placa: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 13: SUBIR FOTO
# =====================================================
@recepcion_jefe_bp.route('/upload-foto', methods=['POST'])
@jefe_operativo_required
def upload_foto_drive(current_user):
    try:
        from google_drive import google_drive
        from datetime import datetime
        
        if 'file' not in request.files:
            return jsonify({'error': 'No se envió el archivo'}), 400
        
        file = request.files.get('file')
        campo = request.form.get('campo', 'general')
        codigo_sesion = request.form.get('codigo_sesion')
        
        if not file or file.filename == '':
            return jsonify({'error': 'Archivo vacío'}), 400
        
        if not codigo_sesion:
            return jsonify({'error': 'No se recibió el código de sesión'}), 400
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        user_id = current_user['id']
        filename = f"{campo}_{user_id}_{timestamp}.jpg"
        
        folder_path = google_drive.generate_folder_path(
            modulo='recepcion',
            referencia_id=codigo_sesion,
            subcarpeta='fotos'
        )
        
        result = google_drive.upload_file(
            file_data=file,
            filename=filename,
            folder_path=folder_path
        )
        
        url = result['url']
        logger.info(f"📸 Foto subida: {campo}")
        
        if codigo_sesion in sesiones_activas:
            sesion = sesiones_activas[codigo_sesion]
            if 'datos' not in sesion:
                sesion['datos'] = {}
            if 'fotos' not in sesion['datos']:
                sesion['datos']['fotos'] = {}
            
            campo_map = {
                'lateral_izquierdo': 'url_lateral_izquierda',
                'lateral_derecho': 'url_lateral_derecha',
                'frontal': 'url_foto_frontal',
                'trasera': 'url_foto_trasera',
                'superior': 'url_foto_superior',
                'inferior': 'url_foto_inferior',
                'tablero': 'url_foto_tablero'
            }
            campo_db = campo_map.get(campo, campo)
            
            sesion['datos']['fotos'][campo_db] = url
            guardar_sesion_en_db(sesion)
        
        return jsonify({
            'success': True,
            'url': url,
            'id': result['id'],
            'web_view_link': result['web_view_link']
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error subiendo foto: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 14: ACTUALIZAR FOTO EN SESIÓN
# =====================================================
@recepcion_jefe_bp.route('/actualizar-foto-sesion', methods=['POST'])
@jefe_operativo_required
def actualizar_foto_sesion(current_user):
    global sesiones_activas
    try:
        data = request.get_json()
        codigo_sesion = data.get('codigo_sesion')
        campo = data.get('campo')
        url = data.get('url')
        if not codigo_sesion or not campo or not url:
            return jsonify({'error': 'Faltan datos requeridos'}), 400
        if codigo_sesion not in sesiones_activas:
            sesion = cargar_sesion_de_db(codigo_sesion)
            if not sesion:
                return jsonify({'error': 'Sesión no encontrada'}), 404
            sesiones_activas[codigo_sesion] = sesion
        sesion = sesiones_activas[codigo_sesion]
        if 'datos' not in sesion:
            sesion['datos'] = {}
        if 'fotos' not in sesion['datos']:
            sesion['datos']['fotos'] = {}
        campo_map = {
            'lateral_izquierdo': 'url_lateral_izquierda',
            'lateral_derecho': 'url_lateral_derecha',
            'frontal': 'url_foto_frontal',
            'trasera': 'url_foto_trasera',
            'superior': 'url_foto_superior',
            'inferior': 'url_foto_inferior',
            'tablero': 'url_foto_tablero'
        }
        campo_db = campo_map.get(campo, campo)
        sesion['datos']['fotos'][campo_db] = url
        fotos = sesion['datos']['fotos']
        fotos_validas = sum(1 for v in fotos.values() if v and v != 'null' and v != '')
        fotos_completas = fotos_validas == 7
        if 'secciones_completadas' not in sesion:
            sesion['secciones_completadas'] = {}
        sesion['secciones_completadas']['fotos'] = fotos_completas
        guardar_sesion_en_db(sesion)
        return jsonify({
            'success': True,
            'fotos_subidas': fotos_validas,
            'total': 7,
            'completado': fotos_completas
        }), 200
    except Exception as e:
        logger.error(f"❌ Error actualizando foto en sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 15: VERIFICAR FOTOS
# =====================================================
@recepcion_jefe_bp.route('/verificar-fotos/<codigo>', methods=['GET'])
@jefe_operativo_required
def verificar_fotos(current_user, codigo):
    global sesiones_activas
    try:
        if codigo not in sesiones_activas:
            sesion = cargar_sesion_de_db(codigo)
            if not sesion:
                return jsonify({'error': 'Sesión no encontrada'}), 404
            sesiones_activas[codigo] = sesion
        sesion = sesiones_activas[codigo]
        fotos = sesion.get('datos', {}).get('fotos', {})
        campos_fotos = [
            'url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal',
            'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'
        ]
        fotos_subidas = 0
        fotos_estado = {}
        for campo in campos_fotos:
            url = fotos.get(campo)
            if url and url != 'null' and url != '':
                fotos_subidas += 1
                fotos_estado[campo] = True
            else:
                fotos_estado[campo] = False
        completado = fotos_subidas == 7
        return jsonify({
            'success': True,
            'total': 7,
            'subidas': fotos_subidas,
            'completado': completado,
            'estado': fotos_estado
        }), 200
    except Exception as e:
        logger.error(f"Error verificando fotos: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 16: VERIFICAR CARPETA EN DRIVE
# =====================================================
@recepcion_jefe_bp.route('/verificar-carpeta/<nombre>', methods=['GET'])
@jefe_operativo_required
def verificar_carpeta(current_user, nombre):
    try:
        from google_drive import google_drive
        folder_id = google_drive.get_folder_id_by_name(nombre)
        if folder_id:
            return jsonify({
                'success': True,
                'exists': True,
                'folder_id': folder_id,
                'nombre': nombre
            }), 200
        return jsonify({
            'success': True,
            'exists': False,
            'nombre': nombre
        }), 200
    except Exception as e:
        logger.error(f"Error verificando carpeta: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 17: SUBIR AUDIO
# =====================================================
@recepcion_jefe_bp.route('/upload-audio', methods=['POST'])
@jefe_operativo_required
def upload_audio_drive(current_user):
    try:
        from google_drive import google_drive
        from datetime import datetime
        
        file = request.files.get('file')
        codigo_sesion = request.form.get('codigo_sesion')
        
        if not file:
            return jsonify({'error': 'No se envió el archivo'}), 400
        if not codigo_sesion:
            return jsonify({'error': 'No se recibió el código de sesión'}), 400
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        user_id = current_user['id']
        filename = f"audio_{user_id}_{timestamp}.wav"
        
        folder_path = google_drive.generate_folder_path(
            modulo='recepcion',
            referencia_id=codigo_sesion,
            subcarpeta='audios'
        )
        
        result = google_drive.upload_file(
            file_data=file,
            filename=filename,
            folder_path=folder_path,
            mime_type='audio/wav'
        )
        
        logger.info(f"🎵 Audio subido")
        
        try:
            if codigo_sesion in sesiones_activas:
                sesion = sesiones_activas[codigo_sesion]
                if 'datos' not in sesion:
                    sesion['datos'] = {}
                if 'descripcion' not in sesion['datos']:
                    sesion['datos']['descripcion'] = {}
                sesion['datos']['descripcion']['audio_url'] = result['url']
                guardar_sesion_en_db(sesion)
        except Exception as e:
            logger.warning(f"⚠️ No se pudo actualizar sesión con audio: {e}")
        
        return jsonify({
            'success': True,
            'url': result['url'],
            'id': result['id'],
            'web_view_link': result['web_view_link']
        }), 200
    except Exception as e:
        logger.error(f"❌ Error subiendo audio: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 18: RENOMBRAR CARPETA
# =====================================================
@recepcion_jefe_bp.route('/renombrar-carpeta', methods=['POST'])
@jefe_operativo_required
def renombrar_carpeta_drive(current_user):
    try:
        from google_drive import google_drive
        data = request.get_json()
        nombre_actual = data.get('nombre_actual')
        nombre_nuevo = data.get('nombre_nuevo')
        if not nombre_actual or not nombre_nuevo:
            return jsonify({'error': 'Se requieren nombre_actual y nombre_nuevo'}), 400
        folder_id = google_drive.get_folder_id_by_name(nombre_actual)
        if not folder_id:
            return jsonify({'error': f'No se encontró la carpeta: {nombre_actual}'}), 404
        resultado = google_drive.rename_folder(folder_id, nombre_nuevo)
        if resultado:
            return jsonify({'success': True, 'message': f'Carpeta renombrada: {nombre_actual} -> {nombre_nuevo}'})
        return jsonify({'success': False, 'error': 'Error al renombrar'}), 500
    except Exception as e:
        logger.error(f"❌ Error renombrando carpeta: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 19: IMAGEN A BASE64
# =====================================================
@recepcion_jefe_bp.route('/imagen-base64', methods=['POST'])
@jefe_operativo_required
def obtener_imagen_base64(current_user):
    try:
        import requests
        import base64
        data = request.get_json()
        url = data.get('url')
        if not url:
            return jsonify({'error': 'URL requerida'}), 400
        url_normalizada = normalizar_url_drive(url)
        response = requests.get(url_normalizada, timeout=30)
        if response.status_code != 200:
            return jsonify({'error': f'Error descargando imagen: {response.status_code}'}), 400
        content_type = response.headers.get('content-type', 'image/jpeg')
        img_base64 = base64.b64encode(response.content).decode('utf-8')
        base64_data = f"data:{content_type};base64,{img_base64}"
        return jsonify({'success': True, 'base64': base64_data}), 200
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Timeout descargando imagen'}), 500
    except Exception as e:
        logger.error(f"❌ Error obteniendo imagen base64: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 20: DETALLE RECEPCIÓN
# =====================================================
@recepcion_jefe_bp.route('/detalle-recepcion/<int:id_orden>', methods=['GET'])
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
            j1 = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .eq('id', orden['id_jefe_operativo']) \
                .execute()
            if j1.data:
                jefe_principal = j1.data[0]
        
        jefe_secundario = {}
        if orden.get('id_jefe_operativo_2'):
            j2 = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .eq('id', orden['id_jefe_operativo_2']) \
                .execute()
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
            c_result = supabase.table('cliente') \
                .select('id, id_usuario, latitud, longitud, ubicacion_confirmada') \
                .eq('id', vehiculo['id_cliente']) \
                .single() \
                .execute()
            if c_result.data:
                cliente_data = c_result.data
                if cliente_data.get('id_usuario'):
                    u_result = supabase.table('usuario') \
                        .select('id, nombre, contacto, ubicacion, email') \
                        .eq('id', cliente_data['id_usuario']) \
                        .single() \
                        .execute()
                    if u_result.data:
                        usuario = u_result.data
        
        recepcion_result = supabase.table('recepcion') \
            .select('''
                id, url_lateral_izquierda, url_lateral_derecha, url_foto_frontal,
                url_foto_trasera, url_foto_superior, url_foto_inferior, url_foto_tablero,
                url_grabacion_problema, transcripcion_problema, url_pdf
            ''') \
            .eq('id_orden_trabajo', id_orden) \
            .single() \
            .execute()
        recepcion = recepcion_result.data if recepcion_result.data else {}
        
        fotos_limpias = {}
        fotos = {
            'url_lateral_izquierda': recepcion.get('url_lateral_izquierda'),
            'url_lateral_derecha': recepcion.get('url_lateral_derecha'),
            'url_foto_frontal': recepcion.get('url_foto_frontal'),
            'url_foto_trasera': recepcion.get('url_foto_trasera'),
            'url_foto_superior': recepcion.get('url_foto_superior'),
            'url_foto_inferior': recepcion.get('url_foto_inferior'),
            'url_foto_tablero': recepcion.get('url_foto_tablero')
        }
        for key, value in fotos.items():
            if value and value != 'null' and value != 'None' and value != '':
                fotos_limpias[key] = normalizar_url_drive(value)
            else:
                fotos_limpias[key] = None
        
        audio_url = recepcion.get('url_grabacion_problema')
        if audio_url and audio_url != 'null' and audio_url != 'None' and audio_url != '':
            audio_url = normalizar_url_drive(audio_url)
        else:
            audio_url = None
        
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
            'kilometraje': vehiculo.get('kilometraje', 0),
            'cliente_nombre': usuario.get('nombre', ''),
            'cliente_telefono': usuario.get('contacto', ''),
            'cliente_ubicacion': usuario.get('ubicacion', ''),
            'latitud': cliente_data.get('latitud'),
            'longitud': cliente_data.get('longitud'),
            'ubicacion_confirmada': cliente_data.get('ubicacion_confirmada', False),
            'fotos': fotos_limpias,
            'audio_url': audio_url,
            'transcripcion_problema': recepcion.get('transcripcion_problema', ''),
            'url_pdf': recepcion.get('url_pdf')
        }
        
        return jsonify({'success': True, 'detalle': detalle}), 200
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 21: OBTENER AUDIO
# =====================================================
@recepcion_jefe_bp.route('/obtener-audio/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def obtener_audio_recepcion(current_user, id_orden):
    try:
        recepcion_result = supabase.table('recepcion') \
            .select('url_grabacion_problema') \
            .eq('id_orden_trabajo', id_orden) \
            .single() \
            .execute()
        if not recepcion_result.data:
            return jsonify({'error': 'Recepción no encontrada'}), 404
        audio_url = recepcion_result.data.get('url_grabacion_problema')
        if not audio_url or audio_url == 'null' or audio_url == 'None' or audio_url == '':
            return jsonify({'error': 'No hay audio disponible'}), 404
        audio_normalizada = normalizar_url_drive(audio_url)
        try:
            response = requests.head(audio_normalizada, timeout=5)
            if response.status_code != 200:
                file_id = obtener_file_id_drive(audio_url)
                if file_id:
                    audio_normalizada = f"https://drive.google.com/uc?export=download&id={file_id}"
        except:
            pass
        return jsonify({
            'success': True,
            'audio_url': audio_normalizada,
            'original_url': audio_url
        }), 200
    except Exception as e:
        logger.error(f"❌ Error obteniendo audio: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 22: ELIMINAR RECEPCIÓN
# =====================================================
@recepcion_jefe_bp.route('/eliminar-recepcion/<int:id_orden>', methods=['DELETE'])
@jefe_operativo_required
def eliminar_recepcion(current_user, id_orden):
    try:
        orden_result = supabase.table('ordentrabajo').select('id, estado_global').eq('id', id_orden).execute()
        if not orden_result.data:
            return jsonify({'error': 'Recepción no encontrada'}), 404
        if orden_result.data[0]['estado_global'] != 'EnRecepcion':
            return jsonify({'error': 'No se puede eliminar una recepción en este estado'}), 400
        supabase.table('recepcion').delete().eq('id_orden_trabajo', id_orden).execute()
        supabase.table('ordentrabajo').delete().eq('id', id_orden).execute()
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error eliminando recepción: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 23: GENERAR PDF
# =====================================================
@recepcion_jefe_bp.route('/generar-pdf-recepcion/<int:id_orden>', methods=['POST'])
@jefe_operativo_required
def generar_pdf_recepcion(current_user, id_orden):
    try:
        from google_drive import google_drive
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.lib.enums import TA_CENTER
        from datetime import datetime
        
        logger.info(f"📄 Generando PDF para orden {id_orden}")
        
        detalle_response = detalle_recepcion(current_user, id_orden)
        detalle_data = detalle_response.get_json()
        if not detalle_data.get('success'):
            return jsonify({'error': 'Error obteniendo datos'}), 500
        detalle = detalle_data.get('detalle', {})
        
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
            pdf_path = tmp_file.name
        
        doc = SimpleDocTemplate(pdf_path, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=20, textColor=colors.HexColor('#C1121F'), alignment=TA_CENTER, spaceAfter=12)
        heading_style = ParagraphStyle('CustomHeading', parent=styles['Heading2'], fontSize=14, textColor=colors.HexColor('#C1121F'), spaceAfter=6, spaceBefore=12)
        normal_style = ParagraphStyle('CustomNormal', parent=styles['Normal'], fontSize=10, spaceAfter=4)
        
        story = []
        story.append(Paragraph("FURIA MOTOR COMPANY", title_style))
        story.append(Paragraph("ORDEN DE TRABAJO - RECEPCIÓN", heading_style))
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph(f"<b>Código:</b> {detalle.get('codigo_unico', 'N/A')}", normal_style))
        story.append(Paragraph(f"<b>Fecha de Ingreso:</b> {detalle.get('fecha_ingreso', 'No registrada')}", normal_style))
        story.append(Paragraph(f"<b>Estado:</b> {detalle.get('estado_global', 'En Recepción')}", normal_style))
        story.append(Spacer(1, 0.5*cm))
        
        story.append(Paragraph("👤 DATOS DEL CLIENTE", heading_style))
        story.append(Paragraph(f"<b>Nombre:</b> {detalle.get('cliente_nombre', 'No registrado')}", normal_style))
        story.append(Paragraph(f"<b>Teléfono:</b> {detalle.get('cliente_telefono', 'No registrado')}", normal_style))
        story.append(Paragraph(f"<b>Ubicación:</b> {detalle.get('cliente_ubicacion', 'No especificada')}", normal_style))
        story.append(Spacer(1, 0.3*cm))
        
        story.append(Paragraph("🚗 DATOS DEL VEHÍCULO", heading_style))
        story.append(Paragraph(f"<b>Placa:</b> {detalle.get('placa', 'No registrada')}", normal_style))
        story.append(Paragraph(f"<b>Marca:</b> {detalle.get('marca', 'No registrada')}", normal_style))
        story.append(Paragraph(f"<b>Modelo:</b> {detalle.get('modelo', 'No registrado')}", normal_style))
        story.append(Paragraph(f"<b>Año:</b> {detalle.get('anio', 'No especificado')}", normal_style))
        story.append(Paragraph(f"<b>Kilometraje:</b> {detalle.get('kilometraje', 0)} km", normal_style))
        story.append(Spacer(1, 0.3*cm))
        
        story.append(Paragraph("📝 DESCRIPCIÓN DEL PROBLEMA", heading_style))
        story.append(Paragraph(detalle.get('transcripcion_problema', 'No se registró descripción'), normal_style))
        story.append(Spacer(1, 0.3*cm))
        
        story.append(Paragraph("✍️ FIRMAS", heading_style))
        story.append(Spacer(1, 0.3*cm))
        firma_data = [
            ['', ''],
            ['Firma del Cliente', 'Firma del Jefe Operativo'],
            ['_________________________', '_________________________'],
            [detalle.get('cliente_nombre', '____________________'), detalle.get('jefe_operativo', {}).get('nombre', '____________________')],
            [datetime.now().strftime('%d/%m/%Y %H:%M'), datetime.now().strftime('%d/%m/%Y %H:%M')]
        ]
        firma_table = Table(firma_data, colWidths=[7*cm, 7*cm])
        firma_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LINEABOVE', (0, 2), (-1, 2), 1, colors.black),
        ]))
        story.append(firma_table)
        story.append(Spacer(1, 0.5*cm))
        story.append(Paragraph("Documento generado automáticamente por FURIA MOTOR COMPANY", 
                              ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#999999'), alignment=TA_CENTER)))
        
        doc.build(story)
        logger.info(f"✅ PDF generado: {pdf_path}")
        
        with open(pdf_path, 'rb') as f:
            pdf_data = f.read()
        
        nombre_archivo = f"Recepcion_{detalle.get('codigo_unico', 'orden')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        folder_path = google_drive.generate_folder_path(
            modulo='recepcion',
            referencia_id=detalle.get('codigo_unico', 'orden'),
            subcarpeta='documentos'
        )
        result = google_drive.upload_file(
            file_data=pdf_data,
            filename=nombre_archivo,
            folder_path=folder_path,
            mime_type='application/pdf',
            public=True
        )
        
        supabase.table('recepcion') \
            .update({'url_pdf': result['url']}) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        try:
            os.unlink(pdf_path)
        except:
            pass
        
        logger.info(f"✅ PDF subido a Drive")
        return jsonify({
            'success': True,
            'url': result['url'],
            'filename': nombre_archivo,
            'message': 'PDF generado y guardado en Google Drive'
        }), 200
    except Exception as e:
        logger.error(f"❌ Error generando PDF: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 24: DESCARGAR PDF
# =====================================================
@recepcion_jefe_bp.route('/descargar-pdf-recepcion/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def descargar_pdf_recepcion(current_user, id_orden):
    try:
        resultado = supabase.table('recepcion') \
            .select('url_pdf') \
            .eq('id_orden_trabajo', id_orden) \
            .single() \
            .execute()
        if not resultado.data or not resultado.data.get('url_pdf'):
            return jsonify({'error': 'PDF no encontrado'}), 404
        return jsonify({'success': True, 'url': resultado.data['url_pdf']}), 200
    except Exception as e:
        logger.error(f"❌ Error obteniendo PDF: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 25: PROXY AUDIO
# =====================================================
@recepcion_jefe_bp.route('/proxy-audio', methods=['GET'])
@jefe_operativo_required
def proxy_audio(current_user):
    try:
        import requests
        from flask import Response, stream_with_context
        
        url = request.args.get('url')
        if not url:
            return jsonify({'error': 'URL requerida'}), 400
        
        file_id = obtener_file_id_drive(url)
        if not file_id:
            return jsonify({'error': 'No se pudo extraer el ID del archivo'}), 400
        
        download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
        response = requests.get(download_url, stream=True, timeout=30)
        
        if response.status_code != 200:
            return jsonify({'error': f'Error descargando audio: {response.status_code}'}), 400
        
        content_type = response.headers.get('content-type', 'audio/wav')
        
        def generate():
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        
        return Response(
            stream_with_context(generate()),
            headers={
                'Content-Type': content_type,
                'Content-Disposition': 'inline',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache'
            }
        )
    except Exception as e:
        logger.error(f"❌ Error en proxy de audio: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 26: ACTUALIZAR RECEPCIÓN
# =====================================================
@recepcion_jefe_bp.route('/actualizar-recepcion/<int:id_orden>', methods=['PUT'])
@jefe_operativo_required
def actualizar_recepcion(current_user, id_orden):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Datos no proporcionados'}), 400
        
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        orden = orden_result.data
        if orden.get('estado_global') != 'EnRecepcion':
            return jsonify({'error': f'No se puede editar una orden en estado "{orden.get("estado_global")}"'}), 400
        
        cliente_data = data.get('cliente', {})
        vehiculo_data = data.get('vehiculo', {})
        fotos = data.get('fotos', {})
        descripcion = data.get('descripcion', {})
        
        # Actualizar cliente
        vehiculo_actual = supabase.table('vehiculo') \
            .select('id_cliente') \
            .eq('id', orden['id_vehiculo']) \
            .single() \
            .execute()
        if vehiculo_actual.data:
            id_cliente = vehiculo_actual.data.get('id_cliente')
            if id_cliente:
                cliente_db = supabase.table('cliente') \
                    .select('id_usuario') \
                    .eq('id', id_cliente) \
                    .single() \
                    .execute()
                if cliente_db.data:
                    id_usuario = cliente_db.data.get('id_usuario')
                    if id_usuario:
                        supabase.table('usuario') \
                            .update({
                                'nombre': cliente_data.get('nombre', ''),
                                'contacto': cliente_data.get('telefono', ''),
                                'ubicacion': cliente_data.get('ubicacion', '')
                            }) \
                            .eq('id', id_usuario) \
                            .execute()
                    supabase.table('cliente') \
                        .update({
                            'latitud': cliente_data.get('latitud'),
                            'longitud': cliente_data.get('longitud')
                        }) \
                        .eq('id', id_cliente) \
                        .execute()
        
        # Actualizar vehículo
        supabase.table('vehiculo') \
            .update({
                'placa': vehiculo_data.get('placa', '').upper(),
                'marca': vehiculo_data.get('marca', ''),
                'modelo': vehiculo_data.get('modelo', ''),
                'anio': vehiculo_data.get('anio'),
                'kilometraje': vehiculo_data.get('kilometraje', 0)
            }) \
            .eq('id', orden['id_vehiculo']) \
            .execute()
        
        # Actualizar recepción
        recepcion_update = {
            'url_lateral_izquierda': fotos.get('url_lateral_izquierda'),
            'url_lateral_derecha': fotos.get('url_lateral_derecha'),
            'url_foto_frontal': fotos.get('url_foto_frontal'),
            'url_foto_trasera': fotos.get('url_foto_trasera'),
            'url_foto_superior': fotos.get('url_foto_superior'),
            'url_foto_inferior': fotos.get('url_foto_inferior'),
            'url_foto_tablero': fotos.get('url_foto_tablero'),
            'transcripcion_problema': descripcion.get('texto', '')
        }
        if descripcion.get('audio_url'):
            recepcion_update['url_grabacion_problema'] = descripcion.get('audio_url')
        
        supabase.table('recepcion') \
            .update(recepcion_update) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Recepción actualizada exitosamente',
            'codigo_unico': orden.get('codigo_unico')
        }), 200
    except Exception as e:
        logger.error(f"❌ Error actualizando recepción: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500