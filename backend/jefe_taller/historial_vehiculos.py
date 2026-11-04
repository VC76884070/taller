# =====================================================
# HISTORIAL DE VEHÍCULOS - JEFE TALLER
# VERSIÓN FULL - INCLUYE TODO EL CICLO DE UNA ORDEN
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging

logger = logging.getLogger(__name__)

historial_vehiculos_bp = Blueprint('historial_vehiculos', __name__, url_prefix='/api/jefe-taller')

supabase = config.supabase


# =====================================================
# HELPERS
# =====================================================

class _NombreCache:
    """Cache local para evitar N+1 queries a usuario"""
    def __init__(self):
        self._cache = {}

    def get(self, uid):
        if not uid:
            return None
        if uid in self._cache:
            return self._cache[uid]
        try:
            r = supabase.table('usuario').select('id, nombre').eq('id', uid).execute()
            if r.data and len(r.data) > 0:
                nombre = r.data[0].get('nombre')
                if nombre and str(nombre).strip():
                    self._cache[uid] = str(nombre).strip()
                else:
                    self._cache[uid] = f"Usuario #{uid}"
            else:
                self._cache[uid] = f"Usuario #{uid}"
            return self._cache[uid]
        except Exception as e:
            logger.warning(f"Error obteniendo nombre {uid}: {e}")
            self._cache[uid] = f"Usuario #{uid}"
            return self._cache[uid]


def _fmt_fecha_iso(fecha):
    """Devuelve fecha ISO string o None"""
    if not fecha:
        return None
    if isinstance(fecha, datetime.datetime):
        return fecha.isoformat()
    return str(fecha)


def _safe_float(val, default=0.0):
    try:
        if val is None: return default
        return float(val)
    except:
        return default


def _safe_int(val, default=0):
    try:
        if val is None: return default
        return int(val)
    except:
        return default


def _get_tecnicos_por_orden(ordenes_ids, cache):
    """Devuelve dict { id_orden: [ {nombre, tipo_asignacion} ] }"""
    tecnicos_map = {}
    if not ordenes_ids:
        return tecnicos_map

    try:
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_orden_trabajo, id_tecnico, tipo_asignacion') \
            .in_('id_orden_trabajo', ordenes_ids) \
            .execute()

        for a in (asignaciones.data or []):
            oid = a.get('id_orden_trabajo')
            tid = a.get('id_tecnico')
            tipo = a.get('tipo_asignacion') or 'diagnostico'
            if not oid: continue
            if oid not in tecnicos_map: tecnicos_map[oid] = []
            if not tid: continue
            
            nombre = cache.get(tid)
            if nombre and not any(t['nombre'] == nombre for t in tecnicos_map[oid]):
                tecnicos_map[oid].append({
                    'nombre': nombre,
                    'tipo_asignacion': tipo
                })
    except Exception as e:
        logger.error(f"Error obteniendo técnicos: {e}")

    return tecnicos_map


# =====================================================
# FUNCIÓN INTERNA: DETALLE COMPLETO DE UNA ORDEN
# =====================================================

