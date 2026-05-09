# =====================================================
# AVANCE.PY - TÉCNICO MECÁNICO (VERSIÓN COMPLETA CORREGIDA)
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

# Blueprint con url_prefix vacío (app.py ya añade /tecnico)
avance_bp = Blueprint('tecnico_avance', __name__, url_prefix='')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def normalizar_nombre_rol(nombre):
    """Normalizar nombres de roles"""
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
    """Obtener roles de un usuario desde Supabase"""
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
    """Verificar token JWT y obtener usuario actual"""
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
        logger.error(f"Error verificando token: {str(e)}")
        return None, "Error de autenticación", 401


def tecnico_required(f):
    """Decorador para verificar que el usuario sea técnico"""
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
# FUNCIONES DE NOTIFICACIÓN
# =====================================================

def notificar_jefe_taller_avance(id_orden, titulo, tecnico_nombre, avance_id, es_actualizacion=False):
    """Notificar al jefe de taller sobre un nuevo avance o actualización"""
    try:
        jefes_result = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .eq('id_rol', 3) \
            .execute()
        
        jefes_ids = [j['id_usuario'] for j in (jefes_result.data or [])]
        
        if not jefes_ids:
            logger.warning("No se encontraron jefes de taller para notificar")
            return
        
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .eq('id', id_orden) \
            .execute()
        
        codigo_orden = orden.data[0]['codigo_unico'] if orden.data else str(id_orden)
        
        if es_actualizacion:
            mensaje = f"📸 AVANCE DE TRABAJO ACTUALIZADO\n\nTécnico: {tecnico_nombre}\nOrden: {codigo_orden}\nTítulo: {titulo}\n\nEl técnico ha actualizado el avance. Por favor, revisa las nuevas fotos."
        else:
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
        
        logger.info(f"Notificación de avance {'actualizado' if es_actualizacion else 'nuevo'} enviada a {len(jefes_ids)} jefes")
        
    except Exception as e:
        logger.error(f"Error notificando a jefes: {str(e)}")


# =====================================================
# ENDPOINTS DE PRUEBA
# =====================================================

@avance_bp.route('/ping', methods=['GET'])
def ping():
    """Endpoint de prueba para verificar que el blueprint funciona"""
    print("🏓 PING recibido")
    return jsonify({'success': True, 'message': 'Pong!'}), 200


