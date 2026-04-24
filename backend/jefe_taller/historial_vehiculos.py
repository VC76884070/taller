# =====================================================
# HISTORIAL DE VEHÍCULOS - JEFE TALLER
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
from decorators import jefe_taller_required
import jwt
import datetime
import logging

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
historial_vehiculos_bp = Blueprint('historial_vehiculos', __name__, url_prefix='/api/jefe-taller')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def verificar_rol_usuario(usuario_id, rol_nombre):
    """Verificar si un usuario tiene un rol específico"""
    try:
        result = supabase.rpc('usuario_tiene_rol', {
            'p_usuario_id': usuario_id,
            'p_rol_nombre': rol_nombre
        }).execute()
        return result.data if result.data else False
    except Exception as e:
        logger.error(f"Error verificando rol: {e}")
        return False

def obtener_nombre_usuario(usuario_id):
    """Obtener nombre de usuario por ID"""
    try:
        if not usuario_id:
            return None
        result = supabase.table('usuario') \
            .select('nombre') \
            .eq('id', usuario_id) \
            .execute()
        if result.data:
            return result.data[0].get('nombre')
        return None
    except Exception as e:
        logger.error(f"Error obteniendo nombre de usuario: {e}")
        return None

def obtener_tecnicos_por_orden(orden_id):
    """Obtener técnicos asignados a una orden (SIN DUPLICADOS)"""
    try:
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', orden_id) \
            .execute()
        
        if not asignaciones.data:
            return []
        
        # Usar un set para evitar duplicados
        tecnicos_set = set()
        tecnicos = []
        
        for asignacion in asignaciones.data:
            tecnico_id = asignacion.get('id_tecnico')
            if tecnico_id and tecnico_id not in tecnicos_set:
                # Verificar que realmente tenga rol de técnico
                es_tecnico = verificar_rol_usuario(tecnico_id, 'tecnico')
                if es_tecnico:
                    nombre = obtener_nombre_usuario(tecnico_id)
                    if nombre:
                        tecnicos_set.add(tecnico_id)
                        tecnicos.append({'id': tecnico_id, 'nombre': nombre})
        
        return tecnicos
    except Exception as e:
        logger.error(f"Error obteniendo técnicos por orden: {e}")
        return []

def obtener_tecnicos_actuales_orden(orden_id):
    """Obtener técnicos actualmente asignados a una orden (SIN DUPLICADOS)"""
    try:
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', orden_id) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        if not asignaciones.data:
            return []
        
        # Usar un set para evitar duplicados
        tecnicos_set = set()
        tecnicos = []
        
        for asignacion in asignaciones.data:
            tecnico_id = asignacion.get('id_tecnico')
            if tecnico_id and tecnico_id not in tecnicos_set:
                es_tecnico = verificar_rol_usuario(tecnico_id, 'tecnico')
                if es_tecnico:
                    nombre = obtener_nombre_usuario(tecnico_id)
                    if nombre:
                        tecnicos_set.add(tecnico_id)
                        tecnicos.append({'id': tecnico_id, 'nombre': nombre})
        
        return tecnicos
    except Exception as e:
        logger.error(f"Error obteniendo técnicos actuales: {e}")
        return []


# =====================================================
# ENDPOINTS - HISTORIAL DE VEHÍCULOS
# =====================================================

@historial_vehiculos_bp.route('/historial-vehiculo', methods=['GET'])
@jefe_taller_required
def obtener_historial_vehiculo(current_user):
    """Obtener historial completo de un vehículo por placa (optimizado y SIN DUPLICADOS)"""
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
        
        # 4. Obtener jefes operativos (verificando rol)
        jefes_map = {}
        if jefes_ids:
            for jefe_id in jefes_ids:
                es_jefe_operativo = verificar_rol_usuario(jefe_id, 'jefe_operativo')
                if es_jefe_operativo:
                    nombre = obtener_nombre_usuario(jefe_id)
                    if nombre:
                        jefes_map[jefe_id] = nombre
        
        # 5. Obtener diagnósticos de una vez
        diagnosticos_map = {}
        diagnosticos = supabase.table('diagnostigoinicial') \
            .select('id_orden_trabajo, diagnostigo') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        for d in (diagnosticos.data or []):
            diagnosticos_map[d['id_orden_trabajo']] = d.get('diagnostigo')
        
        # 6. Obtener técnicos de una vez (SIN DUPLICADOS)
        tecnicos_map = {}
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, id_tecnico') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        
        # Procesar asignaciones para evitar duplicados
        for a in (asignaciones.data or []):
            orden_id = a['id_orden_trabajo']
            tecnico_id = a['id_tecnico']
            
            if orden_id not in tecnicos_map:
                tecnicos_map[orden_id] = {}
            
            # Verificar que el usuario tenga rol técnico y no esté duplicado
            if tecnico_id not in tecnicos_map[orden_id]:
                es_tecnico = verificar_rol_usuario(tecnico_id, 'tecnico')
                if es_tecnico:
                    nombre = obtener_nombre_usuario(tecnico_id)
                    if nombre:
                        tecnicos_map[orden_id][tecnico_id] = {'nombre': nombre}
        
        # Convertir el mapa a lista para cada orden
        tecnicos_lista_map = {}
        for orden_id, tecnicos_dict in tecnicos_map.items():
            tecnicos_lista_map[orden_id] = list(tecnicos_dict.values())
        
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
                'tecnicos': tecnicos_lista_map.get(orden['id'], []),
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
        return jsonify({'error': str(e)}), 500


