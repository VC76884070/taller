# =====================================================
# MIS VEHÍCULOS - TÉCNICO MECÁNICO
# CORREGIDO PARA MULTI-ROL CON VERIFICACIÓN POR NOMBRE
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify, render_template
from functools import wraps
from config import config
import jwt
import datetime
import logging

logger = logging.getLogger(__name__)

mis_vehiculos_bp = Blueprint('mis_vehiculos', __name__, url_prefix='/tecnico')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# FUNCIÓN AUXILIAR: OBTENER ROLES DEL USUARIO
# CORREGIDA - Usa la estructura real de la BD
# =====================================================
def obtener_roles_usuario(usuario_id):
    """Obtiene los nombres de los roles de un usuario"""
    try:
        # Paso 1: Obtener los rol_id de usuario_rol
        user_roles = supabase.table('usuario_rol') \
            .select('id_rol') \
            .eq('id_usuario', usuario_id) \
            .execute()
        
        if not user_roles.data:
            logger.info(f"Usuario {usuario_id} no tiene roles asignados")
            return []
        
        # Paso 2: Obtener los IDs de roles
        rol_ids = [ur['id_rol'] for ur in user_roles.data]
        
        # Paso 3: Obtener los nombres de los roles
        roles_data = supabase.table('rol') \
            .select('nombre_rol') \
            .in_('id', rol_ids) \
            .execute()
        
        roles = [r['nombre_rol'] for r in (roles_data.data or [])]
        
        logger.info(f"📋 Roles obtenidos para usuario {usuario_id}: {roles}")
        return roles
        
    except Exception as e:
        logger.error(f"Error obteniendo roles: {str(e)}")
        import traceback
        traceback.print_exc()
        return []


# =====================================================
# FUNCIÓN AUXILIAR: VERIFICAR TOKEN Y OBTENER USUARIO
# =====================================================
def verificar_token_y_usuario():
    """Verifica el token y retorna el usuario si es válido"""
    token = None
    
    # Buscar token en headers
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        try:
            token = auth_header.split(" ")[1]
        except IndexError:
            pass
    
    # Buscar token en cookies
    if not token:
        token = request.cookies.get('token')
    
    if not token:
        return None, "No autorizado", 401
    
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        current_user = data['user']
        
        # Obtener roles del usuario
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
# DECORADOR: VERIFICAR ROL TÉCNICO (por NOMBRE)
# =====================================================
def tecnico_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user, error, status = verificar_token_y_usuario()
        
        if error:
            return jsonify({'error': error}), status
        
        # Verificar que tenga rol de técnico (por NOMBRE)
        if 'tecnico' not in current_user.get('roles', []):
            logger.warning(f"Usuario {current_user.get('nombre')} no tiene rol de técnico")
            return jsonify({'error': 'No autorizado - Se requiere rol de Técnico'}), 403
        
        return f(current_user, *args, **kwargs)
    
    return decorated


# =====================================================
# RUTA PARA SERVIR EL HTML (SIN DECORADOR)
# =====================================================
@mis_vehiculos_bp.route('/mis-vehiculos')
def mis_vehiculos_page():
    """Servir la página de Mis Vehículos"""
    return render_template('../tecnico_mecanico/misvehiculos.html')


