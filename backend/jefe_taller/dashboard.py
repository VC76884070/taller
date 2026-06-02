# =====================================================
# DASHBOARD - JEFE DE TALLER
# FURIA MOTOR COMPANY SRL
# VERSIÓN CORREGIDA - CON TODOS LOS CAMPOS
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
dashboard_bp = Blueprint('dashboard_jefe', __name__, url_prefix='/api/jefe-taller')

# Configuración
supabase = config.supabase


# =====================================================
# ENDPOINT 1: ESTADO DE BAHÍAS
# =====================================================

@dashboard_bp.route('/bahias-estado', methods=['GET'])
@jefe_taller_required
def obtener_estado_bahias(current_user):
    """Obtener el estado actual de todas las bahías (1-12)"""
    try:
        planificaciones = supabase.table('planificacion') \
            .select('''
                bahia_asignada,
                id_orden_trabajo,
                fecha_hora_inicio_real,
                fecha_hora_fin_real
            ''') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        bahias_ocupadas = {}
        for p in (planificaciones.data or []):
            bahia = p.get('bahia_asignada')
            if bahia:
                estado = 'ocupada' if p.get('fecha_hora_inicio_real') else 'reservada'
                bahias_ocupadas[bahia] = {
                    'estado': estado,
                    'id_orden_trabajo': p.get('id_orden_trabajo')
                }
        
        bahias = []
        for i in range(1, 13):
            bahia_info = bahias_ocupadas.get(i, {})
            estado = bahia_info.get('estado', 'libre')
            orden_id = bahia_info.get('id_orden_trabajo')
            
            tecnico = None
            orden_codigo = None
            
            if estado != 'libre' and orden_id:
                try:
                    orden_result = supabase.table('ordentrabajo') \
                        .select('codigo_unico') \
                        .eq('id', orden_id) \
                        .execute()
                    
                    if orden_result.data:
                        orden_codigo = orden_result.data[0].get('codigo_unico')
                    
                    asignacion = supabase.table('asignaciontecnico') \
                        .select('usuario!id_tecnico(nombre)') \
                        .eq('id_orden_trabajo', orden_id) \
                        .is_('fecha_hora_final', 'null') \
                        .limit(1) \
                        .execute()
                    
                    if asignacion.data:
                        usuario_data = asignacion.data[0].get('usuario', {})
                        if isinstance(usuario_data, dict):
                            tecnico = usuario_data.get('nombre')
                        elif isinstance(usuario_data, list) and len(usuario_data) > 0:
                            tecnico = usuario_data[0].get('nombre')
                except Exception as e:
                    logger.warning(f"Error obteniendo detalles de bahía {i}: {e}")
            
            bahias.append({
                'numero': i,
                'estado': estado,
                'tecnico': tecnico,
                'orden_codigo': orden_codigo
            })
        
        return jsonify({
            'success': True,
            'bahias': bahias
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estado de bahías: {str(e)}")
        return jsonify({'success': False, 'error': str(e), 'bahias': []}), 500


# =====================================================
# ENDPOINT 2: DIAGNÓSTICOS PENDIENTES
# =====================================================

@dashboard_bp.route('/diagnosticos-pendientes', methods=['GET'])
@jefe_taller_required
def obtener_diagnosticos_pendientes(current_user):
    """Obtener diagnósticos pendientes de revisión"""
    try:
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('''
                id,
                informe,
                fecha_envio,
                version,
                estado,
                id_tecnico,
                id_orden_trabajo,
                usuario!id_tecnico(nombre),
                ordentrabajo!inner(
                    id,
                    codigo_unico,
                    id_vehiculo,
                    vehiculo!inner(
                        placa,
                        marca,
                        modelo
                    )
                )
            ''') \
            .eq('estado', 'pendiente') \
            .order('fecha_envio', desc=True) \
            .execute()
        
        resultado = []
        for diag in (diagnosticos.data or []):
            orden_data = diag.get('ordentrabajo', {})
            if isinstance(orden_data, dict):
                vehiculo_data = orden_data.get('vehiculo', {})
                if isinstance(vehiculo_data, dict):
                    marca = vehiculo_data.get('marca', '')
                    modelo = vehiculo_data.get('modelo', '')
                    placa = vehiculo_data.get('placa', '')
                else:
                    marca = modelo = placa = ''
            else:
                marca = modelo = placa = ''
            
            tecnico_data = diag.get('usuario', {})
            if isinstance(tecnico_data, dict):
                tecnico_nombre = tecnico_data.get('nombre', 'Sin técnico')
            else:
                tecnico_nombre = 'Sin técnico'
            
            resultado.append({
                'diagnostico_id': diag.get('id'),
                'id_orden_trabajo': diag.get('id_orden_trabajo'),
                'orden_codigo': orden_data.get('codigo_unico') if isinstance(orden_data, dict) else None,
                'vehiculo': f"{marca} {modelo}".strip() or 'Vehículo',
                'placa': placa,
                'informe': diag.get('informe', ''),
                'fecha_envio': diag.get('fecha_envio'),
                'tecnico_nombre': tecnico_nombre,
                'version': diag.get('version', 1)
            })
        
        return jsonify({
            'success': True,
            'diagnosticos': resultado
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo diagnósticos pendientes: {str(e)}")
        return jsonify({'success': True, 'diagnosticos': []}), 200


# =====================================================
# ENDPOINT 3: ÓRDENES ACTIVAS - VERSIÓN CORREGIDA
# =====================================================

@dashboard_bp.route('/ordenes-activas', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_activas(current_user):
    """Obtener órdenes activas para el dashboard (con días estimados)"""
    print("\n" + "="*60)
    print("🔥 DASHBOARD.PY - ENDPOINT ORDENES-ACTIVAS CORREGIDO")
    print("="*60)
    
    try:
        print("🔍 Consultando órdenes activas con TODOS los campos...")
        
        # IMPORTANTE: Incluir fecha_ingreso, dias_estimados_reparacion, fecha_estimada_finalizacion
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_estimada_finalizacion, dias_estimados_reparacion, id_vehiculo') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        print(f"📊 Órdenes activas encontradas: {len(ordenes.data or [])}")
        
        resultado = []
        
        for orden in (ordenes.data or []):
            orden_id = orden.get('id')
            fecha_ingreso = orden.get('fecha_ingreso')
            dias_estimados = orden.get('dias_estimados_reparacion')
            fecha_estimada_fin = orden.get('fecha_estimada_finalizacion')
            
            print(f"\n📝 Orden ID: {orden_id}")
            print(f"   fecha_ingreso: {fecha_ingreso}")
            print(f"   dias_estimados: {dias_estimados}")
            print(f"   fecha_estimada_fin: {fecha_estimada_fin}")
            
            # Obtener vehículo
            vehiculo = {'placa': 'Sin placa', 'marca': '', 'modelo': ''}
            if orden.get('id_vehiculo'):
                try:
                    vehiculo_result = supabase.table('vehiculo') \
                        .select('placa, marca, modelo') \
                        .eq('id', orden['id_vehiculo']) \
                        .execute()
                    
                    if vehiculo_result.data:
                        v = vehiculo_result.data[0]
                        vehiculo = {
                            'placa': v.get('placa', 'Sin placa'),
                            'marca': v.get('marca', ''),
                            'modelo': v.get('modelo', '')
                        }
                        print(f"   vehículo: {vehiculo['placa']} - {vehiculo['marca']} {vehiculo['modelo']}")
                except Exception as e:
                    print(f"   Error vehículo: {e}")
            
            resultado.append({
                'id_orden': orden_id,
                'codigo_unico': orden.get('codigo_unico'),
                'estado_global': orden.get('estado_global'),
                'fecha_ingreso': fecha_ingreso,
                'fecha_estimada_finalizacion': fecha_estimada_fin,
                'dias_estimados_reparacion': dias_estimados,
                'vehiculo': vehiculo
            })
        
        print("\n" + "="*60)
        print(f"✅ Total: {len(resultado)} órdenes procesadas")
        print("="*60 + "\n")
        
        return jsonify({
            'success': True,
            'ordenes': resultado
        }), 200
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': True, 'ordenes': []}), 200


# =====================================================
# ENDPOINT 4: COTIZACIONES ENVIADAS
# =====================================================

@dashboard_bp.route('/cotizaciones-enviadas-dashboard', methods=['GET'])
@jefe_taller_required
def obtener_cotizaciones_dashboard(current_user):
    """Obtener cotizaciones enviadas (para próximas entregas)"""
    try:
        cotizaciones = supabase.table('cotizacion') \
            .select('''
                id,
                id_orden_trabajo,
                total,
                fecha_envio,
                estado,
                ordentrabajo!inner(
                    codigo_unico,
                    id_vehiculo,
                    vehiculo!inner(
                        placa,
                        marca,
                        modelo,
                        cliente!inner(
                            usuario!inner(
                                nombre
                            )
                        )
                    )
                )
            ''') \
            .in_('estado', ['enviada', 'aprobada']) \
            .order('fecha_envio', desc=True) \
            .limit(10) \
            .execute()
        
        resultado = []
        for cot in (cotizaciones.data or []):
            orden_data = cot.get('ordentrabajo', {})
            if isinstance(orden_data, dict):
                vehiculo_data = orden_data.get('vehiculo', {})
                if isinstance(vehiculo_data, dict):
                    marca = vehiculo_data.get('marca', '')
                    modelo = vehiculo_data.get('modelo', '')
                    placa = vehiculo_data.get('placa', '')
                    cliente_data = vehiculo_data.get('cliente', {})
                    if isinstance(cliente_data, dict):
                        usuario_data = cliente_data.get('usuario', {})
                        if isinstance(usuario_data, dict):
                            cliente_nombre = usuario_data.get('nombre', 'No registrado')
                        else:
                            cliente_nombre = 'No registrado'
                    else:
                        cliente_nombre = 'No registrado'
                else:
                    marca = modelo = placa = ''
                    cliente_nombre = 'No registrado'
            else:
                marca = modelo = placa = ''
                cliente_nombre = 'No registrado'
            
            resultado.append({
                'id': cot.get('id'),
                'id_orden_trabajo': cot.get('id_orden_trabajo'),
                'orden_codigo': orden_data.get('codigo_unico') if isinstance(orden_data, dict) else None,
                'vehiculo': f"{marca} {modelo}".strip() or 'Vehículo',
                'placa': placa,
                'cliente_nombre': cliente_nombre,
                'total': float(cot.get('total', 0)),
                'fecha_envio': cot.get('fecha_envio'),
                'estado': cot.get('estado', 'enviada')
            })
        
        return jsonify({
            'success': True,
            'cotizaciones': resultado
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo cotizaciones: {str(e)}")
        return jsonify({'success': True, 'cotizaciones': []}), 200


# =====================================================
# ENDPOINT 5: ESTADÍSTICAS (KPIs)
# =====================================================

@dashboard_bp.route('/dashboard-stats', methods=['GET'])
@jefe_taller_required
def obtener_stats_dashboard(current_user):
    """Obtener estadísticas para los KPIs del dashboard"""
    try:
        ordenes_activas_result = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        ordenes_activas_count = ordenes_activas_result.count if ordenes_activas_result.count is not None else len(ordenes_activas_result.data or [])
        
        ordenes_pausa_result = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .eq('estado_global', 'EnPausa') \
            .execute()
        
        ordenes_pausa_count = ordenes_pausa_result.count if ordenes_pausa_result.count is not None else len(ordenes_pausa_result.data or [])
        
        diagnosticos_result = supabase.table('diagnostico_tecnico') \
            .select('id', count='exact') \
            .eq('estado', 'pendiente') \
            .execute()
        
        diagnosticos_count = diagnosticos_result.count if diagnosticos_result.count is not None else len(diagnosticos_result.data or [])
        
        return jsonify({
            'success': True,
            'stats': {
                'ordenes_activas': ordenes_activas_count,
                'ordenes_pausa': ordenes_pausa_count,
                'tecnicos_activos': 0,
                'bahias_ocupadas': 0,
                'diagnosticos_pendientes': diagnosticos_count
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Error en stats: {e}")
        return jsonify({'success': True, 'stats': {
            'ordenes_activas': 0, 'ordenes_pausa': 0,
            'tecnicos_activos': 0, 'bahias_ocupadas': 0, 'diagnosticos_pendientes': 0
        }}), 200


# =====================================================
# ENDPOINT 6: NOTIFICACIONES
# =====================================================

@dashboard_bp.route('/notificaciones', methods=['GET'])
@jefe_taller_required
def obtener_notificaciones(current_user):
    """Obtener notificaciones del usuario"""
    try:
        notificaciones = supabase.table('notificacion') \
            .select('*') \
            .eq('id_usuario_destino', current_user['id']) \
            .order('fecha_envio', desc=True) \
            .limit(20) \
            .execute()
        
        return jsonify({
            'success': True,
            'notificaciones': notificaciones.data or []
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo notificaciones: {str(e)}")
        return jsonify({'success': True, 'notificaciones': []}), 200


@dashboard_bp.route('/notificaciones/marcar-leida/<int:id_notificacion>', methods=['PUT'])
@jefe_taller_required
def marcar_notificacion_leida(current_user, id_notificacion):
    """Marcar una notificación como leída"""
    try:
        supabase.table('notificacion') \
            .update({'leida': True}) \
            .eq('id', id_notificacion) \
            .eq('id_usuario_destino', current_user['id']) \
            .execute()
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        logger.error(f"Error marcando notificación: {str(e)}")
        return jsonify({'error': str(e)}), 500