# =====================================================
# GESTION_AVANCES.PY - JEFE DE TALLER (VERSIÓN OPTIMIZADA)
# SOLO ÚLTIMOS 10 AVANCES - MÁXIMA VELOCIDAD
# =====================================================

from flask import Blueprint, request, jsonify, g
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import json
import time

logger = logging.getLogger(__name__)

# Crear el Blueprint con el prefijo de URL correcto
avance_jefe_bp = Blueprint('avance_jefe', __name__, url_prefix='/api/jefe-taller/avances')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# CACHE EN MEMORIA
# =====================================================

class CacheManager:
    def __init__(self):
        self._cache = {}
    
    def get(self, key):
        if key in self._cache:
            data, timestamp, ttl = self._cache[key]
            if time.time() - timestamp < ttl:
                return data
            del self._cache[key]
        return None
    
    def set(self, key, data, ttl=30):
        self._cache[key] = (data, time.time(), ttl)
    
    def clear(self, key=None):
        if key:
            self._cache.pop(key, None)
        else:
            self._cache.clear()

cache = CacheManager()


# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def notificar_tecnico(id_tecnico, tipo, mensaje, id_referencia=None):
    """Enviar notificación al técnico"""
    try:
        supabase.table('notificacion').insert({
            'id_usuario_destino': id_tecnico,
            'tipo': tipo,
            'mensaje': mensaje,
            'fecha_envio': datetime.datetime.now().isoformat(),
            'leida': False,
            'id_referencia': id_referencia
        }).execute()
        logger.info(f"✅ Notificación enviada al técnico {id_tecnico}")
    except Exception as e:
        logger.warning(f"⚠️ Error enviando notificación: {e}")


def parse_fotos(fotos_data):
    """Parsear el campo de fotos (puede ser string JSON o lista)"""
    if not fotos_data:
        return []
    try:
        if isinstance(fotos_data, str):
            return json.loads(fotos_data)
        return fotos_data
    except:
        return []