# =====================================================
# API: VERIFICAR TOKEN Y OBTENER USUARIO (para el JS)
# =====================================================
@mis_vehiculos_bp.route('/api/verify-token', methods=['GET'])
def verify_token():
    """Endpoint para que el JS verifique el usuario y sus roles"""
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
# API: OBTENER VEHÍCULOS ASIGNADOS
# =====================================================
@mis_vehiculos_bp.route('/api/mis-vehiculos', methods=['GET'])
@tecnico_required
def obtener_mis_vehiculos(current_user):
    try:
        tecnico_id = current_user['id']
        
        logger.info(f"🔧 Técnico {tecnico_id} consultando sus vehículos asignados")
        
        # 1. Obtener asignaciones activas del técnico
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, fecha_hora_inicio') \
            .eq('id_tecnico', tecnico_id) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignaciones.data:
            logger.info(f"Técnico {tecnico_id} no tiene asignaciones activas")
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        orden_ids = [a['id_orden_trabajo'] for a in asignaciones.data]
        asignacion_fechas = {a['id_orden_trabajo']: a['fecha_hora_inicio'] for a in asignaciones.data}
        
        # 2. Obtener órdenes de trabajo
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, estado_global, id_vehiculo') \
            .in_('id', orden_ids) \
            .in_('estado_global', ['EnProceso', 'EnPausa']) \
            .execute()
        
        if not ordenes.data:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        # 3. Obtener vehículos
        vehiculos_ids = [o['id_vehiculo'] for o in ordenes.data]
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .in_('id', vehiculos_ids) \
            .execute()
        vehiculos_map = {v['id']: v for v in (vehiculos.data or [])}
        
        # 4. Obtener clientes
        clientes_ids = list(set([v.get('id_cliente') for v in vehiculos_map.values() if v.get('id_cliente')]))
        clientes_map = {}
        usuarios_ids = []
        
        if clientes_ids:
            clientes = supabase.table('cliente') \
                .select('id, id_usuario') \
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
        
        # 5. Obtener recepciones
        recepciones = supabase.table('recepcion') \
            .select('id_orden_trabajo, transcripcion_problema, url_grabacion_problema') \
            .in_('id_orden_trabajo', orden_ids) \
            .execute()
        recepciones_map = {r['id_orden_trabajo']: r for r in (recepciones.data or [])}
        
        # 6. Obtener diagnósticos iniciales
        diagnosticos = supabase.table('diagnostigoinicial') \
            .select('id_orden_trabajo, diagnostigo, url_grabacion') \
            .in_('id_orden_trabajo', orden_ids) \
            .execute()
        diagnosticos_map = {d['id_orden_trabajo']: d for d in (diagnosticos.data or [])}
        
        # 7. Obtener pausas
        pausas = supabase.table('seguimientoorden') \
            .select('id_orden_trabajo, motivo_pausa, fecha_hora_cambio') \
            .in_('id_orden_trabajo', orden_ids) \
            .eq('estado', 'EnPausa') \
            .execute()
        pausas_map = {p['id_orden_trabajo']: p for p in (pausas.data or [])}
        
        # 8. Construir respuesta
        vehiculos_resultado = []
        for orden in ordenes.data:
            vehiculo = vehiculos_map.get(orden['id_vehiculo'], {})
            cliente_info = clientes_map.get(vehiculo.get('id_cliente'), {})
            usuario_cliente = usuarios_map.get(cliente_info.get('id_usuario'), {})
            
            vehiculos_resultado.append({
                'orden_id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_asignacion': asignacion_fechas.get(orden['id']),
                'estado_global': orden['estado_global'],
                'motivo_pausa': pausas_map.get(orden['id'], {}).get('motivo_pausa'),
                'fecha_pausa': pausas_map.get(orden['id'], {}).get('fecha_hora_cambio'),
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
                },
                'diagnostico_inicial': diagnosticos_map.get(orden['id'], {}).get('diagnostigo', ''),
                'diagnostico_audio_url': diagnosticos_map.get(orden['id'], {}).get('url_grabacion'),
                'recepcion': {
                    'transcripcion_problema': recepciones_map.get(orden['id'], {}).get('transcripcion_problema', ''),
                    'audio_url': recepciones_map.get(orden['id'], {}).get('url_grabacion_problema')
                }
            })
        
        logger.info(f"✅ Se encontraron {len(vehiculos_resultado)} vehículos")
        
        return jsonify({'success': True, 'vehiculos': vehiculos_resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo vehículos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: INICIAR TRABAJO (MARCAR BAHÍA COMO OCUPADA)
# =====================================================
@mis_vehiculos_bp.route('/api/iniciar-trabajo', methods=['POST'])
@tecnico_required
def iniciar_trabajo(current_user):
    """Inicia el trabajo en una orden, marcando la bahía como ocupada"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        bahia_asignada = data.get('bahia_asignada')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        if not bahia_asignada:
            return jsonify({'error': 'Número de bahía requerido'}), 400
        
        # Verificar que la orden está asignada al técnico
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes esta orden asignada'}), 403
        
        # Verificar estado actual
        orden = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        if orden.data['estado_global'] != 'EnProceso':
            return jsonify({'error': f'No se puede iniciar una orden en estado {orden.data["estado_global"]}'}), 400
        
        # Verificar si la bahía está disponible
        ahora = datetime.datetime.now()
        
        # Buscar si hay otra orden usando la misma bahía
        bahia_ocupada = supabase.table('planificacion') \
            .select('id_orden_trabajo, fecha_hora_inicio_real') \
            .eq('bahia_asignada', bahia_asignada) \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        if bahia_ocupada.data and len(bahia_ocupada.data) > 0:
            if bahia_ocupada.data[0]['id_orden_trabajo'] != id_orden:
                return jsonify({
                    'error': f'La bahía {bahia_asignada} ya está ocupada por otra orden',
                    'bahia_ocupada': True
                }), 409
        
        ahora_str = ahora.isoformat()
        
        # Buscar planificación existente
        planificacion = supabase.table('planificacion') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if planificacion.data:
            supabase.table('planificacion') \
                .update({
                    'fecha_hora_inicio_real': ahora_str,
                    'bahia_asignada': bahia_asignada
                }) \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
        else:
            supabase.table('planificacion').insert({
                'id_orden_trabajo': id_orden,
                'bahia_asignada': bahia_asignada,
                'fecha_hora_inicio_real': ahora_str,
                'horas_estimadas': 4.0
            }).execute()
        
        # Registrar en seguimiento
        supabase.table('seguimientoorden').insert({
            'id_orden_trabajo': id_orden,
            'estado': 'EnProceso',
            'fecha_hora_cambio': ahora_str,
            'notificaciones_enviadas': 0
        }).execute()
        
        logger.info(f"🔧 Orden {id_orden} iniciada en bahía {bahia_asignada}")
        
        return jsonify({
            'success': True,
            'message': f'Trabajo iniciado en bahía {bahia_asignada}',
            'fecha_inicio': ahora_str
        }), 200
        
    except Exception as e:
        logger.error(f"Error iniciando trabajo: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: VERIFICAR ESTADO DE BAHÍAS
# =====================================================
@mis_vehiculos_bp.route('/api/estado-bahias', methods=['GET'])
@tecnico_required
def estado_bahias(current_user):
    """Obtiene el estado actual de todas las bahías"""
    try:
        # Intentar usar la vista
        try:
            bahias = supabase.table('vista_bahias') \
                .select('*') \
                .execute()
            
            if bahias.data:
                return jsonify({'success': True, 'bahias': bahias.data}), 200
        except Exception:
            pass
        
        # Consulta manual
        planificaciones_activas = supabase.table('planificacion') \
            .select('id_orden_trabajo, bahia_asignada, fecha_hora_inicio_real') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        bahias_ocupadas = {}
        for p in (planificaciones_activas.data or []):
            if p.get('bahia_asignada') and p.get('fecha_hora_inicio_real'):
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


# =====================================================
# API: PAUSAR TRABAJO
# =====================================================
@mis_vehiculos_bp.route('/api/pausar-trabajo', methods=['POST'])
@tecnico_required
def pausar_trabajo(current_user):
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
        
        logger.info(f"⏸️ Orden {id_orden} en pausa: {motivo}")
        
        return jsonify({'success': True, 'message': 'Trabajo en pausa'}), 200
        
    except Exception as e:
        logger.error(f"Error pausando trabajo: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: REANUDAR TRABAJO
# =====================================================
@mis_vehiculos_bp.route('/api/reanudar-trabajo', methods=['POST'])
@tecnico_required
def reanudar_trabajo(current_user):
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
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
        
        logger.info(f"▶️ Orden {id_orden} reanudada")
        
        return jsonify({'success': True, 'message': 'Trabajo reanudado'}), 200
        
    except Exception as e:
        logger.error(f"Error reanudando trabajo: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: FINALIZAR TRABAJO (LIBERAR BAHÍA)
# =====================================================
@mis_vehiculos_bp.route('/api/finalizar-trabajo', methods=['POST'])
@tecnico_required
def finalizar_trabajo(current_user):
    """Finaliza el trabajo, liberando la bahía"""
    try:
        data = request.get_json()
        id_orden = data.get('id_orden')
        
        if not id_orden:
            return jsonify({'error': 'ID de orden requerido'}), 400
        
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes esta orden asignada'}), 403
        
        ahora = datetime.datetime.now().isoformat()
        
        supabase.table('asignaciontecnico') \
            .update({'fecha_hora_final': ahora}) \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        supabase.table('planificacion') \
            .update({'fecha_hora_fin_real': ahora}) \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'Finalizado', 'fecha_salida': ahora}) \
            .eq('id', id_orden) \
            .execute()
        
        logger.info(f"🏁 Orden {id_orden} finalizada - Bahía liberada")
        
        return jsonify({'success': True, 'message': 'Trabajo finalizado'}), 200
        
    except Exception as e:
        logger.error(f"Error finalizando trabajo: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# API: OBTENER DETALLE DE ORDEN
# =====================================================
@mis_vehiculos_bp.route('/api/detalle-orden/<int:id_orden>', methods=['GET'])
@tecnico_required
def detalle_orden(current_user, id_orden):
    try:
        logger.info(f"=== OBTENIENDO DETALLE ORDEN {id_orden} ===")
        
        asignacion = supabase.table('asignaciontecnico') \
            .select('id') \
            .eq('id_orden_trabajo', id_orden) \
            .eq('id_tecnico', current_user['id']) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignacion.data:
            return jsonify({'error': 'No tienes acceso a esta orden'}), 403
        
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, fecha_salida, estado_global, id_vehiculo') \
            .eq('id', id_orden) \
            .single() \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden_data = orden.data
        vehiculo_id = orden_data.get('id_vehiculo')
        
        vehiculo = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, color, id_cliente') \
            .eq('id', vehiculo_id) \
            .single() \
            .execute()
        
        vehiculo_data = vehiculo.data if vehiculo.data else {}
        cliente_id = vehiculo_data.get('id_cliente')
        
        cliente_info = {}
        if cliente_id:
            cliente = supabase.table('cliente') \
                .select('id, id_usuario, email, telefono') \
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
        
        diagnostico_inicial = supabase.table('diagnostigoinicial') \
            .select('diagnostigo, url_grabacion') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_hora', desc=True) \
            .limit(1) \
            .execute()
        
        diagnostico_data = diagnostico_inicial.data[0] if diagnostico_inicial.data else {}
        
        planificacion = supabase.table('planificacion') \
            .select('bahia_asignada, fecha_hora_inicio_real') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        planificacion_data = planificacion.data[0] if planificacion.data else {}
        
        recepcion = supabase.table('recepcion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        recepcion_data = recepcion.data[0] if recepcion.data else {}
        
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
                'vehiculo': {
                    'placa': vehiculo_data.get('placa', 'N/A'),
                    'marca': vehiculo_data.get('marca', 'No especificada'),
                    'modelo': vehiculo_data.get('modelo', 'No especificado'),
                    'anio': vehiculo_data.get('anio', 'N/A'),
                    'kilometraje': vehiculo_data.get('kilometraje', 0),
                    'color': vehiculo_data.get('color', 'No especificado')
                },
                'cliente': cliente_info,
                'orden': {
                    'codigo_unico': orden_data.get('codigo_unico', 'N/A'),
                    'fecha_ingreso': orden_data.get('fecha_ingreso'),
                    'estado_global': orden_data.get('estado_global', 'N/A')
                },
                'planificacion': {
                    'bahia_asignada': planificacion_data.get('bahia_asignada')
                },
                'diagnostico_inicial': diagnostico_data.get('diagnostigo', 'No hay instrucciones'),
                'diagnostico_audio_url': diagnostico_data.get('url_grabacion'),
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