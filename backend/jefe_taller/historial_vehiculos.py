# =====================================================
# HISTORIAL DE VEHÍCULOS - JEFE TALLER
# VERSIÓN CORREGIDA - CON DATOS DEL VEHÍCULO
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging

logger = logging.getLogger(__name__)

historial_vehiculos_bp = Blueprint('historial_vehiculos', __name__, url_prefix='/api/jefe-taller')

supabase = config.supabase


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


# =====================================================
# ENDPOINT: ÚLTIMAS 10 ÓRDENES (CORREGIDO)
# =====================================================

@historial_vehiculos_bp.route('/ultimas-ordenes', methods=['GET'])
@jefe_taller_required
def obtener_ultimas_ordenes(current_user):
    """Obtener las últimas 10 órdenes de trabajo con datos completos"""
    try:
        limite = request.args.get('limite', 10, type=int)
        if limite > 10:
            limite = 10
        
        logger.info(f"📋 Obteniendo últimas {limite} órdenes")
        
        # 1. Obtener órdenes
        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_vehiculo, id_jefe_operativo') \
            .order('fecha_ingreso', desc=True) \
            .limit(limite) \
            .execute()
        
        if not ordenes_result.data:
            return jsonify({
                'success': True, 
                'ordenes': [], 
                'resumen': {
                    'total': 0, 
                    'entregados': 0, 
                    'en_proceso': 0, 
                    'en_pausa': 0, 
                    'en_recepcion': 0
                }
            }), 200
        
        ordenes = ordenes_result.data
        
        # 2. Obtener TODOS los vehículos de una sola vez
        vehiculos_ids = list(set([o.get('id_vehiculo') for o in ordenes if o.get('id_vehiculo')]))
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
            logger.info(f"✅ Vehículos encontrados: {len(vehiculos_map)}")
        
        # 3. Obtener jefes operativos
        jefes_ids = list(set([o.get('id_jefe_operativo') for o in ordenes if o.get('id_jefe_operativo')]))
        jefes_map = {}
        if jefes_ids:
            jefes = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', jefes_ids) \
                .execute()
            for j in (jefes.data or []):
                jefes_map[j['id']] = j['nombre']
        
        # 4. Obtener diagnósticos iniciales
        ordenes_ids = [o['id'] for o in ordenes]
        diagnosticos_map = {}
        if ordenes_ids:
            diagnosticos = supabase.table('diagnostigoinicial') \
                .select('id_orden_trabajo, diagnostigo') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .execute()
            for d in (diagnosticos.data or []):
                diagnosticos_map[d['id_orden_trabajo']] = d.get('diagnostigo', '')[:100]
        
        # 5. Obtener técnicos asignados
        tecnicos_map = {}
        if ordenes_ids:
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo, id_tecnico') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .execute()
            
            # Obtener nombres de técnicos
            tecnicos_ids = list(set([a['id_tecnico'] for a in (asignaciones.data or []) if a.get('id_tecnico')]))
            tecnicos_nombres = {}
            if tecnicos_ids:
                tecnicos = supabase.table('usuario') \
                    .select('id, nombre') \
                    .in_('id', tecnicos_ids) \
                    .execute()
                for t in (tecnicos.data or []):
                    tecnicos_nombres[t['id']] = t['nombre']
            
            for a in (asignaciones.data or []):
                orden_id = a['id_orden_trabajo']
                tecnico_id = a['id_tecnico']
                if orden_id not in tecnicos_map:
                    tecnicos_map[orden_id] = []
                if tecnico_id in tecnicos_nombres:
                    tecnicos_map[orden_id].append({'nombre': tecnicos_nombres[tecnico_id]})
        
        # 6. Construir respuesta con los datos del vehículo
        ordenes_resultado = []
        for orden in ordenes:
            v = vehiculos_map.get(orden.get('id_vehiculo'), {})
            
            orden_data = {
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'fecha_salida': orden.get('fecha_salida'),
                # ✅ Datos del vehículo
                'placa': v.get('placa', 'N/A'),
                'marca': v.get('marca', ''),
                'modelo': v.get('modelo', ''),
                'vehiculo_info': f"{v.get('marca', '')} {v.get('modelo', '')} ({v.get('placa', 'N/A')})".strip(),
                'jefe_operativo_nombre': jefes_map.get(orden.get('id_jefe_operativo')),
                'tecnicos': tecnicos_map.get(orden['id'], []),
                'diagnostico_inicial': diagnosticos_map.get(orden['id'])
            }
            
            # Si no hay marca/modelo, solo mostrar placa
            if not orden_data['vehiculo_info'] or orden_data['vehiculo_info'] == '()':
                orden_data['vehiculo_info'] = v.get('placa', 'Vehículo sin datos')
            
            ordenes_resultado.append(orden_data)
        
        # Calcular resumen
        resumen = {
            'total': len(ordenes_resultado),
            'entregados': len([o for o in ordenes_resultado if o['estado_global'] in ['Entregado', 'Finalizado', 'ReparacionCompletada']]),
            'en_proceso': len([o for o in ordenes_resultado if o['estado_global'] in ['EnProceso', 'EnReparacion']]),
            'en_pausa': len([o for o in ordenes_resultado if o['estado_global'] == 'EnPausa']),
            'en_recepcion': len([o for o in ordenes_resultado if o['estado_global'] == 'EnRecepcion'])
        }
        
        logger.info(f"✅ Devolviendo {len(ordenes_resultado)} órdenes")
        
        return jsonify({
            'success': True,
            'ordenes': ordenes_resultado,
            'resumen': resumen
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo últimas órdenes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT: HISTORIAL POR PLACA
# =====================================================

@historial_vehiculos_bp.route('/historial-vehiculo', methods=['GET'])
@jefe_taller_required
def obtener_historial_vehiculo(current_user):
    """Obtener historial completo de un vehículo por placa"""
    try:
        placa = request.args.get('placa', '').upper().strip()
        fecha_desde = request.args.get('fecha_desde')
        fecha_hasta = request.args.get('fecha_hasta')
        estado = request.args.get('estado')
        
        if not placa:
            return jsonify({'error': 'Placa requerida'}), 400
        
        logger.info(f"🔍 Buscando vehículo con placa: {placa}")
        
        # 1. Buscar vehículo
        vehiculo_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('placa', placa) \
            .execute()
        
        if not vehiculo_result.data:
            return jsonify({'success': True, 'vehiculo': None, 'ordenes': [], 'resumen': {}}), 200
        
        vehiculo = vehiculo_result.data[0]
        
        # 2. Obtener cliente
        cliente_nombre = 'No registrado'
        cliente_telefono = 'No registrado'
        
        if vehiculo.get('id_cliente'):
            cliente_result = supabase.table('cliente') \
                .select('id_usuario') \
                .eq('id', vehiculo['id_cliente']) \
                .execute()
            
            if cliente_result.data and cliente_result.data[0].get('id_usuario'):
                id_usuario = cliente_result.data[0]['id_usuario']
                usuario_result = supabase.table('usuario') \
                    .select('nombre, contacto') \
                    .eq('id', id_usuario) \
                    .execute()
                if usuario_result.data:
                    cliente_nombre = usuario_result.data[0].get('nombre', 'No registrado')
                    cliente_telefono = usuario_result.data[0].get('contacto', 'No registrado')
        
        # 3. Obtener órdenes del vehículo
        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_jefe_operativo') \
            .eq('id_vehiculo', vehiculo['id']) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        if not ordenes_result.data:
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
        
        ordenes = ordenes_result.data
        ordenes_ids = [o['id'] for o in ordenes]
        
        # 4. Obtener jefes operativos
        jefes_ids = list(set([o.get('id_jefe_operativo') for o in ordenes if o.get('id_jefe_operativo')]))
        jefes_map = {}
        if jefes_ids:
            jefes = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', jefes_ids) \
                .execute()
            for j in (jefes.data or []):
                jefes_map[j['id']] = j['nombre']
        
        # 5. Obtener diagnósticos
        diagnosticos_map = {}
        if ordenes_ids:
            diagnosticos = supabase.table('diagnostigoinicial') \
                .select('id_orden_trabajo, diagnostigo') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .execute()
            for d in (diagnosticos.data or []):
                diagnosticos_map[d['id_orden_trabajo']] = d.get('diagnostigo')
        
        # 6. Obtener técnicos
        tecnicos_map = {}
        if ordenes_ids:
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo, id_tecnico') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .execute()
            
            tecnicos_ids = list(set([a['id_tecnico'] for a in (asignaciones.data or []) if a.get('id_tecnico')]))
            tecnicos_nombres = {}
            if tecnicos_ids:
                tecnicos = supabase.table('usuario') \
                    .select('id, nombre') \
                    .in_('id', tecnicos_ids) \
                    .execute()
                for t in (tecnicos.data or []):
                    tecnicos_nombres[t['id']] = t['nombre']
            
            for a in (asignaciones.data or []):
                orden_id = a['id_orden_trabajo']
                tecnico_id = a['id_tecnico']
                if orden_id not in tecnicos_map:
                    tecnicos_map[orden_id] = []
                if tecnico_id in tecnicos_nombres:
                    tecnicos_map[orden_id].append({'nombre': tecnicos_nombres[tecnico_id]})
        
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
                'diagnostico_inicial': diagnosticos_map.get(orden['id'])
            })
        
        # Aplicar filtros
        if fecha_desde:
            try:
                fecha_desde_dt = datetime.datetime.fromisoformat(fecha_desde).date()
                ordenes_resultado = [o for o in ordenes_resultado if datetime.datetime.fromisoformat(o['fecha_ingreso']).date() >= fecha_desde_dt]
            except:
                pass
        if fecha_hasta:
            try:
                fecha_hasta_dt = datetime.datetime.fromisoformat(fecha_hasta).date()
                ordenes_resultado = [o for o in ordenes_resultado if datetime.datetime.fromisoformat(o['fecha_ingreso']).date() <= fecha_hasta_dt]
            except:
                pass
        if estado:
            ordenes_resultado = [o for o in ordenes_resultado if o['estado_global'] == estado]
        
        resumen = {
            'total': len(ordenes_resultado),
            'entregados': len([o for o in ordenes_resultado if o['estado_global'] in ['Entregado', 'Finalizado', 'ReparacionCompletada']]),
            'en_proceso': len([o for o in ordenes_resultado if o['estado_global'] in ['EnProceso', 'EnReparacion']]),
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


# =====================================================
# ENDPOINT: DETALLE COMPLETO DE ORDEN
# =====================================================

@historial_vehiculos_bp.route('/detalle-completo-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_completo_orden(current_user, id_orden):
    """Obtener detalle COMPLETO de una orden"""
    try:
        logger.info(f"🔍 Obteniendo detalle completo de orden {id_orden}")
        
        # 1. Obtener orden básica
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_vehiculo, id_jefe_operativo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data[0]
        
        # 2. Obtener jefe operativo
        jefe_operativo_nombre = None
        if orden.get('id_jefe_operativo'):
            jefe_result = supabase.table('usuario') \
                .select('nombre') \
                .eq('id', orden['id_jefe_operativo']) \
                .execute()
            if jefe_result.data:
                jefe_operativo_nombre = jefe_result.data[0].get('nombre')
        
        # 3. Obtener vehículo
        vehiculo = {}
        if orden.get('id_vehiculo'):
            v_result = supabase.table('vehiculo') \
                .select('placa, marca, modelo, anio, kilometraje, id_cliente') \
                .eq('id', orden['id_vehiculo']) \
                .execute()
            if v_result.data:
                vehiculo = v_result.data[0]
        
        # 4. Obtener cliente
        cliente_nombre = 'No registrado'
        cliente_telefono = 'No registrado'
        
        if vehiculo.get('id_cliente'):
            cliente_result = supabase.table('cliente') \
                .select('id_usuario') \
                .eq('id', vehiculo['id_cliente']) \
                .execute()
            
            if cliente_result.data and cliente_result.data[0].get('id_usuario'):
                id_usuario = cliente_result.data[0]['id_usuario']
                usuario_result = supabase.table('usuario') \
                    .select('nombre, contacto') \
                    .eq('id', id_usuario) \
                    .execute()
                if usuario_result.data:
                    cliente_nombre = usuario_result.data[0].get('nombre', 'No registrado')
                    cliente_telefono = usuario_result.data[0].get('contacto', 'No registrado')
        
        # 5. Obtener recepción
        recepcion = supabase.table('recepcion') \
            .select('transcripcion_problema, url_grabacion_problema') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        recepcion_data = recepcion.data[0] if recepcion.data else {}
        
        # 6. Obtener diagnóstico inicial
        diagnostico_inicial = None
        diagnostico_result = supabase.table('diagnostigoinicial') \
            .select('diagnostigo') \
            .eq('id_orden_trabajo', id_orden) \
            .order('fecha_hora', desc=True) \
            .limit(1) \
            .execute()
        if diagnostico_result.data:
            diagnostico_inicial = diagnostico_result.data[0].get('diagnostigo')
        
        # 7. Obtener técnicos asignados
        tecnicos_asignados = []
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        if asignaciones.data:
            tecnicos_ids = list(set([a['id_tecnico'] for a in asignaciones.data]))
            if tecnicos_ids:
                tecnicos_result = supabase.table('usuario') \
                    .select('id, nombre') \
                    .in_('id', tecnicos_ids) \
                    .execute()
                tecnicos_nombres = {t['id']: t['nombre'] for t in (tecnicos_result.data or [])}
                for a in asignaciones.data:
                    if a['id_tecnico'] in tecnicos_nombres:
                        tecnicos_asignados.append({
                            'nombre': tecnicos_nombres[a['id_tecnico']]
                        })
        
        # 8. Obtener fotos de recepción
        fotos_recepcion = {}
        fotos_result = supabase.table('recepcion') \
            .select('url_lateral_izquierda, url_lateral_derecha, url_foto_frontal, url_foto_trasera, url_foto_superior, url_foto_inferior, url_foto_tablero') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        if fotos_result.data:
            r = fotos_result.data[0]
            for campo in ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 
                         'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero']:
                if r.get(campo):
                    fotos_recepcion[campo] = r[campo]
        
        # 9. Obtener servicios cotizados
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
        
        resultado = {
            'id': orden['id'],
            'codigo_unico': orden['codigo_unico'],
            'estado_global': orden['estado_global'],
            'fecha_ingreso': orden['fecha_ingreso'],
            'fecha_salida': orden.get('fecha_salida'),
            'jefe_operativo_nombre': jefe_operativo_nombre,
            'placa': vehiculo.get('placa', ''),
            'marca': vehiculo.get('marca', ''),
            'modelo': vehiculo.get('modelo', ''),
            'anio': vehiculo.get('anio'),
            'kilometraje': vehiculo.get('kilometraje'),
            'cliente_nombre': cliente_nombre,
            'cliente_telefono': cliente_telefono,
            'descripcion_problema': recepcion_data.get('transcripcion_problema', ''),
            'audio_recepcion': recepcion_data.get('url_grabacion_problema'),
            'fotos': fotos_recepcion,
            'diagnostico_inicial': diagnostico_inicial,
            'tecnicos_asignados': tecnicos_asignados,
            'servicios': servicios,
            'total': total
        }
        
        return jsonify({'success': True, 'detalle': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle completo de orden: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT: TEST
# =====================================================

@historial_vehiculos_bp.route('/test', methods=['GET'])
@jefe_taller_required
def test_endpoint(current_user):
    """Endpoint de prueba"""
    return jsonify({
        'success': True, 
        'message': 'Historial de vehículos funcionando correctamente',
        'user_id': current_user.get('id')
    }), 200