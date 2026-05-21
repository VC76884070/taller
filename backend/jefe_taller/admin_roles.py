# =====================================================
# ADMINISTRACIÓN DE ROLES - JEFE DE TALLER (CORREGIDO)
# FURIA MOTOR COMPANY SRL
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


# Crear el blueprint - ¡IMPORTANTE! La URL prefix debe ser consistente
admin_roles_bp = Blueprint('admin_roles', __name__, url_prefix='/api/admin')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# IDs de roles de personal (excluyendo cliente que es id=5)
# Asegúrate que estos IDs coincidan con tu base de datos
ROLES_PERSONAL = [1, 2, 3, 4]

# IDs de roles críticos que no se pueden quitar si tienen tareas pendientes
ROLES_CRITICOS = {
    'tecnico': 3,               # Ajusta según tu BD
    'encargado_repuestos': 4    # Ajusta según tu BD
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
                    .select('id_rol') \
                    .eq('id', usuario_id) \
                    .execute()
                if user_result.data and user_result.data[0].get('id_rol') == 2:  # ID 2 = jefe_taller
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
# FUNCIÓN AUXILIAR PARA VERIFICAR TAREAS PENDIENTES
# =====================================================

def verificar_tareas_pendientes(id_usuario, roles_a_verificar):
    """
    Verifica si un usuario tiene tareas pendientes para roles específicos
    
    Args:
        id_usuario: ID del usuario a verificar
        roles_a_verificar: Lista de nombres de roles a verificar ['tecnico', 'encargado_repuestos']
    
    Returns:
        dict: {
            'tiene_pendientes': bool,
            'tareas': list,
            'roles_con_tareas': list
        }
    """
    tareas_pendientes = []
    roles_con_tareas = []
    
    # Verificar tareas como técnico
    if 'tecnico' in roles_a_verificar:
        # Asignaciones de técnico activas (sin fecha final)
        asignaciones_activas = supabase.table('asignaciontecnico') \
            .select('id, id_orden_trabajo, tipo_asignacion, fecha_hora_inicio') \
            .eq('id_tecnico', id_usuario) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if asignaciones_activas.data:
            roles_con_tareas.append('tecnico')
            for asig in asignaciones_activas.data:
                # Obtener código de orden
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
        # Solicitudes de cotización pendientes
        solicitudes_pendientes = supabase.table('solicitud_cotizacion_repuesto') \
            .select('id, id_orden_trabajo, descripcion_pieza, cantidad') \
            .eq('id_encargado_repuestos', id_usuario) \
            .eq('estado', 'pendiente') \
            .execute()
        
        if solicitudes_pendientes.data:
            roles_con_tareas.append('encargado_repuestos')
            for sol in solicitudes_pendientes.data:
                # Obtener código de orden
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
        # Primero, obtener todos los usuarios
        usuarios_result = supabase.table('usuario') \
            .select('id, nombre, email, numero_documento, contacto, fecha_registro') \
            .execute()
        
        if not usuarios_result.data:
            return jsonify({'success': True, 'usuarios': []}), 200
        
        # Obtener roles de todos los usuarios
        usuarios_ids = [u['id'] for u in usuarios_result.data]
        
        usuarios_roles = supabase.table('usuario_rol') \
            .select('id_usuario, id_rol, rol:rol!inner(nombre_rol)') \
            .in_('id_usuario', usuarios_ids) \
            .execute()
        
        # Construir mapa de roles por usuario
        roles_por_usuario = {}
        for ur in (usuarios_roles.data or []):
            usuario_id = ur['id_usuario']
            if usuario_id not in roles_por_usuario:
                roles_por_usuario[usuario_id] = {'ids': [], 'nombres': []}
            
            roles_por_usuario[usuario_id]['ids'].append(ur['id_rol'])
            
            # Obtener nombre del rol
            rol_info = ur.get('rol', {})
            if isinstance(rol_info, dict):
                nombre = rol_info.get('nombre_rol', '')
            elif isinstance(rol_info, list) and len(rol_info) > 0:
                nombre = rol_info[0].get('nombre_rol', '')
            else:
                nombre = ''
            
            if nombre:
                roles_por_usuario[usuario_id]['nombres'].append(nombre)
        
        # Construir resultado - SOLO usuarios con roles de personal
        resultado = []
        for u in usuarios_result.data:
            roles_info = roles_por_usuario.get(u['id'], {'ids': [], 'nombres': []})
            
            # Verificar si tiene algún rol de personal
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
    """Obtener lista de clientes (solo lectura)"""
    try:
        # Obtener usuarios con id_rol = 5 (cliente) O usuarios que NO tienen roles de personal
        clientes_result = supabase.table('usuario') \
            .select('id, nombre, email, contacto, ubicacion, fecha_registro') \
            .execute()
        
        if not clientes_result.data:
            return jsonify({'success': True, 'clientes': []}), 200
        
        # Obtener qué usuarios tienen roles de personal para excluirlos
        usuarios_con_roles = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .execute()
        
        usuarios_personal_ids = set([ur['id_usuario'] for ur in (usuarios_con_roles.data or [])])
        
        # Filtrar solo clientes (los que NO están en personal)
        clientes = []
        for u in clientes_result.data:
            if u['id'] not in usuarios_personal_ids:
                # Obtener vehículos del cliente
                vehiculos_result = supabase.table('vehiculo') \
                    .select('id, placa, marca, modelo, anio, kilometraje') \
                    .eq('id_cliente', u['id']) \
                    .execute()
                
                clientes.append({
                    'id': u['id'],
                    'nombre': u['nombre'],
                    'email': u.get('email', ''),
                    'contacto': u.get('contacto', ''),
                    'ubicacion': u.get('ubicacion', ''),
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
        
        # Obtener roles del usuario
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
        
        # Verificar roles válidos
        for rol_id in nuevos_roles_ids:
            if rol_id not in ROLES_PERSONAL:
                return jsonify({'error': f'Rol {rol_id} no permitido'}), 400
        
        # Obtener roles actuales del usuario
        roles_actuales = obtener_roles_usuario(id_usuario)
        roles_actuales_ids = roles_actuales['ids']
        roles_actuales_nombres = roles_actuales['nombres']
        
        # Identificar roles que se están quitando (estaban antes pero no en los nuevos)
        roles_eliminados_ids = [rid for rid in roles_actuales_ids if rid not in nuevos_roles_ids]
        
        # Verificar si se está quitando el rol de técnico o encargado_repuestos
        roles_criticos_a_quitar = []
        for nombre_rol, rol_id in ROLES_CRITICOS.items():
            if rol_id in roles_eliminados_ids:
                roles_criticos_a_quitar.append(nombre_rol)
        
        # Si no se quitan roles críticos, continuar normalmente
        if not roles_criticos_a_quitar:
            # Eliminar roles existentes
            supabase.table('usuario_rol').delete() \
                .eq('id_usuario', id_usuario) \
                .execute()
            
            # Insertar nuevos roles
            for rol_id in nuevos_roles_ids:
                supabase.table('usuario_rol').insert({
                    'id_usuario': id_usuario,
                    'id_rol': rol_id,
                    'fecha_asignacion': datetime.datetime.now().isoformat()
                }).execute()
            
            logger.info(f"Roles actualizados para usuario {id_usuario}: {nuevos_roles_ids}")
            return jsonify({'success': True, 'message': 'Roles asignados correctamente'}), 200
        
        # =====================================================
        # VERIFICAR TAREAS PENDIENTES ANTES DE QUITAR ROLES CRÍTICOS
        # =====================================================
        
        verificacion = verificar_tareas_pendientes(id_usuario, roles_criticos_a_quitar)
        
        # Si hay tareas pendientes, NO permitir quitar el rol
        if verificacion['tiene_pendientes']:
            nombres_roles_quitando = []
            if 'tecnico' in roles_criticos_a_quitar:
                nombres_roles_quitando.append("Técnico Mecánico")
            if 'encargado_repuestos' in roles_criticos_a_quitar:
                nombres_roles_quitando.append("Encargado de Repuestos")
            
            logger.warning(f"Intento denegado: No se pueden quitar roles {nombres_roles_quitando} al usuario {id_usuario} - tiene {len(verificacion['tareas'])} tareas pendientes")
            
            return jsonify({
                'error': f'No se puede quitar el rol de {", ".join(nombres_roles_quitando)} porque el usuario tiene tareas pendientes',
                'tareas_pendientes': verificacion['tareas'],
                'total_tareas': len(verificacion['tareas']),
                'roles_afectados': roles_criticos_a_quitar
            }), 409  # 409 Conflict
        
        # Si no hay tareas pendientes, proceder con la actualización
        supabase.table('usuario_rol').delete() \
            .eq('id_usuario', id_usuario) \
            .execute()
        
        for rol_id in nuevos_roles_ids:
            supabase.table('usuario_rol').insert({
                'id_usuario': id_usuario,
                'id_rol': rol_id,
                'fecha_asignacion': datetime.datetime.now().isoformat()
            }).execute()
        
        logger.info(f"Roles actualizados para usuario {id_usuario} (con eliminación de roles críticos sin tareas): {nuevos_roles_ids}")
        return jsonify({'success': True, 'message': 'Roles actualizados correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error asignando roles: {str(e)}")
        return jsonify({'error': str(e)}), 500


@admin_roles_bp.route('/usuario/<int:id_usuario>', methods=['DELETE'])
@admin_required
def eliminar_usuario(current_user, id_usuario):
    """Eliminar un usuario del sistema"""
    try:
        # Verificar si el usuario existe
        usuario = supabase.table('usuario') \
            .select('id, nombre') \
            .eq('id', id_usuario) \
            .execute()
        
        if not usuario.data:
            return jsonify({'error': 'Usuario no encontrado'}), 404
        
        # No permitir eliminar a sí mismo
        if id_usuario == current_user.get('id'):
            return jsonify({'error': 'No puedes eliminarte a ti mismo'}), 400
        
        # Verificar si tiene tareas pendientes ANTES de eliminar
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
        
        # Eliminar asignaciones de roles
        supabase.table('usuario_rol').delete() \
            .eq('id_usuario', id_usuario) \
            .execute()
        
        # Eliminar usuario
        supabase.table('usuario').delete() \
            .eq('id', id_usuario) \
            .execute()
        
        logger.info(f"Usuario {usuario.data[0]['nombre']} (ID: {id_usuario}) eliminado correctamente")
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
        # Total de usuarios con roles de personal
        usuarios_personal = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .execute()
        
        usuarios_personal_ids = set([ur['id_usuario'] for ur in (usuarios_personal.data or [])])
        total_personal = len(usuarios_personal_ids)
        
        # Usuarios por rol (solo personal)
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
        
        # Total de clientes (usuarios sin roles de personal)
        todos_usuarios = supabase.table('usuario') \
            .select('id') \
            .execute()
        
        total_clientes = 0
        for u in (todos_usuarios.data or []):
            if u['id'] not in usuarios_personal_ids:
                total_clientes += 1
        
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
        # Obtener roles del usuario
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
        
        # Para técnicos: verificar asignaciones activas
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
                asignaciones.append({
                    'tipo': 'tecnico',
                    'id_asignacion': a['id'],
                    'id_orden': a['id_orden_trabajo'],
                    'codigo_orden': orden.get('codigo_unico', 'N/A'),
                    'estado_orden': orden.get('estado_global', 'N/A'),
                    'tipo_asignacion': a.get('tipo_asignacion', 'diagnostico'),
                    'fecha_inicio': a.get('fecha_hora_inicio')
                })
        
        # Para encargado de repuestos: verificar solicitudes pendientes
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
                asignaciones.append({
                    'tipo': 'repuestos',
                    'id_solicitud': s['id'],
                    'id_orden': s['id_orden_trabajo'],
                    'codigo_orden': orden.get('codigo_unico', 'N/A'),
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
        
        # Reasignar asignaciones de técnico
        if nuevo_tecnico_id:
            for asignacion in asignaciones_a_reasignar:
                if asignacion.get('tipo') == 'tecnico' and asignacion.get('id_asignacion'):
                    supabase.table('asignaciontecnico') \
                        .update({'id_tecnico': nuevo_tecnico_id}) \
                        .eq('id', asignacion['id_asignacion']) \
                        .execute()
                    
                    # Crear notificación para el nuevo técnico
                    supabase.table('notificacion').insert({
                        'id_usuario_destino': nuevo_tecnico_id,
                        'tipo': 'nueva_asignacion',
                        'mensaje': f'Se te ha reasignado la orden {asignacion.get("codigo_orden", "desconocida")}',
                        'fecha_envio': datetime.datetime.now().isoformat(),
                        'leida': False
                    }).execute()
        
        # Reasignar solicitudes de repuestos
        if nuevo_encargado_id:
            for asignacion in asignaciones_a_reasignar:
                if asignacion.get('tipo') == 'repuestos' and asignacion.get('id_solicitud'):
                    supabase.table('solicitud_cotizacion_repuesto') \
                        .update({'id_encargado_repuestos': nuevo_encargado_id}) \
                        .eq('id', asignacion['id_solicitud']) \
                        .execute()
        
        logger.info(f"Tareas reasignadas desde usuario {id_usuario} - Técnico: {nuevo_tecnico_id}, Repuestos: {nuevo_encargado_id}")
        return jsonify({
            'success': True,
            'message': 'Tareas reasignadas correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error reasignando tareas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# Ruta para servir la página HTML (si es necesario)
@admin_roles_bp.route('/page', methods=['GET'])
def admin_roles_page():
    """Servir la página de administración de roles"""
    return render_template('jefe_taller/admin_roles.html')