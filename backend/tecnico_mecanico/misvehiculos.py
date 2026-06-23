# =====================================================
# MIS VEHÍCULOS - TÉCNICO MECÁNICO
# FLUJO: EMPEZAR TRABAJO → DIAGNÓSTICO → APROBACIÓN → REPARACIÓN
# VERSIÓN COMPLETA CON INSTRUCCIONES DEL JEFE DE TALLER
# CORREGIDO: DEDUPLICACIÓN DE VEHÍCULOS Y EXCLUSIÓN DE ENTREGADOS
# CORREGIDO: AÑO Y KILOMETRAJE EN DETALLE
# CORREGIDO: AUDIO DEL PROBLEMA Y AUDIO DEL DIAGNÓSTICO
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify, send_from_directory
from functools import wraps
from config import config
import jwt
import datetime
import logging
import os
import json

logger = logging.getLogger(__name__)

mis_vehiculos_bp = Blueprint('tecnico_misvehiculos', __name__)

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# FUNCIÓN AUXILIAR: NORMALIZAR NOMBRE DE ROL
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


# =====================================================
# FUNCIÓN AUXILIAR: OBTENER ROLES DEL USUARIO
# =====================================================
def obtener_roles_usuario(usuario_id):
    try:
        logger.info(f"🔍 Buscando roles para usuario ID: {usuario_id}")
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
        logger.info(f"✅ Roles encontrados: {roles_normalizados}")
        return roles_normalizados
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        return []


# =====================================================
# FUNCIÓN AUXILIAR: VERIFICAR TOKEN Y OBTENER USUARIO
# =====================================================
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
    except jwt.InvalidTokenError as e:
        return None, "Token inválido", 401
    except Exception as e:
        return None, "Error de autenticación", 401


# =====================================================
# DECORADOR: VERIFICAR ROL TÉCNICO
# =====================================================
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


@mis_vehiculos_bp.route('/components/<path:filename>')
def serve_components(filename):
    return send_from_directory(os.path.join(os.path.dirname(__file__), '..', 'tecnico_mecanico', 'components'), filename)


# =====================================================
# API: VERIFICAR TOKEN
# =====================================================
@mis_vehiculos_bp.route('/verify-token', methods=['GET'])
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


