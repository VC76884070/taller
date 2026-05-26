# =====================================================
# DIAGNÓSTICO - JEFE DE TALLER
# Gestión completa de diagnósticos técnicos
# Versión: Solo últimos 5 por estado
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import base64
import io
import os
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_taller_diagnostico_bp = Blueprint('jefe_taller_diagnostico', __name__, url_prefix='/api/jefe-taller')

# Configuración
supabase = config.supabase

# Configuración Cloudinary (opcional)
CLOUDINARY_CONFIGURED = False
try:
    if hasattr(config, 'CLOUDINARY_CLOUD_NAME') and config.CLOUDINARY_CLOUD_NAME:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(
            cloud_name=config.CLOUDINARY_CLOUD_NAME,
            api_key=config.CLOUDINARY_API_KEY,
            api_secret=config.CLOUDINARY_API_SECRET,
            secure=True
        )
        CLOUDINARY_CONFIGURED = True
        logger.info(f"✅ Cloudinary configurado: {config.CLOUDINARY_CLOUD_NAME}")
except Exception as e:
    logger.warning(f"⚠️ Cloudinary no configurado: {e}")


# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def subir_audio_cloudinary(audio_base64, carpeta, nombre):
    """Subir audio a Cloudinary"""
    try:
        if not audio_base64:
            return None
        
        if 'base64,' in audio_base64:
            audio_base64 = audio_base64.split('base64,')[1]
        
        audio_bytes = base64.b64decode(audio_base64)
        audio_file = io.BytesIO(audio_bytes)
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S%f')
        audio_file.name = f"{nombre}_{timestamp}.wav"
        
        if CLOUDINARY_CONFIGURED:
            resultado = cloudinary.uploader.upload(
                audio_file,
                folder=f"furia_motor/{carpeta}",
                public_id=f"{nombre}_{timestamp}",
                resource_type="video"
            )
            return resultado.get('secure_url')
        else:
            upload_dir = os.path.join('uploads', 'audios', carpeta)
            os.makedirs(upload_dir, exist_ok=True)
            filename = f"{nombre}_{timestamp}.wav"
            filepath = os.path.join(upload_dir, filename)
            with open(filepath, 'wb') as f:
                f.write(audio_bytes)
            return f"/uploads/audios/{carpeta}/{filename}"
    except Exception as e:
        logger.error(f"Error subiendo audio: {e}")
        return None