@avance_bp.route('/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba adicional"""
    return jsonify({'success': True, 'message': 'Test endpoint funcionando'}), 200


# =====================================================
# ENDPOINT - ÓRDENES EN REPARACIÓN
# =====================================================

@avance_bp.route('/ordenes-en-reparacion', methods=['GET'])
@tecnico_required
def obtener_ordenes_en_reparacion(current_user):
    """Obtener órdenes en estado EnReparacion para el técnico"""
    try:
        tecnico_id = current_user['id']
        logger.info(f"🔍 Buscando órdenes para técnico {tecnico_id}")
        
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo') \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'reparacion') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignaciones.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        orden_ids = [a['id_orden_trabajo'] for a in asignaciones.data if a.get('id_orden_trabajo')]
        
        if not orden_ids:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes_data = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .in_('id', orden_ids) \
            .eq('estado_global', 'EnReparacion') \
            .execute()
        
        ordenes = []
        for orden in (ordenes_data.data or []):
            vehiculo = orden.get('vehiculo', {})
            ordenes.append({
                'id': orden.get('id'),
                'codigo_unico': orden.get('codigo_unico'),
                'vehiculo': f"{vehiculo.get('marca', '')} {vehiculo.get('modelo', '')} ({vehiculo.get('placa', '')})".strip()
            })
        
        return jsonify({'success': True, 'ordenes': ordenes}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT PRINCIPAL - GESTIONAR AVANCES (GET, POST, PUT)
# =====================================================

@avance_bp.route('/avances', methods=['GET', 'POST', 'PUT'])
@tecnico_required
def gestionar_avances(current_user):
    """
    Gestionar avances de trabajo
    GET: Obtener avances de una orden
    POST: Crear nuevo avance
    PUT: Actualizar avance existente
    """
    
    # =====================================================
    # GET - OBTENER AVANCES
    # =====================================================
    if request.method == 'GET':
        id_orden = request.args.get('id_orden')
        
        if not id_orden or id_orden == 'null' or id_orden == 'undefined':
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        try:
            id_orden = int(id_orden)
        except ValueError:
            return jsonify({'error': 'ID de orden inválido'}), 400
        
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
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
    
    # =====================================================
    # POST - CREAR NUEVO AVANCE
    # =====================================================
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
        
        avance_existente = supabase.table('avance_trabajo') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .execute()
        
        if avance_existente.data:
            return jsonify({'error': 'Ya existe un avance para esta orden. Usa el botón ACTUALIZAR.'}), 400
        
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
        
        avance_id = result.data[0]['id']
        
        if estado == 'pendiente':
            notificar_jefe_taller_avance(
                id_orden,
                titulo,
                current_user.get('nombre', 'Técnico'),
                avance_id,
                es_actualizacion=False
            )
        
        return jsonify({
            'success': True,
            'message': 'Avance creado correctamente',
            'avance_id': avance_id
        }), 201
    
        # =====================================================
    # PUT - ACTUALIZAR AVANCE EXISTENTE (CORREGIDO - SIN fecha_actualizacion)
    # =====================================================
    elif request.method == 'PUT':
        print("=" * 60)
        print("🔴🔴🔴 PUT RECIBIDO - ACTUALIZAR AVANCE 🔴🔴🔴")
        print("=" * 60)
        
        # Obtener datos del request
        try:
            data = request.get_json()
            if not data:
                print("❌ No se recibieron datos JSON")
                return jsonify({'error': 'No se recibieron datos'}), 400
        except Exception as e:
            print(f"❌ Error parsing JSON: {str(e)}")
            return jsonify({'error': f'Error en datos: {str(e)}'}), 400
        
        print(f"📦 Datos recibidos: {json.dumps(data, indent=2)}")
        
        id_orden = data.get('id_orden_trabajo')
        titulo = data.get('titulo')
        descripcion = data.get('descripcion', '')
        fotos = data.get('fotos', [])
        estado = data.get('estado', 'pendiente')
        
        print(f"📝 id_orden: {id_orden}")
        print(f"📝 titulo: {titulo}")
        print(f"📝 fotos: {len(fotos)} fotos")
        print(f"📝 estado: {estado}")
        
        # Validaciones
        if not id_orden:
            print("❌ ID de orden faltante")
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not titulo:
            print("❌ Título faltante")
            return jsonify({'error': 'Título requerido'}), 400
        
        if not fotos:
            print("❌ Fotos faltantes")
            return jsonify({'error': 'Debes subir al menos una foto'}), 400
        
        logger.info(f"✏️ Usuario {current_user['id']} actualizando avance para orden {id_orden}")
        
        # Buscar el avance existente
        avance_existente = supabase.table('avance_trabajo') \
            .select('id, estado') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .execute()
        
        print(f"🔍 Avance existente: {avance_existente.data}")
        
        if not avance_existente.data:
            print("❌ No se encontró avance existente")
            return jsonify({
                'error': 'No existe un avance para esta orden. Usa "Nuevo Avance" primero.'
            }), 404
        
        avance_id = avance_existente.data[0]['id']
        estado_actual = avance_existente.data[0]['estado']
        
        print(f"📝 Avance ID: {avance_id}, Estado actual: {estado_actual}")
        
        # Validar si se puede actualizar según el estado
        if estado_actual == 'aprobado':
            print("❌ Avance ya aprobado, no se puede modificar")
            return jsonify({
                'error': 'No puedes modificar un avance ya aprobado. Contacta al jefe de taller.'
            }), 403
        
        ahora = datetime.datetime.now().isoformat()
        
        # Preparar datos de actualización (SIN fecha_actualizacion)
        update_data = {
            'titulo': titulo,
            'descripcion': descripcion,
            'fotos': json.dumps(fotos)
            # 'fecha_actualizacion': ahora  # ← ELIMINAR ESTA LÍNEA
        }
        
        # Manejar cambio de estado
        if estado == 'pendiente':
            if estado_actual == 'rechazado':
                update_data['estado'] = 'pendiente'
                update_data['fecha_creacion'] = ahora
                update_data['comentario_revision'] = None
                print("🔄 Reactivando avance rechazado a pendiente")
            else:
                print("📝 Actualizando avance pendiente")
        elif estado == 'borrador':
            update_data['estado'] = 'borrador'
            print("📝 Guardando como borrador")
        
        print(f"📦 Datos a actualizar: {update_data}")
        
        # Actualizar el avance
        result = supabase.table('avance_trabajo') \
            .update(update_data) \
            .eq('id', avance_id) \
            .execute()
        
        print(f"✅ Resultado update: {result.data}")
        
        if not result.data:
            print("❌ Error al actualizar en Supabase")
            return jsonify({'error': 'Error al actualizar avance'}), 500
        
        # Notificar al jefe de taller solo si se envía a revisión
        if estado == 'pendiente':
            notificar_jefe_taller_avance(
                id_orden,
                titulo,
                current_user.get('nombre', 'Técnico'),
                avance_id,
                es_actualizacion=True
            )
            mensaje = "Avance actualizado y enviado a revisión"
        else:
            mensaje = "Avance actualizado como borrador"
        
        logger.info(f"✅ Avance {avance_id} actualizado correctamente")
        print(f"✅ Éxito: {mensaje}")
        
        return jsonify({
            'success': True,
            'message': mensaje,
            'avance_id': avance_id
        }), 200

# =====================================================
# RUTAS PARA SERVIR ARCHIVOS ESTÁTICOS
# =====================================================

@avance_bp.route('/avance')
def avance_page():
    """Servir la página de avance.html"""
    try:
        return send_from_directory(
            os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico'), 
            'avance.html'
        )
    except Exception as e:
        logger.error(f"Error sirviendo avance.html: {e}")
        return jsonify({'error': 'Página no encontrada'}), 404


@avance_bp.route('/css/<path:filename>')
def serve_css(filename):
    """Servir archivos CSS del técnico"""
    try:
        return send_from_directory(
            os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico', 'css'), 
            filename
        )
    except Exception as e:
        logger.error(f"Error sirviendo CSS {filename}: {e}")
        return jsonify({'error': 'Archivo no encontrado'}), 404


@avance_bp.route('/js/<path:filename>')
def serve_js(filename):
    """Servir archivos JS del técnico"""
    try:
        return send_from_directory(
            os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico', 'js'), 
            filename
        )
    except Exception as e:
        logger.error(f"Error sirviendo JS {filename}: {e}")
        return jsonify({'error': 'Archivo no encontrado'}), 404