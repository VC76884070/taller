# =====================================================
# ADMINISTRACIÓN DE ROLES - JEFE DE TALLER (CORREGIDO)
# FURIA MOTOR COMPANY SRL
# VERSIÓN: Personal + Clientes + Vehículos (CRUD completo)
# =====================================================

from flask import Blueprint, request, jsonify, render_template
from functools import wraps
from config import config
import jwt
import datetime
import logging
import os

logger = logging.getLogger(__name__)
IS_PRODUCTION = os.environ.get('RAILWAY_ENVIRONMENT') is not None or os.environ.get('PORT') is not None
API_BASE_URL = '' if IS_PRODUCTION else 'http://localhost:5000'


# Crear el blueprint - URL prefix consistente
admin_roles_bp = Blueprint('admin_roles', __name__, url_prefix='/api/admin')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# IDs de roles de personal (excluyendo cliente que es id=5)
ROLES_PERSONAL = [1, 2, 3, 4]

# IDs de roles críticos que no se pueden quitar si tienen tareas pendientes
ROLES_CRITICOS = {
    'tecnico': 3,
    'encargado_repuestos': 4
}


# =====================================================
# DECORADOR PERSONALIZADO PARA ADMIN
# =====================================================

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Obtener token
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Token inválido'}), 401

        if not token:
            return jsonify({'error': 'Token requerido'}), 401

        try:
            # Decodificar token
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data.get('user', data)

            # Obtener roles del usuario desde la BD
            usuario_id = current_user.get('id')
            if not usuario_id:
                return jsonify({'error': 'ID de usuario no encontrado'}), 401

            # Verificar si es jefe_taller
            roles_result = supabase.table('usuario_rol') \
                .select('id_rol, rol:rol!inner(nombre_rol)') \
                .eq('id_usuario', usuario_id) \
                .execute()

            es_jefe_taller = False
            for item in (roles_result.data or []):
                rol_info = item.get('rol', {})
                if isinstance(rol_info, dict):
                    nombre_rol = rol_info.get('nombre_rol', '')
                    if nombre_rol == 'jefe_taller':
                        es_jefe_taller = True
                        break

            if not es_jefe_taller:
                # También verificar por id_rol directo en usuario
                user_result = supabase.table('usuario') \
                    .select('rol_principal') \
                    .eq('id', usuario_id) \
                    .execute()
                if user_result.data and user_result.data[0].get('rol_principal') == 2:
                    es_jefe_taller = True

            if not es_jefe_taller:
                logger.warning(f"Acceso denegado: Usuario {usuario_id} no es jefe_taller")
                return jsonify({'error': 'No autorizado. Se requiere rol jefe_taller'}), 403

        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        except Exception as e:
            logger.error(f"Error en autenticación: {str(e)}")
            return jsonify({'error': 'Error de autenticación'}), 401

        return f(current_user, *args, **kwargs)

    return decorated


# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def verificar_tareas_pendientes(id_usuario, roles_a_verificar):
    """
    Verifica si un usuario tiene tareas pendientes para roles específicos
    """
    tareas_pendientes = []
    roles_con_tareas = []

    # Verificar tareas como técnico
    if 'tecnico' in roles_a_verificar:
        asignaciones_activas = supabase.table('asignaciontecnico') \
            .select('id, id_orden_trabajo, tipo_asignacion, fecha_hora_inicio') \
            .eq('id_tecnico', id_usuario) \
            .is_('fecha_hora_final', 'null') \
            .execute()

        if asignaciones_activas.data:
            roles_con_tareas.append('tecnico')
            for asig in asignaciones_activas.data:
                orden = supabase.table('ordentrabajo') \
                    .select('codigo_unico') \
                    .eq('id', asig['id_orden_trabajo']) \
                    .execute()
                codigo = orden.data[0]['codigo_unico'] if orden.data else 'N/A'

                tareas_pendientes.append({
                    'tipo': 'tecnico',
                    'id': asig['id'],
                    'id_orden': asig['id_orden_trabajo'],
                    'orden_codigo': codigo,
                    'descripcion': f"Orden {codigo} - {asig.get('tipo_asignacion', 'diagnóstico')}",
                    'fecha_inicio': asig.get('fecha_hora_inicio')
                })

    # Verificar tareas como encargado de repuestos
    if 'encargado_repuestos' in roles_a_verificar:
        solicitudes_pendientes = supabase.table('solicitud_cotizacion_repuesto') \
            .select('id, id_orden_trabajo, descripcion_pieza, cantidad') \
            .eq('id_encargado_repuestos', id_usuario) \
            .eq('estado', 'pendiente') \
            .execute()

        if solicitudes_pendientes.data:
            roles_con_tareas.append('encargado_repuestos')
            for sol in solicitudes_pendientes.data:
                orden = supabase.table('ordentrabajo') \
                    .select('codigo_unico') \
                    .eq('id', sol['id_orden_trabajo']) \
                    .execute()
                codigo = orden.data[0]['codigo_unico'] if orden.data else 'N/A'

                tareas_pendientes.append({
                    'tipo': 'repuestos',
                    'id': sol['id'],
                    'id_orden': sol['id_orden_trabajo'],
                    'orden_codigo': codigo,
                    'descripcion': f"Solicitud {codigo} - {sol.get('descripcion_pieza', 'Pieza')} x{sol.get('cantidad', 1)}"
                })

    return {
        'tiene_pendientes': len(tareas_pendientes) > 0,
        'tareas': tareas_pendientes,
        'roles_con_tareas': roles_con_tareas
    }