@mis_vehiculos_bp.route('/test-token', methods=['GET'])
def test_token():
    token = None
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        try:
            token = auth_header.split(" ")[1]
        except IndexError:
            pass
    if not token:
        return jsonify({'error': 'No token'}), 401
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return jsonify({
            'token_decoded': data,
            'user': data.get('user', data),
            'roles': data.get('user', data).get('roles', [])
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: OBTENER VEHÍCULOS ASIGNADOS (CORREGIDO)
# =====================================================
@mis_vehiculos_bp.route('/get-mis-vehiculos', methods=['GET'])
@tecnico_required
def obtener_mis_vehiculos(current_user):
    try:
        tecnico_id = current_user['id']
        
        # =====================================================
        # Obtener asignaciones activas (diagnostico, reparacion, armado)
        # =====================================================
        asignaciones_activas = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, tipo_asignacion') \
            .eq('id_tecnico', tecnico_id) \
            .is_('fecha_hora_final', 'null') \
            .in_('tipo_asignacion', ['diagnostico', 'reparacion', 'armado']) \
            .execute()
        
        # =====================================================
        # También incluir asignaciones de visualización (para órdenes finalizadas)
        # pero EXCLUYENDO las que ya están en activas
        # =====================================================
        ordenes_activas_ids = set([a['id_orden_trabajo'] for a in (asignaciones_activas.data or [])])
        
        asignaciones_visualizacion = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, tipo_asignacion') \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'visualizacion') \
            .execute()
        
        # Combinar todas las asignaciones (deduplicar por id_orden_trabajo)
        ordenes_unicas = {}
        
        # Primero agregar asignaciones activas (prioridad)
        for a in (asignaciones_activas.data or []):
            orden_id = a['id_orden_trabajo']
            if orden_id not in ordenes_unicas:
                ordenes_unicas[orden_id] = a['tipo_asignacion']
        
        # Luego agregar asignaciones de visualización (solo si no están ya activas)
        for a in (asignaciones_visualizacion.data or []):
            orden_id = a['id_orden_trabajo']
            if orden_id not in ordenes_unicas:
                ordenes_unicas[orden_id] = a['tipo_asignacion']
        
        if not ordenes_unicas:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        orden_ids = list(ordenes_unicas.keys())
        
        # =====================================================
        # Obtener órdenes (excluyendo estado 'Entregado')
        # =====================================================
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo, instrucciones_tecnico') \
            .in_('id', orden_ids) \
            .not_.eq('estado_global', 'Entregado') \
            .execute()
        
        if not ordenes.data:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        vehiculos_ids = [o['id_vehiculo'] for o in ordenes.data if o.get('id_vehiculo')]
        
        # Vehículos
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .in_('id', vehiculos_ids) \
            .execute()
        
        vehiculos_map = {v['id']: v for v in (vehiculos.data or [])}
        
        # Clientes
        clientes_ids = list(set([v.get('id_cliente') for v in vehiculos_map.values() if v.get('id_cliente')]))
        clientes_map = {}
        usuarios_ids = []
        
        if clientes_ids:
            clientes = supabase.table('cliente') \
                .select('id, id_usuario, email') \
                .in_('id', clientes_ids) \
                .execute()
            for c in (clientes.data or []):
                clientes_map[c['id']] = c
                if c.get('id_usuario'):
                    usuarios_ids.append(c['id_usuario'])
        
        usuarios_map = {}
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre, contacto, email') \
                .in_('id', usuarios_ids) \
                .execute()
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        # Obtener trabajos iniciados
        trabajos_iniciados = {}
        avances = supabase.table('avancetrabajo') \
            .select('id_orden_trabajo, tipo_avance') \
            .in_('id_orden_trabajo', orden_ids) \
            .execute()
        for av in (avances.data or []):
            trabajos_iniciados[av['id_orden_trabajo']] = True
        
        # Obtener diagnósticos
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('id_orden_trabajo, estado, version') \
            .in_('id_orden_trabajo', orden_ids) \
            .order('version', desc=True) \
            .execute()
        
        diagnostico_map = {}
        for diag in (diagnosticos.data or []):
            if diag['id_orden_trabajo'] not in diagnostico_map:
                diagnostico_map[diag['id_orden_trabajo']] = diag
        
        # Planificación (bahías)
        planificaciones = supabase.table('planificacion') \
            .select('id_orden_trabajo, bahia_asignada, fecha_hora_inicio_real') \
            .in_('id_orden_trabajo', orden_ids) \
            .execute()
        
        planificacion_map = {}
        for p in (planificaciones.data or []):
            planificacion_map[p['id_orden_trabajo']] = p
        
        # Instrucciones de armado
        instrucciones_armado = supabase.table('instrucciones_tecnico_historial') \
            .select('id_orden_trabajo, instrucciones, fecha_envio') \
            .in_('id_orden_trabajo', orden_ids) \
            .order('fecha_envio', desc=True) \
            .execute()
        
        instrucciones_map = {}
        for inst in (instrucciones_armado.data or []):
            if inst['id_orden_trabajo'] not in instrucciones_map:
                instrucciones_map[inst['id_orden_trabajo']] = inst
        
        # Obtener solicitudes de repuestos pendientes
        solicitudes_pendientes = {}
        solicitudes = supabase.table('solicitud_repuestos_tecnico') \
            .select('id_orden_trabajo, estado') \
            .in_('id_orden_trabajo', orden_ids) \
            .eq('estado', 'pendiente') \
            .execute()
        
        for sol in (solicitudes.data or []):
            if sol['id_orden_trabajo'] not in solicitudes_pendientes:
                solicitudes_pendientes[sol['id_orden_trabajo']] = 0
            solicitudes_pendientes[sol['id_orden_trabajo']] += 1
        
        # =====================================================
        # Construir respuesta (DEDUPLICADA por orden_id)
        # =====================================================
        vehiculos_resultado = []
        ordenes_procesadas = set()  # Para evitar duplicados
        
        for orden in ordenes.data:
            orden_id = orden['id']
            
            # Saltar si ya procesamos esta orden
            if orden_id in ordenes_procesadas:
                continue
            ordenes_procesadas.add(orden_id)
            
            # Obtener el tipo de asignación (priorizar activa sobre visualización)
            tipo_asignacion = ordenes_unicas.get(orden_id, 'diagnostico')
            
            vehiculo = vehiculos_map.get(orden['id_vehiculo'], {})
            cliente_info = clientes_map.get(vehiculo.get('id_cliente'), {})
            usuario_cliente = usuarios_map.get(cliente_info.get('id_usuario'), {})
            diagnostico_info = diagnostico_map.get(orden_id, {})
            planificacion_info = planificacion_map.get(orden_id, {})
            instruccion_info = instrucciones_map.get(orden_id, {})
            
            trabajo_iniciado = trabajos_iniciados.get(orden_id, False)
            estado_global = orden['estado_global']
            
            vehiculos_resultado.append({
                'orden_id': orden_id,
                'codigo_unico': orden.get('codigo_unico'),
                'fecha_ingreso': orden.get('fecha_ingreso'),
                'estado_global': estado_global,
                'tipo_asignacion': tipo_asignacion,
                'diagnostico_estado': diagnostico_info.get('estado'),
                'diagnostico_version': diagnostico_info.get('version', 1),
                'diagnostico_enviado': diagnostico_info.get('estado') is not None,
                'diagnostico_aprobado': diagnostico_info.get('estado') == 'aprobado',
                'diagnostico_rechazado': diagnostico_info.get('estado') == 'rechazado',
                'trabajo_iniciado': trabajo_iniciado,
                'bahia_asignada': planificacion_info.get('bahia_asignada'),
                'instrucciones_armado': instruccion_info.get('instrucciones'),
                'instrucciones_tecnico': orden.get('instrucciones_tecnico'),
                'solicitudes_repuestos_pendientes': solicitudes_pendientes.get(orden_id, 0) > 0,
                'vehiculo': {
                    'placa': vehiculo.get('placa', ''),
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'anio': vehiculo.get('anio'),
                    'kilometraje': vehiculo.get('kilometraje', 0)
                },
                'cliente': {
                    'nombre': usuario_cliente.get('nombre', 'No registrado'),
                    'contacto': usuario_cliente.get('contacto', 'No registrado'),
                    'email': usuario_cliente.get('email', '')
                }
            })
        
        logger.info(f"✅ {len(vehiculos_resultado)} vehículos únicos devueltos para técnico {tecnico_id}")
        
        return jsonify({'success': True, 'vehiculos': vehiculos_resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'success': False}), 500


# =====================================================
# API: COMUNICADOS
# =====================================================
@mis_vehiculos_bp.route('/comunicados', methods=['GET'])
@tecnico_required
def obtener_comunicados_tecnico(current_user):
    try:
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
        
        return jsonify({'success': True, 'data': comunicados}), 200
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@mis_vehiculos_bp.route('/comunicados/<int:id>', methods=['GET'])
@tecnico_required
def obtener_comunicado(current_user, id):
    try:
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('id', id) \
            .execute()
        
        if not resultado.data:
            return jsonify({'success': False, 'error': 'Comunicado no encontrado'}), 404
        
        comunicado = resultado.data[0]
        destinatarios = comunicado.get('destinatarios', [])
        
        if not isinstance(destinatarios, list) or 'tecnico' not in destinatarios:
            return jsonify({'success': False, 'error': 'No autorizado'}), 403
        
        return jsonify({
            'success': True,
            'data': {
                'id': comunicado['id'],
                'titulo': comunicado['titulo'],
                'contenido': comunicado['contenido'],
                'prioridad': comunicado.get('prioridad', 'normal'),
                'fecha_creacion': comunicado['fecha_creacion']
            }
        }), 200
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: EMPEZAR DIAGNÓSTICO
# =====================================================
@mis_vehiculos_bp.route('/empezar-diagnostico', methods=['POST'])
@tecnico_required
def empezar_diagnostico(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        tecnico_id = current_user['id']
        ahora = datetime.datetime.now().isoformat()
        
        # Verificar asignación
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'diagnostico') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes una asignación activa para esta orden'}), 403
        
        # Actualizar planificación
        planificacion = supabase.table('planificacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_inicio_real', 'null') \
            .execute()
        
        if planificacion.data:
            supabase.table('planificacion').update({
                'fecha_hora_inicio_real': ahora
            }).eq('id', planificacion.data[0]['id']).execute()
        
        # Registrar avance
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': tecnico_id,
            'descripcion': f"Diagnóstico iniciado por {current_user.get('nombre', 'Técnico')}",
            'tipo_avance': 'inicio_diagnostico',
            'fecha_hora': ahora
        }).execute()
        
        return jsonify({'success': True, 'message': 'Trabajo iniciado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: INICIAR REPARACIÓN
# =====================================================
@mis_vehiculos_bp.route('/iniciar-reparacion', methods=['POST'])
@tecnico_required
def iniciar_reparacion(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        tecnico_id = current_user['id']
        ahora = datetime.datetime.now().isoformat()
        
        # Verificar asignación
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'reparacion') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes una reparación activa para esta orden'}), 403
        
        # Cambiar estado de la orden
        supabase.table('ordentrabajo').update({
            'estado_global': 'EnReparacion'
        }).eq('id', id_orden).execute()
        
        # Actualizar planificación
        planificacion = supabase.table('planificacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_inicio_real', 'null') \
            .execute()
        
        if planificacion.data:
            supabase.table('planificacion').update({
                'fecha_hora_inicio_real': ahora
            }).eq('id', planificacion.data[0]['id']).execute()
        
        # Registrar avance
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': tecnico_id,
            'descripcion': f"Reparación iniciada por {current_user.get('nombre', 'Técnico')}",
            'tipo_avance': 'inicio_reparacion',
            'fecha_hora': ahora
        }).execute()
        
        return jsonify({'success': True, 'message': 'Reparación iniciada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: PAUSAR REPARACIÓN MANUAL
# =====================================================
@mis_vehiculos_bp.route('/pausar-reparacion-manual', methods=['POST'])
@tecnico_required
def pausar_reparacion_manual(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        motivo = data.get('motivo', '')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not motivo:
            return jsonify({'error': 'Debes especificar el motivo de la pausa'}), 400
        
        tecnico_id = current_user['id']
        ahora = datetime.datetime.now().isoformat()
        
        # Verificar que la orden está en reparación
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_actual.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden_actual.data[0]['estado_global'] != 'EnReparacion':
            return jsonify({'error': f'La orden no está en reparación. Estado actual: {orden_actual.data[0]["estado_global"]}'}), 400
        
        # Cambiar estado a EnPausa
        supabase.table('ordentrabajo').update({
            'estado_global': 'EnPausa'
        }).eq('id', id_orden).execute()
        
        # Guardar el motivo
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'EnPausa',
            'motivo_pausa': motivo,
            'fecha_hora_cambio': ahora,
            'notificaciones_enviadas': 1
        }).execute()
        
        # Registrar avance
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': tecnico_id,
            'descripcion': f"Reparación pausada manualmente. Motivo: {motivo[:200]}",
            'tipo_avance': 'pausa_manual',
            'fecha_hora': ahora
        }).execute()
        
        return jsonify({'success': True, 'message': 'Reparación pausada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: SOLICITAR REPUESTOS SIN PAUSA
# =====================================================
@mis_vehiculos_bp.route('/solicitar-repuestos-sin-pausa', methods=['POST'])
@tecnico_required
def solicitar_repuestos_sin_pausa(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        observaciones = data.get('observaciones', '')
        items = data.get('items', [])
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not items:
            return jsonify({'error': 'Debes agregar al menos un repuesto a solicitar'}), 400
        
        tecnico_id = current_user['id']
        ahora = datetime.datetime.now().isoformat()
        
        # Verificar que la orden está en reparación o pausa
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global, codigo_unico') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_actual.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden_actual.data[0]['estado_global']
        if estado_actual not in ['EnReparacion', 'EnPausa']:
            return jsonify({'error': f'No se pueden solicitar repuestos. Estado actual: {estado_actual}'}), 400
        
        # Validar items
        items_validos = []
        for item in items:
            if item.get('descripcion') and item.get('descripcion').strip():
                items_validos.append({
                    'descripcion': item['descripcion'].strip(),
                    'cantidad': item.get('cantidad', 1),
                    'detalle': item.get('detalle', '').strip()
                })
        
        if not items_validos:
            return jsonify({'error': 'Debes agregar al menos un repuesto válido'}), 400
        
        # Crear solicitud
        solicitud = {
            'id_orden_trabajo': id_orden,
            'id_tecnico': tecnico_id,
            'items': json.dumps(items_validos),
            'observaciones': observaciones,
            'estado': 'pendiente',
            'fecha_solicitud': ahora
        }
        
        result = supabase.table('solicitud_repuestos_tecnico').insert(solicitud).execute()
        
        if not result.data:
            return jsonify({'error': 'Error al crear la solicitud'}), 500
        
        # Registrar avance
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': tecnico_id,
            'descripcion': f"Solicitud de repuestos enviada. Items: {len(items_validos)} repuestos.",
            'tipo_avance': 'solicitud_repuestos',
            'fecha_hora': ahora
        }).execute()
        
        # Notificar al jefe de taller
        notificar_jefe_taller_solicitud(
            id_orden, 
            items_validos, 
            observaciones, 
            current_user.get('nombre', 'Técnico'),
            orden_actual.data[0].get('codigo_unico', str(id_orden)),
            result.data[0]['id']
        )
        
        return jsonify({
            'success': True, 
            'message': f'Solicitud de {len(items_validos)} repuesto(s) enviada correctamente. El trabajo continúa.',
            'solicitud_id': result.data[0]['id']
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def notificar_jefe_taller_solicitud(id_orden, items, observaciones, tecnico_nombre, codigo_orden, solicitud_id):
    try:
        jefes_result = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .eq('id_rol', 3) \
            .execute()
        
        jefes_ids = [j['id_usuario'] for j in (jefes_result.data or [])]
        
        if not jefes_ids:
            logger.warning("No se encontraron jefes de taller")
            return
        
        items_texto = "\n".join([f"- {item['descripcion']} x{item['cantidad']}" + (f" ({item['detalle']})" if item.get('detalle') else "") for item in items])
        
        mensaje = f"""📋 NUEVA SOLICITUD DE REPUESTOS

Técnico: {tecnico_nombre}
Orden: {codigo_orden}

Repuestos solicitados:
{items_texto}

Observaciones: {observaciones or 'Sin observaciones'}

⚠️ El técnico CONTINÚA trabajando mientras se gestionan los repuestos."""
        
        for jefe_id in jefes_ids:
            supabase.table('notificacion').insert({
                'id_usuario_destino': jefe_id,
                'tipo': 'solicitud_repuestos',
                'mensaje': mensaje,
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False,
                'id_referencia': solicitud_id
            }).execute()
        
        logger.info(f"Notificación enviada a {len(jefes_ids)} jefes")
        
    except Exception as e:
        logger.error(f"Error notificando: {str(e)}")


# =====================================================
# API: VERIFICAR SOLICITUDES PENDIENTES
# =====================================================
@mis_vehiculos_bp.route('/verificar-solicitudes-pendientes/<int:orden_id>', methods=['GET'])
@tecnico_required
def verificar_solicitudes_pendientes(current_user, orden_id):
    try:
        tecnico_id = current_user['id']
        
        # Verificar acceso
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', orden_id) \
            .eq('id_tecnico', tecnico_id) \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        # Contar solicitudes pendientes
        solicitudes = supabase.table('solicitud_repuestos_tecnico') \
            .select('id', 'estado', 'fecha_solicitud') \
            .eq('id_orden_trabajo', orden_id) \
            .eq('estado', 'pendiente') \
            .execute()
        
        cantidad_pendientes = len(solicitudes.data) if solicitudes.data else 0
        
        return jsonify({
            'success': True,
            'tiene_pendientes': cantidad_pendientes > 0,
            'cantidad': cantidad_pendientes,
            'solicitudes': solicitudes.data if solicitudes.data else []
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: REANUDAR REPARACIÓN
# =====================================================
@mis_vehiculos_bp.route('/reanudar-reparacion', methods=['POST'])
@tecnico_required
def reanudar_reparacion(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        tecnico_id = current_user['id']
        ahora = datetime.datetime.now().isoformat()
        
        # Verificar que la orden está en pausa
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_actual.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden_actual.data[0]['estado_global'] != 'EnPausa':
            return jsonify({'error': f'La orden no está en pausa. Estado actual: {orden_actual.data[0]["estado_global"]}'}), 400
        
        # Cambiar estado a EnReparacion
        supabase.table('ordentrabajo').update({
            'estado_global': 'EnReparacion'
        }).eq('id', id_orden).execute()
        
        # Registrar avance
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': tecnico_id,
            'descripcion': f"Reparación reanudada por {current_user.get('nombre', 'Técnico')}",
            'tipo_avance': 'reanudar_reparacion',
            'fecha_hora': ahora
        }).execute()
        
        return jsonify({'success': True, 'message': 'Reparación reanudada correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: FINALIZAR REPARACIÓN
# =====================================================
@mis_vehiculos_bp.route('/finalizar-reparacion', methods=['POST'])
@tecnico_required
def finalizar_reparacion(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        tecnico_id = current_user['id']
        ahora = datetime.datetime.now().isoformat()
        
        # Verificar que la orden está en reparación
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global, codigo_unico') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_actual.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden_actual.data[0]['estado_global'] != 'EnReparacion':
            return jsonify({'error': f'La orden no está en reparación. Estado actual: {orden_actual.data[0]["estado_global"]}'}), 400
        
        # Finalizar la asignación activa del técnico (reparacion)
        supabase.table('asignaciontecnico') \
            .update({'fecha_hora_final': ahora}) \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'reparacion') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        # Cambiar estado a ReparacionCompletada
        supabase.table('ordentrabajo').update({
            'estado_global': 'ReparacionCompletada'
        }).eq('id', id_orden).execute()
        
        # Crear asignación de visualización para que el técnico pueda seguir viendo la orden
        supabase.table('asignaciontecnico').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': tecnico_id,
            'tipo_asignacion': 'visualizacion',
            'fecha_hora_inicio': ahora
        }).execute()
        
        # Registrar avance
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': tecnico_id,
            'descripcion': f"Reparación completada por {current_user.get('nombre', 'Técnico')}",
            'tipo_avance': 'finalizar_reparacion',
            'fecha_hora': ahora
        }).execute()
        
        # Notificar al jefe de taller
        notificar_jefe_taller_reparacion_completada(
            id_orden,
            current_user.get('nombre', 'Técnico'),
            orden_actual.data[0].get('codigo_unico', str(id_orden))
        )
        
        return jsonify({
            'success': True,
            'message': 'Reparación marcada como completada. Se ha notificado al Jefe de Taller.',
            'nuevo_estado': 'ReparacionCompletada'
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def notificar_jefe_taller_reparacion_completada(id_orden, tecnico_nombre, codigo_orden):
    try:
        jefes_result = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .eq('id_rol', 3) \
            .execute()
        
        jefes_ids = [j['id_usuario'] for j in (jefes_result.data or [])]
        
        if not jefes_ids:
            return
        
        ahora = datetime.datetime.now().isoformat()
        
        for jefe_id in jefes_ids:
            try:
                supabase.table('notificacion').insert({
                    'id_usuario_destino': jefe_id,
                    'tipo': 'reparacion_completada',
                    'mensaje': f"✅ El técnico {tecnico_nombre} ha COMPLETADO la reparación de la orden #{codigo_orden}. Pendiente revisión final.",
                    'fecha_envio': ahora,
                    'leida': False
                }).execute()
            except Exception as e:
                logger.warning(f"Error insertando notificación: {e}")
        
        logger.info(f"Notificación de reparación completada enviada a {len(jefes_ids)} jefes")
        
    except Exception as e:
        logger.error(f"Error notificando: {str(e)}")


# =====================================================
# API: MARCAR ARMADO COMPLETADO
# =====================================================
@mis_vehiculos_bp.route('/marcar-armado-completado', methods=['POST'])
@tecnico_required
def marcar_armado_completado(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        tecnico_id = current_user['id']
        ahora = datetime.datetime.now().isoformat()
        
        orden_actual = supabase.table('ordentrabajo') \
            .select('estado_global, codigo_unico') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_actual.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        estado_actual = orden_actual.data[0]['estado_global']
        
        if estado_actual not in ['EnArmadoVehiculo', 'EnReparacion']:
            return jsonify({'error': f'La orden no está en estado válido para armado'}), 400
        
        # Finalizar asignación de armado activa
        supabase.table('asignaciontecnico') \
            .update({'fecha_hora_final': ahora}) \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', tecnico_id) \
            .eq('tipo_asignacion', 'armado') \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        # Cambiar estado a VehiculoArmado
        supabase.table('ordentrabajo').update({
            'estado_global': 'VehiculoArmado'
        }).eq('id', id_orden).execute()
        
        # Crear asignación de visualización
        supabase.table('asignaciontecnico').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': tecnico_id,
            'tipo_asignacion': 'visualizacion',
            'fecha_hora_inicio': ahora
        }).execute()
        
        # Liberar bahía
        planificacion = supabase.table('planificacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        if planificacion.data:
            supabase.table('planificacion').update({
                'fecha_hora_fin_real': ahora
            }).eq('id', planificacion.data[0]['id']).execute()
        
        # Registrar avance
        supabase.table('avancetrabajo').insert({
            'id_orden_trabajo': id_orden,
            'id_tecnico': tecnico_id,
            'descripcion': f"Armado completado por {current_user.get('nombre', 'Técnico')}",
            'tipo_avance': 'armado_completado',
            'fecha_hora': ahora,
            'estado_asociado': 'VehiculoArmado'
        }).execute()
        
        # Notificar al jefe de taller
        notificar_jefe_taller_armado_completado(
            id_orden, 
            current_user.get('nombre', 'Técnico'), 
            orden_actual.data[0].get('codigo_unico', str(id_orden))
        )
        
        return jsonify({
            'success': True,
            'message': 'Armado completado exitosamente. Se ha notificado al Jefe de Taller.',
            'nuevo_estado': 'VehiculoArmado'
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def notificar_jefe_taller_armado_completado(id_orden, tecnico_nombre, codigo_orden):
    try:
        jefes_result = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .eq('id_rol', 3) \
            .execute()
        
        jefes_ids = [j['id_usuario'] for j in (jefes_result.data or [])]
        
        if not jefes_ids:
            return
        
        for jefe_id in jefes_ids:
            supabase.table('notificacion').insert({
                'id_usuario_destino': jefe_id,
                'tipo': 'armado_completado',
                'mensaje': f"✅ El técnico {tecnico_nombre} ha completado el ARMADO del vehículo orden #{codigo_orden}. Vehículo listo para entrega.",
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False,
                'id_referencia': id_orden
            }).execute()
        
        logger.info(f"Notificación de armado enviada a {len(jefes_ids)} jefes")
        
    except Exception as e:
        logger.error(f"Error notificando: {str(e)}")


# =====================================================
# API: DETALLE DE ORDEN (CORREGIDO CON TODOS LOS DATOS)
# =====================================================
@mis_vehiculos_bp.route('/detalle-orden/<int:orden_id>', methods=['GET'])
@tecnico_required
def obtener_detalle_orden(current_user, orden_id):
    try:
        tecnico_id = current_user['id']
        
        # Verificar acceso
        asignacion = supabase.table('asignaciontecnico') \
            .select('tipo_asignacion') \
            .eq('id_orden_trabajo', orden_id) \
            .eq('id_tecnico', tecnico_id) \
            .execute()
        
        if not asignacion.data:
            return jsonify({'success': False, 'error': 'No tienes acceso a esta orden'}), 403
        
        tipo_asignacion = asignacion.data[0].get('tipo_asignacion', 'diagnostico')
        
        # =====================================================
        # Obtener TODOS los campos de la orden
        # =====================================================
        orden = supabase.table('ordentrabajo') \
            .select('*') \
            .eq('id', orden_id) \
            .execute()
        
        if not orden.data:
            return jsonify({'success': False, 'error': 'Orden no encontrada'}), 404
        
        orden_data = orden.data[0]
        
        # =====================================================
        # OBTENER VEHÍCULO COMPLETO (con año y kilometraje)
        # =====================================================
        vehiculo = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('id', orden_data.get('id_vehiculo')) \
            .execute()
        
        vehiculo_data = vehiculo.data[0] if vehiculo.data else {}
        
        # Obtener cliente
        cliente_info = {'nombre': 'No registrado', 'telefono': 'No registrado', 'email': 'No registrado'}
        
        if vehiculo_data.get('id_cliente'):
            cliente = supabase.table('cliente') \
                .select('id, id_usuario, email') \
                .eq('id', vehiculo_data['id_cliente']) \
                .execute()
            
            if cliente.data:
                cliente_data = cliente.data[0]
                cliente_info['email'] = cliente_data.get('email', 'No registrado')
                
                if cliente_data.get('id_usuario'):
                    usuario = supabase.table('usuario') \
                        .select('nombre, contacto') \
                        .eq('id', cliente_data['id_usuario']) \
                        .execute()
                    
                    if usuario.data:
                        cliente_info['nombre'] = usuario.data[0].get('nombre', 'No registrado')
                        cliente_info['telefono'] = usuario.data[0].get('contacto', 'No registrado')
        
        # =====================================================
        # OBTENER RECEPCIÓN (incluyendo audio del problema)
        # =====================================================
        recepcion = supabase.table('recepcion') \
            .select('transcripcion_problema, url_grabacion_problema, url_lateral_izquierda, url_lateral_derecha, url_foto_frontal, url_foto_trasera, url_foto_superior, url_foto_inferior, url_foto_tablero') \
            .eq('id_orden_trabajo', orden_id) \
            .execute()
        
        recepcion_data = recepcion.data[0] if recepcion.data else {}
        
        # Organizar fotos
        fotos = {}
        if recepcion_data:
            fotos = {
                'url_lateral_izquierda': recepcion_data.get('url_lateral_izquierda'),
                'url_lateral_derecha': recepcion_data.get('url_lateral_derecha'),
                'url_foto_frontal': recepcion_data.get('url_foto_frontal'),
                'url_foto_trasera': recepcion_data.get('url_foto_trasera'),
                'url_foto_superior': recepcion_data.get('url_foto_superior'),
                'url_foto_inferior': recepcion_data.get('url_foto_inferior'),
                'url_foto_tablero': recepcion_data.get('url_foto_tablero')
            }
        
        # =====================================================
        # OBTENER DIAGNÓSTICO DEL JEFE DE TALLER (con audio)
        # =====================================================
        diagnostico_taller = supabase.table('diagnostigoinicial') \
            .select('diagnostigo, url_grabacion') \
            .eq('id_orden_trabajo', orden_id) \
            .order('fecha_hora', desc=True) \
            .limit(1) \
            .execute()
        
        diagnostico_taller_data = diagnostico_taller.data[0] if diagnostico_taller.data else {}
        
        # Obtener diagnóstico técnico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('*') \
            .eq('id_orden_trabajo', orden_id) \
            .order('version', desc=True) \
            .limit(1) \
            .execute()
        
        diagnostico_data = diagnostico.data[0] if diagnostico.data else None
        
        # Obtener planificación
        planificacion = supabase.table('planificacion') \
            .select('*') \
            .eq('id_orden_trabajo', orden_id) \
            .execute()
        
        planificacion_data = planificacion.data[0] if planificacion.data else {}
        
        # Obtener instrucciones de armado
        instrucciones = supabase.table('instrucciones_tecnico_historial') \
            .select('instrucciones, fecha_envio') \
            .eq('id_orden_trabajo', orden_id) \
            .order('fecha_envio', desc=True) \
            .limit(1) \
            .execute()
        
        instrucciones_data = instrucciones.data[0] if instrucciones.data else {}
        
        # Obtener instrucciones pendientes de revisión
        instrucciones_pendientes = []
        try:
            instrucciones_no_leidas = supabase.table('instrucciones_tecnico_historial') \
                .select('id, instrucciones, fecha_envio, leida') \
                .eq('id_orden_trabajo', orden_id) \
                .eq('leida', False) \
                .order('fecha_envio', desc=True) \
                .execute()
            
            for inst in (instrucciones_no_leidas.data or []):
                instrucciones_pendientes.append({
                    'id': inst['id'],
                    'instrucciones': inst['instrucciones'],
                    'fecha_envio': inst['fecha_envio'],
                    'leida': inst.get('leida', False)
                })
            
            hace_24h = (datetime.datetime.now() - datetime.timedelta(days=1)).isoformat()
            instrucciones_recientes = supabase.table('instrucciones_tecnico_historial') \
                .select('id, instrucciones, fecha_envio, leida') \
                .eq('id_orden_trabajo', orden_id) \
                .gte('fecha_envio', hace_24h) \
                .order('fecha_envio', desc=True) \
                .execute()
            
            for inst in (instrucciones_recientes.data or []):
                if not any(p['id'] == inst['id'] for p in instrucciones_pendientes):
                    instrucciones_pendientes.append({
                        'id': inst['id'],
                        'instrucciones': inst['instrucciones'],
                        'fecha_envio': inst['fecha_envio'],
                        'leida': inst.get('leida', False)
                    })
        except Exception as e:
            logger.warning(f"Error obteniendo instrucciones pendientes: {e}")
        
        # Obtener solicitudes de repuestos pendientes
        solicitudes = supabase.table('solicitud_repuestos_tecnico') \
            .select('id, items, observaciones, fecha_solicitud, estado, respuesta, fecha_respuesta') \
            .eq('id_orden_trabajo', orden_id) \
            .in_('estado', ['pendiente', 'en_proceso']) \
            .execute()
        
        solicitudes_pendientes = []
        if solicitudes.data:
            for sol in solicitudes.data:
                try:
                    items_json = json.loads(sol['items']) if isinstance(sol['items'], str) else sol['items']
                except:
                    items_json = []
                solicitudes_pendientes.append({
                    'id': sol['id'],
                    'items': items_json,
                    'observaciones': sol.get('observaciones', ''),
                    'fecha_solicitud': sol.get('fecha_solicitud'),
                    'estado': sol.get('estado', 'pendiente'),
                    'respuesta': sol.get('respuesta', ''),
                    'fecha_respuesta': sol.get('fecha_respuesta')
                })
        
        # =====================================================
        # CONSTRUIR RESPUESTA COMPLETA
        # =====================================================
        return jsonify({
            'success': True,
            'detalle': {
                'orden': {
                    'id': orden_data['id'],
                    'codigo_unico': orden_data.get('codigo_unico', ''),
                    'fecha_ingreso': orden_data.get('fecha_ingreso'),
                    'estado_global': orden_data.get('estado_global', ''),
                    'instrucciones_tecnico': orden_data.get('instrucciones_tecnico', ''),
                    'instrucciones_armado': orden_data.get('instrucciones_armado', '')
                },
                'vehiculo': {
                    'placa': vehiculo_data.get('placa', ''),
                    'marca': vehiculo_data.get('marca', ''),
                    'modelo': vehiculo_data.get('modelo', ''),
                    'anio': vehiculo_data.get('anio'),
                    'kilometraje': vehiculo_data.get('kilometraje', 0)
                },
                'cliente': cliente_info,
                'recepcion': {
                    'transcripcion_problema': recepcion_data.get('transcripcion_problema', 'No hay descripción'),
                    'audio_url': recepcion_data.get('url_grabacion_problema', ''),  # Audio del problema
                    'fotos': fotos
                },
                'diagnostico_taller': {
                    'diagnostigo': diagnostico_taller_data.get('diagnostigo', ''),
                    'audio_url': diagnostico_taller_data.get('url_grabacion', '')  # Audio del diagnóstico
                },
                'diagnostico_tecnico': {
                    'informe': diagnostico_data.get('informe') if diagnostico_data else None,
                    'audio_url': diagnostico_data.get('url_grabacion_informe') if diagnostico_data else None,
                    'transcripcion': diagnostico_data.get('transcripcion_informe') if diagnostico_data else None,
                    'estado': diagnostico_data.get('estado') if diagnostico_data else None,
                    'version': diagnostico_data.get('version', 1) if diagnostico_data else None,
                    'fecha_envio': diagnostico_data.get('fecha_envio') if diagnostico_data else None
                } if diagnostico_data else None,
                'planificacion': {
                    'bahia_asignada': planificacion_data.get('bahia_asignada', ''),
                    'fecha_hora_inicio_estimado': planificacion_data.get('fecha_hora_inicio_estimado'),
                    'fecha_hora_fin_estimado': planificacion_data.get('fecha_hora_fin_estimado'),
                    'fecha_hora_inicio_real': planificacion_data.get('fecha_hora_inicio_real'),
                    'fecha_hora_fin_real': planificacion_data.get('fecha_hora_fin_real')
                },
                'tipo_asignacion': tipo_asignacion,
                'instrucciones_armado_historial': instrucciones_data.get('instrucciones'),
                'fecha_instrucciones': instrucciones_data.get('fecha_envio'),
                'instrucciones_pendientes': instrucciones_pendientes,
                'solicitudes_repuestos_pendientes': solicitudes_pendientes
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# API: HISTORIAL DE SOLICITUDES DE REPUESTOS
# =====================================================
@mis_vehiculos_bp.route('/historial-solicitudes/<int:orden_id>', methods=['GET'])
@tecnico_required
def obtener_historial_solicitudes(current_user, orden_id):
    try:
        tecnico_id = current_user['id']
        
        # Verificar acceso
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', orden_id) \
            .eq('id_tecnico', tecnico_id) \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        # Obtener información de la orden
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico, id_vehiculo, vehiculo!inner(marca, modelo, placa)') \
            .eq('id', orden_id) \
            .execute()
        
        codigo_orden = orden.data[0]['codigo_unico'] if orden.data else str(orden_id)
        vehiculo_info = orden.data[0].get('vehiculo', {}) if orden.data else {}
        vehiculo_texto = f"{vehiculo_info.get('marca', '')} {vehiculo_info.get('modelo', '')} ({vehiculo_info.get('placa', '')})".strip() or 'N/A'
        
        # Obtener solicitudes de repuestos del técnico
        solicitudes_tecnico = supabase.table('solicitud_repuestos_tecnico') \
            .select('*') \
            .eq('id_orden_trabajo', orden_id) \
            .eq('id_tecnico', tecnico_id) \
            .order('fecha_solicitud', desc=True) \
            .execute()
        
        # También obtener solicitudes de compra relacionadas
        solicitudes_compra = supabase.table('solicitud_compra') \
            .select('*') \
            .eq('id_orden_trabajo', orden_id) \
            .order('fecha_solicitud', desc=True) \
            .execute()
        
        # Combinar resultados
        resultado = []
        
        # Agregar solicitudes del técnico
        for s in (solicitudes_tecnico.data or []):
            items = s.get('items', [])
            if isinstance(items, str):
                try:
                    items = json.loads(items)
                except:
                    items = []
            
            resultado.append({
                'id': s.get('id'),
                'items': items,
                'observaciones': s.get('observaciones', ''),
                'estado': s.get('estado', 'pendiente'),
                'fecha_solicitud': s.get('fecha_solicitud'),
                'fecha_respuesta': s.get('fecha_respuesta'),
                'respuesta': s.get('respuesta', ''),
                'fecha_entrega': s.get('fecha_entrega'),
                'tipo': 'tecnico'
            })
        
        # Agregar solicitudes de compra
        for sc in (solicitudes_compra.data or []):
            items = sc.get('items', [])
            if isinstance(items, str):
                try:
                    items = json.loads(items)
                except:
                    items = []
            
            if sc.get('comprobante_url') or sc.get('estado') == 'entregado':
                resultado.append({
                    'id': sc.get('id'),
                    'items': items,
                    'observaciones': sc.get('mensaje_jefe_taller', ''),
                    'estado': sc.get('estado', 'pendiente'),
                    'fecha_solicitud': sc.get('fecha_solicitud'),
                    'fecha_respuesta': sc.get('fecha_respuesta'),
                    'respuesta': sc.get('respuesta_encargado', ''),
                    'fecha_entrega': sc.get('fecha_entrega'),
                    'comprobante_url': sc.get('comprobante_url'),
                    'numero_factura': sc.get('numero_factura'),
                    'proveedor_nombre': sc.get('proveedor_nombre'),
                    'tipo': 'compra'
                })
        
        # Ordenar por fecha descendente
        resultado.sort(key=lambda x: x.get('fecha_solicitud', ''), reverse=True)
        
        logger.info(f"📊 Historial para orden {orden_id}: {len(resultado)} solicitudes encontradas")
        
        return jsonify({
            'success': True,
            'codigo_orden': codigo_orden,
            'vehiculo': vehiculo_texto,
            'solicitudes': resultado
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: MARCAR INSTRUCCIÓN COMO LEÍDA
# =====================================================
@mis_vehiculos_bp.route('/marcar-instruccion-leida/<int:instruccion_id>', methods=['PUT'])
@tecnico_required
def marcar_instruccion_leida(current_user, instruccion_id):
    """Marcar una instrucción como leída por el técnico"""
    try:
        # Verificar que la instrucción pertenece a una orden del técnico
        instruccion = supabase.table('instrucciones_tecnico_historial') \
            .select('id_orden_trabajo') \
            .eq('id', instruccion_id) \
            .execute()
        
        if not instruccion.data:
            return jsonify({'error': 'Instrucción no encontrada'}), 404
        
        id_orden = instruccion.data[0]['id_orden_trabajo']
        
        # Verificar que el técnico tiene acceso a esta orden
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        # Marcar como leída
        supabase.table('instrucciones_tecnico_historial') \
            .update({
                'leida': True,
                'fecha_leida': datetime.datetime.now().isoformat()
            }) \
            .eq('id', instruccion_id) \
            .execute()
        
        return jsonify({'success': True, 'message': 'Instrucción marcada como leída'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500