def procesar_diagnosticos(diagnosticos):
    """Procesa y enriquece los diagnósticos con datos relacionados"""
    if not diagnosticos:
        return []
    
    # Obtener todos los IDs en una sola consulta
    ordenes_ids = list(set([d['id_orden_trabajo'] for d in diagnosticos if d.get('id_orden_trabajo')]))
    tecnicos_ids = list(set([d['id_tecnico'] for d in diagnosticos if d.get('id_tecnico')]))
    diagnosticos_ids = [d['id'] for d in diagnosticos]
    
    def fetch_ordenes():
        if not ordenes_ids:
            return {}
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, id_vehiculo') \
            .in_('id', ordenes_ids) \
            .execute()
        return {o['id']: o for o in (ordenes.data or [])}
    
    def fetch_vehiculos():
        if not ordenes_ids:
            return {}
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo') \
            .execute()
        return {v['id']: v for v in (vehiculos.data or [])}
    
    def fetch_tecnicos():
        if not tecnicos_ids:
            return {}
        tecnicos = supabase.table('usuario') \
            .select('id, nombre') \
            .in_('id', tecnicos_ids) \
            .execute()
        return {t['id']: t['nombre'] for t in (tecnicos.data or [])}
    
    def fetch_servicios():
        if not diagnosticos_ids:
            return {}
        servicios = supabase.table('servicio_tecnico') \
            .select('id, descripcion, id_diagnostico_tecnico') \
            .in_('id_diagnostico_tecnico', diagnosticos_ids) \
            .execute()
        servicios_map = {}
        for s in (servicios.data or []):
            diag_id = s['id_diagnostico_tecnico']
            if diag_id not in servicios_map:
                servicios_map[diag_id] = []
            servicios_map[diag_id].append({'id': s['id'], 'descripcion': s['descripcion']})
        return servicios_map
    
    # Ejecutar en paralelo
    with ThreadPoolExecutor(max_workers=4) as executor:
        future_ordenes = executor.submit(fetch_ordenes)
        future_vehiculos = executor.submit(fetch_vehiculos)
        future_tecnicos = executor.submit(fetch_tecnicos)
        future_servicios = executor.submit(fetch_servicios)
        
        ordenes_map = future_ordenes.result()
        vehiculos_map = future_vehiculos.result()
        tecnicos_map = future_tecnicos.result()
        servicios_map = future_servicios.result()
    
    # Construir resultado
    resultado = []
    for dt in diagnosticos:
        orden = ordenes_map.get(dt['id_orden_trabajo'], {})
        vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
        
        resultado.append({
            'diagnostico_id': dt['id'],
            'id_orden_trabajo': dt['id_orden_trabajo'],
            'id_tecnico': dt['id_tecnico'],
            'tecnico_nombre': tecnicos_map.get(dt['id_tecnico'], ''),
            'informe': dt.get('informe', ''),
            'estado': dt['estado'],
            'version': dt.get('version', 1),
            'es_borrador': dt.get('es_borrador', False),
            'fecha_envio': dt.get('fecha_envio'),
            'codigo_unico': orden.get('codigo_unico', ''),
            'placa': vehiculo.get('placa', ''),
            'marca': vehiculo.get('marca', ''),
            'modelo': vehiculo.get('modelo', ''),
            'servicios': servicios_map.get(dt['id'], [])
        })
    
    return resultado


