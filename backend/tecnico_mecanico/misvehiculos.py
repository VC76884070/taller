# =====================================================
# MIS VEHÍCULOS - TÉCNICO MECÁNICO
# FLUJO: DIAGNÓSTICO → APROBACIÓN → REPARACIÓN
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify, send_from_directory
from functools import wraps
from config import config
import jwt
import datetime
import logging
import os
import time

logger = logging.getLogger(__name__)

mis_vehiculos_bp = Blueprint('mis_vehiculos', __name__, url_prefix='/tecnico')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# FUNCIÓN AUXILIAR: OBTENER ROLES DEL USUARIO
# =====================================================
def obtener_roles_usuario(usuario_id):
    """Obtiene los nombres de los roles de un usuario"""
    try:
        user_roles = supabase.table('usuario_rol') \
            .select('id_rol') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not user_roles.data:
            logger.info(f"Usuario {usuario_id} no tiene roles asignados")
            return []
        
        rol_ids = [ur['id_rol'] for ur in user_roles.data]
        
        roles_data = supabase.table('rol') \
            .select('nombre_rol') \
            .in_('id', rol_ids) \
            .execute()
        
        roles = [r['nombre_rol'] for r in (roles_data.data or [])]
        
        logger.info(f"📋 Roles obtenidos para usuario {usuario_id}: {roles}")
        return roles
        
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return []


# =====================================================
# FUNCIÓN AUXILIAR: VERIFICAR TOKEN Y OBTENER USUARIO
# =====================================================
def verificar_token_y_usuario():
    """Verifica el token y retorna el usuario si es válido"""
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
        current_user = data['user']
        
        roles = obtener_roles_usuario(current_user.get('id'))
        current_user['roles'] = roles
        
        logger.info(f"✅ Usuario verificado: {current_user.get('nombre')} - Roles: {roles}")
        return current_user, None, None
        
    except jwt.ExpiredSignatureError:
        return None, "Sesión expirada", 401
    except jwt.InvalidTokenError as e:
        logger.error(f"Token inválido: {str(e)}")
        return None, "Token inválido", 401


# =====================================================
# DECORADOR: VERIFICAR ROL TÉCNICO
# =====================================================
def tecnico_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user, error, status = verificar_token_y_usuario()
        
        if error:
            return jsonify({'error': error}), status
        
        if 'tecnico' not in current_user.get('roles', []):
            logger.warning(f"Usuario {current_user.get('nombre')} no tiene rol de técnico")
            return jsonify({'error': 'No autorizado - Se requiere rol de Técnico'}), 403
        
        return f(current_user, *args, **kwargs)
    
    return decorated


# =====================================================
# RUTAS PARA SERVIR ARCHIVOS ESTÁTICOS
# =====================================================
@mis_vehiculos_bp.route('/mis-vehiculos')
def mis_vehiculos_page():
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico'), 'misvehiculos.html')


@mis_vehiculos_bp.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico', 'css'), filename)


@mis_vehiculos_bp.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico', 'js'), filename)


# =====================================================
# API: VERIFICAR TOKEN
# =====================================================
@mis_vehiculos_bp.route('/api/verify-token', methods=['GET'])
def verify_token():
    current_user, error, status = verificar_token_y_usuario()
    
    if error:
        return jsonify({'valid': False, 'error': error}), status
    
    return jsonify({
        'valid': True,
        'user': {
            'id': current_user.get('id'),
            'nombre': current_user.get('nombre'),
            'email': current_user.get('email'),
            'roles': current_user.get('roles', [])
        }
    }), 200


