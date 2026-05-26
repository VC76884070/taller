# =====================================================
# CALENDARIO Y BAHÍAS - JEFE TALLER
# PLANIFICACIÓN OPERATIVA - COMPLETO CORREGIDO
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
calendario_bahias_bp = Blueprint('calendario_bahias', __name__, url_prefix='/api/jefe-taller')

# Configuración
supabase = config.supabase


# =====================================================
# ENDPOINT 1: ÓRDENES CON PLANIFICACIÓN (CALENDARIO)
# =====================================================

@calendario_bahias_bp.route('/ordenes-con-planificacion', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_con_planificacion(current_user):
    """Obtener órdenes de trabajo con planificación para el calendario"""
    try:
        logger.info("📅 Obteniendo órdenes con planificación")
        
        # Obtener todas las planificaciones activas
        planificaciones = supabase.table('planificacion') \
            .select('id_orden_trabajo, bahia_asignada, horas_estimadas, fecha_hora_inicio_estimado, fecha_hora_fin_estimado, fecha_hora_inicio_real, fecha_hora_fin_real') \
            .execute()
        
        if not planificaciones.data:
            logger.info("No hay planificaciones")
            return jsonify({'success': True, 'ordenes': []}), 200
        
        # Obtener IDs de órdenes
        ordenes_ids = list(set([p['id_orden_trabajo'] for p in planificaciones.data]))
        planificaciones_map = {p['id_orden_trabajo']: p for p in planificaciones.data}
        
        # Obtener órdenes
        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, id_vehiculo') \
            .in_('id', ordenes_ids) \
            .execute()
        
        if not ordenes_result.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes = ordenes_result.data
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes if o.get('id_vehiculo')]))
        
        # Obtener vehículos
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, anio, id_cliente') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        # Obtener clientes
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
        
        # Obtener usuarios (clientes)
        usuarios_map = {}
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre, contacto') \
                .in_('id', usuarios_ids) \
                .execute()
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        # Obtener técnicos asignados
        tecnicos_por_orden = {}
        if ordenes_ids:
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo, id_tecnico, tipo_asignacion') \
                .in_('id_orden_trabajo', ordenes_ids) \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            tecnicos_ids = list(set([a['id_tecnico'] for a in (asignaciones.data or [])]))
            tecnicos_nombres_map = {}
            
            if tecnicos_ids:
                tecnicos = supabase.table('usuario') \
                    .select('id, nombre') \
                    .in_('id', tecnicos_ids) \
                    .execute()
                for t in (tecnicos.data or []):
                    tecnicos_nombres_map[t['id']] = t['nombre']
            
            for a in (asignaciones.data or []):
                if a['id_orden_trabajo'] not in tecnicos_por_orden:
                    tecnicos_por_orden[a['id_orden_trabajo']] = []
                tecnicos_por_orden[a['id_orden_trabajo']].append({
                    'id': a['id_tecnico'],
                    'nombre': tecnicos_nombres_map.get(a['id_tecnico'], 'Desconocido'),
                    'tipo': a.get('tipo_asignacion', 'reparacion')
                })
        
        # Construir respuesta
        ordenes_data = []
        for orden in ordenes:
            v = vehiculos_map.get(orden['id_vehiculo'], {})
            cliente_info = clientes_map.get(v.get('id_cliente'), {})
            usuario_cliente = usuarios_map.get(cliente_info.get('id_usuario'), {})
            planif = planificaciones_map.get(orden['id'], {})
            
            ordenes_data.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'cliente_nombre': usuario_cliente.get('nombre', 'No registrado'),
                'placa': v.get('placa', ''),
                'marca': v.get('marca', ''),
                'modelo': v.get('modelo', ''),
                'anio': v.get('anio'),
                'bahia_asignada': planif.get('bahia_asignada'),
                'horas_estimadas': planif.get('horas_estimadas'),
                'fecha_hora_inicio_estimado': planif.get('fecha_hora_inicio_estimado'),
                'fecha_hora_fin_estimado': planif.get('fecha_hora_fin_estimado'),
                'fecha_hora_inicio_real': planif.get('fecha_hora_inicio_real'),
                'fecha_hora_fin_real': planif.get('fecha_hora_fin_real'),
                'tecnicos': tecnicos_por_orden.get(orden['id'], [])
            })
        
        logger.info(f"✅ {len(ordenes_data)} órdenes planificadas obtenidas")
        return jsonify({'success': True, 'ordenes': ordenes_data}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes planificadas: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': True, 'ordenes': []}), 500


# =====================================================
# ENDPOINT 2: ESTADO DE BAHÍAS
# =====================================================

@calendario_bahias_bp.route('/bahias', methods=['GET'])
@jefe_taller_required
def listar_estado_bahias(current_user):
    """Listar el estado actual de las 12 bahías del taller"""
    try:
        logger.info("🏭 Obteniendo estado de bahías")
        
        ahora = datetime.datetime.now()
        
        # Bahías OCUPADAS (con inicio_real y sin fin_real)
        planificaciones_ocupadas = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo, fecha_hora_inicio_real, horas_estimadas') \
            .not_.is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        # Bahías RESERVADAS (con planificación pero sin inicio_real)
        planificaciones_reservadas = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo, fecha_hora_inicio_estimado, horas_estimadas') \
            .is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        # Obtener códigos de orden
        todas_ordenes_ids = []
        for p in (planificaciones_ocupadas.data or []):
            todas_ordenes_ids.append(p['id_orden_trabajo'])
        for p in (planificaciones_reservadas.data or []):
            todas_ordenes_ids.append(p['id_orden_trabajo'])
        
        ordenes_info = {}
        if todas_ordenes_ids:
            ordenes = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, estado_global') \
                .in_('id', list(set(todas_ordenes_ids))) \
                .execute()
            for o in (ordenes.data or []):
                ordenes_info[o['id']] = {
                    'codigo': o['codigo_unico'],
                    'estado': o['estado_global']
                }
        
        # Mapear bahías ocupadas
        bahias_ocupadas = {}
        for p in (planificaciones_ocupadas.data or []):
            bahia_num = p.get('bahia_asignada')
            if bahia_num and p['id_orden_trabajo'] in ordenes_info:
                horas_transcurridas = None
                if p.get('fecha_hora_inicio_real'):
                    try:
                        inicio = datetime.datetime.fromisoformat(p['fecha_hora_inicio_real'].replace('Z', '+00:00'))
                        diff = ahora - inicio
                        horas_transcurridas = round(diff.total_seconds() / 3600, 1)
                    except Exception:
                        horas_transcurridas = None
                
                bahias_ocupadas[bahia_num] = {
                    'estado': 'ocupado',
                    'orden_codigo': ordenes_info[p['id_orden_trabajo']]['codigo'],
                    'orden_estado': ordenes_info[p['id_orden_trabajo']]['estado'],
                    'horas_estimadas': p.get('horas_estimadas'),
                    'horas_transcurridas': horas_transcurridas,
                    'fecha_inicio_real': p.get('fecha_hora_inicio_real')
                }
        
        # Mapear bahías reservadas
        bahias_reservadas = {}
        for p in (planificaciones_reservadas.data or []):
            bahia_num = p.get('bahia_asignada')
            if bahia_num and bahia_num not in bahias_ocupadas and p['id_orden_trabajo'] in ordenes_info:
                bahias_reservadas[bahia_num] = {
                    'estado': 'reservado',
                    'orden_codigo': ordenes_info[p['id_orden_trabajo']]['codigo'],
                    'orden_estado': ordenes_info[p['id_orden_trabajo']]['estado'],
                    'horas_estimadas': p.get('horas_estimadas'),
                    'fecha_inicio_estimado': p.get('fecha_hora_inicio_estimado')
                }
        
        # Generar lista de 12 bahías
        bahias = []
        for i in range(1, 13):
            if i in bahias_ocupadas:
                info = bahias_ocupadas[i]
                bahias.append({
                    'numero': i,
                    'estado': info['estado'],
                    'orden_codigo': info['orden_codigo'],
                    'orden_estado': info['orden_estado'],
                    'horas_estimadas': info.get('horas_estimadas'),
                    'horas_transcurridas': info.get('horas_transcurridas'),
                    'fecha_inicio_real': info.get('fecha_inicio_real')
                })
            elif i in bahias_reservadas:
                info = bahias_reservadas[i]
                bahias.append({
                    'numero': i,
                    'estado': info['estado'],
                    'orden_codigo': info['orden_codigo'],
                    'orden_estado': info['orden_estado'],
                    'horas_estimadas': info.get('horas_estimadas'),
                    'fecha_inicio_estimado': info.get('fecha_inicio_estimado')
                })
            else:
                bahias.append({
                    'numero': i,
                    'estado': 'libre',
                    'orden_codigo': None,
                    'orden_estado': None,
                    'horas_estimadas': None,
                    'horas_transcurridas': None
                })
        
        ocupadas_count = len([b for b in bahias if b['estado'] == 'ocupado'])
        reservadas_count = len([b for b in bahias if b['estado'] == 'reservado'])
        
        logger.info(f"✅ Bahías: {ocupadas_count}/12 ocupadas, {reservadas_count} reservadas")
        
        return jsonify({
            'success': True,
            'bahias': bahias,
            'resumen': {
                'total': 12,
                'ocupadas': ocupadas_count,
                'reservadas': reservadas_count,
                'libres': 12 - ocupadas_count - reservadas_count
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error listando estado de bahías: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': True, 'bahias': []}), 500


# =====================================================
# ENDPOINT 3: ESTADÍSTICAS DE ÓRDENES
# =====================================================

@calendario_bahias_bp.route('/estadisticas-ordenes', methods=['GET'])
@jefe_taller_required
def obtener_estadisticas_ordenes(current_user):
    """Obtener estadísticas generales de órdenes de trabajo"""
    try:
        logger.info("📊 Obteniendo estadísticas de órdenes")
        
        # Obtener todas las órdenes
        ordenes = supabase.table('ordentrabajo') \
            .select('estado_global') \
            .execute()
        
        stats = {
            'total': 0,
            'enProceso': 0,
            'enPausa': 0,
            'enRecepcion': 0,
            'pendienteAprobacion': 0,
            'finalizadas': 0,
            'entregadas': 0
        }
        
        for orden in (ordenes.data or []):
            estado = orden.get('estado_global', '')
            stats['total'] += 1
            
            if estado == 'EnProceso':
                stats['enProceso'] += 1
            elif estado == 'EnPausa':
                stats['enPausa'] += 1
            elif estado == 'EnRecepcion':
                stats['enRecepcion'] += 1
            elif estado == 'PendienteAprobacion':
                stats['pendienteAprobacion'] += 1
            elif estado == 'Finalizado':
                stats['finalizadas'] += 1
            elif estado == 'Entregado':
                stats['entregadas'] += 1
        
        logger.info(f"✅ Estadísticas: Total={stats['total']}, Proceso={stats['enProceso']}")
        
        return jsonify(stats), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'total': 0, 'enProceso': 0, 'enPausa': 0, 'enRecepcion': 0, 'pendienteAprobacion': 0, 'finalizadas': 0, 'entregadas': 0}), 500


# =====================================================
# ENDPOINT 4: ESTADÍSTICAS DE DIAGNÓSTICOS
# =====================================================

@calendario_bahias_bp.route('/diagnosticos-stats', methods=['GET'])
@jefe_taller_required
def obtener_estadisticas_diagnosticos(current_user):
    """Obtener estadísticas de diagnósticos técnicos"""
    try:
        logger.info("📊 Obteniendo estadísticas de diagnósticos")
        
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('estado') \
            .execute()
        
        stats = {
            'pendiente': 0,
            'aprobado': 0,
            'rechazado': 0,
            'borrador': 0
        }
        
        for diag in (diagnosticos.data or []):
            estado = diag.get('estado', '')
            if estado == 'pendiente':
                stats['pendiente'] += 1
            elif estado == 'aprobado':
                stats['aprobado'] += 1
            elif estado == 'rechazado':
                stats['rechazado'] += 1
            elif estado == 'borrador':
                stats['borrador'] += 1
        
        logger.info(f"✅ Diagnósticos: Pendientes={stats['pendiente']}, Aprobados={stats['aprobado']}")
        
        return jsonify({'success': True, 'stats': stats}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas de diagnósticos: {str(e)}")
        return jsonify({'success': True, 'stats': {'pendiente': 0, 'aprobado': 0, 'rechazado': 0, 'borrador': 0}}), 500


# =====================================================
# ENDPOINT 5: CARGA DE TÉCNICOS
# =====================================================

@calendario_bahias_bp.route('/tecnicos-carga', methods=['GET'])
@jefe_taller_required
def obtener_carga_tecnicos(current_user):
    """Obtener la carga de trabajo actual de cada técnico"""
    try:
        logger.info("👥 Obteniendo carga de técnicos")
        
        MAX_ORDENES_POR_TECNICO = 2
        
        # Obtener usuarios con rol de técnico
        usuarios_rol = supabase.table('usuario_rol') \
            .select('id_usuario') \
            .eq('id_rol', 4) \
            .execute()
        
        if not usuarios_rol.data:
            logger.info("No hay técnicos registrados")
            return jsonify({'success': True, 'tecnicos': []}), 200
        
        tecnicos_ids = [ur['id_usuario'] for ur in usuarios_rol.data]
        
        # Obtener datos de los técnicos
        resultado = supabase.table('usuario') \
            .select('id, nombre, contacto, email') \
            .in_('id', tecnicos_ids) \
            .execute()
        
        tecnicos = []
        for tecnico in (resultado.data or []):
            # Contar asignaciones activas
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo') \
                .eq('id_tecnico', tecnico['id']) \
                .is_('fecha_hora_final', 'null') \
                .execute()
            
            ordenes_activas = len(asignaciones.data) if asignaciones.data else 0
            
            tecnicos.append({
                'id': tecnico['id'],
                'nombre': tecnico['nombre'],
                'contacto': tecnico.get('contacto', ''),
                'email': tecnico.get('email', ''),
                'ordenes_activas': ordenes_activas,
                'max_vehiculos': MAX_ORDENES_POR_TECNICO
            })
        
        tecnicos.sort(key=lambda x: x['ordenes_activas'], reverse=True)
        
        logger.info(f"✅ {len(tecnicos)} técnicos encontrados")
        
        return jsonify({'success': True, 'tecnicos': tecnicos}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo carga de técnicos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': True, 'tecnicos': []}), 500


# =====================================================
# ENDPOINT 6: EVOLUCIÓN MENSUAL (GRÁFICO)
# =====================================================

@calendario_bahias_bp.route('/evolucion-mensual', methods=['GET'])
@jefe_taller_required
def obtener_evolucion_mensual(current_user):
    """Obtener evolución de órdenes por mes (últimos 6 meses)"""
    try:
        logger.info("📈 Obteniendo evolución mensual")
        
        from datetime import datetime, timedelta
        
        ahora = datetime.now()
        meses_nombres = []
        datos_mensuales = []
        
        for i in range(5, -1, -1):
            # Calcular fecha inicio del mes
            fecha_inicio = datetime(ahora.year, ahora.month, 1) - timedelta(days=30 * i)
            fecha_inicio = datetime(fecha_inicio.year, fecha_inicio.month, 1)
            
            # Calcular fecha fin del mes
            if fecha_inicio.month == 12:
                fecha_fin = datetime(fecha_inicio.year + 1, 1, 1)
            else:
                fecha_fin = datetime(fecha_inicio.year, fecha_inicio.month + 1, 1)
            
            meses_nombres.append(fecha_inicio.strftime('%b'))
            
            # Contar órdenes en ese mes
            count = supabase.table('ordentrabajo') \
                .select('id', count='exact') \
                .gte('fecha_ingreso', fecha_inicio.isoformat()) \
                .lt('fecha_ingreso', fecha_fin.isoformat()) \
                .execute()
            
            cantidad = count.count if hasattr(count, 'count') else len(count.data or [])
            datos_mensuales.append(cantidad)
        
        logger.info(f"✅ Evolución mensual: {meses_nombres} = {datos_mensuales}")
        
        return jsonify({
            'success': True,
            'labels': meses_nombres,
            'datos': datos_mensuales
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo evolución mensual: {str(e)}")
        return jsonify({'success': False, 'labels': ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'], 'datos': [0, 0, 0, 0, 0, 0]}), 500


# =====================================================
# ENDPOINT 7: DETALLE DE ORDEN
# =====================================================

@calendario_bahias_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_orden(current_user, id_orden):
    """Obtener detalle completo de una orden de trabajo"""
    try:
        logger.info(f"🔍 Obteniendo detalle de orden {id_orden}")
        
        # Obtener orden
        orden_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_vehiculo') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data[0]
        
        # Obtener vehículo
        vehiculo_result = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio, kilometraje, id_cliente') \
            .eq('id', orden['id_vehiculo']) \
            .execute()
        
        vehiculo = vehiculo_result.data[0] if vehiculo_result.data else {}
        
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
        
        # Obtener planificación
        planificacion = supabase.table('planificacion') \
            .select('bahia_asignada, horas_estimadas, fecha_hora_inicio_estimado, fecha_hora_fin_estimado, fecha_hora_inicio_real, fecha_hora_fin_real') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        planificacion_data = planificacion.data[0] if planificacion.data else {}
        
        # Obtener técnicos asignados
        tecnicos = []
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico, tipo_asignacion') \
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
                tecnicos.append({
                    'id': a['id_tecnico'],
                    'nombre': tecnicos_nombres_map.get(a['id_tecnico'], 'Desconocido'),
                    'tipo': a.get('tipo_asignacion', 'reparacion')
                })
        
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
            'planificacion': {
                'bahia_asignada': planificacion_data.get('bahia_asignada'),
                'horas_estimadas': planificacion_data.get('horas_estimadas'),
                'fecha_hora_inicio_estimado': planificacion_data.get('fecha_hora_inicio_estimado'),
                'fecha_hora_fin_estimado': planificacion_data.get('fecha_hora_fin_estimado'),
                'fecha_hora_inicio_real': planificacion_data.get('fecha_hora_inicio_real'),
                'fecha_hora_fin_real': planificacion_data.get('fecha_hora_fin_real')
            },
            'tecnicos': tecnicos
        }
        
        return jsonify({'success': True, 'detalle': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle de orden: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