@historial_vehiculos_bp.route('/orden-fotos/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_fotos_orden(current_user, id_orden):
    """Obtener todas las fotos de una orden de trabajo"""
    try:
        logger.info(f"📸 Obteniendo fotos para orden {id_orden}")
        
        recepcion = supabase.table('recepcion') \
            .select('''
                url_lateral_izquierda,
                url_lateral_derecha,
                url_foto_frontal,
                url_foto_trasera,
                url_foto_superior,
                url_foto_inferior,
                url_foto_tablero
            ''') \
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


@historial_vehiculos_bp.route('/ultimas-ordenes', methods=['GET'])
@jefe_taller_required
def obtener_ultimas_ordenes(current_user):
    """Obtener las últimas órdenes de trabajo (optimizado y SIN DUPLICADOS)"""
    try:
        limite = request.args.get('limite', 10, type=int)
        
        query = supabase.table('ordentrabajo') \
            .select('''
                id,
                codigo_unico,
                estado_global,
                fecha_ingreso,
                fecha_salida,
                id_vehiculo,
                id_jefe_operativo
            ''') \
            .order('fecha_ingreso', desc=True) \
            .limit(limite) \
            .execute()
        
        if not query.data:
            return jsonify({'success': True, 'ordenes': [], 'resumen': {}}), 200
        
        ordenes = query.data
        ordenes_ids = [o['id'] for o in ordenes]
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes if o.get('id_vehiculo')]))
        jefes_ids = list(set([o['id_jefe_operativo'] for o in ordenes if o.get('id_jefe_operativo')]))
        
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        # Obtener jefes operativos verificando rol
        jefes_map = {}
        if jefes_ids:
            for jefe_id in jefes_ids:
                es_jefe_operativo = verificar_rol_usuario(jefe_id, 'jefe_operativo')
                if es_jefe_operativo:
                    nombre = obtener_nombre_usuario(jefe_id)
                    if nombre:
                        jefes_map[jefe_id] = nombre
        
        diagnosticos_map = {}
        diagnosticos = supabase.table('diagnostigoinicial') \
            .select('id_orden_trabajo, diagnostigo') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        for d in (diagnosticos.data or []):
            diagnosticos_map[d['id_orden_trabajo']] = d.get('diagnostigo', '')[:100]
        
        # Obtener técnicos verificando rol (SIN DUPLICADOS)
        tecnicos_map = {}
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, id_tecnico') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()
        
        # Procesar asignaciones para evitar duplicados
        for a in (asignaciones.data or []):
            orden_id = a['id_orden_trabajo']
            tecnico_id = a['id_tecnico']
            
            if orden_id not in tecnicos_map:
                tecnicos_map[orden_id] = {}
            
            # Verificar que el usuario tenga rol técnico y no esté duplicado
            if tecnico_id not in tecnicos_map[orden_id]:
                es_tecnico = verificar_rol_usuario(tecnico_id, 'tecnico')
                if es_tecnico:
                    nombre = obtener_nombre_usuario(tecnico_id)
                    if nombre:
                        tecnicos_map[orden_id][tecnico_id] = {'nombre': nombre}
        
        # Convertir el mapa a lista para cada orden
        tecnicos_lista_map = {}
        for orden_id, tecnicos_dict in tecnicos_map.items():
            tecnicos_lista_map[orden_id] = list(tecnicos_dict.values())
        
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
                'tecnicos': tecnicos_lista_map.get(orden['id'], []),
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
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT: DETALLE COMPLETO CON DIAGNÓSTICOS TÉCNICOS
# =====================================================

