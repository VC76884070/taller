# =====================================================
# HISTORIAL DE VEHÍCULOS - JEFE TALLER
# VERSIÓN BLINDADA - ANTI ERRORES 500/404
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import traceback

logger = logging.getLogger(__name__)

historial_vehiculos_bp = Blueprint('historial_vehiculos', __name__)

supabase = config.supabase

# =====================================================
# HELPERS DE SEGURIDAD
# =====================================================

class _NombreCache:
    def __init__(self):
        self._cache = {}
    def get(self, uid):
        if not uid: return "Sin asignar"
        if uid in self._cache: return self._cache[uid]
        try:
            r = supabase.table('usuario').select('nombre').eq('id', uid).execute()
            if r.data and r.data[0].get('nombre'):
                self._cache[uid] = r.data[0]['nombre']
            else:
                self._cache[uid] = f"Usuario #{uid}"
            return self._cache[uid]
        except Exception:
            return f"Usuario #{uid}"

def _fecha(val):
    if not val: return None
    if isinstance(val, datetime.datetime): return val.isoformat()
    return str(val)

def _float(val, default=0.0):
    try: return float(val) if val is not None else default
    except: return default

def _int(val, default=0):
    try: return int(val) if val is not None else default
    except: return default

# =====================================================
# FUNCIÓN MAESTRA: DETALLE COMPLETO
# =====================================================