def _get_detalle_orden_full(id_orden):
    cache = _NombreCache()
    
    # 1. ORDEN BASE
    orden_result = supabase.table('ordentrabajo').select('*').eq('id', id_orden).execute()
    if not orden_result.data:
        return None
    orden = orden_result.data[0]

    # 2. VEHÍCULO Y CLIENTE
    vehiculo = {}
    cliente = {
        'nombre': 'No registrado', 'telefono': 'No registrado',
        'email': '', 'documento': '', 'es_propietario': True,
        'tipo_tercero': None, 'nombre_tercero': None, 'telefono_tercero': None,
        'ubicacion_tercero': None, 'es_empresa': False, 'nombre_empresa': None,
        'nit_empresa': None, 'ubicacion_empresa': None,
        'nombre_propietario_real': None, 'telefono_propietario_real': None, 'ubicacion_propietario_real': None
    }
    
    if orden.get('id_vehiculo'):
        v = supabase.table('vehiculo').select('*').eq('id', orden['id_vehiculo']).execute()
        if v.data:
            vehiculo = v.data[0]
            if vehiculo.get('id_cliente'):
                c = supabase.table('cliente').select('*').eq('id', vehiculo['id_cliente']).execute()
                if c.data:
                    cli = c.data[0]
                    cliente['email'] = cli.get('email') or ''
                    cliente['documento'] = cli.get('numero_documento') or ''
                    cliente['es_propietario'] = cli.get('es_propietario', True)
                    cliente['tipo_tercero'] = cli.get('tipo_tercero')
                    cliente['nombre_tercero'] = cli.get('nombre_tercero')
                    cliente['telefono_tercero'] = cli.get('telefono_tercero')
                    cliente['ubicacion_tercero'] = cli.get('ubicacion_tercero')
                    cliente['es_empresa'] = cli.get('es_empresa', False)
                    cliente['nombre_empresa'] = cli.get('nombre_empresa')
                    cliente['nit_empresa'] = cli.get('nit_empresa')
                    cliente['ubicacion_empresa'] = cli.get('ubicacion_empresa')
                    cliente['nombre_propietario_real'] = cli.get('nombre_propietario_real')
                    cliente['telefono_propietario_real'] = cli.get('telefono_propietario_real')
                    cliente['ubicacion_propietario_real'] = cli.get('ubicacion_propietario_real')
                    
                    if cli.get('id_usuario'):
                        u = supabase.table('usuario').select('nombre, contacto').eq('id', cli['id_usuario']).execute()
                        if u.data:
                            cliente['nombre'] = u.data[0].get('nombre', 'No registrado')
                            cliente['telefono'] = u.data[0].get('contacto', 'No registrado')

    # 3. JEFES
    jefe_operativo_nombre = cache.get(orden.get('id_jefe_operativo'))
    jefe_operativo_2_nombre = cache.get(orden.get('id_jefe_operativo_2'))
    jefe_taller_instrucciones_nombre = cache.get(orden.get('id_jefe_taller_instrucciones'))

    # 4. RECEPCIÓN
    recepcion_data = {}
    r = supabase.table('recepcion').select('*').eq('id_orden_trabajo', id_orden).execute()
    if r.data:
        recepcion_data = r.data[0]

    campos_obligatorios = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero']
    campos_opcionales = [f'url_opcional{i}' for i in range(1, 11)]

    fotos_obligatorias = {c: recepcion_data.get(c) for c in campos_obligatorios if recepcion_data.get(c)}
    fotos_opcionales = {c: recepcion_data.get(c) for c in campos_opcionales if recepcion_data.get(c)}

    # 5. DIAGNÓSTICO INICIAL
    diagnostico_inicial = None
    di = supabase.table('diagnostigoinicial').select('*').eq('id_orden_trabajo', id_orden).order('fecha_hora', desc=True).limit(1).execute()
    if di.data:
        d = di.data[0]
        diagnostico_inicial = {
            'diagnostico': d.get('diagnostigo'),
            'fecha': _fmt_fecha_iso(d.get('fecha_hora')),
            'audio_url': d.get('url_grabacion'),
            'jefe_nombre': cache.get(d.get('id_jefe_taller'))
        }

    # 6. DIAGNÓSTICOS TÉCNICOS
    diagnosticos_tecnicos = []
    dt_result = supabase.table('diagnostico_tecnico').select('*').eq('id_orden_trabajo', id_orden).order('fecha_envio', desc=False).execute()
    for dt in (dt_result.data or []):
        fotos_dt = []
        f = supabase.table('foto_diagnostico').select('*').eq('id_diagnostico_tecnico', dt['id']).execute()
        for foto in (f.data or []):
            fotos_dt.append({'url': foto.get('url_foto'), 'descripcion': foto.get('descripcion_tecnico')})
        
        obs_list = []
        o = supabase.table('observaciondiagnostico').select('*').eq('id_diagnostico_tecnico', dt['id']).order('fecha_hora', desc=False).execute()
        for obs in (o.data or []):
            obs_list.append({
                'observacion': obs.get('observacion'),
                'fecha': _fmt_fecha_iso(obs.get('fecha_hora')),
                'audio_url': obs.get('url_grabacion_observacion'),
                'transcripcion': obs.get('transcripcion_obs'),
                'jefe_nombre': cache.get(obs.get('id_jefe_taller'))
            })
        
        diagnosticos_tecnicos.append({
            'id': dt['id'],
            'version': _safe_int(dt.get('version'), 1),
            'informe': dt.get('informe'),
            'transcripcion': dt.get('transcripcion_informe'),
            'audio_url': dt.get('url_grabacion_informe'),
            'estado': dt.get('estado'),
            'es_borrador': dt.get('es_borrador', False),
            'fecha_envio': _fmt_fecha_iso(dt.get('fecha_envio')),
            'tecnico_nombre': cache.get(dt.get('id_tecnico')),
            'fotos': fotos_dt,
            'observaciones': obs_list
        })

    # 7. INSTRUCCIONES
    instrucciones = []
    inst_result = supabase.table('instrucciones_tecnico_historial').select('*').eq('id_orden_trabajo', id_orden).order('fecha_envio', desc=False).execute()
    for inst in (inst_result.data or []):
        instrucciones.append({
            'instrucciones': inst.get('instrucciones'),
            'fecha_envio': _fmt_fecha_iso(inst.get('fecha_envio')),
            'leida': inst.get('leida', False),
            'fecha_leida': _fmt_fecha_iso(inst.get('fecha_leida')),
            'jefe_nombre': cache.get(inst.get('id_jefe_taller'))
        })

    # 8. TÉCNICOS ASIGNADOS
    tecnicos_asignados = []
    try:
        asig_result = supabase.table('asignaciontecnico').select('*').eq('id_orden_trabajo', id_orden).execute()
        vistos = set()
        for a in (asig_result.data or []):
            tid = a.get('id_tecnico')
            if not tid or tid in vistos: continue
            vistos.add(tid)
            tecnicos_asignados.append({
                'nombre': cache.get(tid),
                'tipo_asignacion': a.get('tipo_asignacion') or 'diagnostico',
                'fecha_inicio': _fmt_fecha_iso(a.get('fecha_hora_inicio')),
                'fecha_final': _fmt_fecha_iso(a.get('fecha_hora_final'))
            })
    except Exception as e:
        logger.error(f"Error obteniendo técnicos: {e}")

    # 9. PLANIFICACIÓN
    planificacion = None
    plan = supabase.table('planificacion').select('*').eq('id_orden_trabajo', id_orden).execute()
    if plan.data:
        p = plan.data[0]
        planificacion = {
            'bahia': p.get('bahia_asignada'),
            'horas_estimadas': _safe_float(p.get('horas_estimadas')),
            'inicio_estimado': _fmt_fecha_iso(p.get('fecha_hora_inicio_estimado')),
            'fin_estimado': _fmt_fecha_iso(p.get('fecha_hora_fin_estimado'))
        }

    # 10. AVANCES
    avances = []
    av_result = supabase.table('avance_trabajo').select('*').eq('id_orden_trabajo', id_orden).order('numero_avance', desc=False).execute()
    for av in (av_result.data or []):
        fotos_av = []
        if av.get('fotos'):
            try:
                import json
                fotos_data = av['fotos'] if isinstance(av['fotos'], list) else json.loads(av['fotos'])
                for f_ in fotos_data:
                    if isinstance(f_, str): fotos_av.append(f_)
                    elif isinstance(f_, dict): fotos_av.append(f_.get('url', ''))
            except: pass
        
        fa = supabase.table('foto_avance').select('*').eq('id_avance', av['id']).execute()
        for f_ in (fa.data or []):
            if f_.get('url_foto'): fotos_av.append(f_.get('url_foto'))

        avances.append({
            'numero_avance': _safe_int(av.get('numero_avance')),
            'titulo': av.get('titulo'),
            'descripcion': av.get('descripcion'),
            'estado': av.get('estado'),
            'comentario_revision': av.get('comentario_revision'),
            'fecha_creacion': _fmt_fecha_iso(av.get('fecha_creacion')),
            'fecha_aprobacion': _fmt_fecha_iso(av.get('fecha_aprobacion')),
            'aprobado_por': cache.get(av.get('aprobado_por')),
            'tecnico_nombre': cache.get(av.get('id_tecnico')),
            'fotos': [f_ for f_ in fotos_av if f_]
        })

    # 11. COTIZACIÓN Y SERVICIOS
    cotizacion = None
    servicios = []
    total_servicios = 0.0
    cot_result = supabase.table('cotizacion').select('*').eq('id_orden_trabajo', id_orden).order('fecha_generacion', desc=True).limit(1).execute()
    if cot_result.data:
        cot = cot_result.data[0]
        det_result = supabase.table('cotizaciondetalle').select('*').eq('id_cotizacion', cot['id']).execute()
        for d in (det_result.data or []):
            precio = _safe_float(d.get('precio'), 0.0)
            servicios.append({
                'descripcion': d.get('servicio_descripcion') or 'Servicio',
                'precio': precio,
                'aprobado': d.get('aprobado_por_cliente', False)
            })
            total_servicios += precio
        
        cotizacion = {
            'id': cot['id'],
            'estado': cot.get('estado'),
            'fecha_generacion': _fmt_fecha_iso(cot.get('fecha_generacion')),
            'total': _safe_float(cot.get('total'), 0.0),
            'jefe_taller_nombre': cache.get(cot.get('id_jefe_taller')),
            'motivo_rechazo': cot.get('motivo_rechazo')
        }

    # 12. SEGUIMIENTO
    seguimiento = []
    seg_result = supabase.table('seguimientoorden').select('*').eq('id_orden_trabajo', id_orden).order('fecha_hora_cambio', desc=False).execute()
    for s in (seg_result.data or []):
        seguimiento.append({
            'estado': s.get('estado'),
            'motivo_pausa': s.get('motivo_pausa'),
            'fecha_hora': _fmt_fecha_iso(s.get('fecha_hora_cambio'))
        })

    # 13. CONTROL DE CALIDAD
    control_calidad = None
    avances_aprobados = [a for a in avances if a.get('estado') == 'aprobado' and a.get('fecha_aprobacion')]
    if avances_aprobados:
        ultimo = avances_aprobados[-1]
        control_calidad = {
            'aprobado_por': ultimo.get('aprobado_por'),
            'fecha_aprobacion': ultimo.get('fecha_aprobacion'),
            'comentario': ultimo.get('comentario_revision')
        }

    # RESULTADO FINAL
    return {
        'id': orden['id'],
        'codigo_unico': orden['codigo_unico'],
        'estado_global': orden['estado_global'],
        'fecha_ingreso': _fmt_fecha_iso(orden.get('fecha_ingreso')),
        'fecha_salida': _fmt_fecha_iso(orden.get('fecha_salida')),
        'jefe_operativo_nombre': jefe_operativo_nombre,
        'jefe_taller_instrucciones_nombre': jefe_taller_instrucciones_nombre,
        'placa': vehiculo.get('placa', ''),
        'marca': vehiculo.get('marca', ''),
        'modelo': vehiculo.get('modelo', ''),
        'anio': vehiculo.get('anio'),
        'kilometraje': vehiculo.get('kilometraje'),
        'cliente': cliente,
        'descripcion_problema': recepcion_data.get('transcripcion_problema', ''),
        'audio_recepcion': recepcion_data.get('url_grabacion_problema'),
        'fotos': {'obligatorias': fotos_obligatorias, 'opcionales': fotos_opcionales},
        'diagnostico_inicial': diagnostico_inicial,
        'diagnosticos_tecnicos': diagnosticos_tecnicos,
        'instrucciones_tecnico': orden.get('instrucciones_tecnico'),
        'instrucciones': instrucciones,
        'tecnicos_asignados': tecnicos_asignados,
        'planificacion': planificacion,
        'avances': avances,
        'cotizacion': cotizacion,
        'servicios': servicios,
        'total_servicios': total_servicios,
        'seguimiento': seguimiento,
        'control_calidad': control_calidad
    }


