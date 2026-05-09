# =====================================================
# GESTION_AVANCES.PY - JEFE DE TALLER
# GESTIÓN DE AVANCES DE TRABAJO - VERSIÓN CORREGIDA
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify, g
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import json

logger = logging.getLogger(__name__)

# Crear el Blueprint con el prefijo de URL correcto
avance_jefe_bp = Blueprint('avance_jefe', __name__, url_prefix='/api/jefe-taller/avances')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


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
# ENDPOINT PENDIENTES
# =====================================================

@avance_jefe_bp.route('/pendientes', methods=['GET'])
@jefe_taller_required
def obtener_avances_pendientes(current_user):
    """Obtener avances pendientes de revisión"""
    try:
        logger.info(f"🔍 Usuario {current_user.get('id')} solicitando avances pendientes")
        
        # Validar autenticación
        if not current_user or not current_user.get('id'):
            logger.error("❌ Usuario no autenticado correctamente")
            return jsonify({'success': False, 'error': 'Usuario no autenticado'}), 401
        
        # Consultar avances pendientes
        avances = supabase.table('avance_trabajo') \
            .select('*') \
            .eq('estado', 'pendiente') \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        logger.info(f"📊 Avances pendientes encontrados: {len(avances.data) if avances.data else 0}")
        
        if not avances.data:
            return jsonify({'success': True, 'avances': []}), 200
        
        # Obtener información adicional (técnico, orden)
        resultado = []
        for avance in avances.data:
            # Obtener nombre del técnico
            tecnico = supabase.table('usuario') \
                .select('nombre') \
                .eq('id', avance['id_tecnico']) \
                .execute()
            
            # Obtener código de la orden de trabajo
            orden = supabase.table('ordentrabajo') \
                .select('codigo_unico') \
                .eq('id', avance['id_orden_trabajo']) \
                .execute()
            
            # Parsear fotos
            fotos = parse_fotos(avance.get('fotos'))
            
            resultado.append({
                'id': avance['id'],
                'titulo': avance['titulo'],
                'descripcion': avance.get('descripcion', ''),
                'fotos': fotos,
                'estado': avance['estado'],
                'fecha_creacion': avance['fecha_creacion'],
                'tecnico_nombre': tecnico.data[0]['nombre'] if tecnico.data else 'Desconocido',
                'orden_codigo': orden.data[0]['codigo_unico'] if orden.data else 'N/A'
            })
        
        logger.info(f"✅ Devueltos {len(resultado)} avances pendientes")
        return jsonify({'success': True, 'avances': resultado}), 200
        
    except Exception as e:
        logger.error(f"❌ Error en obtener_avances_pendientes: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENDPOINT PROCESADOS
# =====================================================

@avance_jefe_bp.route('/procesados', methods=['GET'])
@jefe_taller_required
def obtener_avances_procesados(current_user):
    """Obtener avances ya procesados (aprobados o rechazados)"""
    try:
        estado_filtro = request.args.get('estado', 'all')
        logger.info(f"🔍 Usuario {current_user.get('id')} solicitando avances procesados - Filtro: {estado_filtro}")
        
        # Construir consulta
        query = supabase.table('avance_trabajo') \
            .select('*') \
            .in_('estado', ['aprobado', 'rechazado']) \
            .order('fecha_aprobacion', desc=True)
        
        if estado_filtro in ['aprobado', 'rechazado']:
            query = query.eq('estado', estado_filtro)
        
        avances = query.execute()
        
        if not avances.data:
            return jsonify({'success': True, 'avances': []}), 200
        
        resultado = []
        for avance in avances.data:
            # Obtener nombre del técnico
            tecnico = supabase.table('usuario') \
                .select('nombre') \
                .eq('id', avance['id_tecnico']) \
                .execute()
            
            # Obtener código de la orden de trabajo
            orden = supabase.table('ordentrabajo') \
                .select('codigo_unico') \
                .eq('id', avance['id_orden_trabajo']) \
                .execute()
            
            # Parsear fotos
            fotos = parse_fotos(avance.get('fotos'))
            
            resultado.append({
                'id': avance['id'],
                'titulo': avance['titulo'],
                'descripcion': avance.get('descripcion', ''),
                'fotos': fotos,
                'estado': avance['estado'],
                'fecha_creacion': avance['fecha_creacion'],
                'fecha_aprobacion': avance.get('fecha_aprobacion'),
                'comentario_revision': avance.get('comentario_revision'),
                'tecnico_nombre': tecnico.data[0]['nombre'] if tecnico.data else 'Desconocido',
                'orden_codigo': orden.data[0]['codigo_unico'] if orden.data else 'N/A'
            })
        
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
        
        # Obtener nombre del técnico
        tecnico = supabase.table('usuario') \
            .select('nombre') \
            .eq('id', avance_data['id_tecnico']) \
            .execute()
        
        # Obtener código de la orden de trabajo
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .eq('id', avance_data['id_orden_trabajo']) \
            .execute()
        
        # Parsear fotos
        fotos = parse_fotos(avance_data.get('fotos'))
        
        return jsonify({
            'success': True,
            'avance': {
                'id': avance_data['id'],
                'titulo': avance_data['titulo'],
                'descripcion': avance_data.get('descripcion', ''),
                'fotos': fotos,
                'estado': avance_data['estado'],
                'fecha_creacion': avance_data['fecha_creacion'],
                'fecha_aprobacion': avance_data.get('fecha_aprobacion'),
                'comentario_revision': avance_data.get('comentario_revision'),
                'tecnico_nombre': tecnico.data[0]['nombre'] if tecnico.data else 'Desconocido',
                'orden_codigo': orden.data[0]['codigo_unico'] if orden.data else 'N/A'
            }
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


# =====================================================
# ENDPOINT CONTADOR (OPCIONAL)
# =====================================================

@avance_jefe_bp.route('/contador', methods=['GET'])
@jefe_taller_required
def obtener_contador_pendientes(current_user):
    """Obtener solo el número de avances pendientes (para badge)"""
    try:
        avances = supabase.table('avance_trabajo') \
            .select('id', count='exact') \
            .eq('estado', 'pendiente') \
            .execute()
        
        count = avances.count if hasattr(avances, 'count') else len(avances.data or [])
        
        return jsonify({
            'success': True,
            'pendientes_count': count
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error en contador: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500