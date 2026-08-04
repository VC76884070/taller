# =====================================================
# RECEPCION_JEFEOPERATIVO.PY - VERSIÓN COMPLETA CORREGIDA
# CON TODOS LOS ENDPOINTS Y CORRECCIÓN DE AUDIO Y FOTOS
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
import time

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
    """
    Convierte cualquier URL de Google Drive a una URL de visualización directa
    SOPORTA IMÁGENES Y AUDIOS
    """
    if not url:
        return None
    
    if url == 'null' or url == 'None' or url == '' or url == 'undefined':
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
    """
    Extrae el file_id de una URL de Google Drive
    SOPORTA MÚLTIPLES FORMATOS
    """
    if not url:
        return None
    
    # Limpiar URL
    url = url.strip()
    
    # Formato 1: https://drive.google.com/uc?export=view&id=XXX
    if 'id=' in url:
        import re
        match = re.search(r'[?&]id=([a-zA-Z0-9_-]+)', url)
        if match:
            return match.group(1)
    
    # Formato 2: https://drive.google.com/file/d/XXX/view
    if '/d/' in url:
        parts = url.split('/d/')
        if len(parts) > 1:
            file_id = parts[1].split('/')[0]
            if file_id and len(file_id) > 10:
                return file_id
    
    # Formato 3: https://drive.google.com/open?id=XXX
    if 'open?id=' in url:
        import re
        match = re.search(r'open\?id=([a-zA-Z0-9_-]+)', url)
        if match:
            return match.group(1)
    
    # Formato 4: https://drive.google.com/thumbnail?id=XXX&sz=w800
    if 'thumbnail' in url:
        import re
        match = re.search(r'id=([a-zA-Z0-9_-]+)', url)
        if match:
            return match.group(1)
    
    # Formato 5: ID directo (si es solo el ID)
    import re
    if re.match(r'^[a-zA-Z0-9_-]{10,}$', url):
        return url
    
    return None


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


def cargar_sesion_de_db(codigo):
    """Carga una sesión específica desde la base de datos"""
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
# ENDPOINT 1: PING (PRUEBA)
# =====================================================

