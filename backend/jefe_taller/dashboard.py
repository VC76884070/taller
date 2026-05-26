# =====================================================
# DASHBOARD - JEFE DE TALLER
# FURIA MOTOR COMPANY SRL
# VERSIÓN CORREGIDA - INCLUYE FECHA_INGRESO
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
        # Obtener planificaciones activas
        planificaciones = supabase.table('planificacion') \
            .select('''
                bahia_asignada,
                id_orden_trabajo,
                fecha_hora_inicio_real,
                fecha_hora_fin_real
            ''') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        # Crear mapa de bahías ocupadas
        bahias_ocupadas = {}
        for p in (planificaciones.data or []):
            bahia = p.get('bahia_asignada')
            if bahia:
                estado = 'ocupada' if p.get('fecha_hora_inicio_real') else 'reservada'
                bahias_ocupadas[bahia] = {
                    'estado': estado,
                    'id_orden_trabajo': p.get('id_orden_trabajo')
                }
        
        # Generar bahías del 1 al 12
        bahias = []
        for i in range(1, 13):
            bahia_info = bahias_ocupadas.get(i, {})
            estado = bahia_info.get('estado', 'libre')
            orden_id = bahia_info.get('id_orden_trabajo')
            
            tecnico = None
            orden_codigo = None
            
            # Si está ocupada, obtener información adicional
            if estado != 'libre' and orden_id:
                try:
                    # Obtener código de orden
                    orden_result = supabase.table('ordentrabajo') \
                        .select('codigo_unico') \
                        .eq('id', orden_id) \
                        .execute()
                    
                    if orden_result.data:
                        orden_codigo = orden_result.data[0].get('codigo_unico')
                    
                    # Obtener técnico asignado
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
        # Obtener diagnósticos en estado 'pendiente'
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
# ENDPOINT 3: ÓRDENES ACTIVAS (Vehículos en taller)
# =====================================================