# =====================================================
# API: OBTENER COMUNICADOS PARA TÉCNICO
# =====================================================
@mis_vehiculos_bp.route('/api/comunicados', methods=['GET'])
@tecnico_required
def obtener_comunicados_tecnico(current_user):
    try:
        logger.info(f"📢 Técnico {current_user['id']} consultando comunicados")
        
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('estado', 'activo') \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        comunicados = []
        if resultado.data:
            for c in resultado.data:
                destinatarios = c.get('destinatarios', [])
                if isinstance(destinatarios, list) and 'tecnico' in destinatarios:
                    comunicados.append({
                        'id': c['id'],
                        'titulo': c['titulo'],
                        'contenido': c['contenido'],
                        'prioridad': c.get('prioridad', 'normal'),
                        'estado': c.get('estado', 'activo'),
                        'destinatarios': destinatarios,
                        'fecha_creacion': c['fecha_creacion']
                    })
        
        logger.info(f"✅ {len(comunicados)} comunicados encontrados")
        
        return jsonify({'success': True, 'data': comunicados}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo comunicados: {str(e)}")
        return jsonify({'error': str(e)}), 500


@mis_vehiculos_bp.route('/api/comunicados/<int:id_comunicado>', methods=['GET'])
@tecnico_required
def obtener_comunicado_tecnico_detalle(current_user, id_comunicado):
    try:
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('id', id_comunicado) \
            .eq('estado', 'activo') \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        c = resultado.data[0]
        
        destinatarios = c.get('destinatarios', [])
        if not isinstance(destinatarios, list) or 'tecnico' not in destinatarios:
            return jsonify({'error': 'No tienes permiso para ver este comunicado'}), 403
        
        return jsonify({
            'success': True,
            'data': {
                'id': c['id'],
                'titulo': c['titulo'],
                'contenido': c['contenido'],
                'prioridad': c.get('prioridad', 'normal'),
                'fecha_creacion': c['fecha_creacion']
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo comunicado: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: OBTENER ÓRDENES PARA TÉCNICO (DIAGNÓSTICO)
# =====================================================
@mis_vehiculos_bp.route('/api/ordenes-tecnico', methods=['GET'])
@tecnico_required
def obtener_ordenes_tecnico(current_user):
    """Obtener órdenes asignadas al técnico para diagnóstico"""
    try:
        tecnico_id = current_user['id']
        
        # Obtener asignaciones de diagnóstico activas
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, fecha_hora_inicio') \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignaciones.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        orden_ids = [a['id_orden_trabajo'] for a in asignaciones.data]
        
        # Obtener órdenes con vehículo y cliente
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, id_vehiculo') \
            .in_('id', orden_ids) \
            .execute()
        
        resultado = []
        for orden in ordenes.data:
            # Obtener vehículo
            vehiculo = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
                .eq('id', orden['id_vehiculo']) \
                .single() \
                .execute()
            
            vehiculo_data = vehiculo.data if vehiculo.data else {}
            
            # Obtener cliente
            cliente_nombre = 'No registrado'
            if vehiculo_data.get('id_cliente'):
                cliente = supabase.table('cliente') \
                    .select('id_usuario') \
                    .eq('id', vehiculo_data['id_cliente']) \
                    .single() \
                    .execute()
                if cliente.data and cliente.data.get('id_usuario'):
                    usuario = supabase.table('usuario') \
                        .select('nombre') \
                        .eq('id', cliente.data['id_usuario']) \
                        .single() \
                        .execute()
                    if usuario.data:
                        cliente_nombre = usuario.data['nombre']
            
            # Obtener diagnóstico existente
            diagnostico = supabase.table('diagnostico_tecnico') \
                .select('id, informe, estado, version') \
                .eq('id_orden_trabajo', orden['id']) \
                .order('version', desc=True) \
                .limit(1) \
                .execute()
            
            diagnostico_data = diagnostico.data[0] if diagnostico.data else None
            
            resultado.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'vehiculo': {
                    'placa': vehiculo_data.get('placa', ''),
                    'marca': vehiculo_data.get('marca', ''),
                    'modelo': vehiculo_data.get('modelo', ''),
                    'anio': vehiculo_data.get('anio'),
                    'kilometraje': vehiculo_data.get('kilometraje')
                },
                'cliente_nombre': cliente_nombre,
                'diagnostico': diagnostico_data
            })
        
        return jsonify({'success': True, 'ordenes': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes para técnico: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: OBTENER VEHÍCULOS ASIGNADOS (DIAGNÓSTICO + REPARACIÓN)
# =====================================================
@mis_vehiculos_bp.route('/api/mis-vehiculos', methods=['GET'])
@tecnico_required
def obtener_mis_vehiculos(current_user):
    try:
        tecnico_id = current_user['id']
        
        logger.info(f"🔧 Técnico {tecnico_id} consultando sus vehículos asignados")
        
        def execute_with_retry(query_func, max_retries=3, delay=0.5):
            for attempt in range(max_retries):
                try:
                    return query_func()
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise e
                    logger.warning(f"Intento {attempt + 1} falló: {str(e)}. Reintentando...")
                    time.sleep(delay)
                    delay *= 2
            return None
        
        # 1. Asignaciones de DIAGNÓSTICO
        def get_asignaciones_diagnostico():
            return supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo, fecha_hora_inicio, tipo_asignacion') \
                .eq('id_tecnico', tecnico_id) \
                .eq('tipo_asignacion', 'diagnostico') \
                .is_('fecha_hora_final', 'null') \
                .execute()
        
        # 2. Asignaciones de REPARACIÓN
        def get_asignaciones_reparacion():
            return supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo, fecha_hora_inicio, tipo_asignacion') \
                .eq('id_tecnico', tecnico_id) \
                .eq('tipo_asignacion', 'reparacion') \
                .is_('fecha_hora_final', 'null') \
                .execute()
        
        asignaciones_diagnostico = execute_with_retry(get_asignaciones_diagnostico)
        asignaciones_reparacion = execute_with_retry(get_asignaciones_reparacion)
        
        todas_asignaciones = []
        if asignaciones_diagnostico and asignaciones_diagnostico.data:
            todas_asignaciones.extend(asignaciones_diagnostico.data)
        if asignaciones_reparacion and asignaciones_reparacion.data:
            todas_asignaciones.extend(asignaciones_reparacion.data)
        
        if not todas_asignaciones:
            logger.info(f"Técnico {tecnico_id} no tiene asignaciones activas")
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        orden_ids = [a['id_orden_trabajo'] for a in todas_asignaciones]
        asignacion_info = {a['id_orden_trabajo']: {'fecha': a['fecha_hora_inicio'], 'tipo': a['tipo_asignacion']} for a in todas_asignaciones}
        
        # 3. Órdenes
        def get_ordenes():
            return supabase.table('ordentrabajo') \
                .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
                .in_('id', orden_ids) \
                .execute()
        
        ordenes = execute_with_retry(get_ordenes)
        
        if not ordenes or not ordenes.data:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        # 4. Vehículos
        vehiculos_ids = [o['id_vehiculo'] for o in ordenes.data if o.get('id_vehiculo')]
        
        def get_vehiculos():
            return supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
                .in_('id', vehiculos_ids) \
                .execute()
        
        vehiculos = execute_with_retry(get_vehiculos)
        vehiculos_map = {v['id']: v for v in (vehiculos.data or [])}
        
        # 5. Clientes
        clientes_ids = list(set([v.get('id_cliente') for v in vehiculos_map.values() if v.get('id_cliente')]))
        clientes_map = {}
        usuarios_ids = []
        
        if clientes_ids:
            def get_clientes():
                return supabase.table('cliente') \
                    .select('id, id_usuario, email') \
                    .in_('id', clientes_ids) \
                    .execute()
            
            clientes = execute_with_retry(get_clientes)
            for c in (clientes.data or []):
                clientes_map[c['id']] = c
                if c.get('id_usuario'):
                    usuarios_ids.append(c['id_usuario'])
        
        usuarios_map = {}
        if usuarios_ids:
            def get_usuarios():
                return supabase.table('usuario') \
                    .select('id, nombre, contacto, email') \
                    .in_('id', usuarios_ids) \
                    .execute()
            
            usuarios = execute_with_retry(get_usuarios)
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        # 6. Diagnósticos técnicos
        diagnosticos_tecnicos_map = {}
        if orden_ids:
            def get_diagnosticos_tecnicos():
                return supabase.table('diagnostico_tecnico') \
                    .select('id_orden_trabajo, estado, version, fecha_envio') \
                    .in_('id_orden_trabajo', orden_ids) \
                    .order('version', desc=True) \
                    .execute()
            
            diagnosticos = execute_with_retry(get_diagnosticos_tecnicos)
            for d in (diagnosticos.data or []):
                if d['id_orden_trabajo'] not in diagnosticos_tecnicos_map:
                    diagnosticos_tecnicos_map[d['id_orden_trabajo']] = d
        
        # 7. Planificaciones
        def get_planificaciones():
            return supabase.table('planificacion') \
                .select('id_orden_trabajo, fecha_hora_inicio_real, bahia_asignada') \
                .in_('id_orden_trabajo', orden_ids) \
                .execute()
        
        planificaciones = execute_with_retry(get_planificaciones)
        planificaciones_map = {p['id_orden_trabajo']: p for p in (planificaciones.data or [])}
        
        # 8. Construir respuesta
        vehiculos_resultado = []
        for orden in ordenes.data:
            vehiculo = vehiculos_map.get(orden['id_vehiculo'], {})
            cliente_info = clientes_map.get(vehiculo.get('id_cliente'), {})
            usuario_cliente = usuarios_map.get(cliente_info.get('id_usuario'), {})
            planif = planificaciones_map.get(orden['id'], {})
            diagnostico_info = diagnosticos_tecnicos_map.get(orden['id'], {})
            
            trabajo_iniciado = planif.get('fecha_hora_inicio_real') is not None
            tipo_asignacion = asignacion_info.get(orden['id'], {}).get('tipo', 'diagnostico')
            diagnostico_enviado = diagnostico_info.get('estado') in ['pendiente', 'aprobado', 'rechazado']
            diagnostico_aprobado = diagnostico_info.get('estado') == 'aprobado'
            diagnostico_rechazado = diagnostico_info.get('estado') == 'rechazado'
            
            vehiculos_resultado.append({
                'orden_id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'estado_global': orden['estado_global'],
                'tipo_asignacion': tipo_asignacion,
                'diagnostico_enviado': diagnostico_enviado,
                'diagnostico_aprobado': diagnostico_aprobado,
                'diagnostico_rechazado': diagnostico_rechazado,
                'diagnostico_estado': diagnostico_info.get('estado'),
                'diagnostico_version': diagnostico_info.get('version', 1),
                'trabajo_iniciado': trabajo_iniciado,
                'bahia_asignada': planif.get('bahia_asignada'),
                'vehiculo': {
                    'placa': vehiculo.get('placa', ''),
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'anio': vehiculo.get('anio'),
                    'kilometraje': vehiculo.get('kilometraje')
                },
                'cliente': {
                    'nombre': usuario_cliente.get('nombre', 'No registrado'),
                    'contacto': usuario_cliente.get('contacto', 'No registrado'),
                    'email': usuario_cliente.get('email', '')
                }
            })
        
        logger.info(f"✅ Se encontraron {len(vehiculos_resultado)} asignaciones")
        
        return jsonify({'success': True, 'vehiculos': vehiculos_resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: CREAR/ACTUALIZAR DIAGNÓSTICO TÉCNICO
# =====================================================
@mis_vehiculos_bp.route('/api/crear-diagnostico', methods=['POST'])
@tecnico_required
def crear_diagnostico(current_user):
    """Crear o actualizar un diagnóstico técnico"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        informe = data.get('informe', '')
        url_grabacion = data.get('url_grabacion')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        # Verificar asignación de diagnóstico
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes esta orden asignada para diagnóstico'}), 403
        
        ahora = datetime.datetime.now().isoformat()
        
        # Verificar si ya existe un diagnóstico rechazado (para crear nueva versión)
        diagnostico_rechazado = supabase.table('diagnostico_tecnico') \
            .select('id, version, estado') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('estado', 'rechazado') \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnostico_rechazado.data:
            # Si hay diagnóstico rechazado, crear nueva versión
            nueva_version = diagnostico_rechazado.data[0]['version'] + 1
            resultado = supabase.table('diagnostico_tecnico').insert({
                'id_orden_trabajo': id_orden,
                'id_tecnico': current_user['id'],
                'informe': informe,
                'url_grabacion_informe': url_grabacion,
                'estado': 'borrador',
                'version': nueva_version,
                'fecha_envio': ahora,
                'es_borrador': True
            }).execute()
            logger.info(f"📝 Nueva versión {nueva_version} de diagnóstico creada para orden {id_orden}")
        else:
            # Verificar si ya existe un diagnóstico en borrador o pendiente
            diagnostico_existente = supabase.table('diagnostico_tecnico') \
                .select('id, estado') \
                .eq('id_orden_trabajo', id_orden) \
                .in_('estado', ['borrador', 'pendiente']) \
                .execute()
            
            if diagnostico_existente.data:
                # Actualizar diagnóstico existente
                resultado = supabase.table('diagnostico_tecnico') \
                    .update({
                        'informe': informe,
                        'url_grabacion_informe': url_grabacion,
                        'fecha_modificacion': ahora
                    }) \
                    .eq('id', diagnostico_existente.data[0]['id']) \
                    .execute()
                logger.info(f"📝 Diagnóstico actualizado para orden {id_orden}")
            else:
                # Crear nuevo diagnóstico
                resultado = supabase.table('diagnostico_tecnico').insert({
                    'id_orden_trabajo': id_orden,
                    'id_tecnico': current_user['id'],
                    'informe': informe,
                    'url_grabacion_informe': url_grabacion,
                    'estado': 'borrador',
                    'version': 1,
                    'fecha_envio': ahora,
                    'es_borrador': True
                }).execute()
                logger.info(f"📝 Nuevo diagnóstico creado para orden {id_orden}")
        
        if not resultado.data:
            return jsonify({'error': 'Error al guardar diagnóstico'}), 500
        
        return jsonify({
            'success': True,
            'message': 'Diagnóstico guardado correctamente',
            'diagnostico_id': resultado.data[0]['id']
        }), 200
        
    except Exception as e:
        logger.error(f"Error creando diagnóstico: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: ENVIAR DIAGNÓSTICO PARA APROBACIÓN
# =====================================================
@mis_vehiculos_bp.route('/api/enviar-diagnostico', methods=['POST'])
@tecnico_required
def enviar_diagnostico(current_user):
    """Enviar diagnóstico para aprobación del Jefe de Taller"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        id_diagnostico = data.get('id_diagnostico')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        # Verificar asignación
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes esta orden asignada para diagnóstico'}), 403
        
        ahora = datetime.datetime.now().isoformat()
        
        # Actualizar diagnóstico a estado 'pendiente'
        supabase.table('diagnostico_tecnico') \
            .update({
                'estado': 'pendiente',
                'es_borrador': False,
                'fecha_envio': ahora
            }) \
            .eq('id', id_diagnostico) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        # Cambiar estado de la orden
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'PendienteAprobacion'}) \
            .eq('id', id_orden) \
            .execute()
        
        logger.info(f"📤 Diagnóstico enviado para orden {id_orden}")
        
        return jsonify({
            'success': True,
            'message': 'Diagnóstico enviado para aprobación'
        }), 200
        
    except Exception as e:
        logger.error(f"Error enviando diagnóstico: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: INICIAR REPARACIÓN
# =====================================================
@mis_vehiculos_bp.route('/api/iniciar-reparacion', methods=['POST'])
@tecnico_required
def iniciar_reparacion(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        # Verificar asignación de reparación
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .eq('tipo_asignacion', 'reparacion') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes esta orden asignada para reparación'}), 403
        
        # Verificar estado
        orden = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden.data['estado_global'] != 'EnProceso':
            return jsonify({'error': f'No se puede iniciar en estado {orden.data["estado_global"]}'}), 400
        
        ahora = datetime.datetime.now()
        ahora_str = ahora.isoformat()
        
        # Obtener la bahía asignada por el Jefe Taller
        planificacion = supabase.table('planificacion') \
            .select('bahia_asignada') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        bahia_asignada = planificacion.data[0].get('bahia_asignada') if planificacion.data else None
        
        if not bahia_asignada:
            return jsonify({'error': 'No hay bahía asignada para esta orden'}), 400
        
        # Verificar si la bahía está disponible
        bahia_ocupada = supabase.table('planificacion') \
            .select('id_orden_trabajo') \
            .eq('bahia_asignada', bahia_asignada) \
            .not_.is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        if bahia_ocupada.data and len(bahia_ocupada.data) > 0:
            if bahia_ocupada.data[0]['id_orden_trabajo'] != id_orden:
                return jsonify({
                    'error': f'La bahía {bahia_asignada} ya está ocupada por otra orden',
                    'bahia_ocupada': True
                }), 409
        
        # Actualizar planificación con inicio real
        supabase.table('planificacion') \
            .update({'fecha_hora_inicio_real': ahora_str}) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        logger.info(f"🔧 Reparación iniciada en orden {id_orden}, bahía {bahia_asignada}")
        
        return jsonify({
            'success': True,
            'message': f'Reparación iniciada en bahía {bahia_asignada}',
            'fecha_inicio': ahora_str
        }), 200
        
    except Exception as e:
        logger.error(f"Error iniciando reparación: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: PAUSAR REPARACIÓN
# =====================================================
@mis_vehiculos_bp.route('/api/pausar-reparacion', methods=['POST'])
@tecnico_required
def pausar_reparacion(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        motivo = data.get('motivo', '').strip()
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not motivo:
            return jsonify({'error': 'Debe especificar el motivo de la pausa'}), 400
        
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .eq('tipo_asignacion', 'reparacion') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes esta orden asignada'}), 403
        
        orden = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden.data['estado_global'] != 'EnProceso':
            return jsonify({'error': f'No se puede pausar en estado {orden.data["estado_global"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'EnPausa'}) \
            .eq('id', id_orden) \
            .execute()
        
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'EnPausa',
            'motivo_pausa': motivo,
            'fecha_hora_cambio': ahora,
            'notificaciones_enviadas': 0
        }).execute()
        
        logger.info(f"⏸️ Reparación pausada en orden {id_orden}: {motivo}")
        
        return jsonify({'success': True, 'message': 'Reparación en pausa'}), 200
        
    except Exception as e:
        logger.error(f"Error pausando reparación: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: REANUDAR REPARACIÓN
# =====================================================
@mis_vehiculos_bp.route('/api/reanudar-reparacion', methods=['POST'])
@tecnico_required
def reanudar_reparacion(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .eq('tipo_asignacion', 'reparacion') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes esta orden asignada'}), 403
        
        orden = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden.data['estado_global'] != 'EnPausa':
            return jsonify({'error': f'No se puede reanudar en estado {orden.data["estado_global"]}'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'EnProceso'}) \
            .eq('id', id_orden) \
            .execute()
        
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'EnProceso',
            'fecha_hora_cambio': ahora
        }).execute()
        
        logger.info(f"▶️ Reparación reanudada en orden {id_orden}")
        
        return jsonify({'success': True, 'message': 'Reparación reanudada'}), 200
        
    except Exception as e:
        logger.error(f"Error reanudando reparación: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: FINALIZAR REPARACIÓN
# =====================================================
@mis_vehiculos_bp.route('/api/finalizar-reparacion', methods=['POST'])
@tecnico_required
def finalizar_reparacion(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .eq('tipo_asignacion', 'reparacion') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes esta orden asignada'}), 403
        
        ahora = datetime.datetime.now().isoformat()
        
        # Finalizar asignación
        supabase.table('asignaciontecnico') \
            .update({'fecha_hora_final': ahora}) \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .eq('tipo_asignacion', 'reparacion') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        # Liberar bahía
        supabase.table('planificacion') \
            .update({'fecha_hora_fin_real': ahora}) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        # Cambiar estado a Finalizado
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'Finalizado', 'fecha_salida': ahora}) \
            .eq('id', id_orden) \
            .execute()
        
        logger.info(f"🏁 Reparación finalizada en orden {id_orden}")
        
        return jsonify({'success': True, 'message': 'Reparación finalizada'}), 200
        
    except Exception as e:
        logger.error(f"Error finalizando reparación: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: OBTENER DETALLE DE ORDEN
# =====================================================
@mis_vehiculos_bp.route('/api/detalle-orden/<int:id_orden>', methods=['GET'])
@tecnico_required
def detalle_orden(current_user, id_orden):
    try:
        logger.info(f"=== OBTENIENDO DETALLE ORDEN {id_orden} ===")
        
        # Verificar acceso (diagnóstico o reparación)
        asignacion = supabase.table('asignaciontecnico') \
            .select('id, tipo_asignacion') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        tipo_asignacion = asignacion.data[0]['tipo_asignacion']
        
        # Obtener orden
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, fecha_salida, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden_data = orden.data
        vehiculo_id = orden_data.get('id_vehiculo')
        
        # Obtener vehículo
        vehiculo = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('id', vehiculo_id) \
            .single() \
            .execute()
        
        vehiculo_data = vehiculo.data if vehiculo.data else {}
        cliente_id = vehiculo_data.get('id_cliente')
        
        # Obtener cliente
        cliente_info = {}
        if cliente_id:
            cliente = supabase.table('cliente') \
                .select('id, id_usuario, email') \
                .eq('id', cliente_id) \
                .single() \
                .execute()
            
            if cliente.data:
                usuario_id = cliente.data.get('id_usuario')
                if usuario_id:
                    usuario = supabase.table('usuario') \
                        .select('nombre, contacto, email') \
                        .eq('id', usuario_id) \
                        .single() \
                        .execute()
                    
                    if usuario.data:
                        cliente_info = {
                            'nombre': usuario.data.get('nombre', 'No registrado'),
                            'telefono': usuario.data.get('contacto', 'No registrado'),
                            'email': cliente.data.get('email', 'No registrado')
                        }
        
        # Obtener diagnóstico técnico
        diagnostico_tecnico = supabase.table('diagnostico_tecnico') \
            .select('informe, url_grabacion_informe, estado, version') \
            .eq('id_orden_trabajo', id_orden) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        diagnostico_data = diagnostico_tecnico.data[0] if diagnostico_tecnico.data else {}
        
        # Obtener planificación
        planificacion = supabase.table('planificacion') \
            .select('bahia_asignada, fecha_hora_inicio_real') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        planificacion_data = planificacion.data[0] if planificacion.data else {}
        
        # Obtener recepción
        recepcion = supabase.table('recepcion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        recepcion_data = recepcion.data[0] if recepcion.data else {}
        
        # Obtener fotos
        fotos_keys = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 
                      'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero']
        
        fotos = {}
        for key in fotos_keys:
            url = recepcion_data.get(key)
            if url and url != '' and url != 'null':
                nombre = key.replace('url_', '').replace('_', ' ').title()
                fotos[nombre] = url
        
        response_data = {
            'success': True,
            'detalle': {
                'tipo_asignacion': tipo_asignacion,
                'vehiculo': {
                    'placa': vehiculo_data.get('placa', 'N/A'),
                    'marca': vehiculo_data.get('marca', 'No especificada'),
                    'modelo': vehiculo_data.get('modelo', 'No especificado'),
                    'anio': vehiculo_data.get('anio', 'N/A'),
                    'kilometraje': vehiculo_data.get('kilometraje', 0)
                },
                'cliente': cliente_info,
                'orden': {
                    'codigo_unico': orden_data.get('codigo_unico', 'N/A'),
                    'fecha_ingreso': orden_data.get('fecha_ingreso'),
                    'estado_global': orden_data.get('estado_global', 'N/A')
                },
                'diagnostico_tecnico': {
                    'informe': diagnostico_data.get('informe', ''),
                    'audio_url': diagnostico_data.get('url_grabacion_informe'),
                    'estado': diagnostico_data.get('estado', 'pendiente'),
                    'version': diagnostico_data.get('version', 1)
                },
                'planificacion': {
                    'bahia_asignada': planificacion_data.get('bahia_asignada'),
                    'trabajo_iniciado': planificacion_data.get('fecha_hora_inicio_real') is not None
                },
                'recepcion': {
                    'transcripcion_problema': recepcion_data.get('transcripcion_problema', 'No hay descripción'),
                    'audio_url': recepcion_data.get('url_grabacion_problema'),
                    'fotos': fotos
                }
            }
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: ESTADO DE BAHÍAS
# =====================================================
@mis_vehiculos_bp.route('/api/estado-bahias', methods=['GET'])
@tecnico_required
def estado_bahias(current_user):
    try:
        planificaciones_activas = supabase.table('planificacion') \
            .select('id_orden_trabajo, bahia_asignada, fecha_hora_inicio_real') \
            .not_.is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        bahias_ocupadas = {}
        for p in (planificaciones_activas.data or []):
            if p.get('bahia_asignada'):
                orden = supabase.table('ordentrabajo') \
                    .select('codigo_unico') \
                    .eq('id', p['id_orden_trabajo']) \
                    .single() \
                    .execute()
                bahias_ocupadas[p['bahia_asignada']] = orden.data.get('codigo_unico') if orden.data else None
        
        resultado = []
        for i in range(1, 13):
            resultado.append({
                'bahia_numero': i,
                'estado': 'ocupado' if i in bahias_ocupadas else 'libre',
                'orden_codigo': bahias_ocupadas.get(i)
            })
        
        return jsonify({'success': True, 'bahias': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estado de bahías: {str(e)}")
        return jsonify({'error': str(e)}), 500