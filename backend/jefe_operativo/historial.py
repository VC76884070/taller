# =====================================================
# HISTORIAL DE VEHÍCULOS - JEFE OPERATIVO
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_operativo_historial_bp = Blueprint('jefe_operativo_historial', __name__, url_prefix='/api/jefe-operativo')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# DECORADOR PARA VERIFICAR TOKEN Y ROL (JEFE OPERATIVO)
# =====================================================
def jefe_operativo_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Token inválido'}), 401
        
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data['user']
            
            if current_user.get('rol') != 'jefe_operativo' and current_user.get('id_rol') != 2:
                logger.warning(f"Usuario {current_user.get('nombre')} intentó acceder sin permisos")
                return jsonify({'error': 'No autorizado para esta operación'}), 403
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated


# =====================================================
# ENDPOINTS - HISTORIAL DE VEHÍCULOS (JEFE OPERATIVO)
# =====================================================

@jefe_operativo_historial_bp.route('/historial-vehiculo', methods=['GET'])
@jefe_operativo_required
def obtener_historial_vehiculo(current_user):
    """Obtener historial completo de un vehículo por placa"""
    try:
        placa = request.args.get('placa', '').upper().strip()
        fecha_desde = request.args.get('fecha_desde')
        fecha_hasta = request.args.get('fecha_hasta')
        estado = request.args.get('estado')
        
        if not placa:
            return jsonify({'error': 'Placa requerida'}), 400
        
        # 1. Buscar vehículo
        vehiculo_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .ilike('placa', f'%{placa}%') \
            .execute()
        
        if not vehiculo_result.data:
            return jsonify({'success': True, 'vehiculo': None, 'ordenes': [], 'resumen': {}}), 200
        
        vehiculo = vehiculo_result.data[0]
        
        # 2. Obtener cliente
        cliente_nombre = 'No registrado'
        cliente_telefono = 'No registrado'
        if vehiculo.get('id_cliente'):
            cliente = supabase.table('cliente') \
                .select('id_usuario') \
                .eq('id', vehiculo['id_cliente']) \
                .execute()
            if cliente.data and cliente.data[0].get('id_usuario'):
                usuario = supabase.table('usuario') \
                    .select('nombre, contacto') \
                    .eq('id', cliente.data[0]['id_usuario']) \
                    .execute()
                if usuario.data:
                    cliente_nombre = usuario.data[0].get('nombre', 'No registrado')
                    cliente_telefono = usuario.data[0].get('contacto', 'No registrado')
        
        # 3. Obtener órdenes del vehículo
        query = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_jefe_operativo') \
            .eq('id_vehiculo', vehiculo['id']) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        if not query.data:
            return jsonify({
                'success': True,
                'vehiculo': {
                    'id': vehiculo['id'],
                    'placa': vehiculo['placa'],
                    'marca': vehiculo.get('marca', ''),
                    'modelo': vehiculo.get('modelo', ''),
                    'anio': vehiculo.get('anio'),
                    'kilometraje': vehiculo.get('kilometraje'),
                    'cliente_nombre': cliente_nombre,
                    'cliente_telefono': cliente_telefono
                },
                'ordenes': [],
                'resumen': {}
            }), 200
        
        ordenes = query.data
        ordenes_ids = [o['id'] for o in ordenes]
        jefes_ids = list(set([o['id_jefe_operativo'] for o in ordenes if o.get('id_jefe_operativo')]))
        
        # 4. Obtener jefes de una vez
        jefes_map = {}
        if jefes_ids:
            jefes = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', jefes_ids) \
                .execute()
            for j in (jefes.data or []):
                jefes_map[j['id']] = j['nombre']
        
        # 5. Obtener diagnósticos de una vez
        diagnosticos_map = {}
        diagnosticos = supabase.table('diagnostigoinicial') \
            .select('id_orden_trabajo, diagnostigo') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        for d in (diagnosticos.data or []):
            diagnosticos_map[d['id_orden_trabajo']] = d.get('diagnostigo')
        
        # 6. Obtener técnicos de una vez
        tecnicos_map = {}
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, id_tecnico') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        
        tecnicos_ids = list(set([a['id_tecnico'] for a in (asignaciones.data or [])]))
        tecnicos_nombres_map = {}
        if tecnicos_ids:
            tecnicos_nombres = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', tecnicos_ids) \
                .execute()
            for t in (tecnicos_nombres.data or []):
                tecnicos_nombres_map[t['id']] = t['nombre']
        
        for a in (asignaciones.data or []):
            if a['id_orden_trabajo'] not in tecnicos_map:
                tecnicos_map[a['id_orden_trabajo']] = []
            if a['id_tecnico'] in tecnicos_nombres_map:
                tecnicos_map[a['id_orden_trabajo']].append({
                    'nombre': tecnicos_nombres_map[a['id_tecnico']]
                })
        
        # 7. Construir respuesta
        ordenes_resultado = []
        for orden in ordenes:
            ordenes_resultado.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_salida': orden.get('fecha_salida'),
                'jefe_operativo_nombre': jefes_map.get(orden.get('id_jefe_operativo')),
                'tecnicos': tecnicos_map.get(orden['id'], []),
                'diagnostico_inicial': diagnosticos_map.get(orden['id']),
                'tiene_fotos': True
            })
        
        # Aplicar filtros de fecha y estado
        if fecha_desde:
            fecha_desde_dt = datetime.datetime.fromisoformat(fecha_desde).date()
            ordenes_resultado = [o for o in ordenes_resultado if datetime.datetime.fromisoformat(o['fecha_ingreso']).date() >= fecha_desde_dt]
        if fecha_hasta:
            fecha_hasta_dt = datetime.datetime.fromisoformat(fecha_hasta).date()
            ordenes_resultado = [o for o in ordenes_resultado if datetime.datetime.fromisoformat(o['fecha_ingreso']).date() <= fecha_hasta_dt]
        if estado:
            ordenes_resultado = [o for o in ordenes_resultado if o['estado_global'] == estado]
        
        resumen = {
            'total': len(ordenes_resultado),
            'entregados': len([o for o in ordenes_resultado if o['estado_global'] in ['Entregado', 'Finalizado']]),
            'en_proceso': len([o for o in ordenes_resultado if o['estado_global'] == 'EnProceso']),
            'en_pausa': len([o for o in ordenes_resultado if o['estado_global'] == 'EnPausa']),
            'en_recepcion': len([o for o in ordenes_resultado if o['estado_global'] == 'EnRecepcion'])
        }
        
        return jsonify({
            'success': True,
            'vehiculo': {
                'id': vehiculo['id'],
                'placa': vehiculo['placa'],
                'marca': vehiculo.get('marca', ''),
                'modelo': vehiculo.get('modelo', ''),
                'anio': vehiculo.get('anio'),
                'kilometraje': vehiculo.get('kilometraje'),
                'cliente_nombre': cliente_nombre,
                'cliente_telefono': cliente_telefono
            },
            'ordenes': ordenes_resultado,
            'resumen': resumen
        }), 200
        
    except Exception as e:
        logger.error(f"Error en historial de vehículo: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_historial_bp.route('/orden-fotos/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def obtener_fotos_orden(current_user, id_orden):
    """Obtener todas las fotos de una orden de trabajo"""
    try:
        logger.info(f"📸 Obteniendo fotos para orden {id_orden}")
        
        recepcion = supabase.table('recepcion') \
            .select('url_lateral_izquierda, url_lateral_derecha, url_foto_frontal, url_foto_trasera, url_foto_superior, url_foto_inferior, url_foto_tablero') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        fotos = []
        if recepcion.data:
            r = recepcion.data[0]
            campos = {
                'url_lateral_izquierda': 'Lateral Izquierdo',
                'url_lateral_derecha': 'Lateral Derecho',
                'url_foto_frontal': 'Frontal',
                'url_foto_trasera': 'Trasera',
                'url_foto_superior': 'Superior',
                'url_foto_inferior': 'Inferior',
                'url_foto_tablero': 'Tablero'
            }
            
            for campo, nombre in campos.items():
                if r.get(campo):
                    fotos.append({
                        'tipo': campo,
                        'nombre': nombre,
                        'url': r[campo]
                    })
        
        logger.info(f"✅ {len(fotos)} fotos encontradas para orden {id_orden}")
        
        return jsonify({'success': True, 'fotos': fotos}), 200
        
    except Exception as e:
        logger.error(f"❌ Error obteniendo fotos de orden: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_historial_bp.route('/ultimas-ordenes', methods=['GET'])
@jefe_operativo_required
def obtener_ultimas_ordenes(current_user):
    """Obtener las últimas órdenes de trabajo (optimizado)"""
    try:
        limite = request.args.get('limite', 10, type=int)
        
        query = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_vehiculo, id_jefe_operativo') \
            .order('fecha_ingreso', desc=True) \
            .limit(limite) \
            .execute()
        
        if not query.data:
            return jsonify({'success': True, 'ordenes': [], 'resumen': {}}), 200
        
        ordenes = query.data
        ordenes_ids = [o['id'] for o in ordenes]
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes if o.get('id_vehiculo')]))
        jefes_ids = list(set([o['id_jefe_operativo'] for o in ordenes if o.get('id_jefe_operativo')]))
        
        # Obtener vehículos
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        # Obtener jefes
        jefes_map = {}
        if jefes_ids:
            jefes = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', jefes_ids) \
                .execute()
            for j in (jefes.data or []):
                jefes_map[j['id']] = j['nombre']
        
        # Obtener diagnósticos
        diagnosticos_map = {}
        diagnosticos = supabase.table('diagnostigoinicial') \
            .select('id_orden_trabajo, diagnostigo') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        for d in (diagnosticos.data or []):
            diagnosticos_map[d['id_orden_trabajo']] = d.get('diagnostigo', '')[:100]
        
        # Obtener técnicos
        tecnicos_map = {}
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, id_tecnico') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        
        tecnicos_ids = list(set([a['id_tecnico'] for a in (asignaciones.data or [])]))
        tecnicos_nombres_map = {}
        if tecnicos_ids:
            tecnicos_nombres = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', tecnicos_ids) \
                .execute()
            for t in (tecnicos_nombres.data or []):
                tecnicos_nombres_map[t['id']] = t['nombre']
        
        for a in (asignaciones.data or []):
            orden_id = a['id_orden_trabajo']
            if orden_id not in tecnicos_map:
                tecnicos_map[orden_id] = []
            tecnico_id = a['id_tecnico']
            if tecnico_id in tecnicos_nombres_map:
                tecnicos_map[orden_id].append({
                    'nombre': tecnicos_nombres_map[tecnico_id]
                })
        
        ordenes_resultado = []
        for orden in ordenes:
            v = vehiculos_map.get(orden['id_vehiculo'], {})
            
            ordenes_resultado.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_salida': orden.get('fecha_salida'),
                'placa': v.get('placa', 'N/A'),
                'marca': v.get('marca', ''),
                'modelo': v.get('modelo', ''),
                'jefe_operativo_nombre': jefes_map.get(orden.get('id_jefe_operativo')),
                'tecnicos': tecnicos_map.get(orden['id'], []),
                'diagnostico_inicial': diagnosticos_map.get(orden['id']),
                'tiene_fotos': True
            })
        
        resumen = {
            'total': len(ordenes_resultado),
            'entregados': len([o for o in ordenes_resultado if o['estado_global'] in ['Entregado', 'Finalizado']]),
            'en_proceso': len([o for o in ordenes_resultado if o['estado_global'] == 'EnProceso']),
            'en_pausa': len([o for o in ordenes_resultado if o['estado_global'] == 'EnPausa']),
            'en_recepcion': len([o for o in ordenes_resultado if o['estado_global'] == 'EnRecepcion'])
        }
        
        return jsonify({
            'success': True,
            'ordenes': ordenes_resultado,
            'resumen': resumen,
            'es_ultimas': True
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo últimas órdenes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_historial_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def obtener_detalle_orden(current_user, id_orden):
    """Obtener detalle básico de una orden de trabajo"""
    try:
        logger.info(f"🔍 Obteniendo detalle de orden {id_orden}")
        
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data[0]
        
        # Obtener vehículo
        vehiculo = {}
        if orden.get('id_vehiculo'):
            v_result = supabase.table('vehiculo') \
                .select('placa, marca, modelo, anio, kilometraje, id_cliente') \
                .eq('id', orden['id_vehiculo']) \
                .execute()
            if v_result.data:
                vehiculo = v_result.data[0]
        
        # Obtener cliente
        cliente_nombre = 'No registrado'
        cliente_telefono = 'No registrado'
        if vehiculo.get('id_cliente'):
            cliente_result = supabase.table('cliente') \
                .select('id_usuario') \
                .eq('id', vehiculo['id_cliente']) \
                .execute()
            if cliente_result.data and cliente_result.data[0].get('id_usuario'):
                usuario_result = supabase.table('usuario') \
                    .select('nombre, contacto') \
                    .eq('id', cliente_result.data[0]['id_usuario']) \
                    .execute()
                if usuario_result.data:
                    cliente_nombre = usuario_result.data[0].get('nombre', 'No registrado')
                    cliente_telefono = usuario_result.data[0].get('contacto', 'No registrado')
        
        # Obtener recepción
        recepcion = supabase.table('recepcion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        recepcion_data = recepcion.data[0] if recepcion.data else {}
        
        # Obtener planificación
        planificacion = supabase.table('planificacion') \
            .select('bahia_asignada, horas_estimadas, fecha_hora_inicio_estimado, fecha_hora_fin_estimado') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        # Obtener técnicos asignados
        tecnicos = []
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        tecnicos_ids = [a['id_tecnico'] for a in (asignaciones.data or [])]
        if tecnicos_ids:
            tecnicos_nombres = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', tecnicos_ids) \
                .execute()
            tecnicos_nombres_map = {t['id']: t['nombre'] for t in (tecnicos_nombres.data or [])}
            
            for a in (asignaciones.data or []):
                if a['id_tecnico'] in tecnicos_nombres_map:
                    tecnicos.append({
                        'id': a['id_tecnico'],
                        'nombre': tecnicos_nombres_map[a['id_tecnico']]
                    })
        
        # Obtener diagnóstico inicial
        diagnostico_inicial = None
        diagnostico_result = supabase.table('diagnostigoinicial') \
            .select('diagnostigo') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_hora', desc=True) \
            .limit(1) \
            .execute()
        
        if diagnostico_result.data:
            diagnostico_inicial = diagnostico_result.data[0].get('diagnostigo')
        
        # Obtener fotos de recepción
        fotos = {}
        if recepcion_data:
            campos_fotos = [
                'url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal',
                'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'
            ]
            for campo in campos_fotos:
                if recepcion_data.get(campo):
                    fotos[campo] = recepcion_data.get(campo)
        
        resultado = {
            'id': orden['id'],
            'codigo_unico': orden['codigo_unico'],
            'estado_global': orden['estado_global'],
            'fecha_ingreso': orden['fecha_ingreso'],
            'fecha_salida': orden.get('fecha_salida'),
            'placa': vehiculo.get('placa', ''),
            'marca': vehiculo.get('marca', ''),
            'modelo': vehiculo.get('modelo', ''),
            'anio': vehiculo.get('anio'),
            'kilometraje': vehiculo.get('kilometraje'),
            'cliente': {
                'nombre': cliente_nombre,
                'telefono': cliente_telefono
            },
            'planificacion': planificacion.data[0] if planificacion.data else None,
            'tecnicos': tecnicos,
            'diagnostico_inicial': diagnostico_inicial,
            'transcripcion_problema': recepcion_data.get('transcripcion_problema', ''),
            'audio_url': recepcion_data.get('url_grabacion_problema'),
            'fotos': fotos
        }
        
        return jsonify({'success': True, 'detalle': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle de orden: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_historial_bp.route('/detalle-completo-orden/<int:id_orden>', methods=['GET'])
@jefe_operativo_required
def obtener_detalle_completo_orden(current_user, id_orden):
    """Obtener detalle COMPLETO de una orden incluyendo diagnósticos técnicos"""
    try:
        logger.info(f"🔍 Obteniendo detalle COMPLETO de orden {id_orden}")
        
        # =====================================================
        # 1. OBTENER ORDEN BÁSICA
        # =====================================================
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_vehiculo, id_jefe_operativo, id_jefe_operativo_2') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data[0]
        
        # =====================================================
        # 2. OBTENER JEFES OPERATIVOS
        # =====================================================
        jefe_operativo_nombre = None
        jefe_operativo_2_nombre = None
        
        if orden.get('id_jefe_operativo'):
            jefe_result = supabase.table('usuario') \
                .select('nombre, contacto') \
                .eq('id', orden['id_jefe_operativo']) \
                .execute()
            if jefe_result.data:
                jefe_operativo_nombre = jefe_result.data[0].get('nombre')
        
        if orden.get('id_jefe_operativo_2'):
            jefe2_result = supabase.table('usuario') \
                .select('nombre, contacto') \
                .eq('id', orden['id_jefe_operativo_2']) \
                .execute()
            if jefe2_result.data:
                jefe_operativo_2_nombre = jefe2_result.data[0].get('nombre')
        
        # =====================================================
        # 3. OBTENER VEHÍCULO
        # =====================================================
        vehiculo = {}
        if orden.get('id_vehiculo'):
            v_result = supabase.table('vehiculo') \
                .select('placa, marca, modelo, anio, kilometraje, id_cliente') \
                .eq('id', orden['id_vehiculo']) \
                .execute()
            if v_result.data:
                vehiculo = v_result.data[0]
        
        # =====================================================
        # 4. OBTENER CLIENTE (nombre, teléfono, ubicación) - CORREGIDO
        # =====================================================
        cliente_nombre = 'No registrado'
        cliente_telefono = 'No registrado'
        cliente_ubicacion = 'No registrada'
        
        if vehiculo.get('id_cliente'):
            # Primero obtener el id_usuario desde la tabla cliente
            cliente_result = supabase.table('cliente') \
                .select('id_usuario') \
                .eq('id', vehiculo['id_cliente']) \
                .execute()
            
            if cliente_result.data and cliente_result.data[0].get('id_usuario'):
                id_usuario = cliente_result.data[0]['id_usuario']
                
                # Luego obtener los datos del usuario (incluyendo ubicacion)
                usuario_result = supabase.table('usuario') \
                    .select('nombre, contacto, ubicacion') \
                    .eq('id', id_usuario) \
                    .execute()
                
                if usuario_result.data:
                    cliente_nombre = usuario_result.data[0].get('nombre', 'No registrado')
                    cliente_telefono = usuario_result.data[0].get('contacto', 'No registrado')
                    cliente_ubicacion = usuario_result.data[0].get('ubicacion', 'No registrada')
        
        # =====================================================
        # 5. OBTENER RECEPCIÓN (fotos, audio, descripción)
        # =====================================================
        recepcion = supabase.table('recepcion') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        recepcion_data = recepcion.data[0] if recepcion.data else {}
        
        # =====================================================
        # 6. OBTENER DIAGNÓSTICO INICIAL (Jefe de Taller)
        # =====================================================
        diagnostico_inicial_data = supabase.table('diagnostigoinicial') \
            .select('diagnostigo, url_grabacion, id_jefe_taller') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_hora', desc=True) \
            .limit(1) \
            .execute()
        
        diagnostico_inicial = None
        audio_diagnostico_inicial = None
        jefe_taller_nombre = None
        
        if diagnostico_inicial_data.data:
            diagnostico_inicial = diagnostico_inicial_data.data[0].get('diagnostigo')
            audio_diagnostico_inicial = diagnostico_inicial_data.data[0].get('url_grabacion')
            
            # Obtener nombre del Jefe de Taller
            id_jefe_taller = diagnostico_inicial_data.data[0].get('id_jefe_taller')
            if id_jefe_taller:
                jt_result = supabase.table('usuario') \
                    .select('nombre') \
                    .eq('id', id_jefe_taller) \
                    .execute()
                if jt_result.data:
                    jefe_taller_nombre = jt_result.data[0].get('nombre')
        
        # =====================================================
        # 7. OBTENER TÉCNICOS ASIGNADOS ACTUALMENTE
        # =====================================================
        tecnicos_asignados = []
        asignaciones_actuales = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if asignaciones_actuales.data:
            tecnicos_ids_actuales = [a['id_tecnico'] for a in asignaciones_actuales.data]
            if tecnicos_ids_actuales:
                tecnicos_nombres_result = supabase.table('usuario') \
                    .select('id, nombre') \
                    .in_('id', tecnicos_ids_actuales) \
                    .execute()
                for t in (tecnicos_nombres_result.data or []):
                    tecnicos_asignados.append({
                        'id': t['id'],
                        'nombre': t['nombre']
                    })
        
        # =====================================================
        # 8. OBTENER DIAGNÓSTICOS TÉCNICOS (Técnico)
        # =====================================================
        diagnosticos_tecnicos = []
        diagnosticos_tecnicos_data = supabase.table('diagnostico_tecnico') \
            .select('id, informe, url_grabacion_informe, transcripcion_informe, estado, version, fecha_envio, id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .order('version', desc=True) \
            .execute()
        
        if diagnosticos_tecnicos_data.data:
            # Obtener nombres de técnicos
            tecnicos_ids = list(set([dt['id_tecnico'] for dt in diagnosticos_tecnicos_data.data if dt.get('id_tecnico')]))
            tecnicos_nombres = {}
            if tecnicos_ids:
                tecnicos_result = supabase.table('usuario') \
                    .select('id, nombre') \
                    .in_('id', tecnicos_ids) \
                    .execute()
                for t in (tecnicos_result.data or []):
                    tecnicos_nombres[t['id']] = t['nombre']
            
            # Obtener fotos y observaciones para cada diagnóstico
            for dt in diagnosticos_tecnicos_data.data:
                # Obtener fotos del diagnóstico
                fotos_diagnostico = []
                fotos_result = supabase.table('foto_diagnostico') \
                    .select('url_foto, descripcion_tecnico') \
                    .eq('id_diagnostico_tecnico', dt['id']) \
                    .execute()
                if fotos_result.data:
                    fotos_diagnostico = fotos_result.data
                
                # Obtener observaciones del Jefe de Taller
                observaciones = None
                obs_result = supabase.table('observaciondiagnostico') \
                    .select('observacion, url_grabacion_observacion') \
                    .eq('id_diagnostico_tecnico', dt['id']) \
                    .order('fecha_hora', desc=True) \
                    .limit(1) \
                    .execute()
                if obs_result.data:
                    observaciones = obs_result.data[0].get('observacion')
                
                diagnosticos_tecnicos.append({
                    'id': dt['id'],
                    'informe': dt.get('informe', ''),
                    'url_grabacion_informe': dt.get('url_grabacion_informe'),
                    'transcripcion_informe': dt.get('transcripcion_informe'),
                    'estado': dt.get('estado', 'pendiente'),
                    'version': dt.get('version', 1),
                    'fecha_envio': dt.get('fecha_envio'),
                    'tecnico_nombre': tecnicos_nombres.get(dt.get('id_tecnico'), 'No registrado'),
                    'fotos': fotos_diagnostico,
                    'observaciones': observaciones
                })
        
        # =====================================================
        # 9. OBTENER SERVICIOS COTIZADOS
        # =====================================================
        servicios = []
        total = 0
        try:
            cotizacion_result = supabase.table('cotizacion') \
                .select('id') \
                .eq('id_orden_trabajo', id_orden) \
                .execute()
            
            if cotizacion_result.data:
                detalles_result = supabase.table('cotizaciondetalle') \
                    .select('servicio_descripcion, precio') \
                    .eq('id_cotizacion', cotizacion_result.data[0]['id']) \
                    .execute()
                
                for det in (detalles_result.data or []):
                    precio = float(det.get('precio', 0))
                    servicios.append({
                        'descripcion': det.get('servicio_descripcion', 'Servicio'),
                        'precio': precio
                    })
                    total += precio
        except Exception as e:
            logger.warning(f"Error obteniendo servicios: {e}")
        
        # =====================================================
        # 10. OBTENER FOTOS DE RECEPCIÓN
        # =====================================================
        fotos_recepcion = {}
        if recepcion_data:
            campos_fotos = [
                'url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal',
                'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero'
            ]
            for campo in campos_fotos:
                if recepcion_data.get(campo):
                    fotos_recepcion[campo] = recepcion_data.get(campo)
        
        # =====================================================
        # 11. OBTENER PLANIFICACIÓN
        # =====================================================
        planificacion = None
        planif_result = supabase.table('planificacion') \
            .select('bahia_asignada, horas_estimadas, fecha_hora_inicio_estimado, fecha_hora_fin_estimado') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        if planif_result.data:
            planificacion = planif_result.data[0]
        
        # =====================================================
        # 12. CONSTRUIR RESPUESTA COMPLETA
        # =====================================================
        resultado = {
            # Datos de la orden
            'id': orden['id'],
            'codigo_unico': orden['codigo_unico'],
            'estado_global': orden['estado_global'],
            'fecha_ingreso': orden['fecha_ingreso'],
            'fecha_salida': orden.get('fecha_salida'),
            
            # Jefes Operativos
            'jefe_operativo_nombre': jefe_operativo_nombre,
            'jefe_operativo_2_nombre': jefe_operativo_2_nombre,
            
            # Datos del vehículo
            'placa': vehiculo.get('placa', ''),
            'marca': vehiculo.get('marca', ''),
            'modelo': vehiculo.get('modelo', ''),
            'anio': vehiculo.get('anio'),
            'kilometraje': vehiculo.get('kilometraje'),
            
            # Datos del cliente
            'cliente_nombre': cliente_nombre,
            'cliente_telefono': cliente_telefono,
            'cliente_ubicacion': cliente_ubicacion,
            
            # Recepción
            'descripcion_problema': recepcion_data.get('transcripcion_problema', ''),
            'audio_recepcion': recepcion_data.get('url_grabacion_problema'),
            'fotos': fotos_recepcion,
            
            # Diagnóstico Inicial
            'diagnostico_inicial': diagnostico_inicial,
            'audio_diagnostico_inicial': audio_diagnostico_inicial,
            'jefe_taller_nombre': jefe_taller_nombre,
            
            # Técnicos asignados actualmente
            'tecnicos_asignados': tecnicos_asignados,
            
            # Diagnósticos Técnicos
            'diagnosticos_tecnicos': diagnosticos_tecnicos,
            
            # Servicios cotizados
            'servicios': servicios,
            'total': total,
            
            # Planificación
            'planificacion': planificacion
        }
        
        return jsonify({'success': True, 'detalle': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle completo de orden: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500