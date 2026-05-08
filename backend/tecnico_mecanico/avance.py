# =====================================================
# AVANCE.PY - TÉCNICO MECÁNICO
# REGISTRO DE AVANCES DE TRABAJO
# =====================================================

from flask import Blueprint, request, jsonify, send_from_directory
from functools import wraps
from config import config
import jwt
import datetime
import logging
import json
import os

logger = logging.getLogger(__name__)

avance_bp = Blueprint('tecnico_avance', __name__, url_prefix='/api/tecnico')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def normalizar_nombre_rol(nombre):
    if not nombre:
        return None
    nombre_lower = nombre.lower()
    mapping = {
        'tecnico': 'tecnico',
        'tecnico_mecanico': 'tecnico',
        'jefe_taller': 'jefe_taller',
        'jefe_operativo': 'jefe_operativo',
        'encargado_repuestos': 'encargado_repuestos',
        'cliente': 'cliente',
        'admin': 'admin',
        'administrador': 'admin'
    }
    return mapping.get(nombre_lower, nombre_lower)


def obtener_roles_usuario(usuario_id):
    try:
        user_roles = supabase.table('usuario_rol') \
            .select('id_rol') \
            .eq('id_usuario', usuario_id) \
            .execute()
        if not user_roles.data:
            return []
        rol_ids = [ur['id_rol'] for ur in user_roles.data if ur.get('id_rol')]
        if not rol_ids:
            return []
        roles_data = supabase.table('rol') \
            .select('nombre_rol') \
            .in_('id', rol_ids) \
            .execute()
        roles = [r['nombre_rol'] for r in (roles_data.data or [])]
        roles_normalizados = [normalizar_nombre_rol(r) for r in roles if normalizar_nombre_rol(r)]
        return roles_normalizados
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return []


def verificar_token_y_usuario():
    token = None
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        try:
            token = auth_header.split(" ")[1]
        except IndexError:
            pass
    if not token:
        return None, "No autorizado", 401
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        if 'user' in data:
            current_user = data['user']
        else:
            current_user = data
        usuario_id = current_user.get('id')
        if not usuario_id:
            return None, "Token inválido", 401
        roles = obtener_roles_usuario(usuario_id)
        if not roles:
            roles_token = current_user.get('roles', [])
            if roles_token:
                roles = [normalizar_nombre_rol(r) for r in roles_token if normalizar_nombre_rol(r)]
        current_user['roles'] = roles
        return current_user, None, None
    except jwt.ExpiredSignatureError:
        return None, "Sesión expirada", 401
    except jwt.InvalidTokenError:
        return None, "Token inválido", 401
    except Exception as e:
        return None, "Error de autenticación", 401


def tecnico_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user, error, status = verificar_token_y_usuario()
        if error:
            return jsonify({'error': error}), status
        user_roles = current_user.get('roles', [])
        tiene_rol_tecnico = 'tecnico' in user_roles
        if not tiene_rol_tecnico:
            return jsonify({'error': 'No autorizado - Se requiere rol de Técnico'}), 403
        return f(current_user, *args, **kwargs)
    return decorated


# =====================================================
# ENDPOINTS
# =====================================================

