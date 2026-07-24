# =====================================================
# DIAGNÓSTICO - JEFE DE TALLER
# Gestión completa de diagnósticos técnicos
# MIGRADO A GOOGLE DRIVE
# ESTRUCTURA: {CODIGO_ORDEN}/DIAGNOSTICO_JEFE_TALLER/RECHAZADO/
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import base64
import io
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_taller_diagnostico_bp = Blueprint('jefe_taller_diagnostico', __name__, url_prefix='/api/jefe-taller')

# Configuración
supabase = config.supabase

# Importar Google Drive
from google_drive import google_drive


# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_codigo_orden(id_orden):
    """Obtiene el código único de una orden de trabajo"""
    try:
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .eq('id', id_orden) \
            .execute()
        
        if orden.data:
            return orden.data[0]['codigo_unico']
        return None
    except Exception as e:
        logger.error(f"Error obteniendo código de orden: {str(e)}")
        return None


def obtener_id_orden_por_diagnostico(diagnostico_id):
    """Obtiene el id_orden_trabajo a partir de un diagnostico_id"""
    try:
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id_orden_trabajo') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if diagnostico.data:
            return diagnostico.data[0]['id_orden_trabajo']
        return None
    except Exception as e:
        logger.error(f"Error obteniendo orden por diagnóstico: {str(e)}")
        return None


