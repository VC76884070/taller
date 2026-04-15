# =====================================================
# DIAGNÓSTICO - JEFE DE TALLER
# =====================================================

from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
from decorators import jefe_taller_required
import jwt
import datetime
import logging
import base64
import io
import uuid
import os

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_taller_diagnostico_bp = Blueprint('jefe_taller_diagnostico', __name__, url_prefix='/api/jefe-taller')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# Configuración Cloudinary
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

def obtener_tecnicos():
    """Obtener lista de usuarios con rol técnico"""
    try:
        # Usar función usuario_tiene_rol para filtrar técnicos
        # Primero obtenemos todos los usuarios
        usuarios = supabase.table('usuario').select('id, nombre').execute()
        
        if not usuarios.data:
            return []
        
        # Filtrar aquellos que tienen rol técnico
        tecnicos = []
        for usuario in usuarios.data:
            tiene_rol = supabase.rpc('usuario_tiene_rol', {
                'p_usuario_id': usuario['id'],
                'p_rol_nombre': 'tecnico'
            }).execute()
            
            if tiene_rol.data:
                tecnicos.append(usuario)
        
        return tecnicos
    except Exception as e:
        logger.error(f"Error obteniendo técnicos: {e}")
        return []

def obtener_encargado_repuestos():
    """Obtener el primer encargado de repuestos disponible"""
    try:
        usuarios = supabase.table('usuario').select('id').execute()
        
        if not usuarios.data:
            return None
        
        for usuario in usuarios.data:
            tiene_rol = supabase.rpc('usuario_tiene_rol', {
                'p_usuario_id': usuario['id'],
                'p_rol_nombre': 'encargado_repuestos'
            }).execute()
            
            if tiene_rol.data:
                return usuario['id']
        
        return None
    except Exception as e:
        logger.error(f"Error obteniendo encargado repuestos: {e}")
        return None

