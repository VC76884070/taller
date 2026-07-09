# =====================================================
# RECEPCION_JEFEOPERATIVO.PY - VERSIÓN COMPLETA Y CORREGIDA
# CON TODOS LOS ENDPOINTS - SESIONES + GOOGLE DRIVE + RENOMBRADO DE CARPETA
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
            '/verificar-placa/<placa>',
            '/upload-foto',
            '/upload-audio',
            '/renombrar-carpeta',
            '/imagen-base64',
            '/actualizar-foto-sesion',
            '/verificar-fotos/<codigo>',
            '/verificar-carpeta/<nombre>'
        ]
    }), 200

# =====================================================
# ENDPOINT 2: SESIONES ACTIVAS
# =====================================================

@recepcion_jefe_bp.route('/sesiones-activas', methods=['GET'])
@jefe_operativo_required
def listar_sesiones_activas(current_user):
    """Lista todas las sesiones activas"""
    global sesiones_activas
    try:
        # Limpiar sesiones finalizadas de memoria
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
# ENDPOINT 3: LISTAR RECEPCIONES (🔥 CORREGIDO)
# =====================================================

@recepcion_jefe_bp.route('/listar-recepciones', methods=['GET'])
@jefe_operativo_required
def listar_recepciones(current_user):
    """
    Lista las recepciones guardadas CON TODOS LOS DATOS DEL CLIENTE
    Versión corregida usando SQL directo (la consulta que funcionó en la prueba)
    """
    try:
        # =============================================
        # 🔥 CONSULTA SQL DIRECTA (LA QUE PROBASTE Y FUNCIONÓ)
        # =============================================
        query = """
            SELECT 
                ot.id AS orden_id,
                ot.codigo_unico,
                ot.fecha_ingreso,
                ot.estado_global,
                v.placa,
                v.marca,
                v.modelo,
                v.anio,
                v.kilometraje,
                u.id AS usuario_id,
                u.nombre AS cliente_nombre,
                u.contacto AS cliente_telefono,
                u.email AS cliente_email,
                u.ubicacion AS cliente_ubicacion,
                c.id AS cliente_id,
                c.latitud,
                c.longitud,
                c.ubicacion_confirmada
            FROM ordentrabajo ot
            LEFT JOIN vehiculo v ON ot.id_vehiculo = v.id
            LEFT JOIN cliente c ON v.id_cliente = c.id
            LEFT JOIN usuario u ON c.id_usuario = u.id
            ORDER BY ot.fecha_ingreso DESC
            LIMIT 50
        """
        
        # Ejecutar la consulta SQL directa usando RPC
        try:
            resultado = supabase.rpc('execute_sql', {'query': query}).execute()
        except Exception as e:
            logger.warning(f"⚠️ RPC execute_sql falló, usando método alternativo: {e}")
            resultado = None
        
        # Si el método RPC no funciona, usar el método alternativo con joins de Supabase
        if not resultado or not resultado.data:
            logger.info("📊 Usando método alternativo con joins de Supabase")
            return listar_recepciones_join_supabase(current_user)
        
        # Procesar resultados de la consulta SQL directa
        recepciones = []
        for row in resultado.data:
            recepciones.append({
                'id': row.get('orden_id'),
                'codigo_unico': row.get('codigo_unico'),
                'fecha_ingreso': row.get('fecha_ingreso'),
                'estado_global': row.get('estado_global'),
                'placa': row.get('placa', ''),
                'marca': row.get('marca', ''),
                'modelo': row.get('modelo', ''),
                'anio': row.get('anio'),
                'kilometraje': row.get('kilometraje', 0),
                'cliente_nombre': row.get('cliente_nombre', 'N/A'),
                'cliente_telefono': row.get('cliente_telefono', 'N/A'),
                'cliente_email': row.get('cliente_email', 'N/A'),
                'cliente_ubicacion': row.get('cliente_ubicacion', ''),
                'latitud': row.get('latitud'),
                'longitud': row.get('longitud'),
                'ubicacion_confirmada': row.get('ubicacion_confirmada', False)
            })
        
        logger.info(f"✅ {len(recepciones)} recepciones listadas (SQL directo)")
        return jsonify({'success': True, 'recepciones': recepciones}), 200
        
    except Exception as e:
        logger.error(f"❌ Error listando recepciones: {str(e)}")
        # Fallback al método alternativo
        return listar_recepciones_join_supabase(current_user)