def subir_audio_rechazo_drive(audio_file, codigo_orden):
    """
    Sube un audio de rechazo a Google Drive
    ESTRUCTURA: {CODIGO_ORDEN}/DIAGNOSTICO_JEFE_TALLER/RECHAZADO/
    El audio se guarda directamente en la carpeta RECHAZADO
    """
    try:
        if not audio_file:
            return None
        
        # Ruta: {CODIGO_ORDEN}/DIAGNOSTICO_JEFE_TALLER/RECHAZADO
        folder_path = f"{codigo_orden}/DIAGNOSTICO_JEFE_TALLER/RECHAZADO"
        
        # Generar nombre de archivo único
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"rechazo_audio_{timestamp}_{uuid.uuid4().hex[:8]}.mp3"
        
        # Subir a Google Drive
        resultado = google_drive.upload_file(
            file_data=audio_file,
            filename=filename,
            folder_path=folder_path,
            public=True
        )
        
        if resultado and resultado.get('url'):
            logger.info(f"✅ Audio de rechazo subido a Drive: {resultado['url']}")
            logger.info(f"   📁 Ruta: {folder_path}/{filename}")
            return resultado['url']
        else:
            logger.error("❌ Error subiendo audio de rechazo a Drive")
            return None
            
    except Exception as e:
        logger.error(f"Error subiendo audio de rechazo: {str(e)}")
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
# 1. LISTAR DIAGNÓSTICOS
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos', methods=['GET'])
@jefe_taller_required
def listar_diagnosticos(current_user):
    """Lista los últimos 10 diagnósticos por estado"""
    try:
        estado_filtro = request.args.get('estado', 'todos')
        logger.info(f"📋 Listando diagnósticos - Filtro: {estado_filtro}")
        
        if estado_filtro != 'todos':
            diagnosticos = supabase.table('diagnostico_tecnico') \
                .select('*') \
                .eq('estado', estado_filtro) \
                .order('fecha_envio', desc=True) \
                .limit(10) \
                .execute()
            
            resultado = procesar_diagnosticos(diagnosticos.data or [])
            return jsonify({'success': True, 'diagnosticos': resultado}), 200
        
        estados = ['pendiente', 'aprobado', 'rechazado', 'borrador']
        
        def fetch_por_estado(estado):
            return supabase.table('diagnostico_tecnico') \
                .select('*') \
                .eq('estado', estado) \
                .order('fecha_envio', desc=True) \
                .limit(10) \
                .execute()
        
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
        
        todos_diagnosticos = []
        for estado in estados:
            todos_diagnosticos.extend(resultados.get(estado, []))
        
        logger.info(f"✅ {len(todos_diagnosticos)} diagnósticos")
        resultado = procesar_diagnosticos(todos_diagnosticos)
        
        return jsonify({'success': True, 'diagnosticos': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error listando diagnósticos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# =====================================================
# 2. LISTAR DIAGNÓSTICOS PENDIENTES (Legacy)
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos-pendientes', methods=['GET'])
@jefe_taller_required
def listar_diagnosticos_pendientes(current_user):
    """Endpoint legacy - Últimos 10 pendientes/borradores"""
    try:
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('*') \
            .in_('estado', ['pendiente', 'borrador']) \
            .order('fecha_envio', desc=True) \
            .limit(10) \
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
# 4. ESTADÍSTICAS
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos-stats', methods=['GET'])
@jefe_taller_required
def diagnosticos_stats(current_user):
    """Obtener estadísticas totales"""
    try:
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
    """Aprobar diagnóstico"""
    try:
        diagnostico_id = None
        if request.is_json:
            data = request.get_json()
            diagnostico_id = data.get('diagnostico_id') or data.get('id')
        elif request.form:
            diagnostico_id = request.form.get('diagnostico_id') or request.form.get('id')
        
        if not diagnostico_id:
            return jsonify({'success': False, 'error': 'ID de diagnóstico requerido'}), 400
        
        diagnostico_id = int(diagnostico_id)
        
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
        
        supabase.table('diagnostico_tecnico') \
            .update({
                'estado': 'aprobado',
                'fecha_modificacion': ahora
            }) \
            .eq('id', diagnostico_id) \
            .execute()
        
        supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'DiagnosticoAprobado'
            }) \
            .eq('id', dt['id_orden_trabajo']) \
            .execute()
        
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
# 6. RECHAZAR DIAGNÓSTICO - CON GOOGLE DRIVE
# ESTRUCTURA: {CODIGO_ORDEN}/DIAGNOSTICO_JEFE_TALLER/RECHAZADO/
# =====================================================
@jefe_taller_diagnostico_bp.route('/rechazar-diagnostico', methods=['POST'])
@jefe_taller_required
def rechazar_diagnostico(current_user):
    """
    Rechazar diagnóstico con observación y audio subido a Google Drive
    ESTRUCTURA: {CODIGO_ORDEN}/DIAGNOSTICO_JEFE_TALLER/RECHAZADO/
    """
    try:
        # Obtener datos del formulario
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
        
        # Obtener código de la orden para la carpeta
        codigo_orden = obtener_codigo_orden(dt['id_orden_trabajo'])
        if not codigo_orden:
            logger.warning(f"No se encontró código para orden {dt['id_orden_trabajo']}, usando ID")
            codigo_orden = f"ORDEN_{dt['id_orden_trabajo']}"
        
        # =============================================
        # PROCESAR AUDIO
        # ESTRUCTURA: {CODIGO_ORDEN}/DIAGNOSTICO_JEFE_TALLER/RECHAZADO/
        # =============================================
        audio_url_drive = None
        
        # Verificar si hay audio en el request (como archivo)
        if 'audio' in request.files:
            audio_file = request.files['audio']
            if audio_file and audio_file.filename != '':
                audio_url_drive = subir_audio_rechazo_drive(audio_file, codigo_orden)
        elif grabacion_url:
            # Si ya viene una URL (de Cloudinary), la usamos
            audio_url_drive = grabacion_url
        else:
            # Revisar si viene audio en base64
            audio_base64 = request.form.get('audio_base64')
            if audio_base64:
                try:
                    if 'base64,' in audio_base64:
                        audio_base64 = audio_base64.split('base64,')[1]
                    audio_bytes = base64.b64decode(audio_base64)
                    
                    audio_file = io.BytesIO(audio_bytes)
                    audio_file.name = f"rechazo_audio_{uuid.uuid4().hex[:8]}.wav"
                    
                    audio_url_drive = subir_audio_rechazo_drive(audio_file, codigo_orden)
                except Exception as e:
                    logger.error(f"Error procesando audio base64: {str(e)}")
        
        ahora = datetime.datetime.now().isoformat()
        nueva_version = dt.get('version', 1) + 1
        
        # Guardar observación con la URL de Drive
        observacion_data = {
            'id_diagnostico_tecnico': diagnostico_id,
            'id_jefe_taller': current_user['id'],
            'observacion': observacion,
            'url_grabacion_observacion': audio_url_drive or grabacion_url,
            'fecha_hora': ahora,
            'version_diagnostico': nueva_version
        }
        supabase.table('observaciondiagnostico').insert(observacion_data).execute()
        
        # Actualizar diagnóstico
        supabase.table('diagnostico_tecnico') \
            .update({
                'estado': 'rechazado',
                'version': nueva_version,
                'fecha_modificacion': ahora
            }) \
            .eq('id', diagnostico_id) \
            .execute()
        
        # Actualizar orden de trabajo
        supabase.table('ordentrabajo') \
            .update({
                'estado_global': 'DiagnosticoRechazado'
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
        logger.info(f"   📁 Audio en: {codigo_orden}/DIAGNOSTICO_JEFE_TALLER/RECHAZADO/")
        logger.info(f"   🔗 URL: {audio_url_drive}")
        
        return jsonify({
            'success': True,
            'message': 'Diagnóstico rechazado correctamente',
            'audio_url': audio_url_drive,
            'nuevo_estado_diagnostico': 'rechazado',
            'nuevo_estado_orden': 'DiagnosticoRechazado'
        }), 200
        
    except Exception as e:
        logger.error(f"Error rechazando diagnóstico: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# 7. SUBIR AUDIO DE OBSERVACIÓN (LEGACY - CORREGIDO)
# =====================================================
@jefe_taller_diagnostico_bp.route('/subir-audio-observacion', methods=['POST'])
@jefe_taller_required
def subir_audio_observacion(current_user):
    """
    CORREGIDO: Ahora obtiene el diagnóstico_id correctamente
    y sube el audio a la carpeta correcta
    """
    try:
        # OBTENER DIAGNOSTICO_ID (MÉTODO CORREGIDO)
        diagnostico_id = request.form.get('diagnostico_id')
        
        # Si no viene en form, buscar en JSON
        if not diagnostico_id and request.is_json:
            data = request.get_json(force=True, silent=True) or {}
            diagnostico_id = data.get('diagnostico_id')
        
        # Si no viene en ninguna parte, buscar en args
        if not diagnostico_id:
            diagnostico_id = request.args.get('diagnostico_id')
        
        logger.info(f"🔍 Diagnóstico ID obtenido: {diagnostico_id}")
        
        # Obtener audio
        audio_base64 = None
        audio_file = None
        
        # Verificar si viene como archivo
        if 'audio' in request.files:
            audio_file = request.files['audio']
            if audio_file and audio_file.filename != '':
                logger.info(f"🎵 Audio recibido como archivo: {audio_file.filename}")
        
        # Si no hay archivo, buscar base64
        if not audio_file:
            if request.is_json:
                data = request.get_json(force=True, silent=True) or {}
                audio_base64 = data.get('audio')
            else:
                audio_base64 = request.form.get('audio')
        
        if not audio_file and not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        # OBTENER CÓDIGO DE ORDEN
        codigo_orden = None
        
        if diagnostico_id:
            try:
                diagnostico_id = int(diagnostico_id)
                id_orden = obtener_id_orden_por_diagnostico(diagnostico_id)
                if id_orden:
                    codigo_orden = obtener_codigo_orden(id_orden)
                    logger.info(f"📋 Código de orden obtenido: {codigo_orden}")
            except Exception as e:
                logger.error(f"Error obteniendo orden: {str(e)}")
        
        # Si no se pudo obtener, usar TEMP
        if not codigo_orden:
            logger.warning("⚠️ No se pudo obtener código de orden, usando TEMP")
            codigo_orden = "TEMP"
        
        # SUBIR AUDIO
        audio_url = None
        
        if audio_file:
            audio_url = subir_audio_rechazo_drive(audio_file, codigo_orden)
        elif audio_base64:
            try:
                if 'base64,' in audio_base64:
                    audio_base64 = audio_base64.split('base64,')[1]
                audio_bytes = base64.b64decode(audio_base64)
                audio_file = io.BytesIO(audio_bytes)
                audio_file.name = f"observacion_audio_{uuid.uuid4().hex[:8]}.wav"
                audio_url = subir_audio_rechazo_drive(audio_file, codigo_orden)
            except Exception as e:
                logger.error(f"Error procesando base64: {str(e)}")
                return jsonify({'error': f'Error procesando audio: {str(e)}'}), 400
        
        if audio_url:
            logger.info(f"✅ Audio subido correctamente a Drive")
            return jsonify({
                'success': True,
                'url': audio_url,
                'folder': f"{codigo_orden}/DIAGNOSTICO_JEFE_TALLER/RECHAZADO/"
            }), 200
        else:
            return jsonify({'error': 'Error subiendo audio'}), 500
            
    except Exception as e:
        logger.error(f"Error subiendo audio: {str(e)}")
        import traceback
        traceback.print_exc()
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
        
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico') \
            .eq('id', orden_id) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden de trabajo no encontrada'}), 404
        
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
    """Endpoint de prueba"""
    return jsonify({
        'success': True,
        'message': 'Endpoint de diagnóstico funcionando correctamente',
        'version': '3.1',
        'features': ['Google Drive', 'Rechazo con carpeta correcta']
    }), 200