@avance_bp.route('/ordenes-en-reparacion', methods=['GET'])
@tecnico_required
def obtener_ordenes_en_reparacion(current_user):
    """Obtener órdenes en estado EnReparacion para el técnico"""
    try:
        tecnico_id = current_user['id']
        
        # Primero obtener los IDs de las órdenes asignadas al técnico
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo') \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'reparacion') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        print(f"🔍 Asignaciones encontradas: {len(asignaciones.data) if asignaciones.data else 0}")
        
        if not asignaciones.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        orden_ids = [a['id_orden_trabajo'] for a in asignaciones.data if a.get('id_orden_trabajo')]
        print(f"📋 IDs de órdenes: {orden_ids}")
        
        if not orden_ids:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        # Luego obtener los datos completos de las órdenes
        ordenes_data = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .in_('id', orden_ids) \
            .eq('estado_global', 'EnReparacion') \
            .execute()
        
        print(f"📦 Órdenes encontradas: {len(ordenes_data.data) if ordenes_data.data else 0}")
        
        ordenes = []
        for orden in (ordenes_data.data or []):
            vehiculo = orden.get('vehiculo', {})
            
            ordenes.append({
                'id': orden.get('id'),
                'codigo_unico': orden.get('codigo_unico'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip()
            })
        
        print(f"✅ Órdenes procesadas: {len(ordenes)}")
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@avance_bp.route('/avances', methods=['GET', 'POST'])
@tecnico_required
def gestionar_avances(current_user):
    """Obtener o crear avances de trabajo"""
    
    if request.method == 'GET':
        id_orden = request.args.get('id_orden')
        
        # Validar que id_orden sea un número válido
        if not id_orden or id_orden == 'null' or id_orden == 'undefined':
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        try:
            id_orden = int(id_orden)
        except ValueError:
            return jsonify({'error': 'ID de orden inválido'}), 400
        
        # Verificar que el técnico tiene acceso
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        # Obtener avances
        avances = supabase.table('avance_trabajo') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        resultado = []
        for a in (avances.data or []):
            fotos = []
            if a.get('fotos'):
                try:
                    fotos = json.loads(a['fotos']) if isinstance(a['fotos'], str) else a['fotos']
                except:
                    fotos = []
            
            resultado.append({
                'id': a.get('id'),
                'titulo': a.get('titulo'),
                'descripcion': a.get('descripcion'),
                'fotos': fotos,
                'estado': a.get('estado', 'pendiente'),
                'fecha_creacion': a.get('fecha_creacion'),
                'fecha_aprobacion': a.get('fecha_aprobacion'),
                'comentario_revision': a.get('comentario_revision')
            })
        
        return jsonify({'success': True, 'avances': resultado}), 200
    
    elif request.method == 'POST':
        data = request.get_json()
        
        id_orden = data.get('id_orden_trabajo')
        titulo = data.get('titulo')
        descripcion = data.get('descripcion', '')
        fotos = data.get('fotos', [])
        estado = data.get('estado', 'pendiente')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not titulo:
            return jsonify({'error': 'Título requerido'}), 400
        
        if not fotos:
            return jsonify({'error': 'Debes subir al menos una foto'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        nuevo_avance = {
            'id_orden_trabajo': id_orden,
            'id_tecnico': current_user['id'],
            'titulo': titulo,
            'descripcion': descripcion,
            'fotos': json.dumps(fotos),
            'estado': estado,
            'fecha_creacion': ahora
        }
        
        result = supabase.table('avance_trabajo').insert(nuevo_avance).execute()
        
        if not result.data:
            return jsonify({'error': 'Error al crear avance'}), 500
        
        # Notificar al jefe de taller si se envía a revisión
        if estado == 'pendiente':
            notificar_jefe_taller_avance(
                id_orden,
                titulo,
                current_user.get('nombre', 'Técnico'),
                result.data[0]['id']
            )
        
        return jsonify({
            'success': True,
            'message': 'Avance creado correctamente',
            'avance_id': result.data[0]['id']
        }), 201


def notificar_jefe_taller_avance(id_orden, titulo, tecnico_nombre, avance_id):
    """Notificar al jefe de taller sobre un nuevo avance"""
    try:
        jefes_result = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .eq('id_rol', 3) \
            .execute()
        
        jefes_ids = [j['id_usuario'] for j in (jefes_result.data or [])]
        
        if not jefes_ids:
            return
        
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .eq('id', id_orden) \
            .execute()
        
        codigo_orden = orden.data[0]['codigo_unico'] if orden.data else str(id_orden)
        
        mensaje = f"📸 NUEVO AVANCE DE TRABAJO\n\nTécnico: {tecnico_nombre}\nOrden: {codigo_orden}\nTítulo: {titulo}\n\nPor favor, revisa y aprueba el avance."
        
        for jefe_id in jefes_ids:
            supabase.table('notificacion').insert({
                'id_usuario_destino': jefe_id,
                'tipo': 'avance_trabajo',
                'mensaje': mensaje,
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False,
                'id_referencia': avance_id
            }).execute()
        
        logger.info(f"Notificación de avance enviada a {len(jefes_ids)} jefes")
        
    except Exception as e:
        logger.error(f"Error notificando: {str(e)}")


# =====================================================
# RUTAS PARA SERVIR ARCHIVOS ESTÁTICOS
# =====================================================

@avance_bp.route('/avance')
def avance_page():
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico'), 'avance.html')


@avance_bp.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico', 'css'), filename)


@avance_bp.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico', 'js'), filename)