def _get_detalle_full(id_orden):
    cache = _NombreCache()
    
    # 1. ORDEN
    res_orden = supabase.table('ordentrabajo').select('*').eq('id', id_orden).execute()
    if not res_orden.data: return None
    orden = res_orden.data[0]

    # 2. VEHÍCULO Y CLIENTE
    vehiculo = {}
    cliente = {
        'nombre': 'No registrado', 'telefono': 'No registrado', 'email': '', 'documento': '',
        'es_propietario': True, 'tipo_tercero': None, 'nombre_tercero': None, 'telefono_tercero': None,
        'ubicacion_tercero': None, 'es_empresa': False, 'nombre_empresa': None, 'nit_empresa': None,
        'ubicacion_empresa': None, 'nombre_propietario_real': None, 'telefono_propietario_real': None,
        'ubicacion_propietario_real': None
    }
    
    if orden.get('id_vehiculo'):
        res_v = supabase.table('vehiculo').select('*').eq('id', orden['id_vehiculo']).execute()
        if res_v.data:
            vehiculo = res_v.data[0]
            if vehiculo.get('id_cliente'):
                res_c = supabase.table('cliente').select('*').eq('id', vehiculo['id_cliente']).execute()
                if res_c.data:
                    cli = res_c.data[0]
                    # Extraer todos los datos del cliente
                    cliente.update({
                        'email': cli.get('email') or '', 'documento': cli.get('numero_documento') or '',
                        'es_propietario': cli.get('es_propietario', True), 'tipo_tercero': cli.get('tipo_tercero'),
                        'nombre_tercero': cli.get('nombre_tercero'), 'telefono_tercero': cli.get('telefono_tercero'),
                        'ubicacion_tercero': cli.get('ubicacion_tercero'), 'es_empresa': cli.get('es_empresa', False),
                        'nombre_empresa': cli.get('nombre_empresa'), 'nit_empresa': cli.get('nit_empresa'),
                        'ubicacion_empresa': cli.get('ubicacion_empresa'), 'nombre_propietario_real': cli.get('nombre_propietario_real'),
                        'telefono_propietario_real': cli.get('telefono_propietario_real'), 'ubicacion_propietario_real': cli.get('ubicacion_propietario_real')
                    })
                    if cli.get('id_usuario'):
                        res_u = supabase.table('usuario').select('nombre, contacto').eq('id', cli['id_usuario']).execute()
                        if res_u.data:
                            cliente['nombre'] = res_u.data[0].get('nombre') or 'No registrado'
                            cliente['telefono'] = res_u.data[0].get('contacto') or 'No registrado'

    # 3. RECEPCIÓN
    res_rec = supabase.table('recepcion').select('*').eq('id_orden_trabajo', id_orden).execute()
    rec = res_rec.data[0] if res_rec.data else {}
    
    campos_ob = ['url_lateral_izquierda', 'url_lateral_derecha', 'url_foto_frontal', 'url_foto_trasera', 'url_foto_superior', 'url_foto_inferior', 'url_foto_tablero']
    campos_op = [f'url_opcional{i}' for i in range(1, 11)]
    fotos_ob = {c: rec.get(c) for c in campos_ob if rec.get(c)}
    fotos_op = {c: rec.get(c) for c in campos_op if rec.get(c)}

    # 4. DIAGNÓSTICOS Y AVANCES
    res_diag = supabase.table('diagnostigoinicial').select('*').eq('id_orden_trabajo', id_orden).order('fecha_hora', desc=True).limit(1).execute()
    diag = res_diag.data[0] if res_diag.data else None

    res_dt = supabase.table('diagnostico_tecnico').select('*').eq('id_orden_trabajo', id_orden).order('fecha_envio', desc=False).execute()
    dt_list = []
    for dt in (res_dt.data or []):
        res_f = supabase.table('foto_diagnostico').select('*').eq('id_diagnostico_tecnico', dt['id']).execute()
        res_o = supabase.table('observaciondiagnostico').select('*').eq('id_diagnostico_tecnico', dt['id']).order('fecha_hora', desc=False).execute()
        dt_list.append({
            'id': dt['id'], 'version': _int(dt.get('version'), 1), 'informe': dt.get('informe'),
            'audio_url': dt.get('url_grabacion_informe'), 'es_borrador': dt.get('es_borrador', False),
            'fecha_envio': _fecha(dt.get('fecha_envio')), 'tecnico_nombre': cache.get(dt.get('id_tecnico')),
            'fotos': [{'url': f.get('url_foto'), 'descripcion': f.get('descripcion_tecnico')} for f in (res_f.data or [])],
            'observaciones': [{'observacion': o.get('observacion'), 'fecha': _fecha(o.get('fecha_hora')), 'jefe_nombre': cache.get(o.get('id_jefe_taller'))} for o in (res_o.data or [])]
        })

    res_inst = supabase.table('instrucciones_tecnico_historial').select('*').eq('id_orden_trabajo', id_orden).order('fecha_envio', desc=False).execute()
    inst_list = [{'instrucciones': i.get('instrucciones'), 'fecha_envio': _fecha(i.get('fecha_envio')), 'leida': i.get('leida', False), 'jefe_nombre': cache.get(i.get('id_jefe_taller'))} for i in (res_inst.data or [])]

    res_tec = supabase.table('asignaciontecnico').select('*').eq('id_orden_trabajo', id_orden).execute()
    tec_list = []
    vistos = set()
    for t in (res_tec.data or []):
        if t.get('id_tecnico') and t['id_tecnico'] not in vistos:
            vistos.add(t['id_tecnico'])
            tec_list.append({'nombre': cache.get(t['id_tecnico']), 'tipo_asignacion': t.get('tipo_asignacion') or 'diagnostico'})

    res_av = supabase.table('avance_trabajo').select('*').eq('id_orden_trabajo', id_orden).order('numero_avance', desc=False).execute()
    av_list = []
    for av in (res_av.data or []):
        res_fa = supabase.table('foto_avance').select('*').eq('id_avance', av['id']).execute()
        av_list.append({
            'numero_avance': _int(av.get('numero_avance')), 'titulo': av.get('titulo'), 'descripcion': av.get('descripcion'),
            'estado': av.get('estado'), 'fecha_creacion': _fecha(av.get('fecha_creacion')), 'fecha_aprobacion': _fecha(av.get('fecha_aprobacion')),
            'aprobado_por': cache.get(av.get('aprobado_por')), 'tecnico_nombre': cache.get(av.get('id_tecnico')),
            'fotos': [{'url_foto': f.get('url_foto')} for f in (res_fa.data or [])]
        })

    # 5. COTIZACIÓN Y SEGUIMIENTO
    res_cot = supabase.table('cotizacion').select('*').eq('id_orden_trabajo', id_orden).order('fecha_generacion', desc=True).limit(1).execute()
    cotizacion = None
    servicios = []
    total_s = 0.0
    if res_cot.data:
        c = res_cot.data[0]
        res_det = supabase.table('cotizaciondetalle').select('*').eq('id_cotizacion', c['id']).execute()
        for d in (res_det.data or []):
            p = _float(d.get('precio'))
            servicios.append({'descripcion': d.get('servicio_descripcion') or 'Servicio', 'precio': p, 'aprobado': d.get('aprobado_por_cliente', False)})
            total_s += p
        cotizacion = {'estado': c.get('estado'), 'fecha_generacion': _fecha(c.get('fecha_generacion')), 'total': _float(c.get('total')), 'jefe_taller_nombre': cache.get(c.get('id_jefe_taller')), 'motivo_rechazo': c.get('motivo_rechazo')}

    res_seg = supabase.table('seguimientoorden').select('*').eq('id_orden_trabajo', id_orden).order('fecha_hora_cambio', desc=False).execute()
    seg_list = [{'estado': s.get('estado'), 'motivo_pausa': s.get('motivo_pausa'), 'fecha_hora': _fecha(s.get('fecha_hora_cambio'))} for s in (res_seg.data or [])]

    res_plan = supabase.table('planificacion').select('*').eq('id_orden_trabajo', id_orden).execute()
    plan = res_plan.data[0] if res_plan.data else None

    # RETORNO FINAL
    return {
        'id': orden['id'], 'codigo_unico': orden['codigo_unico'], 'estado_global': orden['estado_global'],
        'fecha_ingreso': _fecha(orden.get('fecha_ingreso')), 'fecha_salida': _fecha(orden.get('fecha_salida')),
        'jefe_operativo_nombre': cache.get(orden.get('id_jefe_operativo')), 'jefe_taller_instrucciones_nombre': cache.get(orden.get('id_jefe_taller_instrucciones')),
        'placa': vehiculo.get('placa', ''), 'marca': vehiculo.get('marca', ''), 'modelo': vehiculo.get('modelo', ''),
        'anio': vehiculo.get('anio'), 'kilometraje': vehiculo.get('kilometraje'), 'cliente': cliente,
        'descripcion_problema': rec.get('transcripcion_problema', ''), 'audio_recepcion': rec.get('url_grabacion_problema'),
        'fotos': {'obligatorias': fotos_ob, 'opcionales': fotos_op},
        'diagnostico_inicial': {'diagnostico': diag.get('diagnostigo'), 'fecha': _fecha(diag.get('fecha_hora')), 'audio_url': diag.get('url_grabacion'), 'jefe_nombre': cache.get(diag.get('id_jefe_taller'))} if diag else None,
        'diagnosticos_tecnicos': dt_list, 'instrucciones_tecnico': orden.get('instrucciones_tecnico'),
        'instrucciones': inst_list, 'tecnicos_asignados': tec_list,
        'planificacion': {'bahia': plan.get('bahia_asignada'), 'horas_estimadas': _float(plan.get('horas_estimadas')), 'inicio_estimado': _fecha(plan.get('fecha_hora_inicio_estimado')), 'fin_estimado': _fecha(plan.get('fecha_hora_fin_estimado'))} if plan else None,
        'avances': av_list, 'cotizacion': cotizacion, 'servicios': servicios, 'total_servicios': total_s,
        'seguimiento': seg_list,
        'control_calidad': {'aprobado_por': av_list[-1]['aprobado_por'], 'fecha_aprobacion': av_list[-1]['fecha_aprobacion'], 'comentario': av_list[-1].get('comentario_revision')} if av_list and av_list[-1]['estado'] == 'aprobado' else None
    }