# =====================================================
# 1. LISTAR DIAGNÓSTICOS - SOLO ÚLTIMOS 5 POR ESTADO
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos', methods=['GET'])
@jefe_taller_required
def listar_diagnosticos(current_user):
    """Lista los últimos 5 diagnósticos por estado"""
    try:
        estado_filtro = request.args.get('estado', 'todos')
        logger.info(f"📋 Listando diagnósticos - Últimos 5 - Filtro: {estado_filtro}")
        
        # Si hay filtro específico, solo mostrar últimos 5 de ese estado
        if estado_filtro != 'todos':
            diagnosticos = supabase.table('diagnostico_tecnico') \
                .select('*') \
                .eq('estado', estado_filtro) \
                .order('fecha_envio', desc=True) \
                .limit(5) \
                .execute()
            
            resultado = procesar_diagnosticos(diagnosticos.data or [])
            return jsonify({'success': True, 'diagnosticos': resultado}), 200
        
        # Si no hay filtro, obtener últimos 5 de cada estado en PARALELO
        estados = ['pendiente', 'aprobado', 'rechazado', 'borrador']
        
        def fetch_por_estado(estado):
            return supabase.table('diagnostico_tecnico') \
                .select('*') \
                .eq('estado', estado) \
                .order('fecha_envio', desc=True) \
                .limit(5) \
                .execute()
        
        # Ejecutar consultas en paralelo
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(fetch_por_estado, estado): estado for estado in estados}
            resultados = {}
            for future in futures:
                estado = futures[future]
                try:
                    result = future.result()
                    resultados[estado] = result.data or []
                except Exception as e:
                    logger.error(f"Error fetching {estado}: {e}")
                    resultados[estado] = []
        
        # Combinar resultados
        todos_diagnosticos = []
        for estado in estados:
            todos_diagnosticos.extend(resultados.get(estado, []))
        
        logger.info(f"✅ {len(todos_diagnosticos)} diagnósticos (últimos 5 por estado)")
        
        # Procesar y enriquecer datos
        resultado = procesar_diagnosticos(todos_diagnosticos)
        
        return jsonify({'success': True, 'diagnosticos': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error listando diagnósticos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# 2. LISTAR DIAGNÓSTICOS PENDIENTES (Endpoint legacy)
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos-pendientes', methods=['GET'])
@jefe_taller_required
def listar_diagnosticos_pendientes(current_user):
    """Endpoint legacy - redirige al nuevo endpoint con filtro pendiente"""
    try:
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('*') \
            .in_('estado', ['pendiente', 'borrador']) \
            .order('fecha_envio', desc=True) \
            .limit(5) \
            .execute()
        
        resultado = procesar_diagnosticos(diagnosticos.data or [])
        return jsonify({'success': True, 'diagnosticos': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error listando diagnósticos pendientes: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# 3. OBTENER DETALLE DE UN DIAGNÓSTICO
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnostico/<int:diagnostico_id>', methods=['GET'])
@jefe_taller_required
def obtener_diagnostico(current_user, diagnostico_id):
    """Obtener detalle completo de un diagnóstico"""
    try:
        logger.info(f"🔍 Obteniendo diagnóstico {diagnostico_id}")
        
        # Obtener diagnóstico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('*') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'error': 'Diagnóstico no encontrado'}), 404
        
        dt = diagnostico.data[0]
        
        # Obtener orden y vehículo
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, id_vehiculo') \
            .eq('id', dt['id_orden_trabajo']) \
            .execute()
        orden_data = orden.data[0] if orden.data else {}
        
        vehiculo = {}
        if orden_data.get('id_vehiculo'):
            v = supabase.table('vehiculo') \
                .select('placa, marca, modelo') \
                .eq('id', orden_data['id_vehiculo']) \
                .execute()
            if v.data:
                vehiculo = v.data[0]
        
        # Obtener técnico
        tecnico = supabase.table('usuario') \
            .select('nombre') \
            .eq('id', dt['id_tecnico']) \
            .execute()
        tecnico_nombre = tecnico.data[0]['nombre'] if tecnico.data else ''
        
        # Obtener servicios
        servicios = supabase.table('servicio_tecnico') \
            .select('id, descripcion, orden') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .order('orden') \
            .execute()
        
        # Obtener solicitudes de repuestos
        solicitudes = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .eq('id_orden_trabajo', dt['id_orden_trabajo']) \
            .execute()
        
        # Obtener fotos
        fotos = supabase.table('foto_diagnostico') \
            .select('id, url_foto, descripcion_tecnico, public_id') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .execute()
        
        # Obtener observaciones
        observaciones = supabase.table('observaciondiagnostico') \
            .select('id, observacion, url_grabacion_observacion, fecha_hora, id_jefe_taller') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .order('fecha_hora', desc=True) \
            .limit(10) \
            .execute()
        
        # Obtener nombres de jefes
        jefes_ids = list(set([obs.get('id_jefe_taller') for obs in (observaciones.data or []) if obs.get('id_jefe_taller')]))
        jefes_map = {}
        if jefes_ids:
            jefes = supabase.table('usuario') \
                .select('id, nombre') \
                .in_('id', jefes_ids) \
                .execute()
            for j in (jefes.data or []):
                jefes_map[j['id']] = j['nombre']
        
        # Obtener precios de servicios
        servicios_ids = [s['id'] for s in (servicios.data or [])]
        precios_map = {}
        if servicios_ids:
            precios = supabase.table('servicio_precio') \
                .select('id_servicio, precio_estimado, precio_final') \
                .in_('id_servicio', servicios_ids) \
                .execute()
            for p in (precios.data or []):
                precios_map[p['id_servicio']] = p
        
        servicios_list = []
        for s in (servicios.data or []):
            precio = precios_map.get(s['id'], {})
            servicios_list.append({
                'id': s['id'],
                'descripcion': s['descripcion'],
                'orden': s.get('orden', 0),
                'precio_estimado': precio.get('precio_estimado'),
                'precio_final': precio.get('precio_final')
            })
        
        resultado = {
            'diagnostico_id': dt['id'],
            'id_orden_trabajo': dt['id_orden_trabajo'],
            'codigo_unico': orden_data.get('codigo_unico', ''),
            'id_tecnico': dt['id_tecnico'],
            'tecnico_nombre': tecnico_nombre,
            'informe': dt.get('informe', ''),
            'url_grabacion_informe': dt.get('url_grabacion_informe'),
            'transcripcion_informe': dt.get('transcripcion_informe'),
            'estado': dt['estado'],
            'version': dt.get('version', 1),
            'es_borrador': dt.get('es_borrador', False),
            'fecha_envio': dt.get('fecha_envio'),
            'fecha_modificacion': dt.get('fecha_modificacion'),
            'placa': vehiculo.get('placa', ''),
            'marca': vehiculo.get('marca', ''),
            'modelo': vehiculo.get('modelo', ''),
            'servicios': servicios_list,
            'solicitudes_repuestos': solicitudes.data or [],
            'fotos': fotos.data or [],
            'observaciones': [{
                'id': obs['id'],
                'observacion': obs.get('observacion', ''),
                'url_grabacion': obs.get('url_grabacion_observacion'),
                'jefe_taller_nombre': jefes_map.get(obs.get('id_jefe_taller'), ''),
                'fecha_hora': obs.get('fecha_hora')
            } for obs in (observaciones.data or [])]
        }
        
        return jsonify({'success': True, 'diagnostico': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo diagnóstico: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# 4. ESTADÍSTICAS (CONTEO TOTAL)
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos-stats', methods=['GET'])
@jefe_taller_required
def diagnosticos_stats(current_user):
    """Obtener estadísticas totales (para el contador)"""
    try:
        # Contar todos los diagnósticos por estado
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('estado') \
            .execute()
        
        stats = {
            'pendiente': 0,
            'aprobado': 0,
            'rechazado': 0,
            'borrador': 0
        }
        
        for d in (diagnosticos.data or []):
            estado = d.get('estado')
            if estado in stats:
                stats[estado] += 1
        
        logger.info(f"📊 Stats: Pendientes={stats['pendiente']}, Aprobados={stats['aprobado']}, Rechazados={stats['rechazado']}")
        
        return jsonify({'success': True, 'stats': stats}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo stats: {str(e)}")
        return jsonify({'success': True, 'stats': {'pendiente': 0, 'aprobado': 0, 'rechazado': 0, 'borrador': 0}}), 500


# =====================================================
# 5. APROBAR DIAGNÓSTICO
# =====================================================
@jefe_taller_diagnostico_bp.route('/aprobar-diagnostico-simple', methods=['POST'])
@jefe_taller_required
def aprobar_diagnostico_simple(current_user):
    """Aprobar diagnóstico de forma optimizada"""
    try:
        # Obtener ID
        diagnostico_id = None
        if request.is_json:
            data = request.get_json()
            diagnostico_id = data.get('diagnostico_id') or data.get('id')
        elif request.form:
            diagnostico_id = request.form.get('diagnostico_id') or request.form.get('id')
        
        if not diagnostico_id:
            return jsonify({'success': False, 'error': 'ID de diagnóstico requerido'}), 400
        
        diagnostico_id = int(diagnostico_id)
        
        # Verificar diagnóstico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id, estado, id_orden_trabajo, id_tecnico') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'success': False, 'error': 'Diagnóstico no encontrado'}), 404
        
        dt = diagnostico.data[0]
        
        if dt['estado'] != 'pendiente':
            return jsonify({'success': False, 'error': f'El diagnóstico está en estado "{dt["estado"]}", no se puede aprobar'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Actualizar diagnóstico
        supabase.table('diagnostico_tecnico') \
            .update({
                'estado': 'aprobado',
                'fecha_modificacion': ahora,
                'fecha_aprobacion': ahora
            }) \
            .eq('id', diagnostico_id) \
            .execute()
        
        # Actualizar orden de trabajo
        supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'DiagnosticoAprobado',
                'fecha_aprobacion_diagnostico': ahora
            }) \
            .eq('id', dt['id_orden_trabajo']) \
            .execute()
        
        # Notificar al técnico
        supabase.table('notificacion').insert({
            'id_usuario_destino': dt['id_tecnico'],
            'tipo': 'diagnostico_aprobado',
            'mensaje': '✅ Tu diagnóstico ha sido APROBADO. Ahora se procederá con la cotización.',
            'fecha_envio': ahora,
            'leida': False
        }).execute()
        
        logger.info(f"✅ Diagnóstico {diagnostico_id} aprobado correctamente")
        
        return jsonify({
            'success': True,
            'message': 'Diagnóstico aprobado correctamente',
            'nuevo_estado_diagnostico': 'aprobado',
            'nuevo_estado_orden': 'DiagnosticoAprobado'
        }), 200
        
    except Exception as e:
        logger.error(f"Error aprobando diagnóstico: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# 6. RECHAZAR DIAGNÓSTICO
# =====================================================
@jefe_taller_diagnostico_bp.route('/rechazar-diagnostico', methods=['POST'])
@jefe_taller_required
def rechazar_diagnostico(current_user):
    """Rechazar diagnóstico con observación"""
    try:
        # Obtener datos
        diagnostico_id = None
        observacion = ''
        grabacion_url = None
        
        if request.is_json:
            data = request.get_json()
            diagnostico_id = data.get('diagnostico_id')
            observacion = data.get('observacion', '')
            grabacion_url = data.get('grabacion_url')
        elif request.form:
            diagnostico_id = request.form.get('diagnostico_id')
            observacion = request.form.get('observacion', '')
            grabacion_url = request.form.get('grabacion_url')
        
        if not diagnostico_id:
            return jsonify({'success': False, 'error': 'ID de diagnóstico requerido'}), 400
        
        if not observacion and not grabacion_url:
            return jsonify({'success': False, 'error': 'Debe proporcionar una observación'}), 400
        
        diagnostico_id = int(diagnostico_id)
        
        # Verificar diagnóstico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id, estado, id_orden_trabajo, id_tecnico, version') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'success': False, 'error': 'Diagnóstico no encontrado'}), 404
        
        dt = diagnostico.data[0]
        
        if dt['estado'] != 'pendiente':
            return jsonify({'success': False, 'error': f'El diagnóstico está en estado "{dt["estado"]}", no se puede rechazar'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        nueva_version = dt.get('version', 1) + 1
        
        # Guardar observación
        observacion_data = {
            'id_diagnostico_tecnico': diagnostico_id,
            'id_jefe_taller': current_user['id'],
            'observacion': observacion,
            'url_grabacion_observacion': grabacion_url,
            'fecha_hora': ahora,
            'version_diagnostico': nueva_version
        }
        supabase.table('observaciondiagnostico').insert(observacion_data).execute()
        
        # Actualizar diagnóstico
        supabase.table('diagnostico_tecnico') \
            .update({
                'estado': 'rechazado',
                'version': nueva_version,
                'fecha_modificacion': ahora,
                'fecha_rechazo': ahora,
                'motivo_rechazo': observacion[:200]
            }) \
            .eq('id', diagnostico_id) \
            .execute()
        
        # Actualizar orden de trabajo
        supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'DiagnosticoRechazado',
                'fecha_rechazo_diagnostico': ahora,
                'motivo_rechazo_diagnostico': observacion[:200]
            }) \
            .eq('id', dt['id_orden_trabajo']) \
            .execute()
        
        # Notificar al técnico
        supabase.table('notificacion').insert({
            'id_usuario_destino': dt['id_tecnico'],
            'tipo': 'diagnostico_rechazado',
            'mensaje': f'❌ Tu diagnóstico ha sido RECHAZADO. Motivo: {observacion[:100]}... Por favor, corrígelo y reenvía.',
            'fecha_envio': ahora,
            'leida': False
        }).execute()
        
        logger.info(f"✅ Diagnóstico {diagnostico_id} rechazado correctamente")
        
        return jsonify({
            'success': True,
            'message': 'Diagnóstico rechazado correctamente',
            'nuevo_estado_diagnostico': 'rechazado',
            'nuevo_estado_orden': 'DiagnosticoRechazado'
        }), 200
        
    except Exception as e:
        logger.error(f"Error rechazando diagnóstico: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# 7. SUBIR AUDIO DE OBSERVACIÓN
# =====================================================
@jefe_taller_diagnostico_bp.route('/subir-audio-observacion', methods=['POST'])
@jefe_taller_required
def subir_audio_observacion(current_user):
    """Subir audio de observación a Cloudinary"""
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            data = request.form.to_dict()
        
        audio_base64 = data.get('audio')
        tipo = data.get('tipo', 'observacion')
        
        if not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        url = subir_audio_cloudinary(audio_base64, f'observaciones/{current_user["id"]}', f'{tipo}_{timestamp}')
        
        if url:
            return jsonify({'success': True, 'url': url}), 200
        else:
            return jsonify({'error': 'Error subiendo audio'}), 500
            
    except Exception as e:
        logger.error(f"Error subiendo audio: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# 8. SOLICITAR COTIZACIÓN DE REPUESTO
# =====================================================
@jefe_taller_diagnostico_bp.route('/solicitar-cotizacion-repuesto', methods=['POST'])
@jefe_taller_required
def solicitar_cotizacion_repuesto(current_user):
    """Solicitar cotización de repuestos al encargado"""
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            data = request.form.to_dict()
        
        orden_id = data.get('orden_id')
        servicio_id = data.get('servicio_id')
        descripcion_pieza = data.get('descripcion_pieza')
        cantidad = int(data.get('cantidad', 1))
        observacion = data.get('observacion', '')
        
        if not orden_id or not descripcion_pieza:
            return jsonify({'error': 'Faltan datos requeridos'}), 400
        
        # Verificar orden
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico') \
            .eq('id', orden_id) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden de trabajo no encontrada'}), 404
        
        # Obtener encargado de repuestos
        try:
            encargado_result = supabase.rpc('obtener_encargado_repuestos').execute()
            encargado_id = encargado_result.data if encargado_result.data else None
        except:
            encargado_id = None
        
        solicitud_data = {
            'id_orden_trabajo': int(orden_id),
            'id_servicio': int(servicio_id) if servicio_id else None,
            'id_jefe_taller': current_user['id'],
            'id_encargado_repuestos': encargado_id,
            'descripcion_pieza': descripcion_pieza,
            'cantidad': cantidad,
            'observacion_jefe_taller': observacion,
            'estado': 'pendiente',
            'fecha_solicitud': datetime.datetime.now().isoformat()
        }
        
        result = supabase.table('solicitud_cotizacion_repuesto').insert(solicitud_data).execute()
        
        # Notificar al encargado de repuestos
        if encargado_id:
            supabase.table('notificacion').insert({
                'id_usuario_destino': encargado_id,
                'tipo': 'solicitud_cotizacion',
                'mensaje': f'🔧 Nueva solicitud de cotización: {descripcion_pieza[:50]}...',
                'fecha_envio': datetime.datetime.now().isoformat(),
                'leida': False
            }).execute()
        
        logger.info(f"✅ Solicitud de repuesto creada para orden {orden_id}")
        
        return jsonify({'success': True, 'solicitud_id': result.data[0]['id'] if result.data else None}), 200
        
    except Exception as e:
        logger.error(f"Error creando solicitud: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# 9. ENDPOINT DE PRUEBA
# =====================================================
@jefe_taller_diagnostico_bp.route('/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba para verificar que el blueprint funciona"""
    return jsonify({
        'success': True,
        'message': 'Endpoint de diagnóstico funcionando correctamente',
        'version': '2.0',
        'features': ['Últimos 5 por estado', 'Aprobación optimizada', 'Rechazo con observación']
    }), 200