@recepcion_jefe_bp.route('/ping', methods=['GET'])
def ping():
    return jsonify({
        'success': True,
        'message': '✅ Jefe Operativo Recepción funcionando correctamente',
        'endpoints': [
            '/sesiones-activas', '/listar-recepciones', '/listar-recepciones-simple',
            '/iniciar-sesion', '/obtener-sesion/<codigo>', '/guardar-seccion',
            '/unirse-sesion', '/finalizar-sesion', '/cancelar-sesion',
            '/ping-sesion/<codigo>', '/verificar-placa/<placa>',
            '/upload-foto', '/upload-audio', '/renombrar-carpeta',
            '/imagen-base64', '/actualizar-foto-sesion',
            '/forzar-completado-fotos/<codigo>', '/sincronizar-fotos/<codigo>',
            '/verificar-fotos/<codigo>', '/verificar-carpeta/<nombre>',
            '/detalle-recepcion/<int:id_orden>', '/obtener-audio/<int:id_orden>',
            '/eliminar-recepcion/<int:id_orden>', '/generar-pdf-recepcion/<int:id_orden>',
            '/descargar-pdf-recepcion/<int:id_orden>', '/proxy-audio',
            '/actualizar-recepcion/<int:id_orden>',  # 🔥 AGREGAR COMA
            '/reemplazar-foto', '/eliminar-foto'
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
# ENDPOINT: LISTAR RECEPCIONES CON FILTROS
# =====================================================

@recepcion_jefe_bp.route('/listar-recepciones', methods=['GET'])
@jefe_operativo_required
def listar_recepciones(current_user):
    try:
        limit = request.args.get('limit', 5, type=int)
        offset = request.args.get('offset', 0, type=int)
        search = request.args.get('search', '').strip()
        estado = request.args.get('estado', '').strip()
        
        if limit > 50:
            limit = 50
        
        logger.info(f"📋 [listar_recepciones] Limit: {limit}, Offset: {offset}, Search: '{search}', Estado: '{estado}'")
        
        # 🔥 CONSTRUIR QUERY DE ORDENES
        query = supabase.table('ordentrabajo').select('*')
        
        # 🔥 FILTRO POR ESTADO
        if estado and estado != 'todos':
            query = query.eq('estado_global', estado)
        
        # 🔥 FILTRO POR BÚSQUEDA (código, placa, cliente)
        ordenes_ids = None
        
        if search:
            # Buscar clientes por nombre
            clientes_result = supabase.table('usuario') \
                .select('id') \
                .ilike('nombre', f'%{search}%') \
                .execute()
            clientes_ids = [c['id'] for c in (clientes_result.data or [])]
            
            # Buscar clientes por teléfono
            clientes_telefono = supabase.table('usuario') \
                .select('id') \
                .ilike('contacto', f'%{search}%') \
                .execute()
            for c in (clientes_telefono.data or []):
                if c['id'] not in clientes_ids:
                    clientes_ids.append(c['id'])
            
            # Buscar vehículos por placa
            vehiculos_result = supabase.table('vehiculo') \
                .select('id, id_cliente') \
                .ilike('placa', f'%{search}%') \
                .execute()
            vehiculos_ids = [v['id'] for v in (vehiculos_result.data or [])]
            
            # Obtener clientes de esos vehículos
            for v in (vehiculos_result.data or []):
                if v.get('id_cliente') and v['id_cliente'] not in clientes_ids:
                    clientes_ids.append(v['id_cliente'])
            
            # Buscar clientes por email
            clientes_email = supabase.table('cliente') \
                .select('id_usuario') \
                .ilike('email', f'%{search}%') \
                .execute()
            for c in (clientes_email.data or []):
                if c.get('id_usuario') and c['id_usuario'] not in clientes_ids:
                    clientes_ids.append(c['id_usuario'])
            
            # Si hay clientes, obtener vehículos de esos clientes
            if clientes_ids:
                vehiculos_cliente = supabase.table('vehiculo') \
                    .select('id') \
                    .in_('id_cliente', clientes_ids) \
                    .execute()
                for v in (vehiculos_cliente.data or []):
                    if v['id'] not in vehiculos_ids:
                        vehiculos_ids.append(v['id'])
            
            # Buscar órdenes por código único
            ordenes_codigo = supabase.table('ordentrabajo') \
                .select('id') \
                .ilike('codigo_unico', f'%{search}%') \
                .execute()
            ordenes_ids = [o['id'] for o in (ordenes_codigo.data or [])]
            
            # Agregar órdenes de vehículos encontrados
            if vehiculos_ids:
                ordenes_vehiculo = supabase.table('ordentrabajo') \
                    .select('id') \
                    .in_('id_vehiculo', vehiculos_ids) \
                    .execute()
                for o in (ordenes_vehiculo.data or []):
                    if o['id'] not in ordenes_ids:
                        ordenes_ids.append(o['id'])
            
            # Si hay IDs de órdenes, filtrar
            if ordenes_ids:
                query = query.in_('id', ordenes_ids)
            else:
                # No hay coincidencias, devolver vacío
                return jsonify({
                    'success': True,
                    'recepciones': [],
                    'paginacion': {
                        'total': 0,
                        'limit': limit,
                        'offset': offset,
                        'has_more': False
                    }
                }), 200
        
        # 🔥 OBTENER TOTAL
        count_query = supabase.table('ordentrabajo').select('id', count='exact')
        if estado and estado != 'todos':
            count_query = count_query.eq('estado_global', estado)
        if ordenes_ids:
            count_query = count_query.in_('id', ordenes_ids)
        total_result = count_query.execute()
        total_ordenes = total_result.count if hasattr(total_result, 'count') else len(total_result.data or [])
        
        # 🔥 EJECUTAR QUERY CON PAGINACIÓN
        try:
            resultado = query \
                .order('fecha_ingreso', desc=True) \
                .limit(limit) \
                .offset(offset) \
                .execute()
            logger.info("✅ Usando .offset() (versión antigua)")
        except AttributeError:
            logger.info("🔄 .offset() no disponible, usando .range() (versión nueva)")
            start = offset
            end = offset + limit
            resultado = query \
                .order('fecha_ingreso', desc=True) \
                .range(start, end - 1) \
                .execute()
        
        # 🔥 PROCESAR RESULTADOS
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
                                    recepcion['ubicacion_confirmada'] = c.get('ubicacion_confirmada', False)
                                    
                                    id_usuario = c.get('id_usuario')
                                    if id_usuario:
                                        try:
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
                                            logger.warning(f"⚠️ Error obteniendo usuario {id_usuario}: {e}")
                            except Exception as e:
                                logger.warning(f"⚠️ Error obteniendo cliente {id_cliente}: {e}")
                except Exception as e:
                    logger.warning(f"⚠️ Error obteniendo vehículo {id_vehiculo}: {e}")
            
            recepciones.append(recepcion)
        
        logger.info(f"✅ {len(recepciones)} recepciones listadas")
        
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
        logger.error(f"❌ Error en listar_recepciones: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e),
            'recepciones': []
        }), 500

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
# ENDPOINT: GUARDAR SECCIÓN (CORREGIDO)
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
            
            # 🔥 GUARDAR CADA FOTO INDIVIDUALMENTE
            for campo, valor in datos_seccion.items():
                if valor and valor != 'null' and valor != '' and valor != 'undefined':
                    sesion['datos']['fotos'][campo] = valor
                    logger.info(f"📸 Foto guardada en sesión: {campo} -> {valor[:50]}...")
            
            # Recalcular completado
            fotos = sesion['datos']['fotos']
            fotos_validas = sum(1 for v in fotos.values() if v and v != 'null' and v != '' and v != 'undefined')
            sesion['secciones_completadas']['fotos'] = fotos_validas == 7
            
            logger.info(f"📸 Total fotos en sesión: {fotos_validas}/7")
            logger.info(f"📸 Fotos: {fotos}")
            
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
# ENDPOINT: FINALIZAR SESIÓN (VERSIÓN DEFINITIVA CON MAPEO CORRECTO)
# =====================================================

@recepcion_jefe_bp.route('/finalizar-sesion', methods=['POST'])
@jefe_operativo_required
def finalizar_sesion(current_user):
    """Finaliza una sesión y crea la orden de trabajo con renombrado de carpeta"""
    global sesiones_activas
    try:
        from google_drive import google_drive
        
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        datos_directos = data.get('datos', {})
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        logger.info(f"📋 Finalizando sesión: {codigo_sesion}")
        
        if codigo_sesion not in sesiones_activas:
            sesion = cargar_sesion_de_db(codigo_sesion)
            if not sesion:
                return jsonify({'error': 'Sesión no encontrada'}), 404
            sesiones_activas[codigo_sesion] = sesion
        
        sesion = sesiones_activas[codigo_sesion]
        
        if sesion.get('estado') != 'activa':
            return jsonify({'error': 'Sesión no activa'}), 400
        
        if datos_directos:
            sesion['datos'] = datos_directos
        
        # 🔥 FORZAR RECALCULO DE FOTOS
        fotos = sesion.get('datos', {}).get('fotos', {})
        fotos_validas = sum(1 for v in fotos.values() if v and v != 'null' and v != '' and v != 'undefined')
        sesion['secciones_completadas']['fotos'] = fotos_validas == 7
        
        # Verificar secciones faltantes
        secciones_faltantes = []
        if not sesion.get('secciones_completadas', {}).get('cliente', False):
            secciones_faltantes.append('cliente')
        if not sesion.get('secciones_completadas', {}).get('vehiculo', False):
            secciones_faltantes.append('vehiculo')
        if not sesion.get('secciones_completadas', {}).get('fotos', False):
            secciones_faltantes.append('fotos')
        if not sesion.get('secciones_completadas', {}).get('descripcion', False):
            secciones_faltantes.append('descripcion')
        
        if secciones_faltantes:
            logger.warning(f"⚠️ Secciones faltantes: {secciones_faltantes}")
            return jsonify({
                'error': f'Faltan: {", ".join(secciones_faltantes)}',
                'fotos_validas': fotos_validas,
                'secciones': sesion.get('secciones_completadas', {})
            }), 400
        
        # =============================================
        # CREAR ORDEN DE TRABAJO
        # =============================================
        try:
            cliente_data = sesion['datos'].get('cliente', {})
            vehiculo_data = sesion['datos'].get('vehiculo', {})
            descripcion_data = sesion['datos'].get('descripcion', {})
            fotos = sesion['datos'].get('fotos', {})
            
            # 1. Obtener o crear cliente
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
                import uuid
                from werkzeug.security import generate_password_hash
                
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
            
            # 2. Obtener o crear vehículo
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
            
            # 3. Generar código único
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
            
            # 4. Crear orden de trabajo
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
            
            # =============================================
            # 5. Guardar recepción - MAPEO CORRECTO DE FOTOS
            # =============================================
            
            # 🔥 MAPEAR LAS CLAVES CORRECTAMENTE
            # Las fotos pueden venir con diferentes nombres de clave
            # Necesitamos mapearlas a los nombres correctos de la tabla RECEPCION
            
            # Mapeo de claves de fotos (short) a claves de la tabla (full)
            MAPEO_FOTOS = {
                'lateral_izquierdo': 'url_lateral_izquierda',
                'lateral_derecho': 'url_lateral_derecha',
                'frontal': 'url_foto_frontal',
                'trasera': 'url_foto_trasera',
                'superior': 'url_foto_superior',
                'inferior': 'url_foto_inferior',
                'tablero': 'url_foto_tablero',
                # También soportar claves ya mapeadas
                'url_lateral_izquierda': 'url_lateral_izquierda',
                'url_lateral_derecha': 'url_lateral_derecha',
                'url_foto_frontal': 'url_foto_frontal',
                'url_foto_trasera': 'url_foto_trasera',
                'url_foto_superior': 'url_foto_superior',
                'url_foto_inferior': 'url_foto_inferior',
                'url_foto_tablero': 'url_foto_tablero'
            }
            
            # 🔥 OBTENER FOTOS DE TODAS LAS FUENTES
            fotos_combinadas = {}
            
            # Fuente 1: datos_directos
            if datos_directos and 'fotos' in datos_directos:
                fotos_combinadas.update(datos_directos.get('fotos', {}))
            
            # Fuente 2: sesion.datos.fotos
            if sesion and 'datos' in sesion and 'fotos' in sesion['datos']:
                fotos_combinadas.update(sesion['datos']['fotos'])
            
            # Fuente 3: variable local
            if fotos:
                fotos_combinadas.update(fotos)
            
            logger.info(f"📸 Fotos combinadas (antes de mapear): {fotos_combinadas}")
            
            # 🔥 MAPEAR LAS FOTOS A LOS NOMBRES CORRECTOS DE LA TABLA
            fotos_mapeadas = {}
            for key, value in fotos_combinadas.items():
                if value and value != 'null' and value != 'None' and value != '' and value != 'undefined':
                    # Buscar el mapeo
                    if key in MAPEO_FOTOS:
                        nueva_key = MAPEO_FOTOS[key]
                        fotos_mapeadas[nueva_key] = value
                        logger.info(f"📸 Mapeo: {key} -> {nueva_key}")
                    else:
                        # Si no está en el mapeo, intentar usar la clave tal cual
                        # pero solo si parece una URL válida
                        if value.startswith('http'):
                            fotos_mapeadas[key] = value
                            logger.info(f"📸 Clave directa: {key}")
            
            logger.info(f"📸 Fotos mapeadas: {fotos_mapeadas}")
            logger.info(f"📸 Total fotos mapeadas: {len(fotos_mapeadas)}")
            
            # Verificar que tengamos 7 fotos
            if len(fotos_mapeadas) < 7:
                logger.warning(f"⚠️ Solo {len(fotos_mapeadas)} fotos mapeadas, se esperaban 7")
            
            # Construir datos de recepción con las fotos mapeadas
            recepcion_data = {
                'id_orden_trabajo': id_orden,
                'url_lateral_izquierda': fotos_mapeadas.get('url_lateral_izquierda'),
                'url_lateral_derecha': fotos_mapeadas.get('url_lateral_derecha'),
                'url_foto_frontal': fotos_mapeadas.get('url_foto_frontal'),
                'url_foto_trasera': fotos_mapeadas.get('url_foto_trasera'),
                'url_foto_superior': fotos_mapeadas.get('url_foto_superior'),
                'url_foto_inferior': fotos_mapeadas.get('url_foto_inferior'),
                'url_foto_tablero': fotos_mapeadas.get('url_foto_tablero'),
                'url_grabacion_problema': descripcion_data.get('audio_url'),
                'transcripcion_problema': descripcion_data.get('texto', '')
            }
            
            # 🔥 FILTRAR SOLO CAMPOS CON VALORES VÁLIDOS
            recepcion_data_limpia = {}
            for key, value in recepcion_data.items():
                if value and value != 'null' and value != 'None' and value != '' and value != 'undefined':
                    recepcion_data_limpia[key] = value
            
            logger.info(f"📸 Datos FINALES a guardar en recepcion: {recepcion_data_limpia}")
            
            # Insertar en la base de datos
            if recepcion_data_limpia:
                try:
                    resultado = supabase.table('recepcion').insert(recepcion_data_limpia).execute()
                    logger.info(f"✅ Recepción guardada exitosamente: {resultado.data}")
                except Exception as e:
                    logger.error(f"❌ Error guardando recepción: {e}")
                    # Intentar guardar solo el id_orden_trabajo
                    resultado = supabase.table('recepcion').insert({
                        'id_orden_trabajo': id_orden
                    }).execute()
                    logger.info(f"✅ Recepción básica guardada: {resultado.data}")
            else:
                logger.warning("⚠️ No hay datos para guardar en recepción")
                resultado = supabase.table('recepcion').insert({
                    'id_orden_trabajo': id_orden
                }).execute()
                logger.info(f"✅ Recepción básica guardada: {resultado.data}")
            
            # 6. Renombrar carpeta en Drive
            carpeta_renombrada = False
            try:
                logger.info(f"📁 Intentando renombrar carpeta {codigo_sesion} a {codigo_unico}")
                folder_id = google_drive.get_folder_id_by_name(codigo_sesion)
                
                if folder_id:
                    rename_result = google_drive.rename_folder(folder_id, codigo_unico)
                    if rename_result:
                        carpeta_renombrada = True
                        logger.info(f"✅ Carpeta renombrada exitosamente: {codigo_sesion} -> {codigo_unico}")
                    else:
                        logger.warning(f"⚠️ No se pudo renombrar la carpeta {codigo_sesion}")
                else:
                    logger.warning(f"⚠️ No se encontró la carpeta con nombre: {codigo_sesion}")
                    
            except Exception as e:
                logger.error(f"❌ Error renombrando carpeta: {str(e)}")
            
            # 7. Marcar sesión como finalizada
            sesion['estado'] = 'finalizada'
            guardar_sesion_en_db(sesion)
            
            # 8. Eliminar de memoria
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
            import traceback
            logger.error(traceback.format_exc())
            return jsonify({'error': str(e)}), 500
        
    except Exception as e:
        logger.error(f"Error finalizando: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT: SUBIR PDF A GOOGLE DRIVE DESDE FRONTEND
# =====================================================

@recepcion_jefe_bp.route('/subir-pdf-recepcion', methods=['POST'])
@jefe_operativo_required
def subir_pdf_recepcion(current_user):
    """
    Recibe un PDF generado desde el frontend y lo sube a Google Drive
    """
    try:
        from google_drive import google_drive
        from datetime import datetime
        import base64
        
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
        
        pdf_base64 = data.get('pdf_base64')
        id_orden = data.get('id_orden')
        codigo_unico = data.get('codigo_unico', 'orden')
        
        if not pdf_base64:
            return jsonify({'error': 'No se recibió el PDF'}), 400
        
        if not id_orden:
            return jsonify({'error': 'No se recibió el ID de la orden'}), 400
        
        # Decodificar base64 a binario
        if ',' in pdf_base64:
            pdf_base64 = pdf_base64.split(',')[1]
        
        pdf_data = base64.b64decode(pdf_base64)
        
        logger.info(f"📄 PDF recibido para orden {id_orden}, tamaño: {len(pdf_data)} bytes")
        
        # Subir a Google Drive
        nombre_archivo = f"Recepcion_{codigo_unico}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        folder_path = google_drive.generate_folder_path(
            modulo='recepcion',
            referencia_id=codigo_unico,
            subcarpeta='documentos'
        )
        
        result = google_drive.upload_file(
            file_data=pdf_data,
            filename=nombre_archivo,
            folder_path=folder_path,
            mime_type='application/pdf',
            public=True
        )
        
        logger.info(f"✅ PDF subido a Drive: {result['url']}")
        
        # Actualizar la tabla recepcion con la URL del PDF
        supabase.table('recepcion') \
            .update({
                'url_pdf': result['url']
            }) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        logger.info(f"✅ URL del PDF guardada en la base de datos para orden {id_orden}")
        
        return jsonify({
            'success': True,
            'url': result['url'],
            'filename': nombre_archivo,
            'message': 'PDF subido a Google Drive exitosamente'
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error subiendo PDF: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
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
        except Exception as e:
            logger.error(f"❌ Error eliminando carpeta de Drive: {str(e)}")
        
        try:
            supabase.table('sesion_colaborativa') \
                .delete() \
                .eq('codigo', codigo_sesion) \
                .execute()
            logger.info(f"✅ Sesión eliminada de Supabase: {codigo_sesion}")
        except Exception as e:
            logger.error(f"❌ Error eliminando de Supabase: {str(e)}")
        
        if codigo_sesion in sesiones_activas:
            del sesiones_activas[codigo_sesion]
            logger.info(f"✅ Sesión eliminada de memoria: {codigo_sesion}")
        
        return jsonify({
            'success': True,
            'message': f'Sesión {codigo_sesion} cancelada y datos eliminados',
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


@recepcion_jefe_bp.route('/upload-foto', methods=['POST'])
@jefe_operativo_required
def upload_foto_drive(current_user):
    try:
        from google_drive import google_drive
        from datetime import datetime
        import time
        
        file = request.files.get('file')
        campo = request.form.get('campo', 'general')
        codigo_sesion = request.form.get('codigo_sesion')
        codigo_orden = request.form.get('codigo_orden')  # 🔥 NUEVO: código de orden de trabajo
        modo_edicion = request.form.get('modo_edicion', 'false') == 'true'  # 🔥 NUEVO: indicar si es edición
        
        if not file:
            return jsonify({'error': 'No se envió el archivo'}), 400
        
        # 🔥 DETERMINAR QUÉ IDENTIFICADOR USAR
        referencia_id = None
        if modo_edicion and codigo_orden:
            # Si es edición y tenemos código de orden, usarlo
            referencia_id = codigo_orden
            logger.info(f"📸 Subiendo foto en modo edición - usando código de orden: {codigo_orden}")
        elif codigo_sesion:
            referencia_id = codigo_sesion
            logger.info(f"📸 Subiendo foto - usando código de sesión: {codigo_sesion}")
        else:
            # Si no hay ningún identificador, buscar en la sesión activa
            if codigo_sesion and codigo_sesion in sesiones_activas:
                referencia_id = codigo_sesion
            else:
                return jsonify({'error': 'No se pudo determinar la carpeta destino'}), 400
        
        if file.filename == '':
            return jsonify({'error': 'Archivo vacío'}), 400
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        user_id = current_user['id']
        filename = f"{campo}_{user_id}_{timestamp}.jpg"
        
        # 🔥 USAR LA REFERENCIA CORRECTA
        folder_path = google_drive.generate_folder_path(
            modulo='recepcion',
            referencia_id=referencia_id,
            subcarpeta='fotos'
        )
        
        logger.info(f"📁 Subiendo foto a: {folder_path}")
        
        result = google_drive.upload_file(
            file_data=file,
            filename=filename,
            folder_path=folder_path
        )
        
        url = result['url']
        logger.info(f"📸 Foto subida: {url}")
        
        # Mapeo de campos
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
        
        # 🔥 ACTUALIZAR SESIÓN EN MEMORIA Y BD CON RETRY
        fotos_validas = 0
        if codigo_sesion and codigo_sesion in sesiones_activas:
            sesion = sesiones_activas[codigo_sesion]
            if 'datos' not in sesion:
                sesion['datos'] = {}
            if 'fotos' not in sesion['datos']:
                sesion['datos']['fotos'] = {}
            
            sesion['datos']['fotos'][campo_db] = url
            logger.info(f"📸 Foto guardada en sesión: {campo_db} -> {url[:50]}...")
            
            # Recalcular fotos válidas
            fotos = sesion['datos']['fotos']
            fotos_validas = sum(1 for v in fotos.values() if v and v != 'null' and v != '' and v != 'undefined')
            sesion['secciones_completadas']['fotos'] = fotos_validas == 7
            
            logger.info(f"📸 Fotos válidas: {fotos_validas}/7")
            
            # Guardar en BD con retry
            for intento in range(3):
                try:
                    guardar_sesion_en_db(sesion)
                    logger.info(f"✅ Sesión guardada en BD (intento {intento+1})")
                    break
                except Exception as e:
                    logger.warning(f"⚠️ Error guardando sesión (intento {intento+1}): {e}")
                    time.sleep(0.5)
        
        return jsonify({
            'success': True,
            'url': url,
            'id': result['id'],
            'web_view_link': result['web_view_link'],
            'fotos_validas': fotos_validas,
            'referencia_usada': referencia_id
        })
        
    except Exception as e:
        logger.error(f"❌ Error subiendo foto: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT: ACTUALIZAR FOTO EN SESIÓN (CORREGIDO)
# =====================================================

@recepcion_jefe_bp.route('/actualizar-foto-sesion', methods=['POST'])
@jefe_operativo_required
def actualizar_foto_sesion(current_user):
    """Actualiza la URL de una foto en la sesión actual y recalcula completado"""
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
        
        # 🔥 GUARDAR LA FOTO EN LA SESIÓN
        sesion['datos']['fotos'][campo_db] = url
        logger.info(f"📸 Foto actualizada en sesión: {campo_db} -> {url[:50]}...")
        
        # Recalcular completado
        fotos = sesion['datos']['fotos']
        fotos_validas = sum(1 for v in fotos.values() if v and v != 'null' and v != '' and v != 'undefined')
        fotos_completas = fotos_validas == 7
        
        if 'secciones_completadas' not in sesion:
            sesion['secciones_completadas'] = {}
        sesion['secciones_completadas']['fotos'] = fotos_completas
        
        logger.info(f"📸 Fotos válidas: {fotos_validas}/7 - Completado: {fotos_completas}")
        
        # Guardar en BD
        guardar_sesion_en_db(sesion)
        
        return jsonify({
            'success': True,
            'fotos_subidas': fotos_validas,
            'total': 7,
            'completado': fotos_completas
        })
        
    except Exception as e:
        logger.error(f"❌ Error actualizando foto en sesión: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
# =====================================================
# ENDPOINT: VERIFICAR FOTOS EN SESIÓN (NUEVO)
# =====================================================

@recepcion_jefe_bp.route('/verificar-fotos-sesion/<codigo>', methods=['GET'])
@jefe_operativo_required
def verificar_fotos_sesion(current_user, codigo):
    """Verifica qué fotos tiene la sesión en la BD"""
    try:
        if codigo not in sesiones_activas:
            sesion = cargar_sesion_de_db(codigo)
            if not sesion:
                return jsonify({'error': 'Sesión no encontrada'}), 404
            sesiones_activas[codigo] = sesion
        
        sesion = sesiones_activas[codigo]
        fotos = sesion.get('datos', {}).get('fotos', {})
        
        fotos_validas = {}
        for key, value in fotos.items():
            if value and value != 'null' and value != '' and value != 'undefined':
                fotos_validas[key] = value
        
        logger.info(f"📸 Verificando fotos en sesión {codigo}: {len(fotos_validas)}/7")
        logger.info(f"📸 Fotos válidas: {fotos_validas}")
        
        return jsonify({
            'success': True,
            'fotos': fotos,
            'fotos_validas': fotos_validas,
            'total': len(fotos_validas),
            'secciones_completadas': sesion.get('secciones_completadas', {})
        })
    except Exception as e:
        logger.error(f"Error verificando fotos: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 15: FORZAR COMPLETADO DE FOTOS
# =====================================================

@recepcion_jefe_bp.route('/forzar-completado-fotos/<codigo>', methods=['POST'])
@jefe_operativo_required
def forzar_completado_fotos(current_user, codigo):
    global sesiones_activas
    try:
        logger.info(f"🔄 Forzando completado de fotos para sesión: {codigo}")
        
        if codigo not in sesiones_activas:
            sesion = cargar_sesion_de_db(codigo)
            if not sesion:
                return jsonify({'error': 'Sesión no encontrada'}), 404
            sesiones_activas[codigo] = sesion
        
        sesion = sesiones_activas[codigo]
        
        fotos = sesion.get('datos', {}).get('fotos', {})
        fotos_validas = sum(1 for v in fotos.values() if v and v != 'null' and v != '' and v != 'undefined')
        fotos_completas = fotos_validas == 7
        
        if 'secciones_completadas' not in sesion:
            sesion['secciones_completadas'] = {}
        sesion['secciones_completadas']['fotos'] = fotos_completas
        
        guardar_sesion_en_db(sesion)
        
        logger.info(f"✅ Forzado completado de fotos: {fotos_validas}/7 -> {fotos_completas}")
        
        return jsonify({
            'success': True,
            'fotos_validas': fotos_validas,
            'completado': fotos_completas,
            'fotos': fotos
        })
        
    except Exception as e:
        logger.error(f"❌ Error forzando completado: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 16: SINCRONIZAR FOTOS
# =====================================================

@recepcion_jefe_bp.route('/sincronizar-fotos/<codigo>', methods=['POST'])
@jefe_operativo_required
def sincronizar_fotos(current_user, codigo):
    global sesiones_activas
    try:
        data = request.get_json()
        fotos = data.get('fotos', {})
        
        logger.info(f"🔄 Sincronizando fotos para sesión: {codigo}")
        logger.info(f"📸 Fotos recibidas: {len(fotos)}")
        
        if codigo not in sesiones_activas:
            sesion = cargar_sesion_de_db(codigo)
            if not sesion:
                return jsonify({'error': 'Sesión no encontrada'}), 404
            sesiones_activas[codigo] = sesion
        
        sesion = sesiones_activas[codigo]
        
        if 'datos' not in sesion:
            sesion['datos'] = {}
        if 'fotos' not in sesion['datos']:
            sesion['datos']['fotos'] = {}
        
        fotos_actualizadas = 0
        for campo, url in fotos.items():
            if url and url != 'null' and url != '' and url != 'undefined':
                sesion['datos']['fotos'][campo] = url
                fotos_actualizadas += 1
                logger.info(f"  ✅ {campo} -> {url[:50]}...")
        
        fotos_values = sesion['datos']['fotos']
        fotos_validas = sum(1 for v in fotos_values.values() if v and v != 'null' and v != '' and v != 'undefined')
        
        if 'secciones_completadas' not in sesion:
            sesion['secciones_completadas'] = {}
        sesion['secciones_completadas']['fotos'] = fotos_validas == 7
        
        guardar_sesion_en_db(sesion)
        
        logger.info(f"✅ Fotos sincronizadas: {fotos_validas}/7")
        
        return jsonify({
            'success': True,
            'fotos_validas': fotos_validas,
            'completado': fotos_validas == 7,
            'fotos_actualizadas': fotos_actualizadas
        })
        
    except Exception as e:
        logger.error(f"❌ Error sincronizando fotos: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 17: VERIFICAR FOTOS DE SESIÓN
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
            'url_lateral_izquierda',
            'url_lateral_derecha',
            'url_foto_frontal',
            'url_foto_trasera',
            'url_foto_superior',
            'url_foto_inferior',
            'url_foto_tablero'
        ]
        
        fotos_subidas = 0
        fotos_estado = {}
        fotos_detalles = {}
        
        for campo in campos_fotos:
            url = fotos.get(campo)
            if url and url != 'null' and url != '' and url != 'undefined':
                fotos_subidas += 1
                fotos_estado[campo] = True
                fotos_detalles[campo] = url
            else:
                fotos_estado[campo] = False
                fotos_detalles[campo] = None
        
        completado = fotos_subidas == 7
        
        if completado and not sesion.get('secciones_completadas', {}).get('fotos', False):
            sesion['secciones_completadas']['fotos'] = True
            guardar_sesion_en_db(sesion)
            logger.info(f"✅ Corregido flag de fotos completadas para sesión {codigo}")
        
        return jsonify({
            'success': True,
            'total': 7,
            'subidas': fotos_subidas,
            'completado': completado,
            'estado': fotos_estado,
            'detalles': fotos_detalles
        })
        
    except Exception as e:
        logger.error(f"❌ Error verificando fotos: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 18: UPLOAD AUDIO (CORREGIDO - SOLO UNA VEZ)
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
        
        logger.info(f"🎵 Audio subido: {result['url']}")
        
        if codigo_sesion in sesiones_activas:
            sesion = sesiones_activas[codigo_sesion]
            if 'datos' not in sesion:
                sesion['datos'] = {}
            if 'descripcion' not in sesion['datos']:
                sesion['datos']['descripcion'] = {}
            sesion['datos']['descripcion']['audio_url'] = result['url']
            
            if sesion['datos']['descripcion'].get('texto'):
                sesion['secciones_completadas']['descripcion'] = True
            
            guardar_sesion_en_db(sesion)
        
        return jsonify({
            'success': True,
            'url': result['url'],
            'id': result['id'],
            'web_view_link': result['web_view_link']
        })
        
    except Exception as e:
        logger.error(f"❌ Error subiendo audio: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 19: VERIFICAR CARPETA EN DRIVE
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
            })
        else:
            return jsonify({
                'success': True,
                'exists': False,
                'nombre': nombre
            })
    except Exception as e:
        logger.error(f"Error verificando carpeta: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 20: RENOMBRAR CARPETA (MANUAL)
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
            return jsonify({
                'success': False,
                'error': f'No se encontró la carpeta: {nombre_actual}'
            }), 404
        
        resultado = google_drive.rename_folder(folder_id, nombre_nuevo)
        
        if resultado:
            return jsonify({
                'success': True,
                'message': f'Carpeta renombrada: {nombre_actual} -> {nombre_nuevo}'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Error al renombrar la carpeta'
            }), 500
        
    except Exception as e:
        logger.error(f"❌ Error renombrando carpeta: {str(e)}")
        return jsonify({'error': str(e)}), 500


# En recepcion_jefeoperativo.py - Mejorar el endpoint imagen-base64

@recepcion_jefe_bp.route('/imagen-base64', methods=['POST'])
@jefe_operativo_required
def obtener_imagen_base64(current_user):
    try:
        import base64
        import requests
        
        data = request.get_json()
        url = data.get('url')
        # 🔥 PARÁMETRO PARA MINIATURA (más rápido)
        thumbnail = data.get('thumbnail', True)  # Por defecto usa miniatura
        size = data.get('size', 'w400')  # w100, w200, w400, w800
        
        if not url:
            return jsonify({'error': 'URL requerida'}), 400
        
        file_id = obtener_file_id_drive(url)
        if not file_id:
            url_normalizada = normalizar_url_drive(url)
            file_id = obtener_file_id_drive(url_normalizada)
        
        if not file_id:
            logger.error(f"❌ No se pudo extraer file_id de: {url}")
            return jsonify({'error': 'No se pudo identificar el archivo en Google Drive'}), 400
        
        # 🔥 USAR MINIATURA DE GOOGLE DRIVE (MUCHO MÁS RÁPIDO)
        if thumbnail:
            # Miniaturas: w100, w200, w400, w800
            download_url = f"https://drive.google.com/thumbnail?id={file_id}&sz={size}"
            logger.info(f"📥 Usando miniatura: {download_url}")
        else:
            download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            logger.info(f"📥 Descargando imagen completa: {download_url}")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(download_url, headers=headers, timeout=10)
        
        if response.status_code != 200:
            # Fallback a descarga completa
            download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            response = requests.get(download_url, headers=headers, timeout=10)
            if response.status_code != 200:
                return jsonify({'error': f'Error descargando imagen: {response.status_code}'}), 400
        
        content_type = response.headers.get('content-type', 'image/jpeg')
        img_base64 = base64.b64encode(response.content).decode('utf-8')
        base64_data = f"data:{content_type};base64,{img_base64}"
        
        logger.info(f"✅ Imagen convertida a base64: {len(base64_data)} bytes")
        
        return jsonify({
            'success': True,
            'base64': base64_data
        })
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo imagen base64: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 22: DETALLE RECEPCIÓN (CORREGIDO)
# =====================================================

@recepcion_jefe_bp.route('/detalle-recepcion/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def detalle_recepcion(current_user, id_orden):
    try:
        logger.info(f"📋 Obteniendo detalle de recepción: {id_orden}")
        
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo, id_jefe_operativo, id_jefe_operativo_2') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            logger.warning(f"⚠️ Orden {id_orden} no encontrada")
            return jsonify({'error': f'Orden {id_orden} no encontrada'}), 404
        
        orden = orden_result.data[0]
        logger.info(f"✅ Orden encontrada: {orden.get('codigo_unico')}")
        
        jefe_principal = {}
        if orden.get('id_jefe_operativo'):
            try:
                j1 = supabase.table('usuario') \
                    .select('id, nombre, contacto, email') \
                    .eq('id', orden['id_jefe_operativo']) \
                    .execute()
                if j1.data:
                    jefe_principal = j1.data[0]
            except Exception as e:
                logger.warning(f"⚠️ Error obteniendo jefe principal: {e}")
        
        jefe_secundario = {}
        if orden.get('id_jefe_operativo_2'):
            try:
                j2 = supabase.table('usuario') \
                    .select('id, nombre, contacto, email') \
                    .eq('id', orden['id_jefe_operativo_2']) \
                    .execute()
                if j2.data:
                    jefe_secundario = j2.data[0]
            except Exception as e:
                logger.warning(f"⚠️ Error obteniendo jefe secundario: {e}")
        
        vehiculo = {}
        if orden.get('id_vehiculo'):
            try:
                vehiculo_result = supabase.table('vehiculo') \
                    .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
                    .eq('id', orden['id_vehiculo']) \
                    .execute()
                if vehiculo_result.data:
                    vehiculo = vehiculo_result.data[0]
            except Exception as e:
                logger.warning(f"⚠️ Error obteniendo vehículo: {e}")
        
        usuario = {}
        cliente_data = {}
        if vehiculo.get('id_cliente'):
            try:
                c_result = supabase.table('cliente') \
                    .select('id, id_usuario, latitud, longitud, ubicacion_confirmada') \
                    .eq('id', vehiculo['id_cliente']) \
                    .execute()
                if c_result.data:
                    cliente_data = c_result.data[0]
                    if cliente_data.get('id_usuario'):
                        u_result = supabase.table('usuario') \
                            .select('id, nombre, contacto, ubicacion, email') \
                            .eq('id', cliente_data['id_usuario']) \
                            .execute()
                        if u_result.data:
                            usuario = u_result.data[0]
            except Exception as e:
                logger.warning(f"⚠️ Error obteniendo cliente: {e}")
        
        recepcion = {}
        try:
            recepcion_result = supabase.table('recepcion') \
                .select('''
                    id,
                    url_lateral_izquierda,
                    url_lateral_derecha,
                    url_foto_frontal,
                    url_foto_trasera,
                    url_foto_superior,
                    url_foto_inferior,
                    url_foto_tablero,
                    url_grabacion_problema,
                    transcripcion_problema,
                    url_pdf
                ''') \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
            
            if recepcion_result.data:
                recepcion = recepcion_result.data[0]
                logger.info(f"✅ Recepción encontrada para orden {id_orden}")
            else:
                logger.warning(f"⚠️ No hay recepción para orden {id_orden}")
                recepcion = {}
        except Exception as e:
            logger.error(f"❌ Error obteniendo recepción: {e}")
            recepcion = {}
        
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
            'codigo_unico': orden.get('codigo_unico', 'OT-N/A'),
            'fecha_ingreso': orden.get('fecha_ingreso'),
            'estado_global': orden.get('estado_global', 'EnRecepcion'),
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
        
        logger.info(f"📸 Fotos normalizadas: {sum(1 for v in fotos_limpias.values() if v)}/7")
        
        return jsonify({'success': True, 'detalle': detalle}), 200
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo detalle: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 23: OBTENER AUDIO ESPECÍFICO
# =====================================================

@recepcion_jefe_bp.route('/obtener-audio/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def obtener_audio_recepcion(current_user, id_orden):
    try:
        recepcion_result = supabase.table('recepcion') \
            .select('url_grabacion_problema') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if not recepcion_result.data:
            return jsonify({'error': 'Recepción no encontrada'}), 404
        
        audio_url = recepcion_result.data[0].get('url_grabacion_problema')
        
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
# ENDPOINT 24: ELIMINAR RECEPCIÓN
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
# ENDPOINT 25: GENERAR PDF
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
        
        logger.info(f"📄 Generando PDF con ReportLab para orden {id_orden}")
        
        detalle_response = detalle_recepcion(current_user, id_orden)
        detalle_data = detalle_response.get_json()
        
        if not detalle_data.get('success'):
            return jsonify({'error': 'Error obteniendo datos de la recepción'}), 500
        
        detalle = detalle_data.get('detalle', {})
        
        fecha_actual = datetime.now().strftime('%d/%m/%Y %H:%M')
        fecha_ingreso = detalle.get('fecha_ingreso', 'No registrada')
        
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
            pdf_path = tmp_file.name
        
        doc = SimpleDocTemplate(
            pdf_path,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=20,
            textColor=colors.HexColor('#C1121F'),
            alignment=TA_CENTER,
            spaceAfter=12
        )
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#C1121F'),
            spaceAfter=6,
            spaceBefore=12
        )
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=4
        )
        
        story = []
        
        story.append(Paragraph("FURIA MOTOR COMPANY", title_style))
        story.append(Paragraph("ORDEN DE TRABAJO - RECEPCIÓN", heading_style))
        story.append(Spacer(1, 0.3*cm))
        
        story.append(Paragraph(f"<b>Código:</b> {detalle.get('codigo_unico', 'N/A')}", normal_style))
        story.append(Paragraph(f"<b>Fecha de Ingreso:</b> {fecha_ingreso}", normal_style))
        story.append(Paragraph(f"<b>Estado:</b> {detalle.get('estado_global', 'En Recepción')}", normal_style))
        story.append(Spacer(1, 0.5*cm))
        
        story.append(Paragraph("👤 DATOS DEL CLIENTE", heading_style))
        story.append(Paragraph(f"<b>Nombre:</b> {detalle.get('cliente_nombre', 'No registrado')}", normal_style))
        story.append(Paragraph(f"<b>Teléfono:</b> {detalle.get('cliente_telefono', 'No registrado')}", normal_style))
        story.append(Paragraph(f"<b>Ubicación:</b> {detalle.get('cliente_ubicacion', 'No especificada')}", normal_style))
        if detalle.get('latitud') and detalle.get('longitud'):
            story.append(Paragraph(f"<b>Coordenadas:</b> {detalle['latitud']}, {detalle['longitud']}", normal_style))
        story.append(Spacer(1, 0.3*cm))
        
        story.append(Paragraph("🚗 DATOS DEL VEHÍCULO", heading_style))
        story.append(Paragraph(f"<b>Placa:</b> {detalle.get('placa', 'No registrada')}", normal_style))
        story.append(Paragraph(f"<b>Marca:</b> {detalle.get('marca', 'No registrada')}", normal_style))
        story.append(Paragraph(f"<b>Modelo:</b> {detalle.get('modelo', 'No registrado')}", normal_style))
        story.append(Paragraph(f"<b>Año:</b> {detalle.get('anio', 'No especificado')}", normal_style))
        story.append(Paragraph(f"<b>Kilometraje:</b> {detalle.get('kilometraje', 0)} km", normal_style))
        story.append(Spacer(1, 0.3*cm))
        
        story.append(Paragraph("📝 DESCRIPCIÓN DEL PROBLEMA", heading_style))
        descripcion = detalle.get('transcripcion_problema', 'No se registró descripción')
        story.append(Paragraph(descripcion, normal_style))
        story.append(Spacer(1, 0.3*cm))
        
        story.append(Paragraph("✍️ FIRMAS", heading_style))
        story.append(Spacer(1, 0.3*cm))
        
        firma_data = [
            ['', ''],
            ['Firma del Cliente', 'Firma del Jefe Operativo'],
            ['_________________________', '_________________________'],
            [detalle.get('cliente_nombre', '____________________'), 
             detalle.get('jefe_operativo', {}).get('nombre', '____________________')],
            [fecha_actual, fecha_actual]
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
            .update({
                'url_pdf': result['url']
            }) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        try:
            os.unlink(pdf_path)
        except:
            pass
        
        logger.info(f"✅ PDF subido a Drive: {nombre_archivo} -> {result['url']}")
        
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
# ENDPOINT 26: DESCARGAR PDF
# =====================================================

@recepcion_jefe_bp.route('/descargar-pdf-recepcion/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def descargar_pdf_recepcion(current_user, id_orden):
    try:
        resultado = supabase.table('recepcion') \
            .select('url_pdf') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if not resultado.data or not resultado.data[0].get('url_pdf'):
            return jsonify({'error': 'PDF no encontrado para esta recepción'}), 404
        
        return jsonify({
            'success': True,
            'url': resultado.data[0]['url_pdf']
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo PDF: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT 27: PROXY PARA AUDIO
# =====================================================

# En recepcion_jefeoperativo.py - Verifica que este código esté así:

@recepcion_jefe_bp.route('/proxy-audio', methods=['GET'])
@jefe_operativo_required  # 🔥 Asegurar que requiere autenticación
def proxy_audio(current_user):
    try:
        from flask import Response, stream_with_context
        import requests
        
        url = request.args.get('url')
        if not url:
            return jsonify({'error': 'URL requerida'}), 400
        
        # 🔥 EXTRAER FILE_ID
        file_id = obtener_file_id_drive(url)
        if not file_id:
            return jsonify({'error': 'No se pudo extraer el ID del archivo'}), 400
        
        # 🔥 USAR URL DE DESCARGA DIRECTA
        download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
        
        logger.info(f"🎵 Proxy de audio: {download_url}")
        
        # 🔥 HACER LA PETICIÓN CON HEADERS
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(download_url, stream=True, headers=headers, timeout=30)
        
        if response.status_code != 200:
            logger.error(f"❌ Error descargando audio: {response.status_code}")
            return jsonify({'error': f'Error descargando audio: {response.status_code}'}), 400
        
        content_type = response.headers.get('content-type', 'audio/wav')
        
        def generate():
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        
        return Response(
            stream_with_context(generate()),
            status=200,
            headers={
                'Content-Type': content_type,
                'Content-Disposition': 'inline',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            }
        )
        
    except Exception as e:
        logger.error(f"❌ Error en proxy de audio: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT: ACTUALIZAR RECEPCIÓN (EDICIÓN) - CORREGIDO DEFINITIVO
# =====================================================

@recepcion_jefe_bp.route('/actualizar-recepcion/<int:id_orden>', methods=['PUT'])
@jefe_operativo_required
def actualizar_recepcion(current_user, id_orden):
    try:
        from google_drive import google_drive
        import datetime
        
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Datos no proporcionados'}), 400
        
        logger.info(f"📝 Editando recepción {id_orden}")
        logger.info(f"📝 Datos recibidos: {data.keys()}")
        
        # 1. OBTENER ORDEN DE TRABAJO
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data[0]
        codigo_unico = orden.get('codigo_unico')
        
        if not codigo_unico:
            return jsonify({'error': 'La orden no tiene código único'}), 400
        
        if orden.get('estado_global') != 'EnRecepcion':
            return jsonify({'error': f'No se puede editar una orden en estado "{orden.get("estado_global")}"'}), 400
        
        # 2. EXTRAER DATOS DEL FRONTEND
        cliente_data = data.get('cliente', {})
        nombre = cliente_data.get('nombre', '')
        telefono = cliente_data.get('telefono', '')
        ubicacion = cliente_data.get('ubicacion', '')
        latitud = cliente_data.get('latitud')
        longitud = cliente_data.get('longitud')
        
        vehiculo_data = data.get('vehiculo', {})
        placa = vehiculo_data.get('placa', '').upper()
        marca = vehiculo_data.get('marca', '')
        modelo = vehiculo_data.get('modelo', '')
        anio = vehiculo_data.get('anio')
        kilometraje = vehiculo_data.get('kilometraje', 0)
        
        # 🔥 OBTENER FOTOS DEL FRONTEND (pueden venir con claves cortas o largas)
        fotos_frontend = data.get('fotos', {})
        logger.info(f"📸 Fotos recibidas del frontend: {fotos_frontend}")
        
        descripcion = data.get('descripcion', {})
        texto_descripcion = descripcion.get('texto', '')
        audio_url = descripcion.get('audio_url')
        
        # 3. VERIFICAR/ACTUALIZAR CLIENTE
        vehiculo_actual = supabase.table('vehiculo') \
            .select('id_cliente') \
            .eq('id', orden['id_vehiculo']) \
            .execute()
        
        if vehiculo_actual.data:
            id_cliente = vehiculo_actual.data[0].get('id_cliente')
            
            if id_cliente:
                cliente_db = supabase.table('cliente') \
                    .select('id_usuario') \
                    .eq('id', id_cliente) \
                    .execute()
                
                if cliente_db.data:
                    id_usuario = cliente_db.data[0].get('id_usuario')
                    
                    if id_usuario:
                        supabase.table('usuario') \
                            .update({
                                'nombre': nombre,
                                'contacto': telefono,
                                'ubicacion': ubicacion
                            }) \
                            .eq('id', id_usuario) \
                            .execute()
                    
                    supabase.table('cliente') \
                        .update({
                            'latitud': latitud,
                            'longitud': longitud
                        }) \
                        .eq('id', id_cliente) \
                        .execute()
        
        # 4. ACTUALIZAR VEHÍCULO
        supabase.table('vehiculo') \
            .update({
                'placa': placa,
                'marca': marca,
                'modelo': modelo,
                'anio': anio,
                'kilometraje': kilometraje
            }) \
            .eq('id', orden['id_vehiculo']) \
            .execute()
        
        # =============================================
        # 5. 🔥 MAPEAR FOTOS CORRECTAMENTE PARA LA BASE DE DATOS
        # =============================================
        
        # Mapeo de claves del frontend a claves de la base de datos
        MAPEO_FOTOS = {
            'lateral_izquierdo': 'url_lateral_izquierda',
            'lateral_derecho': 'url_lateral_derecha',
            'frontal': 'url_foto_frontal',
            'trasera': 'url_foto_trasera',
            'superior': 'url_foto_superior',
            'inferior': 'url_foto_inferior',
            'tablero': 'url_foto_tablero',
            # También soportar claves ya mapeadas
            'url_lateral_izquierda': 'url_lateral_izquierda',
            'url_lateral_derecha': 'url_lateral_derecha',
            'url_foto_frontal': 'url_foto_frontal',
            'url_foto_trasera': 'url_foto_trasera',
            'url_foto_superior': 'url_foto_superior',
            'url_foto_inferior': 'url_foto_inferior',
            'url_foto_tablero': 'url_foto_tablero'
        }
        
        # 🔥 CONSTRUIR EL DICCIONARIO DE FOTOS PARA LA BD
        fotos_para_bd = {}
        
        for key, value in fotos_frontend.items():
            # Buscar el mapeo
            if key in MAPEO_FOTOS:
                db_key = MAPEO_FOTOS[key]
                # Si el valor es válido, guardarlo; si no, None
                if value and value != 'null' and value != 'None' and value != '' and value != 'undefined':
                    fotos_para_bd[db_key] = value
                    logger.info(f"📸 Mapeo: {key} -> {db_key} = {value[:50]}...")
                else:
                    fotos_para_bd[db_key] = None
                    logger.info(f"📸 Mapeo: {key} -> {db_key} = None (eliminada)")
        
        # Asegurar que todas las 7 fotos estén presentes
        todas_las_claves = [
            'url_lateral_izquierda',
            'url_lateral_derecha',
            'url_foto_frontal',
            'url_foto_trasera',
            'url_foto_superior',
            'url_foto_inferior',
            'url_foto_tablero'
        ]
        
        for clave in todas_las_claves:
            if clave not in fotos_para_bd:
                # Si no está en el dict, buscar en el frontend con la clave corta
                clave_corta = {
                    'url_lateral_izquierda': 'lateral_izquierdo',
                    'url_lateral_derecha': 'lateral_derecho',
                    'url_foto_frontal': 'frontal',
                    'url_foto_trasera': 'trasera',
                    'url_foto_superior': 'superior',
                    'url_foto_inferior': 'inferior',
                    'url_foto_tablero': 'tablero'
                }.get(clave)
                
                if clave_corta and clave_corta in fotos_frontend:
                    value = fotos_frontend[clave_corta]
                    if value and value != 'null' and value != 'None' and value != '' and value != 'undefined':
                        fotos_para_bd[clave] = value
                        logger.info(f"📸 Asignando {clave} desde {clave_corta}: {value[:50]}...")
                else:
                    # Buscar con la misma clave por si acaso
                    if clave in fotos_frontend:
                        value = fotos_frontend[clave]
                        if value and value != 'null' and value != 'None' and value != '' and value != 'undefined':
                            fotos_para_bd[clave] = value
                            logger.info(f"📸 Asignando {clave} directamente: {value[:50]}...")
        
        logger.info(f"📸 Fotos FINALES para la BD: {fotos_para_bd}")
        
        # =============================================
        # 6. GUARDAR RECEPCIÓN
        # =============================================
        
        # Verificar si ya existe recepción
        recepcion_existente = supabase.table('recepcion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        # Construir datos para la recepción
        recepcion_update = {
            'transcripcion_problema': texto_descripcion
        }
        
        # Agregar todas las fotos
        for clave, valor in fotos_para_bd.items():
            recepcion_update[clave] = valor
        
        # Agregar audio si existe
        if audio_url and audio_url != 'null' and audio_url != '' and audio_url != 'undefined':
            recepcion_update['url_grabacion_problema'] = audio_url
            logger.info(f"🎵 Guardando audio: {audio_url[:50]}...")
        
        logger.info(f"📸 Datos FINALES a guardar: {recepcion_update}")
        
        # 🔥 GUARDAR O ACTUALIZAR
        if recepcion_existente.data:
            # Actualizar recepción existente
            result = supabase.table('recepcion') \
                .update(recepcion_update) \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
            logger.info(f"✅ Recepción actualizada para orden {id_orden}")
        else:
            # Crear nueva recepción
            recepcion_update['id_orden_trabajo'] = id_orden
            result = supabase.table('recepcion') \
                .insert(recepcion_update) \
                .execute()
            logger.info(f"✅ Recepción creada para orden {id_orden}")
        
        # Contar fotos guardadas
        fotos_guardadas = sum(1 for v in recepcion_update.values() 
                             if v and v != 'null' and v != '' and v != 'undefined' 
                             and v != 'url_grabacion_problema' and v != 'transcripcion_problema'
                             and v != 'id_orden_trabajo')
        logger.info(f"📸 Fotos guardadas: {fotos_guardadas}/7")
        
        return jsonify({
            'success': True,
            'message': 'Recepción actualizada exitosamente',
            'codigo_unico': codigo_unico,
            'fotos_guardadas': fotos_guardadas,
            'fotos': fotos_para_bd
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error actualizando recepción: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
# =====================================================
# ENDPOINT: REEMPLAZAR FOTO EN DRIVE (ELIMINA Y SUBE)
# =====================================================

@recepcion_jefe_bp.route('/reemplazar-foto', methods=['POST'])
@jefe_operativo_required
def reemplazar_foto_drive(current_user):
    """
    Reemplaza una foto existente en Drive:
    1. Elimina la foto anterior
    2. Sube la nueva foto
    3. Actualiza la sesión
    """
    try:
        from google_drive import google_drive
        from datetime import datetime
        
        file = request.files.get('file')
        campo = request.form.get('campo')
        url_anterior = request.form.get('url_anterior')
        codigo_orden = request.form.get('codigo_orden')
        codigo_sesion = request.form.get('codigo_sesion')
        carpeta = request.form.get('carpeta', 'recepcion')
        
        # 🔥 VALIDACIONES
        if not file:
            return jsonify({'error': 'No se envió el archivo'}), 400
        
        if not campo:
            return jsonify({'error': 'No se especificó el campo'}), 400
        
        logger.info(f"🔄 Reemplazando foto: campo={campo}")
        logger.info(f"   URL anterior: {url_anterior[:80] if url_anterior else 'None'}...")
        logger.info(f"   Código orden: {codigo_orden}")
        logger.info(f"   Código sesión: {codigo_sesion}")
        
        # =============================================
        # 1. ELIMINAR FOTO ANTERIOR
        # =============================================
        foto_eliminada = False
        if url_anterior and url_anterior != 'null' and url_anterior != '' and url_anterior != 'undefined':
            try:
                # Extraer file_id de la URL
                file_id = google_drive.extract_file_id_from_url(url_anterior)
                if file_id:
                    # Verificar si el archivo existe antes de eliminar
                    if google_drive.file_exists(file_id):
                        delete_result = google_drive.delete_file(file_id)
                        if delete_result:
                            foto_eliminada = True
                            logger.info(f"🗑️ Foto anterior eliminada: {file_id}")
                        else:
                            logger.warning(f"⚠️ No se pudo eliminar foto: {file_id}")
                    else:
                        logger.info(f"ℹ️ La foto ya no existe en Drive: {file_id}")
                        foto_eliminada = True  # Considerar como éxito
                else:
                    logger.warning(f"⚠️ No se pudo extraer file_id de: {url_anterior[:50]}...")
            except Exception as e:
                logger.warning(f"⚠️ Error eliminando foto anterior: {str(e)}")
        else:
            logger.info("ℹ️ No hay foto anterior para eliminar (subida nueva)")
        
        # =============================================
        # 2. SUBIR NUEVA FOTO
        # =============================================
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        user_id = current_user['id']
        filename = f"{campo}_{user_id}_{timestamp}.jpg"
        
        # Determinar referencia para la carpeta
        referencia = codigo_orden or codigo_sesion or 'recepcion'
        
        # Generar ruta de carpeta
        folder_path = google_drive.generate_folder_path(
            modulo='recepcion',
            codigo_orden=referencia,
            subcarpeta='fotos'
        )
        
        logger.info(f"📁 Subiendo nueva foto a: {folder_path}")
        
        result = google_drive.upload_file(
            file_data=file,
            filename=filename,
            folder_path=folder_path,
            public=True
        )
        
        url = result['url']
        file_id = result['id']
        logger.info(f"📸 Nueva foto subida: {file_id} - {url[:50]}...")
        
        # =============================================
        # 3. ACTUALIZAR SESIÓN EN MEMORIA Y BD
        # =============================================
        # Mapeo de campos
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
        
        sesion_actualizada = False
        
        # Buscar en sesiones activas
        for sesion_codigo, sesion in sesiones_activas.items():
            if sesion.get('estado') != 'activa':
                continue
            
            # Verificar si esta sesión tiene la foto anterior
            if 'datos' in sesion and 'fotos' in sesion['datos']:
                foto_actual = sesion['datos']['fotos'].get(campo_db)
                
                # Si coincide con la URL anterior o es la sesión que buscamos
                if foto_actual == url_anterior or sesion_codigo == codigo_sesion:
                    # Actualizar la foto
                    sesion['datos']['fotos'][campo_db] = url
                    
                    # Recalcular fotos válidas
                    fotos = sesion['datos']['fotos']
                    fotos_validas = sum(1 for v in fotos.values() 
                                       if v and v != 'null' and v != '' and v != 'undefined')
                    sesion['secciones_completadas']['fotos'] = fotos_validas == 7
                    
                    # Guardar en BD
                    guardar_sesion_en_db(sesion)
                    sesion_actualizada = True
                    logger.info(f"📸 Sesión {sesion_codigo} actualizada: {fotos_validas}/7 fotos")
                    break
        
        # Si no se encontró la sesión, intentar guardar en la sesión actual
        if not sesion_actualizada and codigo_sesion and codigo_sesion in sesiones_activas:
            sesion = sesiones_activas[codigo_sesion]
            if 'datos' not in sesion:
                sesion['datos'] = {}
            if 'fotos' not in sesion['datos']:
                sesion['datos']['fotos'] = {}
            sesion['datos']['fotos'][campo_db] = url
            guardar_sesion_en_db(sesion)
            sesion_actualizada = True
            logger.info(f"📸 Sesión {codigo_sesion} actualizada directamente")
        
        logger.info(f"✅ Foto reemplazada exitosamente: {campo}")
        logger.info(f"   Eliminada: {foto_eliminada}")
        logger.info(f"   Nueva URL: {url[:50]}...")
        
        return jsonify({
            'success': True,
            'url': url,
            'id': file_id,
            'web_view_link': result.get('web_view_link'),
            'foto_eliminada': foto_eliminada,
            'sesion_actualizada': sesion_actualizada,
            'message': 'Foto reemplazada exitosamente'
        })
        
    except Exception as e:
        logger.error(f"❌ Error reemplazando foto: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# =====================================================
# ENDPOINT: ELIMINAR FOTO INDIVIDUAL DE DRIVE
# =====================================================

@recepcion_jefe_bp.route('/eliminar-foto', methods=['POST'])
@jefe_operativo_required
def eliminar_foto_drive(current_user):
    """
    Elimina una foto específica de Google Drive por su URL
    """
    try:
        from google_drive import google_drive
        
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({'error': 'URL requerida'}), 400
        
        logger.info(f"🗑️ Eliminando foto de Drive: {url[:50]}...")
        
        # Extraer file_id de la URL
        file_id = google_drive.extract_file_id_from_url(url)
        if not file_id:
            return jsonify({'error': 'No se pudo extraer el ID del archivo'}), 400
        
        # Eliminar el archivo
        result = google_drive.delete_file(file_id)
        
        if result:
            logger.info(f"✅ Foto eliminada de Drive: {file_id}")
            return jsonify({
                'success': True,
                'message': 'Foto eliminada de Drive exitosamente',
                'file_id': file_id
            })
        else:
            logger.warning(f"⚠️ No se pudo eliminar la foto: {file_id}")
            return jsonify({
                'success': False,
                'error': 'Error al eliminar la foto de Drive'
            }), 500
        
    except Exception as e:
        logger.error(f"❌ Error eliminando foto: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT: TRANSCRIBIR AUDIO CON WHISPER
# =====================================================

@recepcion_jefe_bp.route('/transcribir-audio', methods=['POST'])
@jefe_operativo_required
def transcribir_audio_endpoint(current_user):
    """
    Transcribe un audio usando Whisper
    Recibe: { id_orden, audio_url (opcional) }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Datos no proporcionados'}), 400
        
        id_orden = data.get('id_orden')
        audio_url = data.get('audio_url')
        
        # Si no se proporciona audio_url, buscarlo en la base de datos
        if not audio_url and id_orden:
            recepcion = supabase.table('recepcion') \
                .select('url_grabacion_problema') \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
            
            if recepcion.data and recepcion.data[0].get('url_grabacion_problema'):
                audio_url = recepcion.data[0]['url_grabacion_problema']
            else:
                return jsonify({
                    'success': False,
                    'error': 'No se encontró audio para esta orden'
                }), 404
        
        if not audio_url:
            return jsonify({
                'success': False,
                'error': 'URL de audio no proporcionada'
            }), 400
        
        # Normalizar URL
        audio_url_normalizada = normalizar_url_drive(audio_url)
        if not audio_url_normalizada:
            return jsonify({
                'success': False,
                'error': 'URL de audio inválida'
            }), 400
        
        logger.info(f"🎙️ Iniciando transcripción para orden {id_orden}")
        
        # Transcribir con Whisper usando google_drive
        from google_drive import google_drive
        
        resultado = google_drive.transcribir_audio(
            url_audio=audio_url_normalizada
        )
        
        if not resultado['success']:
            return jsonify({
                'success': False,
                'error': resultado.get('error', 'Error en la transcripción')
            }), 500
        
        transcripcion = resultado['transcripcion']
        
        logger.info(f"✅ Transcripción completada: {transcripcion[:100]}...")
        
        # Guardar en la base de datos
        if id_orden:
            try:
                supabase.table('recepcion') \
                    .update({'transcripcion_problema': transcripcion}) \
                    .eq('id_orden_trabajo', id_orden) \
                    .execute()
                logger.info(f"💾 Transcripción guardada para orden {id_orden}")
            except Exception as e:
                logger.warning(f"⚠️ No se pudo guardar transcripción: {str(e)}")
        
        return jsonify({
            'success': True,
            'transcripcion': transcripcion,
            'modelo_usado': resultado.get('modelo', 'desconocido'),
            'idioma': resultado.get('idioma', 'es'),
            'duracion': resultado.get('duracion', 0)
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error en transcribir_audio: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
# =====================================================
# ENDPOINT: GUARDAR TRANSCRIPCIÓN MANUAL
# =====================================================

@recepcion_jefe_bp.route('/guardar-transcripcion', methods=['POST'])
@jefe_operativo_required
def guardar_transcripcion(current_user):
    """
    Guarda una transcripción manual en la base de datos
    Recibe: { id_orden, transcripcion }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Datos no proporcionados'}), 400
        
        id_orden = data.get('id_orden')
        transcripcion = data.get('transcripcion', '').strip()
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not transcripcion:
            return jsonify({'error': 'Transcripción vacía'}), 400
        
        # Verificar que existe la orden
        orden = supabase.table('ordentrabajo') \
            .select('id') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        # Actualizar transcripción
        supabase.table('recepcion') \
            .update({'transcripcion_problema': transcripcion}) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        logger.info(f"💾 Transcripción manual guardada para orden {id_orden}")
        
        return jsonify({
            'success': True,
            'message': 'Transcripción guardada correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error guardando transcripción: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500