# =====================================================
# ENDPOINTS
# =====================================================

@historial_vehiculos_bp.route('/ultimas-ordenes', methods=['GET'])
@jefe_taller_required
def obtener_ultimas_ordenes(current_user):
    try:
        limite = request.args.get('limite', 10, type=int)
        res = supabase.table('ordentrabajo').select('id, codigo_unico, estado_global, fecha_ingreso, fecha_salida, id_vehiculo, id_jefe_operativo').order('fecha_ingreso', desc=True).limit(limite).execute()
        if not res.data: return jsonify({'success': True, 'ordenes': [], 'resumen': {'total':0}}), 200
        
        ordenes = res.data
        cache = _NombreCache()
        
        v_ids = list(set([o.get('id_vehiculo') for o in ordenes if o.get('id_vehiculo')]))
        v_map = {v['id']: v for v in supabase.table('vehiculo').select('id, placa, marca, modelo, id_cliente').in_('id', v_ids).execute().data} if v_ids else {}
        
        c_ids = list(set([v.get('id_cliente') for v in v_map.values() if v.get('id_cliente')]))
        c_map = {}
        if c_ids:
            c_data = supabase.table('cliente').select('id, id_usuario, nombre_tercero, nombre_empresa').in_('id', c_ids).execute().data
            u_ids = list(set([c.get('id_usuario') for c in c_data if c.get('id_usuario')]))
            u_map = {u['id']: u.get('nombre') for u in supabase.table('usuario').select('id, nombre').in_('id', u_ids).execute().data} if u_ids else {}
            for c in c_data:
                c_map[c['id']] = u_map.get(c.get('id_usuario')) or c.get('nombre_tercero') or c.get('nombre_empresa') or 'Cliente no registrado'

        o_ids = [o['id'] for o in ordenes]
        d_map = {d['id_orden_trabajo']: (d.get('diagnostigo') or '')[:80] for d in supabase.table('diagnostigoinicial').select('id_orden_trabajo, diagnostigo').in_('id_orden_trabajo', o_ids).execute().data} if o_ids else {}
        
        a_data = supabase.table('asignaciontecnico').select('id_orden_trabajo, id_tecnico, tipo_asignacion').in_('id_orden_trabajo', o_ids).execute().data if o_ids else []
        t_map = {}
        for a in a_data:
            oid, tid = a['id_orden_trabajo'], a.get('id_tecnico')
            if oid not in t_map: t_map[oid] = []
            if tid:
                nombre = cache.get(tid)
                if not any(t['nombre'] == nombre for t in t_map[oid]):
                    t_map[oid].append({'nombre': nombre, 'tipo_asignacion': a.get('tipo_asignacion')})

        resultado = []
        for o in ordenes:
            v = v_map.get(o.get('id_vehiculo'), {})
            marca, modelo, placa = v.get('marca') or '', v.get('modelo') or '', v.get('placa') or 'N/A'
            resultado.append({
                'id': o['id'], 'codigo_unico': o['codigo_unico'], 'estado_global': o['estado_global'],
                'fecha_ingreso': _fecha(o['fecha_ingreso']), 'fecha_salida': _fecha(o.get('fecha_salida')),
                'placa': placa, 'marca': marca, 'modelo': modelo, 'vehiculo_info': f"{marca} {modelo} ({placa})".strip() if (marca or modelo) else placa,
                'cliente_nombre': c_map.get(v.get('id_cliente'), 'Cliente no registrado'), 'jefe_operativo_nombre': cache.get(o.get('id_jefe_operativo')),
                'tecnicos': t_map.get(o['id'], []), 'diagnostico_inicial': d_map.get(o['id'])
            })
            
        return jsonify({'success': True, 'ordenes': resultado, 'resumen': {'total': len(resultado)}}), 200
    except Exception as e:
        logger.error(f"Error últimas órdenes: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@historial_vehiculos_bp.route('/detalle-completo-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_completo_orden(current_user, id_orden):
    try:
        logger.info(f"Buscando detalle de orden ID: {id_orden}")
        detalle = _get_detalle_full(id_orden)
        if not detalle:
            return jsonify({'error': 'Orden no encontrada'}), 404
        return jsonify({'success': True, 'detalle': detalle}), 200
    except Exception as e:
        logger.error(f"Error detalle orden {id_orden}: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': f"Error interno: {str(e)}"}), 500

@historial_vehiculos_bp.route('/test', methods=['GET'])
@jefe_taller_required
def test_endpoint(current_user):
    return jsonify({'success': True, 'message': 'Historial OK'}), 200