# =====================================================
# 1. LISTAR DIAGNÓSTICOS PENDIENTES
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos-pendientes', methods=['GET'])
@jefe_taller_required
def listar_diagnosticos_pendientes(current_user):
    try:
        logger.info("📋 Listando diagnósticos pendientes")
        
        # Obtener diagnósticos con estado 'pendiente' o 'borrador'
        diagnosticos = supabase.table('diagnostico_tecnico') \
            .select('*') \
            .in_('estado', ['pendiente', 'borrador']) \
            .order('fecha_envio', desc=True) \
            .execute()
        
        if not diagnosticos.data:
            logger.info("No hay diagnósticos pendientes")
            return jsonify({'success': True, 'diagnosticos': []}), 200
        
        # Obtener IDs de órdenes y técnicos
        ordenes_ids = list(set([d['id_orden_trabajo'] for d in diagnosticos.data if d.get('id_orden_trabajo')]))
        tecnicos_ids = list(set([d['id_tecnico'] for d in diagnosticos.data if d.get('id_tecnico')]))
        
        logger.info(f"Órdenes IDs: {ordenes_ids}")
        logger.info(f"Técnicos IDs: {tecnicos_ids}")
        
        # Obtener órdenes con vehículos de una vez
        ordenes_map = {}
        if ordenes_ids:
            ordenes = supabase.table('ordentrabajo') \
                .select('id, codigo_unico, id_vehiculo') \
                .in_('id', ordenes_ids) \
                .execute()
            logger.info(f"Órdenes encontradas: {len(ordenes.data) if ordenes.data else 0}")
            for o in (ordenes.data or []):
                ordenes_map[o['id']] = o
        
        # Obtener vehículos de una vez
        vehiculos_ids = list(set([o.get('id_vehiculo') for o in ordenes_map.values() if o.get('id_vehiculo')]))
        vehiculos_map = {}
        if vehiculos_ids:
            vehiculos = supabase.table('vehiculo') \
                .select('id, placa, marca, modelo') \
                .in_('id', vehiculos_ids) \
                .execute()
            logger.info(f"Vehículos encontrados: {len(vehiculos.data) if vehiculos.data else 0}")
            for v in (vehiculos.data or []):
                vehiculos_map[v['id']] = v
        
        # Obtener técnicos usando la nueva función
        tecnicos_map = {}
        if tecnicos_ids:
            # Para cada técnico, verificar que tenga rol 'tecnico'
            for tecnico_id in tecnicos_ids:
                tiene_rol = supabase.rpc('usuario_tiene_rol', {
                    'p_usuario_id': tecnico_id,
                    'p_rol_nombre': 'tecnico'
                }).execute()
                
                if tiene_rol.data:
                    tecnico = supabase.table('usuario') \
                        .select('id, nombre') \
                        .eq('id', tecnico_id) \
                        .execute()
                    if tecnico.data:
                        tecnicos_map[tecnico_id] = tecnico.data[0]['nombre']
        
        # Obtener servicios para cada diagnóstico
        diagnosticos_ids = [d['id'] for d in diagnosticos.data]
        servicios_map = {}
        if diagnosticos_ids:
            servicios = supabase.table('servicio_tecnico') \
                .select('id, descripcion, id_diagnostico_tecnico') \
                .in_('id_diagnostico_tecnico', diagnosticos_ids) \
                .execute()
            logger.info(f"Servicios encontrados: {len(servicios.data) if servicios.data else 0}")
            for s in (servicios.data or []):
                diag_id = s['id_diagnostico_tecnico']
                if diag_id not in servicios_map:
                    servicios_map[diag_id] = []
                servicios_map[diag_id].append({'id': s['id'], 'descripcion': s['descripcion']})
        
        resultado = []
        for dt in diagnosticos.data:
            orden = ordenes_map.get(dt['id_orden_trabajo'], {})
            vehiculo = vehiculos_map.get(orden.get('id_vehiculo'), {})
            tecnico_nombre = tecnicos_map.get(dt['id_tecnico'], '')
            
            resultado.append({
                'diagnostico_id': dt['id'],
                'id_orden_trabajo': dt['id_orden_trabajo'],
                'id_tecnico': dt['id_tecnico'],
                'tecnico_nombre': tecnico_nombre,
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
        
        logger.info(f"✅ {len(resultado)} diagnósticos encontrados")
        return jsonify({'success': True, 'diagnosticos': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error listando diagnósticos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =====================================================
# 2. OBTENER DETALLE DE UN DIAGNÓSTICO
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnostico/<int:diagnostico_id>', methods=['GET'])
@jefe_taller_required
def obtener_diagnostico(current_user, diagnostico_id):
    try:
        logger.info(f"🔍 Obteniendo diagnóstico {diagnostico_id}")
        
        # 1. Obtener diagnóstico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('*') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'error': 'Diagnóstico no encontrado'}), 404
        
        dt = diagnostico.data[0]
        
        # 2. Obtener orden de trabajo
        orden = supabase.table('ordentrabajo') \
            .select('*') \
            .eq('id', dt['id_orden_trabajo']) \
            .execute()
        
        orden_data = orden.data[0] if orden.data else {}
        
        # 3. Obtener vehículo
        vehiculo = {}
        if orden_data.get('id_vehiculo'):
            v = supabase.table('vehiculo') \
                .select('placa, marca, modelo') \
                .eq('id', orden_data['id_vehiculo']) \
                .execute()
            if v.data:
                vehiculo = v.data[0]
        
        # 4. Obtener técnico (verificando rol)
        tecnico_nombre = ''
        tiene_rol_tecnico = supabase.rpc('usuario_tiene_rol', {
            'p_usuario_id': dt['id_tecnico'],
            'p_rol_nombre': 'tecnico'
        }).execute()
        
        if tiene_rol_tecnico.data:
            tecnico = supabase.table('usuario') \
                .select('nombre') \
                .eq('id', dt['id_tecnico']) \
                .execute()
            if tecnico.data:
                tecnico_nombre = tecnico.data[0]['nombre']
        
        # 5. Obtener servicios del diagnóstico
        servicios = supabase.table('servicio_tecnico') \
            .select('id, descripcion, orden') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .order('orden') \
            .execute()
        
        # Obtener precios para los servicios
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
                'precio_estimado': precio.get('precio_estimado') if isinstance(precio, dict) else None,
                'precio_final': precio.get('precio_final') if isinstance(precio, dict) else None
            })
        
        # 6. Obtener solicitudes de repuestos
        solicitudes = supabase.table('solicitud_cotizacion_repuesto') \
            .select('*') \
            .eq('id_orden_trabajo', dt['id_orden_trabajo']) \
            .execute()
        
        # 7. Obtener fotos del diagnóstico
        fotos = supabase.table('foto_diagnostico') \
            .select('*') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .execute()
        
        # 8. Obtener observaciones
        observaciones = supabase.table('observaciondiagnostico') \
            .select('*') \
            .eq('id_diagnostico_tecnico', diagnostico_id) \
            .order('fecha_hora', desc=True) \
            .execute()
        
        # Obtener nombres de jefes de taller para observaciones (verificando rol)
        jefes_ids = list(set([obs.get('id_jefe_taller') for obs in (observaciones.data or []) if obs.get('id_jefe_taller')]))
        jefes_map = {}
        if jefes_ids:
            for jefe_id in jefes_ids:
                tiene_rol = supabase.rpc('usuario_tiene_rol', {
                    'p_usuario_id': jefe_id,
                    'p_rol_nombre': 'jefe_taller'
                }).execute()
                
                if tiene_rol.data:
                    jefe = supabase.table('usuario') \
                        .select('id, nombre') \
                        .eq('id', jefe_id) \
                        .execute()
                    if jefe.data:
                        jefes_map[jefe_id] = jefe.data[0]['nombre']
        
        # También incluir los roles del técnico en la respuesta (opcional)
        roles_tecnico = supabase.rpc('usuario_obtener_roles', {
            'p_usuario_id': dt['id_tecnico']
        }).execute()
        
        resultado = {
            'diagnostico_id': dt['id'],
            'id_orden_trabajo': dt['id_orden_trabajo'],
            'codigo_unico': orden_data.get('codigo_unico', ''),
            'id_tecnico': dt['id_tecnico'],
            'tecnico_nombre': tecnico_nombre,
            'roles_tecnico': roles_tecnico.data if roles_tecnico.data else [],
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
        
        logger.info(f"✅ Diagnóstico {diagnostico_id} obtenido correctamente")
        return jsonify({'success': True, 'diagnostico': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo diagnóstico: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =====================================================
# 3. APROBAR DIAGNÓSTICO
# =====================================================
@jefe_taller_diagnostico_bp.route('/aprobar-diagnostico', methods=['POST'])
@jefe_taller_required
def aprobar_diagnostico(current_user):
    try:
        data = request.get_json()
        diagnostico_id = data.get('diagnostico_id')
        
        if not diagnostico_id:
            return jsonify({'error': 'ID de diagnóstico requerido'}), 400
        
        # Verificar que el diagnóstico existe
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id, id_orden_trabajo, id_tecnico, estado') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'error': 'Diagnóstico no encontrado'}), 404
        
        dt = diagnostico.data[0]
        
        if dt['estado'] != 'pendiente':
            return jsonify({'error': f'El diagnóstico está en estado {dt["estado"]}, no se puede aprobar'}), 400
        
        # Actualizar estado del diagnóstico
        supabase.table('diagnostico_tecnico') \
            .update({
                'estado': 'aprobado',
                'fecha_modificacion': datetime.datetime.now().isoformat()
            }) \
            .eq('id', diagnostico_id) \
            .execute()
        
        # Actualizar estado de la orden de trabajo
        supabase.table('ordentrabajo') \
            .update({'estado_global': 'PendienteAprobacion'}) \
            .eq('id', dt['id_orden_trabajo']) \
            .execute()
        
        # Notificar al técnico
        supabase.table('notificacion').insert({
            'id_usuario_destino': dt['id_tecnico'],
            'tipo': 'diagnostico_aprobado',
            'mensaje': '✅ Tu diagnóstico ha sido APROBADO.',
            'fecha_envio': datetime.datetime.now().isoformat(),
            'leida': False
        }).execute()
        
        logger.info(f"Diagnóstico {diagnostico_id} aprobado por Jefe de Taller {current_user['id']}")
        
        return jsonify({'success': True, 'message': 'Diagnóstico aprobado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error aprobando diagnóstico: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# 4. RECHAZAR DIAGNÓSTICO CON OBSERVACIÓN
# =====================================================
@jefe_taller_diagnostico_bp.route('/rechazar-diagnostico', methods=['POST'])
@jefe_taller_required
def rechazar_diagnostico(current_user):
    try:
        data = request.get_json()
        diagnostico_id = data.get('diagnostico_id')
        observacion = data.get('observacion')
        grabacion_url = data.get('grabacion_url')
        
        if not diagnostico_id:
            return jsonify({'error': 'ID de diagnóstico requerido'}), 400
        
        if not observacion and not grabacion_url:
            return jsonify({'error': 'Debe proporcionar una observación o grabación'}), 400
        
        # Verificar diagnóstico
        diagnostico = supabase.table('diagnostico_tecnico') \
            .select('id, id_orden_trabajo, id_tecnico, version') \
            .eq('id', diagnostico_id) \
            .execute()
        
        if not diagnostico.data:
            return jsonify({'error': 'Diagnóstico no encontrado'}), 404
        
        dt = diagnostico.data[0]
        
        # Guardar observación
        observacion_data = {
            'id_diagnostico_tecnico': diagnostico_id,
            'id_jefe_taller': current_user['id'],
            'observacion': observacion,
            'url_grabacion_observacion': grabacion_url,
            'fecha_hora': datetime.datetime.now().isoformat(),
            'version_diagnostico': dt.get('version', 1) + 1
        }
        
        supabase.table('observaciondiagnostico').insert(observacion_data).execute()
        
        # Actualizar diagnóstico a rechazado
        supabase.table('diagnostico_tecnico') \
            .update({
                'estado': 'rechazado',
                'version': dt.get('version', 1) + 1,
                'fecha_modificacion': datetime.datetime.now().isoformat()
            }) \
            .eq('id', diagnostico_id) \
            .execute()
        
        # Notificar al técnico
        supabase.table('notificacion').insert({
            'id_usuario_destino': dt['id_tecnico'],
            'tipo': 'diagnostico_rechazado',
            'mensaje': f'❌ Tu diagnóstico ha sido RECHAZADO. Motivo: {observacion[:100]}...',
            'fecha_envio': datetime.datetime.now().isoformat(),
            'leida': False
        }).execute()
        
        logger.info(f"Diagnóstico {diagnostico_id} rechazado por Jefe de Taller {current_user['id']}")
        
        return jsonify({'success': True, 'message': 'Diagnóstico rechazado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error rechazando diagnóstico: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# 5. SOLICITAR COTIZACIÓN DE REPUESTO
# =====================================================
@jefe_taller_diagnostico_bp.route('/solicitar-cotizacion-repuesto', methods=['POST'])
@jefe_taller_required
def solicitar_cotizacion_repuesto(current_user):
    try:
        data = request.get_json()
        
        orden_id = data.get('orden_id')
        servicio_id = data.get('servicio_id')
        descripcion_pieza = data.get('descripcion_pieza')
        cantidad = data.get('cantidad', 1)
        urgencia = data.get('urgencia', 'normal')
        observacion = data.get('observacion', '')
        
        if not orden_id or not servicio_id or not descripcion_pieza:
            return jsonify({'error': 'Faltan datos requeridos'}), 400
        
        # Verificar que la orden existe
        orden = supabase.table('ordentrabajo') \
            .select('id, codigo_unico') \
            .eq('id', orden_id) \
            .execute()
        
        if not orden.data:
            return jsonify({'error': 'Orden de trabajo no encontrada'}), 404
        
        # Buscar encargado de repuestos usando la nueva función
        encargado_id = obtener_encargado_repuestos()
        
        # Crear solicitud
        solicitud_data = {
            'id_orden_trabajo': orden_id,
            'id_servicio': servicio_id,
            'id_jefe_taller': current_user['id'],
            'id_encargado_repuestos': encargado_id,
            'descripcion_pieza': descripcion_pieza,
            'cantidad': cantidad,
            'urgencia': urgencia,
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
        
        logger.info(f"Solicitud de repuesto creada para orden {orden_id}")
        
        return jsonify({'success': True, 'solicitud_id': result.data[0]['id'] if result.data else None}), 200
        
    except Exception as e:
        logger.error(f"Error creando solicitud: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# 6. SUBIR AUDIO DE OBSERVACIÓN
# =====================================================
@jefe_taller_diagnostico_bp.route('/subir-audio-observacion', methods=['POST'])
@jefe_taller_required
def subir_audio_observacion(current_user):
    try:
        data = request.get_json()
        audio_base64 = data.get('audio')
        
        if not audio_base64:
            return jsonify({'error': 'Audio no proporcionado'}), 400
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        url = subir_audio_cloudinary(audio_base64, f'observaciones/{current_user["id"]}', f'obs_{timestamp}')
        
        if url:
            return jsonify({'success': True, 'url': url}), 200
        else:
            return jsonify({'error': 'Error subiendo audio'}), 500
            
    except Exception as e:
        logger.error(f"Error subiendo audio: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# 7. ESTADÍSTICAS PARA DASHBOARD
# =====================================================
@jefe_taller_diagnostico_bp.route('/diagnosticos-stats', methods=['GET'])
@jefe_taller_required
def diagnosticos_stats(current_user):
    try:
        estados = ['pendiente', 'aprobado', 'rechazado', 'borrador']
        stats = {}
        
        for estado in estados:
            count = supabase.table('diagnostico_tecnico') \
                .select('id', count='exact') \
                .eq('estado', estado) \
                .execute()
            stats[estado] = count.count if hasattr(count, 'count') else len(count.data) if count.data else 0
        
        return jsonify({'success': True, 'stats': stats}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo stats: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# 8. ASIGNAR PRECIOS A SERVICIOS
# =====================================================
@jefe_taller_diagnostico_bp.route('/asignar-precios-servicios', methods=['POST'])
@jefe_taller_required
def asignar_precios_servicios(current_user):
    try:
        data = request.get_json()
        diagnostico_id = data.get('diagnostico_id')
        servicios = data.get('servicios', [])
        
        if not diagnostico_id:
            return jsonify({'error': 'ID de diagnóstico requerido'}), 400
        
        for servicio in servicios:
            servicio_id = servicio.get('id')
            precio_estimado = servicio.get('precio_estimado')
            precio_final = servicio.get('precio_final')
            
            if not servicio_id:
                continue
            
            existing = supabase.table('servicio_precio') \
                .select('id') \
                .eq('id_servicio', servicio_id) \
                .execute()
            
            if existing.data:
                supabase.table('servicio_precio') \
                    .update({
                        'precio_estimado': precio_estimado,
                        'precio_final': precio_final,
                        'aprobado_por_jefe_taller': True,
                        'aprobado_en': datetime.datetime.now().isoformat()
                    }) \
                    .eq('id_servicio', servicio_id) \
                    .execute()
            else:
                supabase.table('servicio_precio').insert({
                    'id_servicio': servicio_id,
                    'id_jefe_taller': current_user['id'],
                    'precio_estimado': precio_estimado,
                    'precio_final': precio_final,
                    'aprobado_por_jefe_taller': True,
                    'aprobado_en': datetime.datetime.now().isoformat()
                }).execute()
        
        logger.info(f"Precios asignados para diagnóstico {diagnostico_id}")
        
        return jsonify({'success': True, 'message': 'Precios asignados correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error asignando precios: {str(e)}")
        return jsonify({'error': str(e)}), 500