def listar_recepciones_join_supabase(current_user):
    """
    Método alternativo con joins de Supabase
    (fallback si el SQL directo no funciona)
    """
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                fecha_ingreso,
                estado_global,
                vehiculo!inner (
                    placa,
                    marca,
                    modelo,
                    anio,
                    kilometraje,
                    cliente!inner (
                        id,
                        latitud,
                        longitud,
                        ubicacion_confirmada,
                        usuario!inner (
                            id,
                            nombre,
                            contacto,
                            email,
                            ubicacion
                        )
                    )
                )
            ''') \
            .order('fecha_ingreso', desc=True) \
            .limit(50) \
            .execute()
        
        recepciones = []
        for orden in (resultado.data or []):
            vehiculo_data = orden.get('vehiculo', {})
            cliente_data = vehiculo_data.get('cliente', {})
            usuario_data = cliente_data.get('usuario', {})
            
            recepciones.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'estado_global': orden['estado_global'],
                'placa': vehiculo_data.get('placa', ''),
                'marca': vehiculo_data.get('marca', ''),
                'modelo': vehiculo_data.get('modelo', ''),
                'anio': vehiculo_data.get('anio'),
                'kilometraje': vehiculo_data.get('kilometraje', 0),
                'cliente_nombre': usuario_data.get('nombre', 'N/A'),
                'cliente_telefono': usuario_data.get('contacto', 'N/A'),
                'cliente_email': usuario_data.get('email', 'N/A'),
                'cliente_ubicacion': usuario_data.get('ubicacion', ''),
                'latitud': cliente_data.get('latitud'),
                'longitud': cliente_data.get('longitud'),
                'ubicacion_confirmada': cliente_data.get('ubicacion_confirmada', False)
            })
        
        logger.info(f"✅ {len(recepciones)} recepciones listadas (joins Supabase)")
        return jsonify({'success': True, 'recepciones': recepciones}), 200
        
    except Exception as e:
        logger.error(f"❌ Error en método alternativo: {str(e)}")
        # Último fallback: método simple con consultas separadas
        return listar_recepciones_simple(current_user)


def listar_recepciones_simple(current_user):
    """
    Versión simple con consultas separadas (último fallback)
    """
    try:
        resultado = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .order('fecha_ingreso', desc=True) \
            .limit(50) \
            .execute()
        
        recepciones = []
        for orden in (resultado.data or []):
            recepcion = {
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'estado_global': orden['estado_global'],
                'cliente_nombre': 'N/A',
                'cliente_telefono': 'N/A',
                'cliente_email': 'N/A',
                'cliente_ubicacion': '',
                'latitud': None,
                'longitud': None,
                'placa': '',
                'marca': '',
                'modelo': '',
                'anio': None,
                'kilometraje': 0
            }
            
            if orden.get('id_vehiculo'):
                # Obtener vehículo
                v_result = supabase.table('vehiculo') \
                    .select('placa, marca, modelo, anio, kilometraje, id_cliente') \
                    .eq('id', orden['id_vehiculo']) \
                    .execute()
                
                if v_result.data:
                    v = v_result.data[0]
                    recepcion['placa'] = v.get('placa', '')
                    recepcion['marca'] = v.get('marca', '')
                    recepcion['modelo'] = v.get('modelo', '')
                    recepcion['anio'] = v.get('anio')
                    recepcion['kilometraje'] = v.get('kilometraje', 0)
                    
                    # Obtener cliente
                    if v.get('id_cliente'):
                        c_result = supabase.table('cliente') \
                            .select('id_usuario, latitud, longitud, ubicacion_confirmada') \
                            .eq('id', v['id_cliente']) \
                            .execute()
                        
                        if c_result.data:
                            c = c_result.data[0]
                            recepcion['latitud'] = c.get('latitud')
                            recepcion['longitud'] = c.get('longitud')
                            recepcion['ubicacion_confirmada'] = c.get('ubicacion_confirmada', False)
                            
                            # Obtener usuario (cliente)
                            if c.get('id_usuario'):
                                u_result = supabase.table('usuario') \
                                    .select('nombre, contacto, email, ubicacion') \
                                    .eq('id', c['id_usuario']) \
                                    .execute()
                                
                                if u_result.data:
                                    u = u_result.data[0]
                                    recepcion['cliente_nombre'] = u.get('nombre', 'N/A')
                                    recepcion['cliente_telefono'] = u.get('contacto', 'N/A')
                                    recepcion['cliente_email'] = u.get('email', 'N/A')
                                    recepcion['cliente_ubicacion'] = u.get('ubicacion', '')
            
            recepciones.append(recepcion)
        
        logger.info(f"✅ {len(recepciones)} recepciones listadas (fallback simple)")
        return jsonify({'success': True, 'recepciones': recepciones}), 200
        
    except Exception as e:
        logger.error(f"❌ Error en fallback simple: {str(e)}")
        return jsonify({'success': True, 'recepciones': []}), 200

# =====================================================
# ENDPOINT 4: INICIAR SESIÓN
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
# ENDPOINT 5: OBTENER SESIÓN
# =====================================================

@recepcion_jefe_bp.route('/obtener-sesion/<codigo>', methods=['GET'])
@jefe_operativo_required
def obtener_sesion(current_user, codigo):
    """Obtiene los datos de una sesión específica"""
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
# ENDPOINT 6: GUARDAR SECCIÓN (CORREGIDO)
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
            if 'datos' not in sesion:
                sesion['datos'] = {}
            if 'fotos' not in sesion['datos']:
                sesion['datos']['fotos'] = {}
            
            fotos_actualizadas = 0
            for campo, valor in datos_seccion.items():
                if valor and valor != 'null' and valor != '':
                    sesion['datos']['fotos'][campo] = valor
                    fotos_actualizadas += 1
                    logger.info(f"📸 Foto {campo} guardada en sesión")
            
            fotos = sesion['datos']['fotos']
            fotos_validas = sum(1 for v in fotos.values() if v and v != 'null' and v != '')
            sesion['secciones_completadas']['fotos'] = fotos_validas == 7
            
            logger.info(f"📸 Fotos en sesión: {fotos_validas}/7 - Actualizadas: {fotos_actualizadas}")
            
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
# ENDPOINT 7: UNIRSE A SESIÓN
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
# ENDPOINT 8: FINALIZAR SESIÓN (CON RENOMBRADO DE CARPETA)
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
        
        # Validar secciones completadas
        secciones_faltantes = [s for s, c in sesion['secciones_completadas'].items() if not c]
        if secciones_faltantes:
            return jsonify({'error': f'Faltan: {", ".join(secciones_faltantes)}'}), 400
        
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
            
            # 5. Guardar recepción
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
            
            # =============================================
            # 🔥 PASO IMPORTANTE: RENOMBRAR CARPETA EN DRIVE
            # =============================================
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
            
            # 6. Marcar sesión como finalizada
            sesion['estado'] = 'finalizada'
            guardar_sesion_en_db(sesion)
            
            # 7. Eliminar de memoria
            if codigo_sesion in sesiones_activas:
                del sesiones_activas[codigo_sesion]
            
            logger.info(f"✅ Sesión {codigo_sesion} finalizada. Orden: {codigo_unico}")
            
            return jsonify({
                'success': True,
                'codigo': codigo_unico,
                'id_orden': id_orden,
                'carpeta_renombrada': carpeta_renombrada
            }), 200
            
        except Exception as e:
            logger.error(f"Error creando orden: {str(e)}")
            return jsonify({'error': str(e)}), 500
        
    except Exception as e:
        logger.error(f"Error finalizando: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 9: CANCELAR SESIÓN (CON ELIMINACIÓN DE CARPETA EN DRIVE)
# =====================================================

@recepcion_jefe_bp.route('/cancelar-sesion', methods=['DELETE'])
@jefe_operativo_required
def cancelar_sesion(current_user):
    """
    Cancela una sesión activa y elimina TODOS los datos asociados:
    - Archivos en Google Drive
    - Registros en Supabase
    - Memoria (sesiones_activas)
    """
    global sesiones_activas
    try:
        from google_drive import google_drive
        
        data = request.get_json()
        codigo_sesion = data.get('codigo')
        
        if not codigo_sesion:
            return jsonify({'error': 'Código requerido'}), 400
        
        logger.info(f"🗑️ Cancelando sesión: {codigo_sesion}")
        
        # 1. ELIMINAR CARPETA DE GOOGLE DRIVE
        carpeta_eliminada = False
        try:
            logger.info(f"🔍 Buscando carpeta en Drive: {codigo_sesion}")
            folder_id = google_drive.get_folder_id_by_name(codigo_sesion)
            
            if folder_id:
                logger.info(f"📁 Carpeta encontrada: {folder_id}")
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
        
        # 2. ELIMINAR REGISTROS DE SUPABASE
        try:
            logger.info(f"🗄️ Eliminando sesión de Supabase: {codigo_sesion}")
            supabase.table('sesion_colaborativa') \
                .delete() \
                .eq('codigo', codigo_sesion) \
                .execute()
            logger.info(f"✅ Sesión eliminada de Supabase: {codigo_sesion}")
                
        except Exception as e:
            logger.error(f"❌ Error eliminando de Supabase: {str(e)}")
        
        # 3. ELIMINAR DE MEMORIA
        if codigo_sesion in sesiones_activas:
            del sesiones_activas[codigo_sesion]
            logger.info(f"✅ Sesión eliminada de memoria: {codigo_sesion}")
        else:
            sesiones_activas = {}
            logger.info(f"🔄 Sesiones recargadas: {len(sesiones_activas)} activas")
        
        return jsonify({
            'success': True,
            'message': f'Sesión {codigo_sesion} cancelada y datos eliminados',
            'carpeta_eliminada': carpeta_eliminada,
            'detalles': {
                'sesion_eliminada': True,
                'carpeta_eliminada': carpeta_eliminada
            }
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error cancelando sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 10: PING SESIÓN
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
# ENDPOINT 11: VERIFICAR PLACA
# =====================================================

@recepcion_jefe_bp.route('/verificar-placa/<placa>', methods=['GET'])
@jefe_operativo_required
def verificar_placa(current_user, placa):
    """Verifica si una placa ya existe en el sistema"""
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
# ENDPOINT 12: SUBIR FOTO A GOOGLE DRIVE
# =====================================================

@recepcion_jefe_bp.route('/upload-foto', methods=['POST'])
@jefe_operativo_required
def upload_foto_drive(current_user):
    """
    Sube una foto a Google Drive
    ESTRUCTURA: S-XXXXX/recepcion/fotos/
    """
    try:
        from google_drive import google_drive
        from datetime import datetime
        
        file = request.files.get('file')
        campo = request.form.get('campo', 'general')
        codigo_sesion = request.form.get('codigo_sesion')
        
        if not file:
            return jsonify({'error': 'No se envió el archivo'}), 400
        
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
        
        logger.info(f"📸 Foto subida: {result['url']}")
        
        try:
            if codigo_sesion not in sesiones_activas:
                sesion = cargar_sesion_de_db(codigo_sesion)
                if sesion:
                    sesiones_activas[codigo_sesion] = sesion
            
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
                
                sesion['datos']['fotos'][campo_db] = result['url']
                
                fotos = sesion['datos']['fotos']
                fotos_validas = sum(1 for v in fotos.values() if v and v != 'null' and v != '')
                fotos_completas = fotos_validas == 7
                
                if 'secciones_completadas' not in sesion:
                    sesion['secciones_completadas'] = {}
                sesion['secciones_completadas']['fotos'] = fotos_completas
                
                guardar_sesion_en_db(sesion)
                
                logger.info(f"📸 Sesión actualizada: {fotos_validas}/7 fotos - Completado: {fotos_completas}")
                
        except Exception as e:
            logger.warning(f"⚠️ No se pudo actualizar sesión automáticamente: {e}")
        
        return jsonify({
            'success': True,
            'url': result['url'],
            'id': result['id'],
            'web_view_link': result['web_view_link']
        })
        
    except Exception as e:
        logger.error(f"❌ Error subiendo foto: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 13: ACTUALIZAR FOTO EN SESIÓN
# =====================================================

@recepcion_jefe_bp.route('/actualizar-foto-sesion', methods=['POST'])
@jefe_operativo_required
def actualizar_foto_sesion(current_user):
    """
    Actualiza la URL de una foto en la sesión actual
    """
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
        
        logger.info(f"📸 Foto {campo} actualizada en sesión {codigo_sesion} - {fotos_validas}/7")
        
        return jsonify({
            'success': True,
            'fotos_subidas': fotos_validas,
            'total': 7,
            'completado': fotos_completas,
            'campo': campo,
            'url': url
        })
        
    except Exception as e:
        logger.error(f"❌ Error actualizando foto en sesión: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 14: VERIFICAR FOTOS DE SESIÓN
# =====================================================

@recepcion_jefe_bp.route('/verificar-fotos/<codigo>', methods=['GET'])
@jefe_operativo_required
def verificar_fotos(current_user, codigo):
    """
    Verifica el estado de las fotos de una sesión
    """
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
        })
        
    except Exception as e:
        logger.error(f"Error verificando fotos: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 15: VERIFICAR CARPETA EN DRIVE
# =====================================================

@recepcion_jefe_bp.route('/verificar-carpeta/<nombre>', methods=['GET'])
@jefe_operativo_required
def verificar_carpeta(current_user, nombre):
    """
    Verifica si una carpeta existe en Google Drive
    """
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
# ENDPOINT 16: SUBIR AUDIO A GOOGLE DRIVE
# =====================================================

@recepcion_jefe_bp.route('/upload-audio', methods=['POST'])
@jefe_operativo_required
def upload_audio_drive(current_user):
    """
    Sube un audio a Google Drive
    ESTRUCTURA: S-XXXXX/recepcion/audios/
    """
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
        })
        
    except Exception as e:
        logger.error(f"❌ Error subiendo audio: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 17: RENOMBRAR CARPETA (MANUAL)
# =====================================================

@recepcion_jefe_bp.route('/renombrar-carpeta', methods=['POST'])
@jefe_operativo_required
def renombrar_carpeta_drive(current_user):
    """
    Renombra una carpeta en Google Drive
    """
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

# =====================================================
# ENDPOINT 18: IMAGEN A BASE64
# =====================================================

@recepcion_jefe_bp.route('/imagen-base64', methods=['POST'])
@jefe_operativo_required
def obtener_imagen_base64(current_user):
    """
    Descarga una imagen de Google Drive y la convierte a base64
    """
    try:
        import requests
        import base64
        
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({'error': 'URL requerida'}), 400
        
        logger.info(f"📥 Descargando imagen desde: {url[:50]}...")
        
        response = requests.get(url, timeout=30)
        
        if response.status_code != 200:
            logger.error(f"❌ Error descargando imagen: {response.status_code}")
            return jsonify({'error': f'Error descargando imagen: {response.status_code}'}), 400
        
        content_type = response.headers.get('content-type', 'image/jpeg')
        
        img_base64 = base64.b64encode(response.content).decode('utf-8')
        base64_data = f"data:{content_type};base64,{img_base64}"
        
        logger.info(f"✅ Imagen convertida a base64: {len(base64_data)} bytes")
        
        return jsonify({
            'success': True,
            'base64': base64_data
        })
        
    except requests.exceptions.Timeout:
        logger.error("❌ Timeout descargando imagen")
        return jsonify({'error': 'Timeout descargando imagen'}), 500
    except Exception as e:
        logger.error(f"❌ Error obteniendo imagen base64: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 19: DETALLE RECEPCIÓN (CORREGIDO)
# =====================================================

@recepcion_jefe_bp.route('/detalle-recepcion/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def detalle_recepcion(current_user, id_orden):
    """
    Obtiene el detalle completo de una recepción
    """
    try:
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo, id_jefe_operativo, id_jefe_operativo_2') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data
        
        # Obtener jefe principal
        jefe_principal = {}
        if orden.get('id_jefe_operativo'):
            j1 = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .eq('id', orden['id_jefe_operativo']) \
                .execute()
            if j1.data:
                jefe_principal = j1.data[0]
        
        # Obtener jefe secundario
        jefe_secundario = {}
        if orden.get('id_jefe_operativo_2'):
            j2 = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .eq('id', orden['id_jefe_operativo_2']) \
                .execute()
            if j2.data:
                jefe_secundario = j2.data[0]
        
        # Obtener vehículo
        vehiculo_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('id', orden['id_vehiculo']) \
            .single() \
            .execute()
        
        vehiculo = vehiculo_result.data if vehiculo_result.data else {}
        
        # Obtener cliente y usuario
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
        
        # 🔥 OBTENER RECEPCIÓN CON TODAS LAS FOTOS
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
                transcripcion_problema
            ''') \
            .eq('id_orden_trabajo', id_orden) \
            .single() \
            .execute()
        
        recepcion = recepcion_result.data if recepcion_result.data else {}
        
        # 🔥 CONSTRUIR OBJETO DE FOTOS CON TODAS LAS URLS
        fotos = {
            'url_lateral_izquierda': recepcion.get('url_lateral_izquierda'),
            'url_lateral_derecha': recepcion.get('url_lateral_derecha'),
            'url_foto_frontal': recepcion.get('url_foto_frontal'),
            'url_foto_trasera': recepcion.get('url_foto_trasera'),
            'url_foto_superior': recepcion.get('url_foto_superior'),
            'url_foto_inferior': recepcion.get('url_foto_inferior'),
            'url_foto_tablero': recepcion.get('url_foto_tablero')
        }
        
        # 🔥 LIMPIAR URLs NULAS O VACÍAS PARA QUE EL FRONTEND LAS FILTRE
        fotos_limpias = {}
        for key, value in fotos.items():
            if value and value != 'null' and value != 'None' and value != '':
                fotos_limpias[key] = value
            else:
                fotos_limpias[key] = None
        
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
            # 🔥 FOTOS LIMPIAS
            'fotos': fotos_limpias,
            'audio_url': recepcion.get('url_grabacion_problema'),
            'transcripcion_problema': recepcion.get('transcripcion_problema', '')
        }
        
        return jsonify({'success': True, 'detalle': detalle}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ENDPOINT 20: ELIMINAR RECEPCIÓN
# =====================================================

@recepcion_jefe_bp.route('/eliminar-recepcion/<int:id_orden>', methods=['DELETE'])
@jefe_operativo_required
def eliminar_recepcion(current_user, id_orden):
    """
    Elimina una recepción (solo si está en estado EnRecepcion)
    """
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