def obtener_roles_usuario(id_usuario):
    """Obtiene los roles actuales de un usuario"""
    try:
        roles_result = supabase.table('usuario_rol') \
            .select('id_rol, rol:rol!inner(nombre_rol)') \
            .eq('id_usuario', id_usuario) \
            .execute()

        roles_ids = []
        roles_nombres = []

        for item in (roles_result.data or []):
            rol_id = item.get('id_rol')
            if rol_id:
                roles_ids.append(rol_id)

            rol_info = item.get('rol', {})
            if isinstance(rol_info, dict):
                nombre = rol_info.get('nombre_rol', '')
                if nombre:
                    roles_nombres.append(nombre)
            elif isinstance(rol_info, list) and len(rol_info) > 0:
                nombre = rol_info[0].get('nombre_rol', '')
                if nombre:
                    roles_nombres.append(nombre)

        return {
            'ids': roles_ids,
            'nombres': roles_nombres
        }
    except Exception as e:
        logger.error(f"Error obteniendo roles del usuario {id_usuario}: {str(e)}")
        return {'ids': [], 'nombres': []}


def obtener_datos_cliente(id_cliente):
    """
    Obtiene los datos de un cliente (tabla cliente) + su usuario asociado.
    Retorna un dict con:
        {
            'id_cliente': int,
            'id_usuario': int,
            'nombre': str,
            'email': str,
            'contacto': str,
            'ubicacion': str
        }
    """
    try:
        cliente_result = supabase.table('cliente') \
            .select('id, id_usuario, tipo_documento, numero_documento, email') \
            .eq('id', id_cliente) \
            .execute()

        if not cliente_result.data:
            return {}

        c = cliente_result.data[0]
        id_usuario = c.get('id_usuario')

        info = {
            'id_cliente': c['id'],
            'id_usuario': id_usuario,
            'nombre': 'Sin nombre',
            'email': c.get('email', '') or '',
            'contacto': '',
            'ubicacion': ''
        }

        if id_usuario:
            u_result = supabase.table('usuario') \
                .select('id, nombre, email, contacto, ubicacion') \
                .eq('id', id_usuario) \
                .execute()

            if u_result.data:
                u = u_result.data[0]
                info['nombre'] = u.get('nombre', 'Sin nombre')
                info['email'] = u.get('email', '') or info['email']
                info['contacto'] = u.get('contacto', '') or ''
                info['ubicacion'] = u.get('ubicacion', '') or ''

        return info

    except Exception as e:
        logger.error(f"Error obteniendo datos del cliente {id_cliente}: {str(e)}")
        return {}


def obtener_datos_usuarios_por_ids(ids_usuarios):
    """Obtiene un mapa {id_usuario: {nombre, email, contacto, ubicacion}}"""
    if not ids_usuarios:
        return {}

    try:
        result = supabase.table('usuario') \
            .select('id, nombre, email, contacto, ubicacion') \
            .in_('id', list(set(ids_usuarios))) \
            .execute()

        return {u['id']: u for u in (result.data or [])}

    except Exception as e:
        logger.error(f"Error obteniendo usuarios: {str(e)}")
        return {}


# =====================================================
# ENDPOINTS PRINCIPALES
# =====================================================

@admin_roles_bp.route('/roles', methods=['GET'])
@admin_required
def get_roles(current_user):
    """Obtener lista de roles (solo personal)"""
    try:
        result = supabase.table('rol') \
            .select('id, nombre_rol, descripcion') \
            .execute()

        if not result.data:
            return jsonify({'success': True, 'roles': []}), 200

        # Filtrar roles de personal (excluir cliente)
        roles = [r for r in result.data if r['id'] != 5]

        return jsonify({
            'success': True,
            'roles': roles
        }), 200

    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuarios', methods=['GET'])
