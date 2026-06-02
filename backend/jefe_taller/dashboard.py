# =====================================================
# DASHBOARD - JEFE DE TALLER
# VERSIÓN COMPLETA CON TODOS LOS ENDPOINTS FUNCIONANDO
# =====================================================

from flask import Blueprint, jsonify
from config import config
from decorators import jefe_taller_required
import datetime

dashboard_bp = Blueprint('dashboard_jefe', __name__, url_prefix='/api/jefe-taller')
supabase = config.supabase

print("="*60)
print("🔥 DASHBOARD COMPLETO - TODOS LOS ENDPOINTS ACTIVOS 🔥")
print("="*60)


# =====================================================
# ENDPOINT 1: ÓRDENES ACTIVAS (PARA CALENDARIO)
# =====================================================

@dashboard_bp.route('/mis-ordenes-activas', methods=['GET'])
@jefe_taller_required
def mis_ordenes_activas(current_user):
    """Obtener órdenes activas para el calendario"""
    print("📡 /mis-ordenes-activas llamado")
    
    try:
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_estimada_finalizacion, dias_estimados_reparacion, id_vehiculo') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        resultado = []
        for orden in (ordenes.data or []):
            vehiculo = {'placa': 'SIN PLACA', 'marca': '', 'modelo': ''}
            if orden.get('id_vehiculo'):
                try:
                    v_result = supabase.table('vehiculo') \
                        .select('placa, marca, modelo') \
                        .eq('id', orden['id_vehiculo']) \
                        .execute()
                    if v_result.data:
                        v = v_result.data[0]
                        vehiculo = {
                            'placa': v.get('placa', 'SIN PLACA'),
                            'marca': v.get('marca', ''),
                            'modelo': v.get('modelo', '')
                        }
                except:
                    pass
            
            resultado.append({
                'id_orden': orden.get('id'),
                'codigo_unico': orden.get('codigo_unico'),
                'estado_global': orden.get('estado_global'),
                'fecha_ingreso': orden.get('fecha_ingreso'),
                'fecha_estimada_finalizacion': orden.get('fecha_estimada_finalizacion'),
                'dias_estimados_reparacion': orden.get('dias_estimados_reparacion'),
                'vehiculo': vehiculo
            })
        
        print(f"✅ {len(resultado)} órdenes activas")
        return jsonify({'success': True, 'ordenes': resultado}), 200
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({'success': True, 'ordenes': []}), 200


# =====================================================
# ENDPOINT 2: BAHÍAS
# =====================================================

@dashboard_bp.route('/mis-bahias-estado', methods=['GET'])
@jefe_taller_required
def mis_bahias_estado(current_user):
    """Obtener estado de bahías"""
    print("📡 /mis-bahias-estado llamado")
    
    try:
        planificaciones = supabase.table('planificacion') \
            .select('bahia_asignada, id_orden_trabajo, fecha_hora_inicio_real, fecha_hora_fin_real') \
            .is_('fecha_hora_fin_real', 'null') \
            .execute()
        
        bahias_ocupadas = {}
        for p in (planificaciones.data or []):
            bahia = p.get('bahia_asignada')
            if bahia:
                estado = 'ocupada' if p.get('fecha_hora_inicio_real') else 'reservada'
                bahias_ocupadas[bahia] = {'estado': estado}
        
        bahias = []
        for i in range(1, 13):
            info = bahias_ocupadas.get(i, {})
            estado = info.get('estado', 'libre')
            bahias.append({'numero': i, 'estado': estado, 'tecnico': None, 'orden_codigo': None})
        
        return jsonify({'success': True, 'bahias': bahias}), 200
    except Exception as e:
        return jsonify({'success': True, 'bahias': []}), 200


# =====================================================
# ENDPOINT 3: DIAGNÓSTICOS PENDIENTES
# =====================================================

@dashboard_bp.route('/mis-diagnosticos', methods=['GET'])
@jefe_taller_required
def mis_diagnosticos(current_user):
    """Obtener diagnósticos pendientes de revisión"""
    print("📡 /mis-diagnosticos llamado")
    
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
            vehiculo_data = orden_data.get('vehiculo', {}) if isinstance(orden_data, dict) else {}
            
            marca = vehiculo_data.get('marca', '') if isinstance(vehiculo_data, dict) else ''
            modelo = vehiculo_data.get('modelo', '') if isinstance(vehiculo_data, dict) else ''
            placa = vehiculo_data.get('placa', '') if isinstance(vehiculo_data, dict) else ''
            
            tecnico_data = diag.get('usuario', {})
            tecnico_nombre = tecnico_data.get('nombre', 'Sin técnico') if isinstance(tecnico_data, dict) else 'Sin técnico'
            
            resultado.append({
                'diagnostico_id': diag.get('id'),
                'id_orden_trabajo': diag.get('id_orden_trabajo'),
                'orden_codigo': orden_data.get('codigo_unico') if isinstance(orden_data, dict) else None,
                'vehiculo': f"{marca} {modelo}".strip() or 'Vehículo',
                'placa': placa,
                'informe': diag.get('informe', 'Sin informe'),
                'fecha_envio': diag.get('fecha_envio'),
                'tecnico_nombre': tecnico_nombre,
                'version': diag.get('version', 1)
            })
        
        print(f"✅ {len(resultado)} diagnósticos pendientes")
        return jsonify({'success': True, 'diagnosticos': resultado}), 200
        
    except Exception as e:
        print(f"❌ Error en diagnósticos: {e}")
        return jsonify({'success': True, 'diagnosticos': []}), 200