@dashboard_bp.route('/ordenes-activas', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_activas(current_user):
    """Obtener órdenes activas para el dashboard (con días estimados)"""
    try:
        print("🔍 Consultando órdenes activas...")
        
        # Obtener órdenes activas (no finalizadas ni entregadas)
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_estimada_finalizacion, dias_estimados_reparacion, id_vehiculo') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        print(f"📊 Órdenes activas encontradas: {len(ordenes.data or [])}")
        
        # Debug: imprimir primera orden para verificar campos
        if ordenes.data and len(ordenes.data) > 0:
            print(f"📋 Campos de la primera orden: {list(ordenes.data[0].keys())}")
            print(f"📋 fecha_ingreso: {ordenes.data[0].get('fecha_ingreso')}")
        
        resultado = []
        for orden in (ordenes.data or []):
            vehiculo = None
            
            # Obtener datos del vehículo
            if orden.get('id_vehiculo'):
                try:
                    vehiculo_result = supabase.table('vehiculo') \
                        .select('placa, marca, modelo') \
                        .eq('id', orden['id_vehiculo']) \
                        .execute()
                    
                    if vehiculo_result.data:
                        v = vehiculo_result.data[0]
                        vehiculo = {
                            'placa': v.get('placa', ''),
                            'marca': v.get('marca', ''),
                            'modelo': v.get('modelo', '')
                        }
                except Exception as e:
                    print(f"⚠️ Error obteniendo vehículo: {e}")
            
            if not vehiculo:
                vehiculo = {'placa': 'N/A', 'marca': '', 'modelo': ''}
            
            resultado.append({
                'id_orden': orden.get('id'),
                'codigo_unico': orden.get('codigo_unico'),
                'estado_global': orden.get('estado_global'),
                'fecha_ingreso': orden.get('fecha_ingreso'),  # ESTO ES CLAVE
                'fecha_estimada_finalizacion': orden.get('fecha_estimada_finalizacion'),
                'dias_estimados_reparacion': orden.get('dias_estimados_reparacion'),
                'vehiculo': vehiculo
            })
        
        return jsonify({
            'success': True,
            'ordenes': resultado
        }), 200
        
    except Exception as e:
        print(f"❌ Error obteniendo órdenes activas: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': True, 'ordenes': []}), 200


# =====================================================
# ENDPOINT 4: COTIZACIONES ENVIADAS (Próximas entregas)
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
        print("\n" + "="*50)
        print("📊 CALCULANDO STATS DEL DASHBOARD")
        print("="*50)
        
        # =====================================================
        # 1. ÓRDENES ACTIVAS
        # =====================================================
        ordenes_activas_result = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        ordenes_activas_count = ordenes_activas_result.count if ordenes_activas_result.count is not None else len(ordenes_activas_result.data or [])
        print(f"✅ Órdenes activas: {ordenes_activas_count}")
        
        # =====================================================
        # 2. ÓRDENES EN PAUSA
        # =====================================================
        ordenes_pausa_result = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .eq('estado_global', 'EnPausa') \
            .execute()
        
        ordenes_pausa_count = ordenes_pausa_result.count if ordenes_pausa_result.count is not None else len(ordenes_pausa_result.data or [])
        print(f"✅ Órdenes en pausa: {ordenes_pausa_count}")
        
        # =====================================================
        # 3. TÉCNICOS TRABAJANDO
        # =====================================================
        tecnicos_activos_result = supabase.table('asignaciontecnico') \
            .select('id_tecnico', distinct=True) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        tecnicos_activos_count = len(set([t['id_tecnico'] for t in (tecnicos_activos_result.data or [])]))
        
        if tecnicos_activos_count == 0:
            try:
                roles_result = supabase.table('usuario_rol') \
                    .select('id_usuario, rol:rol_id(nombre_rol)') \
                    .execute()
                
                tecnicos_set = set()
                for item in (roles_result.data or []):
                    rol_data = item.get('rol', {})
                    if isinstance(rol_data, dict):
                        nombre_rol = rol_data.get('nombre_rol', '')
                    else:
                        nombre_rol = ''
                    
                    if 'tecnico' in nombre_rol.lower():
                        tecnicos_set.add(item['id_usuario'])
                
                tecnicos_activos_count = len(tecnicos_set)
                print(f"✅ Técnicos (por rol): {tecnicos_activos_count}")
            except Exception as e:
                print(f"⚠️ Error fallback técnicos: {e}")
                tecnicos_activos_count = 0
        
        print(f"✅ Técnicos activos final: {tecnicos_activos_count}")
        
        # =====================================================
        # 4. BAHÍAS OCUPADAS
        # =====================================================
        bahias_result = supabase.table('planificacion') \
            .select('bahia_asignada, fecha_hora_inicio_real, fecha_hora_fin_real, ordentrabajo!inner(estado_global)') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        bahias_ocupadas_set = set()
        for p in (bahias_result.data or []):
            bahia = p.get('bahia_asignada')
            if not bahia:
                continue
            
            tiene_inicio_real = p.get('fecha_hora_inicio_real') is not None
            
            orden_data = p.get('ordentrabajo', {})
            if isinstance(orden_data, dict):
                estado_orden = orden_data.get('estado_global', '')
            else:
                estado_orden = ''
            
            if tiene_inicio_real or estado_orden not in ['Finalizado', 'Entregado']:
                bahias_ocupadas_set.add(bahia)
        
        bahias_ocupadas_count = len(bahias_ocupadas_set)
        print(f"✅ Bahías ocupadas: {bahias_ocupadas_count}")
        
        # =====================================================
        # 5. DIAGNÓSTICOS PENDIENTES
        # =====================================================
        diagnosticos_result = supabase.table('diagnostico_tecnico') \
            .select('id', count='exact') \
            .eq('estado', 'pendiente') \
            .execute()
        
        diagnosticos_count = diagnosticos_result.count if diagnosticos_result.count is not None else len(diagnosticos_result.data or [])
        print(f"✅ Diagnósticos pendientes: {diagnosticos_count}")
        
        print("="*50 + "\n")
        
        return jsonify({
            'success': True,
            'stats': {
                'ordenes_activas': ordenes_activas_count,
                'ordenes_pausa': ordenes_pausa_count,
                'tecnicos_activos': tecnicos_activos_count,
                'bahias_ocupadas': bahias_ocupadas_count,
                'diagnosticos_pendientes': diagnosticos_count
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Error en stats: {e}")
        import traceback
        traceback.print_exc()
        
        return jsonify({
            'success': True, 
            'stats': {
                'ordenes_activas': 0,
                'ordenes_pausa': 0,
                'tecnicos_activos': 0,
                'bahias_ocupadas': 0,
                'diagnosticos_pendientes': 0
            }
        }), 200


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


# =====================================================
# ENDPOINT 7: EVENTOS PARA CALENDARIO (NUEVO)
# =====================================================

@dashboard_bp.route('/eventos-calendario', methods=['GET'])
@jefe_taller_required
def obtener_eventos_calendario(current_user):
    """Obtener eventos para el calendario (solo fecha_ingreso y placa)"""
    try:
        print("📅 Consultando eventos para calendario...")
        
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, fecha_ingreso, id_vehiculo') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        eventos = []
        for orden in (ordenes.data or []):
            if orden.get('fecha_ingreso'):
                # Obtener placa del vehículo
                placa = "Vehículo"
                if orden.get('id_vehiculo'):
                    try:
                        vehiculo_result = supabase.table('vehiculo') \
                            .select('placa') \
                            .eq('id', orden['id_vehiculo']) \
                            .execute()
                        if vehiculo_result.data:
                            placa = vehiculo_result.data[0].get('placa', 'Vehículo')
                    except Exception as e:
                        print(f"⚠️ Error obteniendo vehículo: {e}")
                
                eventos.append({
                    'id': orden.get('id'),
                    'title': f"🔧 {placa}",
                    'start': orden.get('fecha_ingreso'),
                    'backgroundColor': '#FF9800',
                    'borderColor': '#FF9800',
                    'extendedProps': {
                        'orden_id': orden.get('id'),
                        'codigo_unico': orden.get('codigo_unico')
                    }
                })
        
        print(f"📅 Eventos generados: {len(eventos)}")
        return jsonify({
            'success': True,
            'eventos': eventos
        }), 200
        
    except Exception as e:
        print(f"❌ Error en eventos-calendario: {e}")
        return jsonify({'success': True, 'eventos': []}), 200


# =====================================================
# ENDPOINT 8: TEST PARA VERIFICAR CAMPOS
# =====================================================

@dashboard_bp.route('/test-ordenes', methods=['GET'])
@jefe_taller_required
def test_ordenes(current_user):
    """Endpoint de prueba para verificar campos de la tabla ordentrabajo"""
    try:
        ordenes = supabase.table('ordentrabajo') \
            .select('*') \
            .limit(1) \
            .execute()
        
        if ordenes.data and len(ordenes.data) > 0:
            return jsonify({
                'success': True,
                'campos': list(ordenes.data[0].keys()),
                'primera_orden': ordenes.data[0]
            }), 200
        else:
            return jsonify({'success': False, 'message': 'No hay órdenes'}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500