# =====================================================
# ENDPOINTS
# =====================================================

@historial_vehiculos_bp.route('/ultimas-ordenes', methods=['GET'])
@jefe_taller_required
def obtener_ultimas_ordenes(current_user):
    try:
        limite = request.args.get('limite', 10, type=int)
        if limite > 10: limite = 10

        ordenes_result = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_vehiculo, id_jefe_operativo') \
            .order('fecha_ingreso', desc=True).limit(limite).execute()

        if not ordenes_result.data:
            return jsonify({'success': True, 'ordenes': [], 'resumen': {'total':0, 'entregados':0, 'en_proceso':0, 'en_pausa':0, 'en_recepcion':0}}), 200

        ordenes = ordenes_result.data
        cache = _NombreCache()

        # Vehículos
        vehiculos_ids = list(set([o.get('id_vehiculo') for o in ordenes if o.get('id_vehiculo')]))
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo').select('id, placa, marca, modelo, id_cliente').in_('id', vehiculos_ids).execute()
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v

        # Clientes
        cliente_ids = list(set([v.get('id_cliente') for v in vehiculos_map.values() if v.get('id_cliente')]))
        clientes_map = {}
        if cliente_ids:
            clientes = supabase.table('cliente').select('id, id_usuario, nombre_tercero, nombre_empresa').in_('id', cliente_ids).execute()
            usuario_ids = list(set([c.get('id_usuario') for c in (clientes.data or []) if c.get('id_usuario')]))
            usuarios_nombres = {}
            if usuario_ids:
                usuarios = supabase.table('usuario').select('id, nombre').in_('id', usuario_ids).execute()
                for u in (usuarios.data or []):
                    usuarios_nombres[u['id']] = u.get('nombre')
            
            for c in (clientes.data or []):
                nombre = usuarios_nombres.get(c.get('id_usuario')) or c.get('nombre_tercero') or c.get('nombre_empresa') or 'Cliente no registrado'
                clientes_map[c['id']] = nombre

        # Diagnósticos
        ordenes_ids = [o['id'] for o in ordenes]
        diagnosticos_map = {}
        if ordenes_ids:
            diagnosticos = supabase.table('diagnostigoinicial').select('id_orden_trabajo, diagnostigo').in_('id_orden_trabajo', ordenes_ids).execute()
            for d in (diagnosticos.data or []):
                diagnosticos_map[d['id_orden_trabajo']] = (d.get('diagnostigo') or '')[:100]

        # Técnicos
        tecnicos_map = _get_tecnicos_por_orden(ordenes_ids, cache)

        ordenes_resultado = []
        for orden in ordenes:
            v = vehiculos_map.get(orden.get('id_vehiculo'), {})
            marca = v.get('marca', '') or ''
            modelo = v.get('modelo', '') or ''
            placa = v.get('placa', 'N/A') or 'N/A'
            vehiculo_info = f"{marca} {modelo} ({placa})".strip() if (marca or modelo) else placa

            ordenes_resultado.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'fecha_ingreso': _fmt_fecha_iso(orden['fecha_ingreso']),
                'fecha_salida': _fmt_fecha_iso(orden.get('fecha_salida')),
                'placa': placa,
                'marca': marca,
                'modelo': modelo,
                'vehiculo_info': vehiculo_info,
                'cliente_nombre': clientes_map.get(v.get('id_cliente'), 'Cliente no registrado'),
                'jefe_operativo_nombre': cache.get(orden.get('id_jefe_operativo')),
                'tecnicos': tecnicos_map.get(orden['id'], []),
                'diagnostico_inicial': diagnosticos_map.get(orden['id'])
            })

        resumen = {
            'total': len(ordenes_resultado),
            'entregados': len([o for o in ordenes_resultado if o['estado_global'] in ['Entregado', 'Finalizado', 'ReparacionCompletada']]),
            'en_proceso': len([o for o in ordenes_resultado if o['estado_global'] in ['EnProceso', 'EnReparacion', 'EnDiagnostico']]),
            'en_pausa': len([o for o in ordenes_resultado if o['estado_global'] == 'EnPausa']),
            'en_recepcion': len([o for o in ordenes_resultado if o['estado_global'] == 'EnRecepcion'])
        }

        return jsonify({'success': True, 'ordenes': ordenes_resultado, 'resumen': resumen}), 200
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@historial_vehiculos_bp.route('/historial-vehiculo', methods=['GET'])
@jefe_taller_required
def obtener_historial_vehiculo(current_user):
    try:
        placa = request.args.get('placa', '').upper().strip()
        if not placa: return jsonify({'error': 'Placa requerida'}), 400

        vehiculo_result = supabase.table('vehiculo').select('*').eq('placa', placa).execute()
        if not vehiculo_result.data:
            return jsonify({'success': True, 'vehiculo': None, 'ordenes': [], 'resumen': {}}), 200

        vehiculo = vehiculo_result.data[0]
        cache = _NombreCache()

        # Cliente
        cliente_nombre = 'No registrado'
        cliente_telefono = 'No registrado'
        if vehiculo.get('id_cliente'):
            c_res = supabase.table('cliente').select('id_usuario, nombre_tercero, nombre_empresa').eq('id', vehiculo['id_cliente']).execute()
            if c_res.data:
                cli = c_res.data[0]
                if cli.get('id_usuario'):
                    u_res = supabase.table('usuario').select('nombre, contacto').eq('id', cli['id_usuario']).execute()
                    if u_res.data:
                        cliente_nombre = u_res.data[0].get('nombre', 'No registrado')
                        cliente_telefono = u_res.data[0].get('contacto', 'No registrado')
                else:
                    cliente_nombre = cli.get('nombre_tercero') or cli.get('nombre_empresa') or 'No registrado'

        # Órdenes
        ordenes_result = supabase.table('ordentrabajo').select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_jefe_operativo').eq('id_vehiculo', vehiculo['id']).order('fecha_ingreso', desc=True).execute()
        
        if not ordenes_result.data:
            return jsonify({'success': True, 'vehiculo': {'id': vehiculo['id'], 'placa': vehiculo['placa'], 'marca': vehiculo.get('marca', ''), 'modelo': vehiculo.get('modelo', ''), 'anio': vehiculo.get('anio'), 'kilometraje': vehiculo.get('kilometraje'), 'cliente_nombre': cliente_nombre, 'cliente_telefono': cliente_telefono}, 'ordenes': [], 'resumen': {}}), 200

        ordenes = ordenes_result.data
        ordenes_ids = [o['id'] for o in ordenes]

        diagnosticos_map = {}
        if ordenes_ids:
            d_res = supabase.table('diagnostigoinicial').select('id_orden_trabajo, diagnostigo').in_('id_orden_trabajo', ordenes_ids).execute()
            for d in (d_res.data or []):
                diagnosticos_map[d['id_orden_trabajo']] = d.get('diagnostigo')

        tecnicos_map = _get_tecnicos_por_orden(ordenes_ids, cache)

        ordenes_resultado = []
        for orden in ordenes:
            ordenes_resultado.append({
                'id': orden['id'],
                'codigo_unico': orden['codigo_unico'],
                'estado_global': orden['estado_global'],
                'fecha_ingreso': _fmt_fecha_iso(orden['fecha_ingreso']),
                'fecha_salida': _fmt_fecha_iso(orden.get('fecha_salida')),
                'jefe_operativo_nombre': cache.get(orden.get('id_jefe_operativo')),
                'tecnicos': tecnicos_map.get(orden['id'], []),
                'diagnostico_inicial': diagnosticos_map.get(orden['id'])
            })

        resumen = {
            'total': len(ordenes_resultado),
            'entregados': len([o for o in ordenes_resultado if o['estado_global'] in ['Entregado', 'Finalizado', 'ReparacionCompletada']]),
            'en_proceso': len([o for o in ordenes_resultado if o['estado_global'] in ['EnProceso', 'EnReparacion', 'EnDiagnostico']]),
            'en_pausa': len([o for o in ordenes_resultado if o['estado_global'] == 'EnPausa']),
            'en_recepcion': len([o for o in ordenes_resultado if o['estado_global'] == 'EnRecepcion'])
        }

        return jsonify({'success': True, 'vehiculo': {'id': vehiculo['id'], 'placa': vehiculo['placa'], 'marca': vehiculo.get('marca', ''), 'modelo': vehiculo.get('modelo', ''), 'anio': vehiculo.get('anio'), 'kilometraje': vehiculo.get('kilometraje'), 'cliente_nombre': cliente_nombre, 'cliente_telefono': cliente_telefono}, 'ordenes': ordenes_resultado, 'resumen': resumen}), 200
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@historial_vehiculos_bp.route('/detalle-completo-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_completo_orden(current_user, id_orden):
    try:
        detalle = _get_detalle_orden_full(id_orden)
        if not detalle:
            logger.warning(f"Orden {id_orden} no encontrada.")
            return jsonify({'error': 'Orden no encontrada'}), 404
        return jsonify({'success': True, 'detalle': detalle}), 200
    except Exception as e:
        logger.error(f"Error detalle completo: {str(e)}")
        return jsonify({'error': str(e)}), 500


@historial_vehiculos_bp.route('/test', methods=['GET'])
@jefe_taller_required
def test_endpoint(current_user):
    return jsonify({'success': True, 'message': 'Historial OK', 'user_id': current_user.get('id')}), 200