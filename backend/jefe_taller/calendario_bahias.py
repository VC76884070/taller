# =====================================================
# CALENDARIO Y BAHÍAS - JEFE TALLER
# PLANIFICACIÓN OPERATIVA
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required  # <-- IMPORTAR EL DECORADOR
import datetime
import logging

# Configurar logging
logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
calendario_bahias_bp = Blueprint('calendario_bahias', __name__, url_prefix='/api/jefe-taller')

# Configuración desde config.py
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# ENDPOINTS - CALENDARIO Y BAHÍAS
# =====================================================

@calendario_bahias_bp.route('/ordenes-con-planificacion', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_con_planificacion(current_user):
    """Obtener órdenes de trabajo con planificación para el calendario (OPTIMIZADO)"""
    try:
        logger.info("📅 Obteniendo órdenes con planificación")
        
        # 1. Obtener todas las planificaciones con fechas
        planificaciones = supabase.table('planificacion') \
            .select('id_orden_trabajo, bahia_asignada, horas_estimadas, fecha_hora_inicio_estimado, fecha_hora_fin_estimado') \
            .not_.is_('fecha_hora_inicio_estimado', 'null') \
            .execute()
        
        if not planificaciones.data:
            logger.info("No hay planificaciones")
            return jsonify({'success': True, 'ordenes': []}), 200
        
        # Obtener IDs de órdenes con planificación
        ordenes_ids = [p['id_orden_trabajo'] for p in planificaciones.data]
        
        # Mapear planificaciones por orden_id
        planificaciones_map = {p['id_orden_trabajo']: p for p in planificaciones.data}
        
        # 2. Obtener TODAS las órdenes de una vez
        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, id_vehiculo') \
            .in_('id', ordenes_ids) \
            .execute()
        
        if not ordenes_result.data:
            return jsonify({'success': True, 'ordenes': []}), 200
        
        ordenes = ordenes_result.data
        vehiculos_ids = list(set([o['id_vehiculo'] for o in ordenes if o.get('id_vehiculo')]))
        
        # 3. Obtener TODOS los vehículos de una vez
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo, anio, id_cliente') \
                .in_('id', vehiculos_ids) \
                .execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        # 4. Obtener TODOS los clientes de una vez
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
        
        # 5. Obtener TODOS los usuarios (clientes) de una vez
        usuarios_map = {}
        if usuarios_ids:
            usuarios = supabase.table('usuario') \
                .select('id, nombre, contacto') \
                .in_('id', usuarios_ids) \
                .execute()
            for u in (usuarios.data or []):
                usuarios_map[u['id']] = u
        
        # 6. Obtener TODAS las asignaciones de técnicos de una vez
        tecnicos_por_orden = {}
        if ordenes_ids:
            asignaciones = supabase.table('asignaciontecnico') \
                .select('id_orden_trabajo, id_tecnico') \
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
                    tecnicos_nombres_map[t['id']] = t
            
            for a in (asignaciones.data or []):
                if a['id_orden_trabajo'] not in tecnicos_por_orden:
                    tecnicos_por_orden[a['id_orden_trabajo']] = []
                if a['id_tecnico'] in tecnicos_nombres_map:
                    tecnicos_por_orden[a['id_orden_trabajo']].append({
                        'id': a['id_tecnico'],
                        'nombre': tecnicos_nombres_map[a['id_tecnico']]['nombre']
                    })
        
        # 7. Construir respuesta
        ordenes_data = []
        for orden in ordenes:
            v = vehiculos_map.get(orden['id_vehiculo'], {})
            
            # Obtener cliente
            cliente_info = clientes_map.get(v.get('id_cliente'), {})
            usuario_cliente = usuarios_map.get(cliente_info.get('id_usuario'), {})
            cliente_nombre = usuario_cliente.get('nombre', 'No registrado')
            
            # Obtener planificación
            planif = planificaciones_map.get(orden['id'], {})
            
            # Obtener técnicos
            tecnicos = tecnicos_por_orden.get(orden['id'], [])
            
            ordenes_data.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'fecha_ingreso': orden['fecha_ingreso'],
                'cliente_nombre': cliente_nombre,
                'placa': v.get('placa', ''),
                'marca': v.get('marca', ''),
                'modelo': v.get('modelo', ''),
                'anio': v.get('anio'),
                'bahia_asignada': planif.get('bahia_asignada'),
                'horas_estimadas': planif.get('horas_estimadas'),
                'fecha_hora_inicio_estimado': planif.get('fecha_hora_inicio_estimado'),
                'fecha_hora_fin_estimado': planif.get('fecha_hora_fin_estimado'),
                'tecnicos': tecnicos
            })
        
        logger.info(f"✅ {len(ordenes_data)} órdenes planificadas obtenidas")
        return jsonify({'success': True, 'ordenes': ordenes_data}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo órdenes planificadas: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@calendario_bahias_bp.route('/bahias', methods=['GET'])
@jefe_taller_required
def listar_estado_bahias(current_user):
    """Listar el estado actual de las 12 bahías del taller (OPTIMIZADO)"""
    try:
        logger.info("🏭 Obteniendo estado de bahías")
        
        # Obtener planificaciones activas (con inicio real y sin fin real)
        planificaciones_activas = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo') \
            .not_.is_('fecha_hora_inicio_real', 'null') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        # Obtener códigos de orden
        ordenes_ids = list(set([p['id_orden_trabajo'] for p in (planificaciones_activas.data or [])]))
        ordenes_codigos = {}
        
        if ordenes_ids:
            ordenes = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, estado_global') \
                .in_('id', ordenes_ids) \
                .execute()
            for o in (ordenes.data or []):
                ordenes_codigos[o['id']] = {
                    'codigo': o['codigo_unico'],
                    'estado': o['estado_global']
                }
        
        # Mapear bahías ocupadas
        bahias_ocupadas = {}
        for p in (planificaciones_activas.data or []):
            bahia_num = p.get('bahia_asignada')
            if bahia_num and p['id_orden_trabajo'] in ordenes_codigos:
                bahias_ocupadas[bahia_num] = ordenes_codigos[p['id_orden_trabajo']]
        
        # Generar lista de 12 bahías
        bahias = []
        for i in range(1, 13):
            if i in bahias_ocupadas:
                bahias.append({
                    'numero': i,
                    'estado': 'ocupado',
                    'orden_codigo': bahias_ocupadas[i]['codigo'],
                    'orden_estado': bahias_ocupadas[i]['estado']
                })
            else:
                bahias.append({
                    'numero': i,
                    'estado': 'libre',
                    'orden_codigo': None,
                    'orden_estado': None
                })
        
        ocupadas_count = len([b for b in bahias if b['estado'] == 'ocupado'])
        
        logger.info(f"✅ Bahías: {ocupadas_count}/12 ocupadas")
        
        return jsonify({
            'success': True,
            'bahias': bahias,
            'resumen': {
                'total': 12,
                'ocupadas': ocupadas_count,
                'libres': 12 - ocupadas_count
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error listando estado de bahías: {str(e)}")
        return jsonify({'error': str(e)}), 500


@calendario_bahias_bp.route('/tecnicos-carga', methods=['GET'])
@jefe_taller_required
def obtener_carga_tecnicos(current_user):
    """Obtener la carga de trabajo actual de cada técnico"""
    try:
        logger.info("👥 Obteniendo carga de técnicos")
        
        MAX_ORDENES_POR_TECNICO = 2
        
        resultado = supabase.table('usuario') \
            .select('id, nombre, contacto, email') \
            .eq('id_rol', 4) \
            .execute()
        
        tecnicos = []
        for tecnico in (resultado.data or []):
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
        return jsonify({'error': str(e)}), 500


@calendario_bahias_bp.route('/estadisticas-ordenes', methods=['GET'])
@jefe_taller_required
def obtener_estadisticas_ordenes(current_user):
    """Obtener estadísticas generales de órdenes de trabajo"""
    try:
        logger.info("📊 Obteniendo estadísticas de órdenes")
        
        # Contar órdenes por estado
        estados = ['EnRecepcion', 'EnProceso', 'EnPausa', 'PendienteAprobacion', 'Finalizado', 'Entregado']
        stats = {
            'total': 0,
            'enProceso': 0,
            'enPausa': 0,
            'finalizadas': 0
        }
        
        for estado in estados:
            count = supabase.table('ordentrabajo') \
                .select('id', count='exact') \
                .eq('estado_global', estado) \
                .execute()
            
            cantidad = count.count if hasattr(count, 'count') else len(count.data) if count.data else 0
            
            if estado == 'EnProceso':
                stats['enProceso'] = cantidad
            elif estado == 'EnPausa':
                stats['enPausa'] = cantidad
            elif estado in ['Finalizado', 'Entregado']:
                stats['finalizadas'] += cantidad
            
            stats['total'] += cantidad
        
        logger.info(f"✅ Estadísticas: Total={stats['total']}, Proceso={stats['enProceso']}, Pausa={stats['enPausa']}, Finalizadas={stats['finalizadas']}")
        
        return jsonify(stats), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500


@calendario_bahias_bp.route('/diagnosticos-stats', methods=['GET'])
@jefe_taller_required
def obtener_estadisticas_diagnosticos(current_user):
    """Obtener estadísticas de diagnósticos técnicos"""
    try:
        logger.info("📊 Obteniendo estadísticas de diagnósticos")
        
        estados = ['pendiente', 'aprobado', 'rechazado', 'borrador']
        stats = {}
        
        for estado in estados:
            count = supabase.table('diagnostico_tecnico') \
                .select('id', count='exact') \
                .eq('estado', estado) \
                .execute()
            stats[estado] = count.count if hasattr(count, 'count') else len(count.data) if count.data else 0
        
        logger.info(f"✅ Diagnósticos: Pendientes={stats['pendiente']}, Aprobados={stats['aprobado']}, Rechazados={stats['rechazado']}")
        
        return jsonify({'success': True, 'stats': stats}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas de diagnósticos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@calendario_bahias_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_orden(current_user, id_orden):
    """Obtener detalle completo de una orden de trabajo"""
    try:
        logger.info(f"🔍 Obteniendo detalle de orden {id_orden}")
        
        # Obtener orden con vehículo
        orden_result = supabase.table('ordentrabajo') \
            .select('''
                id, codigo_unico, estado_global, fecha_ingreso, fecha_salida,
                id_vehiculo, vehiculo!inner (placa, marca, modelo, anio, kilometraje, id_cliente)
            ''') \
            .eq('id', id_orden) \
            .execute()
        
        if not orden_result.data:
            return jsonify({'error': 'Orden no encontrada'}), 404
        
        orden = orden_result.data[0]
        vehiculo = orden.get('vehiculo', {})
        
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
            .select('bahia_asignada, horas_estimadas, fecha_hora_inicio_estimado, fecha_hora_fin_estimado') \
            .eq('id_orden_trabajo', id_orden) \
            .execute()
        
        # Obtener técnicos asignados
        tecnicos = []
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico, usuario!inner(nombre)') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        for a in (asignaciones.data or []):
            usuario = a.get('usuario', {})
            tecnicos.append({
                'id': a['id_tecnico'],
                'nombre': usuario.get('nombre', 'Desconocido')
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
            'diagnostico_inicial': diagnostico_inicial
        }
        
        return jsonify({'success': True, 'detalle': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo detalle de orden: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500