def obtener_datos_avances_con_join(avances_data):
    """Optimizado: Obtener técnicos y órdenes en UNA SOLA consulta"""
    if not avances_data:
        return []
    
    # Extraer IDs únicos
    tecnicos_ids = list(set([a['id_tecnico'] for a in avances_data]))
    ordenes_ids = list(set([a['id_orden_trabajo'] for a in avances_data]))
    
    # Obtener todos los técnicos de una vez
    tecnicos_map = {}
    if tecnicos_ids:
        tecnicos = supabase.table('usuario') \
            .select('id, nombre') \
            .in_('id', tecnicos_ids) \
            .execute()
        for t in (tecnicos.data or []):
            tecnicos_map[t['id']] = t['nombre']
    
    # Obtener todas las órdenes de una vez
    ordenes_map = {}
    if ordenes_ids:
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico') \
            .in_('id', ordenes_ids) \
            .execute()
        for o in (ordenes.data or []):
            ordenes_map[o['id']] = o['codigo_unico']
    
    # Construir resultado
    resultado = []
    for avance in avances_data:
        resultado.append({
            'id': avance['id'],
            'titulo': avance['titulo'],
            'descripcion': avance.get('descripcion', ''),
            'fotos': parse_fotos(avance.get('fotos')),
            'estado': avance['estado'],
            'fecha_creacion': avance['fecha_creacion'],
            'fecha_aprobacion': avance.get('fecha_aprobacion'),
            'comentario_revision': avance.get('comentario_revision'),
            'tecnico_nombre': tecnicos_map.get(avance['id_tecnico'], 'Desconocido'),
            'orden_codigo': ordenes_map.get(avance['id_orden_trabajo'], 'N/A')
        })
    
    return resultado


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@avance_jefe_bp.route('/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba para verificar que el blueprint funciona"""
    return jsonify({
        'success': True, 
        'message': 'Blueprint de avances funcionando correctamente'
    }), 200


# =====================================================
# ENDPOINT PENDIENTES - SOLO ÚLTIMOS 10 (OPTIMIZADO)
# =====================================================

@avance_jefe_bp.route('/pendientes', methods=['GET'])
@jefe_taller_required
def obtener_avances_pendientes(current_user):
    """Obtener SOLO los últimos 10 avances pendientes de revisión - MÁS RÁPIDO"""
    try:
        logger.info(f"🔍 Usuario {current_user.get('id')} solicitando avances pendientes")
        
        # Verificar caché
        cached_data = cache.get('avances_pendientes')
        if cached_data:
            logger.info("📦 Usando caché de avances pendientes")
            return jsonify({'success': True, 'avances': cached_data}), 200
        
        # Consultar SOLO últimos 10 avances pendientes
        avances = supabase.table('avance_trabajo') \
            .select('id, titulo, descripcion, fotos, estado, fecha_creacion, id_tecnico, id_orden_trabajo') \
            .eq('estado', 'pendiente') \
            .order('fecha_creacion', desc=True) \
            .limit(10) \
            .execute()
        
        logger.info(f"📊 Avances pendientes encontrados: {len(avances.data) if avances.data else 0}")
        
        if not avances.data:
            return jsonify({'success': True, 'avances': []}), 200
        
        # Obtener datos adicionales con JOIN optimizado
        resultado = obtener_datos_avances_con_join(avances.data)
        
        # Guardar en caché por 15 segundos
        cache.set('avances_pendientes', resultado, ttl=15)
        
        logger.info(f"✅ Devueltos {len(resultado)} avances pendientes (últimos 10)")
        return jsonify({'success': True, 'avances': resultado}), 200
        
    except Exception as e:
        logger.error(f"❌ Error en obtener_avances_pendientes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENDPOINT CONTADOR PENDIENTES (PARA EL BADGE)
# =====================================================

@avance_jefe_bp.route('/contador', methods=['GET'])
@jefe_taller_required
def obtener_contador_pendientes(current_user):
    """Obtener solo el número TOTAL de avances pendientes (para el badge)"""
    try:
        # Verificar caché del contador
        cached_count = cache.get('pendientes_count')
        if cached_count is not None:
            return jsonify({'success': True, 'pendientes_count': cached_count}), 200
        
        # Consulta ligera: solo contar, no traer datos
        result = supabase.table('avance_trabajo') \
            .select('id', count='exact') \
            .eq('estado', 'pendiente') \
            .execute()
        
        count = result.count if hasattr(result, 'count') else len(result.data or [])
        
        # Guardar en caché por 30 segundos
        cache.set('pendientes_count', count, ttl=30)
        
        return jsonify({'success': True, 'pendientes_count': count}), 200
        
    except Exception as e:
        logger.error(f"❌ Error en contador: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENDPOINT PROCESADOS - SOLO ÚLTIMOS 20 (OPTIMIZADO)
# =====================================================

@avance_jefe_bp.route('/procesados', methods=['GET'])
@jefe_taller_required
def obtener_avances_procesados(current_user):
    """Obtener SOLO los últimos 20 avances procesados (aprobados o rechazados)"""
    try:
        estado_filtro = request.args.get('estado', 'all')
        logger.info(f"🔍 Usuario {current_user.get('id')} solicitando avances procesados - Filtro: {estado_filtro}")
        
        # Clave de caché según el filtro
        cache_key = f'avances_procesados_{estado_filtro}'
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.info(f"📦 Usando caché para {cache_key}")
            return jsonify({'success': True, 'avances': cached_data}), 200
        
        # Construir consulta - SOLO últimos 20
        query = supabase.table('avance_trabajo') \
            .select('id, titulo, descripcion, fotos, estado, fecha_creacion, fecha_aprobacion, comentario_revision, id_tecnico, id_orden_trabajo') \
            .in_('estado', ['aprobado', 'rechazado']) \
            .order('fecha_aprobacion', desc=True) \
            .limit(20)
        
        if estado_filtro in ['aprobado', 'rechazado']:
            query = query.eq('estado', estado_filtro)
        
        avances = query.execute()
        
        if not avances.data:
            return jsonify({'success': True, 'avances': []}), 200
        
        # Obtener datos adicionales con JOIN optimizado
        resultado = obtener_datos_avances_con_join(avances.data)
        
        # Guardar en caché por 30 segundos
        cache.set(cache_key, resultado, ttl=30)
        
        logger.info(f"✅ Devueltos {len(resultado)} avances procesados")
        return jsonify({'success': True, 'avances': resultado}), 200
        
    except Exception as e:
        logger.error(f"❌ Error en obtener_avances_procesados: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENDPOINT DETALLE
# =====================================================

@avance_jefe_bp.route('/detalle/<int:id_avance>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_avance(current_user, id_avance):
    """Obtener detalle completo de un avance específico"""
    try:
        logger.info(f"🔍 Usuario {current_user.get('id')} solicitando detalle del avance {id_avance}")
        
        # Obtener avance
        avance = supabase.table('avance_trabajo') \
            .select('*') \
            .eq('id', id_avance) \
            .execute()
        
        if not avance.data:
            return jsonify({'success': False, 'error': 'Avance no encontrado'}), 404
        
        avance_data = avance.data[0]
        
        # Obtener datos adicionales con JOIN optimizado
        resultado = obtener_datos_avances_con_join([avance_data])
        
        return jsonify({
            'success': True,
            'avance': resultado[0] if resultado else None
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error en obtener_detalle_avance: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENDPOINT APROBAR
# =====================================================

@avance_jefe_bp.route('/aprobar/<int:id_avance>', methods=['PUT'])
@jefe_taller_required
def aprobar_avance(current_user, id_avance):
    """Aprobar un avance de trabajo"""
    try:
        data = request.get_json() or {}
        comentario = data.get('comentario', '')
        
        logger.info(f"✅ Usuario {current_user.get('id')} aprobando avance {id_avance}")
        
        ahora = datetime.datetime.now().isoformat()
        
        # Obtener el avance para conocer al técnico
        avance = supabase.table('avance_trabajo') \
            .select('id_tecnico, id_orden_trabajo, titulo') \
            .eq('id', id_avance) \
            .execute()
        
        if not avance.data:
            return jsonify({'success': False, 'error': 'Avance no encontrado'}), 404
        
        tecnico_id = avance.data[0]['id_tecnico']
        titulo_avance = avance.data[0]['titulo']
        
        # Actualizar avance a aprobado
        supabase.table('avance_trabajo') \
            .update({
                'estado': 'aprobado',
                'fecha_aprobacion': ahora,
                'comentario_revision': comentario,
                'aprobado_por': current_user['id']
            }) \
            .eq('id', id_avance) \
            .execute()
        
        # Notificar al técnico
        mensaje = f"✅ Tu avance '{titulo_avance}' ha sido APROBADO."
        if comentario:
            mensaje += f" Comentario: {comentario}"
        
        notificar_tecnico(tecnico_id, 'avance_aprobado', mensaje, id_avance)
        
        # Limpiar caché
        cache.clear('avances_pendientes')
        cache.clear('pendientes_count')
        cache.clear('avances_procesados_all')
        cache.clear('avances_procesados_aprobado')
        cache.clear('avances_procesados_rechazado')
        
        logger.info(f"✅ Avance {id_avance} aprobado correctamente")
        return jsonify({'success': True, 'message': 'Avance aprobado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"❌ Error en aprobar_avance: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENDPOINT RECHAZAR
# =====================================================

@avance_jefe_bp.route('/rechazar/<int:id_avance>', methods=['PUT'])
@jefe_taller_required
def rechazar_avance(current_user, id_avance):
    """Rechazar un avance de trabajo y notificar al técnico para corregir"""
    try:
        data = request.get_json() or {}
        motivo = data.get('motivo', '').strip()
        
        if not motivo:
            return jsonify({'success': False, 'error': 'Debes proporcionar el motivo del rechazo'}), 400
        
        logger.info(f"❌ Usuario {current_user.get('id')} rechazando avance {id_avance} - Motivo: {motivo}")
        
        ahora = datetime.datetime.now().isoformat()
        
        # Obtener el avance para conocer al técnico
        avance = supabase.table('avance_trabajo') \
            .select('id_tecnico, id_orden_trabajo, titulo') \
            .eq('id', id_avance) \
            .execute()
        
        if not avance.data:
            return jsonify({'success': False, 'error': 'Avance no encontrado'}), 404
        
        tecnico_id = avance.data[0]['id_tecnico']
        titulo_avance = avance.data[0]['titulo']
        
        # Actualizar avance (dejar en pendiente para que el técnico pueda corregir)
        supabase.table('avance_trabajo') \
            .update({
                'estado': 'pendiente',
                'comentario_revision': f"Rechazado: {motivo}",
                'aprobado_por': current_user['id']
            }) \
            .eq('id', id_avance) \
            .execute()
        
        # Notificar al técnico
        mensaje = f"❌ Tu avance '{titulo_avance}' necesita correcciones.\n\nMotivo del rechazo: {motivo}\n\nPor favor, realiza las correcciones necesarias y vuelve a enviar el avance."
        
        notificar_tecnico(tecnico_id, 'avance_rechazado', mensaje, id_avance)
        
        # Limpiar caché
        cache.clear('avances_pendientes')
        cache.clear('pendientes_count')
        cache.clear('avances_procesados_all')
        cache.clear('avances_procesados_aprobado')
        cache.clear('avances_procesados_rechazado')
        
        logger.info(f"✅ Avance {id_avance} rechazado. Técnico {tecnico_id} notificado.")
        return jsonify({'success': True, 'message': 'Avance rechazado. El técnico ha sido notificado.'}), 200
        
    except Exception as e:
        logger.error(f"❌ Error en rechazar_avance: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENDPOINT VERIFICAR TOKEN
# =====================================================

@avance_jefe_bp.route('/verify-token', methods=['GET'])
@jefe_taller_required
def verify_token(current_user):
    """Verificar que el token es válido y obtener datos del usuario"""
    return jsonify({
        'success': True, 
        'user': current_user
    }), 200