@admin_required
def get_usuarios(current_user):
    """Obtener lista de usuarios con roles de personal"""
    try:
        usuarios_result = supabase.table('usuario') \
            .select('id, nombre, email, numero_documento, contacto, fecha_registro') \
            .execute()

        if not usuarios_result.data:
            return jsonify({'success': True, 'usuarios': []}), 200

        usuarios_ids = [u['id'] for u in usuarios_result.data]

        usuarios_roles = supabase.table('usuario_rol') \
            .select('id_usuario, id_rol, rol:rol!inner(nombre_rol)') \
            .in_('id_usuario', usuarios_ids) \
            .execute()

        roles_por_usuario = {}
        for ur in (usuarios_roles.data or []):
            usuario_id = ur['id_usuario']
            if usuario_id not in roles_por_usuario:
                roles_por_usuario[usuario_id] = {'ids': [], 'nombres': []}

            roles_por_usuario[usuario_id]['ids'].append(ur['id_rol'])

            rol_info = ur.get('rol', {})
            if isinstance(rol_info, dict):
                nombre = rol_info.get('nombre_rol', '')
            elif isinstance(rol_info, list) and len(rol_info) > 0:
                nombre = rol_info[0].get('nombre_rol', '')
            else:
                nombre = ''

            if nombre:
                roles_por_usuario[usuario_id]['nombres'].append(nombre)

        resultado = []
        for u in usuarios_result.data:
            roles_info = roles_por_usuario.get(u['id'], {'ids': [], 'nombres': []})

            tiene_rol_personal = any(rid in ROLES_PERSONAL for rid in roles_info['ids'])

            if tiene_rol_personal:
                resultado.append({
                    'id': u['id'],
                    'nombre': u['nombre'],
                    'email': u.get('email', ''),
                    'documento': u.get('numero_documento', ''),
                    'contacto': u.get('contacto', ''),
                    'fecha_registro': u.get('fecha_registro'),
                    'roles_ids': roles_info['ids'],
                    'roles_nombres': roles_info['nombres']
                })

        return jsonify({'success': True, 'usuarios': resultado}), 200

    except Exception as e:
        logger.error(f"Error obteniendo usuarios: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/clientes', methods=['GET'])
@admin_required
def get_clientes(current_user):
    """
    Obtener lista de clientes desde la tabla 'cliente' + 'usuario'.
    Devuelve el id de la tabla cliente (que es el que se usa en vehiculo.id_cliente).
    """
    try:
        # 1) Obtener todos los clientes de la tabla 'cliente'
        clientes_result = supabase.table('cliente') \
            .select('id, id_usuario, tipo_documento, numero_documento, email') \
            .execute()

        if not clientes_result.data:
            return jsonify({'success': True, 'clientes': []}), 200

        # 2) Obtener usuarios asociados
        ids_usuarios = list(set([
            c['id_usuario'] for c in clientes_result.data if c.get('id_usuario')
        ]))

        usuarios_map = obtener_datos_usuarios_por_ids(ids_usuarios) if ids_usuarios else {}

        # 3) Construir lista de clientes
        clientes = []
        for c in clientes_result.data:
            u = usuarios_map.get(c.get('id_usuario'), {})

            # Obtener vehículos de ESTE cliente (usando id de tabla cliente)
            vehiculos_result = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, anio, kilometraje') \
                .eq('id_cliente', c['id']) \
                .execute()

            clientes.append({
                'id': c['id'],                                # ID tabla cliente
                'id_usuario': c.get('id_usuario'),            # ID tabla usuario
                'nombre': u.get('nombre', 'Sin nombre'),
                'email': u.get('email', '') or c.get('email', '') or '',
                'contacto': u.get('contacto', '') or '',
                'ubicacion': u.get('ubicacion', '') or '',
                'numero_documento': c.get('numero_documento', '') or '',
                'tipo_documento': c.get('tipo_documento', '') or '',
                'fecha_registro': u.get('fecha_registro'),
                'vehiculos': vehiculos_result.data or []
            })

        return jsonify({'success': True, 'clientes': clientes}), 200

    except Exception as e:
        logger.error(f"Error obteniendo clientes: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuario/<int:id_usuario>', methods=['GET'])
@admin_required
def get_usuario_detalle(current_user, id_usuario):
    """Obtener detalle completo de un usuario"""
    try:
        usuario = supabase.table('usuario') \
            .select('id, nombre, email, numero_documento, contacto, ubicacion, fecha_registro') \
            .eq('id', id_usuario) \
            .execute()

        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404

        u = usuario.data[0]

        roles_result = supabase.table('usuario_rol') \
            .select('id_rol, rol:rol!inner(nombre_rol)') \
            .eq('id_usuario', id_usuario) \
            .execute()

        roles = []
        for item in (roles_result.data or []):
            rol_info = item.get('rol', {})
            if isinstance(rol_info, dict):
                nombre_rol = rol_info.get('nombre_rol', '')
                if nombre_rol:
                    roles.append(nombre_rol)
            elif isinstance(rol_info, list) and len(rol_info) > 0:
                nombre_rol = rol_info[0].get('nombre_rol', '')
                if nombre_rol:
                    roles.append(nombre_rol)

        return jsonify({
            'success': True,
            'usuario': {
                'id': u['id'],
                'nombre': u['nombre'],
                'email': u.get('email', ''),
                'documento': u.get('numero_documento', ''),
                'contacto': u.get('contacto', ''),
                'ubicacion': u.get('ubicacion', ''),
                'fecha_registro': u.get('fecha_registro'),
                'roles': roles
            }
        }), 200

    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuario/<int:id_usuario>/roles', methods=['PUT'])
@admin_required
def asignar_roles_usuario(current_user, id_usuario):
    """Asignar roles a un usuario con validación de tareas pendientes"""
    try:
        data = request.get_json()
        nuevos_roles_ids = data.get('roles_ids', [])

        for rol_id in nuevos_roles_ids:
            if rol_id not in ROLES_PERSONAL:
                return jsonify({'error': f'Rol {rol_id} no permitido'}), 400

        roles_actuales = obtener_roles_usuario(id_usuario)
        roles_actuales_ids = roles_actuales['ids']

        roles_eliminados_ids = [rid for rid in roles_actuales_ids if rid not in nuevos_roles_ids]

        roles_criticos_a_quitar = []
        for nombre_rol, rol_id in ROLES_CRITICOS.items():
            if rol_id in roles_eliminados_ids:
                roles_criticos_a_quitar.append(nombre_rol)

        # Si no se quitan roles críticos, continuar normalmente
        if not roles_criticos_a_quitar:
            supabase.table('usuario_rol').delete() \
                .eq('id_usuario', id_usuario) \
                .execute()

            for rol_id in nuevos_roles_ids:
                supabase.table('usuario_rol').insert({
                    'id_usuario': id_usuario,
                    'id_rol': rol_id,
                    'fecha_asignacion': datetime.datetime.now().isoformat()
                }).execute()

            logger.info(f"Roles actualizados para usuario {id_usuario}: {nuevos_roles_ids}")
            return jsonify({'success': True, 'message': 'Roles asignados correctamente'}), 200

        # Verificar tareas pendientes antes de quitar roles críticos
        verificacion = verificar_tareas_pendientes(id_usuario, roles_criticos_a_quitar)

        if verificacion['tiene_pendientes']:
            nombres_roles_quitando = []
            if 'tecnico' in roles_criticos_a_quitar:
                nombres_roles_quitando.append("Técnico Mecánico")
            if 'encargado_repuestos' in roles_criticos_a_quitar:
                nombres_roles_quitando.append("Encargado de Repuestos")

            logger.warning(f"Intento denegado: No se pueden quitar roles {nombres_roles_quitando} al usuario {id_usuario}")

            return jsonify({
                'error': f'No se puede quitar el rol de {", ".join(nombres_roles_quitando)} porque el usuario tiene tareas pendientes',
                'tareas_pendientes': verificacion['tareas'],
                'total_tareas': len(verificacion['tareas']),
                'roles_afectados': roles_criticos_a_quitar
            }), 409

        # Proceder con la actualización
        supabase.table('usuario_rol').delete() \
            .eq('id_usuario', id_usuario) \
            .execute()

        for rol_id in nuevos_roles_ids:
            supabase.table('usuario_rol').insert({
                'id_usuario': id_usuario,
                'id_rol': rol_id,
                'fecha_asignacion': datetime.datetime.now().isoformat()
            }).execute()

        logger.info(f"Roles actualizados para usuario {id_usuario}: {nuevos_roles_ids}")
        return jsonify({'success': True, 'message': 'Roles actualizados correctamente'}), 200

    except Exception as e:
        logger.error(f"Error asignando roles: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuario/<int:id_usuario>', methods=['DELETE'])
@admin_required
def eliminar_usuario(current_user, id_usuario):
    """Eliminar un usuario del sistema"""
    try:
        usuario = supabase.table('usuario') \
            .select('id, nombre') \
            .eq('id', id_usuario) \
            .execute()

        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404

        if id_usuario == current_user.get('id'):
            return jsonify({'error': 'No puedes eliminarte a ti mismo'}), 400

        roles_usuario = obtener_roles_usuario(id_usuario)
        roles_nombres = roles_usuario['nombres']

        roles_a_verificar = []
        if 'tecnico' in roles_nombres:
            roles_a_verificar.append('tecnico')
        if 'encargado_repuestos' in roles_nombres:
            roles_a_verificar.append('encargado_repuestos')

        if roles_a_verificar:
            verificacion = verificar_tareas_pendientes(id_usuario, roles_a_verificar)
            if verificacion['tiene_pendientes']:
                return jsonify({
                    'error': 'No se puede eliminar el usuario porque tiene tareas pendientes',
                    'tareas_pendientes': verificacion['tareas'],
                    'total_tareas': len(verificacion['tareas'])
                }), 409

        supabase.table('usuario_rol').delete() \
            .eq('id_usuario', id_usuario) \
            .execute()

        supabase.table('usuario').delete() \
            .eq('id', id_usuario) \
            .execute()

        logger.info(f"Usuario {usuario.data[0]['nombre']} (ID: {id_usuario}) eliminado")
        return jsonify({
            'success': True,
            'message': f'Usuario {usuario.data[0]["nombre"]} eliminado correctamente'
        }), 200

    except Exception as e:
        logger.error(f"Error eliminando usuario: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/estadisticas', methods=['GET'])
@admin_required
def get_estadisticas(current_user):
    """Obtener estadísticas de roles y clientes"""
    try:
        usuarios_personal = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .execute()

        usuarios_personal_ids = set([ur['id_usuario'] for ur in (usuarios_personal.data or [])])
        total_personal = len(usuarios_personal_ids)

        roles = supabase.table('rol') \
            .select('id, nombre_rol') \
            .execute()

        usuarios_por_rol = []
        for rol in (roles.data or []):
            if rol['id'] in ROLES_PERSONAL:
                count = supabase.table('usuario_rol') \
                    .select('id', count='exact') \
                    .eq('id_rol', rol['id']) \
                    .execute()
                usuarios_por_rol.append({
                    'rol_id': rol['id'],
                    'rol_nombre': rol['nombre_rol'],
                    'cantidad': count.count if count.count else 0
                })

        # Contar clientes reales desde la tabla 'cliente'
        clientes_result = supabase.table('cliente') \
            .select('id', count='exact') \
            .execute()
        total_clientes = clientes_result.count if clientes_result.count else 0

        return jsonify({
            'success': True,
            'estadisticas': {
                'total_usuarios': total_personal,
                'total_clientes': total_clientes,
                'usuarios_por_rol': usuarios_por_rol
            }
        }), 200

    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/tecnico/<int:id_tecnico>/ordenes-activas', methods=['GET'])
@admin_required
def get_tecnico_ordenes_activas(current_user, id_tecnico):
    """Contar órdenes activas de un técnico"""
    try:
        count = supabase.table('asignaciontecnico') \
            .select('id', count='exact') \
            .eq('id_tecnico', id_tecnico) \
            .is_('fecha_hora_final', 'null') \
            .execute()

        return jsonify({'success': True, 'total': count.count if count.count else 0}), 200

    except Exception as e:
        logger.error(f"Error contando órdenes activas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuario/<int:id_usuario>/asignaciones-activas', methods=['GET'])
@admin_required
def get_asignaciones_activas(current_user, id_usuario):
    """Obtener asignaciones activas de un usuario por rol"""
    try:
        usuario_roles = supabase.table('usuario_rol') \
            .select('id_rol, rol:rol!inner(nombre_rol)') \
            .eq('id_usuario', id_usuario) \
            .execute()

        roles_nombres = []
        for ur in (usuario_roles.data or []):
            rol_info = ur.get('rol', {})
            if isinstance(rol_info, dict):
                nombre = rol_info.get('nombre_rol')
            elif isinstance(rol_info, list) and len(rol_info) > 0:
                nombre = rol_info[0].get('nombre_rol')
            else:
                nombre = None

            if nombre:
                roles_nombres.append(nombre.lower())

        asignaciones = []

        # Para técnicos
        if 'tecnico' in roles_nombres:
            asignaciones_tecnicas = supabase.table('asignaciontecnico') \
                .select('''
                    id, id_orden_trabajo, tipo_asignacion, fecha_hora_inicio,
                    ordentrabajo:ordentrabajo!inner(codigo_unico, estado_global)
                ''') \
                .eq('id_tecnico', id_usuario) \
                .is_('fecha_hora_final', 'null') \
                .execute()

            for a in (asignaciones_tecnicas.data or []):
                orden = a.get('ordentrabajo', {})
                if isinstance(orden, list) and len(orden) > 0:
                    orden = orden[0]
                asignaciones.append({
                    'tipo': 'tecnico',
                    'id_asignacion': a['id'],
                    'id_orden': a['id_orden_trabajo'],
                    'codigo_orden': orden.get('codigo_unico', 'N/A') if isinstance(orden, dict) else 'N/A',
                    'estado_orden': orden.get('estado_global', 'N/A') if isinstance(orden, dict) else 'N/A',
                    'tipo_asignacion': a.get('tipo_asignacion', 'diagnostico'),
                    'fecha_inicio': a.get('fecha_hora_inicio')
                })

        # Para encargado de repuestos
        if 'encargado_repuestos' in roles_nombres:
            solicitudes = supabase.table('solicitud_cotizacion_repuesto') \
                .select('''
                    id, id_orden_trabajo, descripcion_pieza, cantidad, estado,
                    ordentrabajo:ordentrabajo!inner(codigo_unico)
                ''') \
                .eq('id_encargado_repuestos', id_usuario) \
                .eq('estado', 'pendiente') \
                .execute()

            for s in (solicitudes.data or []):
                orden = s.get('ordentrabajo', {})
                if isinstance(orden, list) and len(orden) > 0:
                    orden = orden[0]
                asignaciones.append({
                    'tipo': 'repuestos',
                    'id_solicitud': s['id'],
                    'id_orden': s['id_orden_trabajo'],
                    'codigo_orden': orden.get('codigo_unico', 'N/A') if isinstance(orden, dict) else 'N/A',
                    'descripcion_pieza': s.get('descripcion_pieza', ''),
                    'cantidad': s.get('cantidad', 1),
                    'estado': s.get('estado')
                })

        return jsonify({
            'success': True,
            'tiene_asignaciones': len(asignaciones) > 0,
            'asignaciones': asignaciones,
            'roles': roles_nombres
        }), 200

    except Exception as e:
        logger.error(f"Error obteniendo asignaciones activas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuario/<int:id_usuario>/reasignar', methods=['POST'])
@admin_required
def reasignar_tareas(current_user, id_usuario):
    """Reasignar tareas de un usuario a otro"""
    try:
        data = request.get_json()
        nuevo_tecnico_id = data.get('nuevo_tecnico_id')
        nuevo_encargado_id = data.get('nuevo_encargado_id')
        asignaciones_a_reasignar = data.get('asignaciones', [])

        if nuevo_tecnico_id:
            for asignacion in asignaciones_a_reasignar:
                if asignacion.get('tipo') == 'tecnico' and asignacion.get('id_asignacion'):
                    supabase.table('asignaciontecnico') \
                        .update({'id_tecnico': nuevo_tecnico_id}) \
                        .eq('id', asignacion['id_asignacion']) \
                        .execute()

                    supabase.table('notificacion').insert({
                        'id_usuario_destino': nuevo_tecnico_id,
                        'tipo': 'nueva_asignacion',
                        'mensaje': f'Se te ha reasignado la orden {asignacion.get("codigo_orden", "desconocida")}',
                        'fecha_envio': datetime.datetime.now().isoformat(),
                        'leida': False
                    }).execute()

        if nuevo_encargado_id:
            for asignacion in asignaciones_a_reasignar:
                if asignacion.get('tipo') == 'repuestos' and asignacion.get('id_solicitud'):
                    supabase.table('solicitud_cotizacion_repuesto') \
                        .update({'id_encargado_repuestos': nuevo_encargado_id}) \
                        .eq('id', asignacion['id_solicitud']) \
                        .execute()

        logger.info(f"Tareas reasignadas desde usuario {id_usuario}")
        return jsonify({
            'success': True,
            'message': 'Tareas reasignadas correctamente'
        }), 200

    except Exception as e:
        logger.error(f"Error reasignando tareas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# CRUD DE CLIENTES (EDITAR / ELIMINAR)
# =====================================================

@admin_roles_bp.route('/cliente/<int:id_cliente>', methods=['PUT'])
@admin_required
def editar_cliente(current_user, id_cliente):
    """
    Editar datos de un cliente.
    - Actualiza la tabla 'cliente' (email)
    - Actualiza la tabla 'usuario' asociada (nombre, email, contacto, ubicacion)
    """
    try:
        data = request.get_json()

        # Verificar que el cliente existe
        cliente = supabase.table('cliente') \
            .select('id, id_usuario') \
            .eq('id', id_cliente) \
            .execute()

        if not cliente.data:
            return jsonify({'error': 'Cliente no encontrado'}), 404

        id_usuario = cliente.data[0].get('id_usuario')

        # Preparar campos para tabla usuario
        campos_usuario = ['nombre', 'email', 'contacto', 'ubicacion']
        update_usuario = {}
        for campo in campos_usuario:
            if campo in data:
                update_usuario[campo] = data[campo]

        # Preparar campos para tabla cliente
        update_cliente = {}
        if 'email' in data:
            update_cliente['email'] = data['email']
        if 'numero_documento' in data:
            update_cliente['numero_documento'] = data['numero_documento']
        if 'tipo_documento' in data:
            update_cliente['tipo_documento'] = data['tipo_documento']

        # Actualizar tabla cliente
        if update_cliente:
            supabase.table('cliente') \
                .update(update_cliente) \
                .eq('id', id_cliente) \
                .execute()

        # Actualizar tabla usuario
        if update_usuario and id_usuario:
            supabase.table('usuario') \
                .update(update_usuario) \
                .eq('id', id_usuario) \
                .execute()

        logger.info(f"Cliente {id_cliente} (usuario {id_usuario}) actualizado")

        return jsonify({
            'success': True,
            'message': 'Cliente actualizado correctamente'
        }), 200

    except Exception as e:
        logger.error(f"Error editando cliente: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/cliente/<int:id_cliente>', methods=['DELETE'])
@admin_required
def eliminar_cliente(current_user, id_cliente):
    """
    Eliminar un cliente, sus vehículos y su usuario asociado.
    """
    try:
        # Verificar que el cliente existe
        cliente = supabase.table('cliente') \
            .select('id, id_usuario') \
            .eq('id', id_cliente) \
            .execute()

        if not cliente.data:
            return jsonify({'error': 'Cliente no encontrado'}), 404

        id_usuario = cliente.data[0].get('id_usuario')

        # Obtener vehículos del cliente
        vehiculos = supabase.table('vehiculo') \
            .select('id') \
            .eq('id_cliente', id_cliente) \
            .execute()

        vehiculos_ids = [v['id'] for v in (vehiculos.data or [])]

        # Verificar órdenes activas
        if vehiculos_ids:
            ordenes = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, estado_global') \
                .in_('id_vehiculo', vehiculos_ids) \
                .execute()

            estados_activos = ['EnRecepcion', 'EnDiagnostico', 'EnReparacion',
                              'EsperandoRepuestos', 'EnArmado', 'EnControlCalidad']

            ordenes_pendientes = [
                o for o in (ordenes.data or [])
                if o.get('estado_global') in estados_activos
            ]

            if ordenes_pendientes:
                return jsonify({
                    'error': f'No se puede eliminar el cliente porque tiene {len(ordenes_pendientes)} orden(es) de trabajo activa(s)',
                    'ordenes_pendientes': ordenes_pendientes,
                    'total': len(ordenes_pendientes)
                }), 409

        # Eliminar dependencias de órdenes
        if vehiculos_ids:
            for vid in vehiculos_ids:
                ordenes_vehiculo = supabase.table('ordentrabajo') \
                    .select('id') \
                    .eq('id_vehiculo', vid) \
                    .execute()

                for orden in (ordenes_vehiculo.data or []):
                    oid = orden['id']
                    supabase.table('recepcion').delete().eq('id_orden_trabajo', oid).execute()
                    supabase.table('seguimientoorden').delete().eq('id_orden_trabajo', oid).execute()
                    supabase.table('planificacion').delete().eq('id_orden_trabajo', oid).execute()

                supabase.table('ordentrabajo').delete().eq('id_vehiculo', vid).execute()

            # Eliminar vehículos
            supabase.table('vehiculo').delete().eq('id_cliente', id_cliente).execute()

        # Eliminar reservas asociadas al cliente
        if id_usuario:
            try:
                supabase.table('solicitud_reserva_cliente') \
                    .delete().eq('id_cliente', id_usuario).execute()
            except Exception as ex:
                logger.warning(f"No se pudieron eliminar reservas del usuario {id_usuario}: {str(ex)}")

        # Eliminar de tabla cliente
        supabase.table('cliente').delete().eq('id', id_cliente).execute()

        # Eliminar usuario
        if id_usuario:
            supabase.table('usuario').delete().eq('id', id_usuario).execute()

        logger.info(f"Cliente {id_cliente} (usuario {id_usuario}) eliminado con {len(vehiculos_ids)} vehículo(s)")

        return jsonify({
            'success': True,
            'message': 'Cliente eliminado correctamente'
        }), 200

    except Exception as e:
        logger.error(f"Error eliminando cliente: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# CRUD DE VEHÍCULOS (CORREGIDO - SIN JOIN AUTOMÁTICO)
# =====================================================

@admin_roles_bp.route('/vehiculos', methods=['GET'])
@admin_required
def get_vehiculos(current_user):
    """
    Obtener lista de todos los vehículos.
    Como 'vehiculo.id_cliente' apunta a 'cliente.id', hacemos las
    consultas por separado y unimos en Python.
    """
    try:
        # 1) Obtener todos los vehículos
        vehiculos_result = supabase.table('vehiculo') \
            .select('id, id_cliente, placa, marca, modelo, anio, kilometraje') \
            .order('id', desc=True) \
            .execute()

        if not vehiculos_result.data:
            return jsonify({'success': True, 'vehiculos': []}), 200

        # 2) Obtener clientes únicos
        ids_clientes = list(set([
            v['id_cliente'] for v in vehiculos_result.data if v.get('id_cliente')
        ]))

        clientes_map = {}
        if ids_clientes:
            clientes_result = supabase.table('cliente') \
                .select('id, id_usuario') \
                .in_('id', ids_clientes) \
                .execute()

            ids_usuarios = list(set([
                c['id_usuario'] for c in (clientes_result.data or []) if c.get('id_usuario')
            ]))

            usuarios_map = obtener_datos_usuarios_por_ids(ids_usuarios) if ids_usuarios else {}

            for c in (clientes_result.data or []):
                u = usuarios_map.get(c.get('id_usuario'), {})
                clientes_map[c['id']] = {
                    'id_cliente': c['id'],
                    'id_usuario': c.get('id_usuario'),
                    'nombre': u.get('nombre', 'Sin nombre'),
                    'email': u.get('email', '') or '',
                    'contacto': u.get('contacto', '') or '',
                    'ubicacion': u.get('ubicacion', '') or ''
                }

        # 3) Construir respuesta con conteo de órdenes
        vehiculos_con_stats = []
        for v in vehiculos_result.data:
            ordenes_count = supabase.table('ordentrabajo') \
                .select('id', count='exact') \
                .eq('id_vehiculo', v['id']) \
                .execute()

            cliente_info = clientes_map.get(v.get('id_cliente'), {})

            vehiculos_con_stats.append({
                'id': v['id'],
                'id_cliente': v.get('id_cliente'),
                'placa': v.get('placa', ''),
                'marca': v.get('marca', ''),
                'modelo': v.get('modelo', ''),
                'anio': v.get('anio'),
                'kilometraje': v.get('kilometraje', 0),
                'cliente_nombre': cliente_info.get('nombre', 'Sin cliente'),
                'cliente_email': cliente_info.get('email', ''),
                'cliente_contacto': cliente_info.get('contacto', ''),
                'total_ordenes': ordenes_count.count if ordenes_count.count else 0
            })

        return jsonify({'success': True, 'vehiculos': vehiculos_con_stats}), 200

    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/vehiculo/<int:id_vehiculo>', methods=['GET'])
@admin_required
def get_vehiculo_detalle(current_user, id_vehiculo):
    """Obtener detalle completo de un vehículo"""
    try:
        vehiculo = supabase.table('vehiculo') \
            .select('id, id_cliente, placa, marca, modelo, anio, kilometraje') \
            .eq('id', id_vehiculo) \
            .execute()

        if not vehiculo.data:
            return jsonify({'error': 'Vehículo no encontrado'}), 404

        v = vehiculo.data[0]

        # Obtener datos del cliente
        cliente_info = {}
        if v.get('id_cliente'):
            cliente_info = obtener_datos_cliente(v['id_cliente'])

        # Obtener historial de órdenes
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida') \
            .eq('id_vehiculo', id_vehiculo) \
            .order('fecha_ingreso', desc=True) \
            .execute()

        return jsonify({
            'success': True,
            'vehiculo': {
                'id': v['id'],
                'id_cliente': v.get('id_cliente'),
                'placa': v.get('placa', ''),
                'marca': v.get('marca', ''),
                'modelo': v.get('modelo', ''),
                'anio': v.get('anio'),
                'kilometraje': v.get('kilometraje', 0),
                'cliente': cliente_info,
                'ordenes': ordenes.data or []
            }
        }), 200

    except Exception as e:
        logger.error(f"Error obteniendo detalle del vehículo: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/vehiculo/<int:id_vehiculo>', methods=['PUT'])
@admin_required
def editar_vehiculo(current_user, id_vehiculo):
    """Editar datos de un vehículo"""
    try:
        data = request.get_json()

        vehiculo = supabase.table('vehiculo') \
            .select('id, placa') \
            .eq('id', id_vehiculo) \
            .execute()

        if not vehiculo.data:
            return jsonify({'error': 'Vehículo no encontrado'}), 404

        campos_permitidos = ['placa', 'marca', 'modelo', 'anio', 'kilometraje', 'id_cliente']
        update_data = {}

        for campo in campos_permitidos:
            if campo in data:
                update_data[campo] = data[campo]

        if not update_data:
            return jsonify({'error': 'No hay campos para actualizar'}), 400

        # Validar placa duplicada
        if 'placa' in update_data:
            placa_existente = supabase.table('vehiculo') \
                .select('id') \
                .eq('placa', update_data['placa']) \
                .neq('id', id_vehiculo) \
                .execute()

            if placa_existente.data:
                return jsonify({'error': f'Ya existe un vehículo con la placa {update_data["placa"]}'}), 409

        # Validar cliente existente (tabla cliente)
        if 'id_cliente' in update_data:
            cliente_existe = supabase.table('cliente') \
                .select('id') \
                .eq('id', update_data['id_cliente']) \
                .execute()

            if not cliente_existe.data:
                return jsonify({'error': 'El cliente especificado no existe'}), 404

        resultado = supabase.table('vehiculo') \
            .update(update_data) \
            .eq('id', id_vehiculo) \
            .execute()

        logger.info(f"Vehículo {id_vehiculo} actualizado: {list(update_data.keys())}")

        return jsonify({
            'success': True,
            'message': 'Vehículo actualizado correctamente',
            'vehiculo': resultado.data[0] if resultado.data else None
        }), 200

    except Exception as e:
        logger.error(f"Error editando vehículo: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/vehiculo/<int:id_vehiculo>', methods=['DELETE'])
@admin_required
def eliminar_vehiculo(current_user, id_vehiculo):
    """Eliminar un vehículo (solo si no tiene órdenes activas)"""
    try:
        vehiculo = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo') \
            .eq('id', id_vehiculo) \
            .execute()

        if not vehiculo.data:
            return jsonify({'error': 'Vehículo no encontrado'}), 404

        v = vehiculo.data[0]

        # Verificar órdenes activas
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global') \
            .eq('id_vehiculo', id_vehiculo) \
            .execute()

        estados_activos = ['EnRecepcion', 'EnDiagnostico', 'EnReparacion',
                          'EsperandoRepuestos', 'EnArmado', 'EnControlCalidad']

        ordenes_pendientes = [
            o for o in (ordenes.data or [])
            if o.get('estado_global') in estados_activos
        ]

        if ordenes_pendientes:
            return jsonify({
                'error': f'No se puede eliminar el vehículo porque tiene {len(ordenes_pendientes)} orden(es) de trabajo activa(s)',
                'ordenes_pendientes': ordenes_pendientes
            }), 409

        # Eliminar dependencias de órdenes finalizadas
        for orden in (ordenes.data or []):
            oid = orden['id']
            supabase.table('recepcion').delete().eq('id_orden_trabajo', oid).execute()
            supabase.table('seguimientoorden').delete().eq('id_orden_trabajo', oid).execute()
            supabase.table('planificacion').delete().eq('id_orden_trabajo', oid).execute()

        # Eliminar órdenes finalizadas
        supabase.table('ordentrabajo').delete().eq('id_vehiculo', id_vehiculo).execute()

        # Eliminar reservas asociadas
        try:
            supabase.table('solicitud_reserva_cliente').delete().eq('id_vehiculo', id_vehiculo).execute()
        except Exception as ex:
            logger.warning(f"No se pudieron eliminar reservas del vehículo {id_vehiculo}: {str(ex)}")

        # Eliminar vehículo
        supabase.table('vehiculo').delete().eq('id', id_vehiculo).execute()

        logger.info(f"Vehículo {v['placa']} (ID: {id_vehiculo}) eliminado")

        return jsonify({
            'success': True,
            'message': f'Vehículo {v["placa"]} eliminado correctamente'
        }), 200

    except Exception as e:
        logger.error(f"Error eliminando vehículo: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# RUTA PARA SERVIR LA PÁGINA HTML
# =====================================================

@admin_roles_bp.route('/page', methods=['GET'])
def admin_roles_page():
    """Servir la página de administración de roles"""
    return render_template('jefe_taller/admin_roles.html')