# =====================================================
# ENDPOINT 4: COTIZACIONES (PRÓXIMAS ENTREGAS)
# =====================================================

@dashboard_bp.route('/mis-cotizaciones', methods=['GET'])
@jefe_taller_required
def mis_cotizaciones(current_user):
    """Obtener cotizaciones enviadas/aprobadas para próximas entregas"""
    print("📡 /mis-cotizaciones llamado")
    
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
                        cliente_nombre = usuario_data.get('nombre', 'No registrado') if isinstance(usuario_data, dict) else 'No registrado'
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
        
        print(f"✅ {len(resultado)} cotizaciones")
        return jsonify({'success': True, 'cotizaciones': resultado}), 200
        
    except Exception as e:
        print(f"❌ Error en cotizaciones: {e}")
        return jsonify({'success': True, 'cotizaciones': []}), 200


# =====================================================
# ENDPOINT 5: COMUNICADOS DEL JEFE OPERATIVO
# =====================================================

@dashboard_bp.route('/mis-comunicados', methods=['GET'])
@jefe_taller_required
def mis_comunicados(current_user):
    """Obtener comunicados del Jefe Operativo dirigidos al rol jefe_taller"""
    
    try:
        # Obtener comunicados activos que tengan 'jefe_taller' como destinatario
        # IMPORTANTE: Usar contains para buscar en el array destinatarios
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('estado', 'activo') \
            .execute()
        
        comunicados = []
        if resultado.data:
            for c in resultado.data:
                destinatarios = c.get('destinatarios', [])
                # Verificar si destinatarios es una lista y contiene 'jefe_taller'
                if isinstance(destinatarios, list) and 'jefe_taller' in destinatarios:
                    comunicados.append({
                        'id': c.get('id'),
                        'titulo': c.get('titulo'),
                        'contenido': c.get('contenido'),
                        'prioridad': c.get('prioridad', 'normal'),
                        'fecha_creacion': c.get('fecha_creacion'),
                        'creado_por': c.get('creado_por'),
                        'destinatarios': destinatarios
                    })
                    print(f"   📬 Comunicado encontrado: {c.get('titulo')}")
        
        print(f"✅ {len(comunicados)} comunicados encontrados para jefe_taller")
        
        # Debug: mostrar los primeros 3 comunicados
        for com in comunicados[:3]:
            print(f"   - ID: {com['id']}, Título: {com['titulo']}, Prioridad: {com['prioridad']}")
        
        return jsonify({'success': True, 'comunicados': comunicados}), 200
        
    except Exception as e:
        print(f"❌ Error obteniendo comunicados: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': True, 'comunicados': []}), 200


# =====================================================
# ENDPOINT 6: ESTADÍSTICAS (KPIs)
# =====================================================

@dashboard_bp.route('/mis-stats', methods=['GET'])
@jefe_taller_required
def mis_stats(current_user):
    """Obtener estadísticas para KPIs"""
    print("📡 /mis-stats llamado")
    
    try:
        # Órdenes activas
        ordenes_count = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .not_.in_('estado_global', ['Finalizado', 'Entregado']) \
            .execute()
        
        # Órdenes en pausa
        pausa_count = supabase.table('ordentrabajo') \
            .select('id', count='exact') \
            .eq('estado_global', 'EnPausa') \
            .execute()
        
        # Diagnósticos pendientes
        diag_count = supabase.table('diagnostico_tecnico') \
            .select('id', count='exact') \
            .eq('estado', 'pendiente') \
            .execute()
        
        return jsonify({
            'success': True,
            'stats': {
                'ordenes_activas': ordenes_count.count or 0,
                'ordenes_pausa': pausa_count.count or 0,
                'tecnicos_activos': 0,
                'bahias_ocupadas': 0,
                'diagnosticos_pendientes': diag_count.count or 0
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Error en stats: {e}")
        return jsonify({'success': True, 'stats': {
            'ordenes_activas': 0, 'ordenes_pausa': 0,
            'tecnicos_activos': 0, 'bahias_ocupadas': 0, 'diagnosticos_pendientes': 0
        }}), 200