@historial_vehiculos_bp.route('/detalle-completo-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
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
        # 2. OBTENER JEFES OPERATIVOS (verificando rol)
        # =====================================================
        jefe_operativo_nombre = None
        jefe_operativo_2_nombre = None
        
        if orden.get('id_jefe_operativo'):
            es_jefe_op = verificar_rol_usuario(orden['id_jefe_operativo'], 'jefe_operativo')
            if es_jefe_op:
                jefe_operativo_nombre = obtener_nombre_usuario(orden['id_jefe_operativo'])
        
        if orden.get('id_jefe_operativo_2'):
            es_jefe_op_2 = verificar_rol_usuario(orden['id_jefe_operativo_2'], 'jefe_operativo')
            if es_jefe_op_2:
                jefe_operativo_2_nombre = obtener_nombre_usuario(orden['id_jefe_operativo_2'])
        
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
        # 4. OBTENER CLIENTE (nombre, teléfono, ubicación)
        # =====================================================
        cliente_nombre = 'No registrado'
        cliente_telefono = 'No registrado'
        cliente_ubicacion = 'No registrada'
        
        if vehiculo.get('id_cliente'):
            cliente_result = supabase.table('cliente') \
                .select('id_usuario') \
                .eq('id', vehiculo['id_cliente']) \
                .execute()
            
            if cliente_result.data and cliente_result.data[0].get('id_usuario'):
                id_usuario = cliente_result.data[0]['id_usuario']
                
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
            
            id_jefe_taller = diagnostico_inicial_data.data[0].get('id_jefe_taller')
            if id_jefe_taller:
                es_jefe_taller = verificar_rol_usuario(id_jefe_taller, 'jefe_taller')
                if es_jefe_taller:
                    jefe_taller_nombre = obtener_nombre_usuario(id_jefe_taller)
        
        # =====================================================
        # 7. OBTENER TÉCNICOS ASIGNADOS ACTUALMENTE (SIN DUPLICADOS)
        # =====================================================
        tecnicos_asignados = obtener_tecnicos_actuales_orden(id_orden)
        
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
            for dt in diagnosticos_tecnicos_data.data:
                # Verificar que el técnico tenga rol técnico
                tecnico_nombre = None
                if dt.get('id_tecnico'):
                    es_tecnico = verificar_rol_usuario(dt['id_tecnico'], 'tecnico')
                    if es_tecnico:
                        tecnico_nombre = obtener_nombre_usuario(dt['id_tecnico'])
                
                fotos_diagnostico = []
                fotos_result = supabase.table('foto_diagnostico') \
                    .select('url_foto, descripcion_tecnico') \
                    .eq('id_diagnostico_tecnico', dt['id']) \
                    .execute()
                if fotos_result.data:
                    fotos_diagnostico = fotos_result.data
                
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
                    'tecnico_nombre': tecnico_nombre or 'No registrado',
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
            'id': orden['id'],
            'codigo_unico': orden['codigo_unico'],
            'estado_global': orden['estado_global'],
            'fecha_ingreso': orden['fecha_ingreso'],
            'fecha_salida': orden.get('fecha_salida'),
            'jefe_operativo_nombre': jefe_operativo_nombre,
            'jefe_operativo_2_nombre': jefe_operativo_2_nombre,
            'placa': vehiculo.get('placa', ''),
            'marca': vehiculo.get('marca', ''),
            'modelo': vehiculo.get('modelo', ''),
            'anio': vehiculo.get('anio'),
            'kilometraje': vehiculo.get('kilometraje'),
            'cliente_nombre': cliente_nombre,
            'cliente_telefono': cliente_telefono,
            'cliente_ubicacion': cliente_ubicacion,
            'descripcion_problema': recepcion_data.get('transcripcion_problema', ''),
            'audio_recepcion': recepcion_data.get('url_grabacion_problema'),
            'fotos': fotos_recepcion,
            'diagnostico_inicial': diagnostico_inicial,
            'audio_diagnostico_inicial': audio_diagnostico_inicial,
            'jefe_taller_nombre': jefe_taller_nombre,
            'tecnicos_asignados': tecnicos_asignados,
            'diagnosticos_tecnicos': diagnosticos_tecnicos,
            'servicios': servicios,
            'total': total,
            'planificacion': planificacion
        }
        
        # Incluir roles del usuario actual en la respuesta (opcional)
        roles_usuario_actual = supabase.rpc('usuario_obtener_roles', {
            'p_usuario_id': current_user['id']
        }).execute()
        resultado['usuario_actual_roles'] = roles_usuario_actual.data if roles_usuario_actual.data else []
        
        return jsonify({'success': True, 'detalle': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle completo de orden: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500