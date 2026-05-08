# =====================================================
# AVANCE.PY - JEFE DE TALLER
# GESTIÓN DE AVANCES DE TRABAJO
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import json

logger = logging.getLogger(__name__)

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
    except Exception as e:
        logger.warning(f"Error enviando notificación: {e}")


# =====================================================
# ENDPOINTS
# =====================================================

@avance_jefe_bp.route('/pendientes', methods=['GET'])
def obtener_avances_pendientes(current_user):
    print("🔴🔴🔴 ENDPOINT /pendientes SIN AUTENTICACIÓN 🔴🔴🔴")
    """Obtener avances pendientes de revisión"""
    try:
        avances = supabase.table('avance_trabajo') \
            .select('*') \
            .eq('estado', 'pendiente') \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        if not avances.data:
            return jsonify({'success': True, 'avances': []}), 200
        
        # Obtener información adicional (técnico, orden)
        resultado = []
        for avance in avances.data:
            tecnico = supabase.table('usuario') \
                .select('nombre') \
                .eq('id', avance['id_tecnico']) \
                .execute()
            
            orden = supabase.table('ordentrabajo') \
                .select('codigo_unico') \
                .eq('id', avance['id_orden_trabajo']) \
                .execute()
            
            fotos = []
            if avance.get('fotos'):
                try:
                    fotos = json.loads(avance['fotos']) if isinstance(avance['fotos'], str) else avance['fotos']
                except:
                    fotos = []
            
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
        
        return jsonify({'success': True, 'avances': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@avance_jefe_bp.route('/procesados', methods=['GET'])
@jefe_taller_required
def obtener_avances_procesados(current_user):
    """Obtener avances ya procesados (aprobados o rechazados)"""
    try:
        estado_filtro = request.args.get('estado', 'all')
        
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
            tecnico = supabase.table('usuario') \
                .select('nombre') \
                .eq('id', avance['id_tecnico']) \
                .execute()
            
            orden = supabase.table('ordentrabajo') \
                .select('codigo_unico') \
                .eq('id', avance['id_orden_trabajo']) \
                .execute()
            
            fotos = []
            if avance.get('fotos'):
                try:
                    fotos = json.loads(avance['fotos']) if isinstance(avance['fotos'], str) else avance['fotos']
                except:
                    fotos = []
            
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
        
        return jsonify({'success': True, 'avances': resultado}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@avance_jefe_bp.route('/detalle/<int:id_avance>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_avance(current_user, id_avance):
    """Obtener detalle de un avance específico"""
    try:
        avance = supabase.table('avance_trabajo') \
            .select('*') \
            .eq('id', id_avance) \
            .execute()
        
        if not avance.data:
            return jsonify({'error': 'Avance no encontrado'}), 404
        
        avance_data = avance.data[0]
        
        tecnico = supabase.table('usuario') \
            .select('nombre') \
            .eq('id', avance_data['id_tecnico']) \
            .execute()
        
        orden = supabase.table('ordentrabajo') \
            .select('codigo_unico') \
            .eq('id', avance_data['id_orden_trabajo']) \
            .execute()
        
        fotos = []
        if avance_data.get('fotos'):
            try:
                fotos = json.loads(avance_data['fotos']) if isinstance(avance_data['fotos'], str) else avance_data['fotos']
            except:
                fotos = []
        
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
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@avance_jefe_bp.route('/aprobar/<int:id_avance>', methods=['PUT'])
@jefe_taller_required
def aprobar_avance(current_user, id_avance):
    """Aprobar un avance de trabajo"""
    try:
        data = request.get_json()
        comentario = data.get('comentario', '')
        
        ahora = datetime.datetime.now().isoformat()
        
        # Obtener el avance para conocer al técnico
        avance = supabase.table('avance_trabajo') \
            .select('id_tecnico, id_orden_trabajo, titulo') \
            .eq('id', id_avance) \
            .execute()
        
        if not avance.data:
            return jsonify({'error': 'Avance no encontrado'}), 404
        
        tecnico_id = avance.data[0]['id_tecnico']
        
        # Actualizar avance
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
        notificar_tecnico(
            tecnico_id,
            'avance_aprobado',
            f"✅ Tu avance '{avance.data[0]['titulo']}' ha sido APROBADO. {comentario if comentario else ''}",
            id_avance
        )
        
        return jsonify({'success': True, 'message': 'Avance aprobado correctamente'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@avance_jefe_bp.route('/rechazar/<int:id_avance>', methods=['PUT'])
@jefe_taller_required
def rechazar_avance(current_user, id_avance):
    """Rechazar un avance de trabajo y notificar al técnico para corregir"""
    try:
        data = request.get_json()
        motivo = data.get('motivo', '')
        
        if not motivo:
            return jsonify({'error': 'Debes proporcionar el motivo del rechazo'}), 400
        
        ahora = datetime.datetime.now().isoformat()
        
        # Obtener el avance para conocer al técnico
        avance = supabase.table('avance_trabajo') \
            .select('id_tecnico, id_orden_trabajo, titulo') \
            .eq('id', id_avance) \
            .execute()
        
        if not avance.data:
            return jsonify({'error': 'Avance no encontrado'}), 404
        
        tecnico_id = avance.data[0]['id_tecnico']
        
        # Actualizar avance (estado pendiente para que el técnico pueda corregir)
        supabase.table('avance_trabajo') \
            .update({
                'estado': 'pendiente',
                'comentario_revision': f"Rechazado: {motivo}",
                'aprobado_por': current_user['id']
            }) \
            .eq('id', id_avance) \
            .execute()
        
        # Notificar al técnico
        notificar_tecnico(
            tecnico_id,
            'avance_rechazado',
            f"❌ Tu avance '{avance.data[0]['titulo']}' necesita correcciones.\n\nMotivo: {motivo}\n\nPor favor, realiza las correcciones y vuelve a enviar.",
            id_avance
        )
        
        return jsonify({'success': True, 'message': 'Avance rechazado. El técnico ha sido notificado.'}), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@avance_jefe_bp.route('/verify-token', methods=['GET'])
@jefe_taller_required
def verify_token(current_user):
    return jsonify({'success': True, 'user': current_user}), 200


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@avance_jefe_bp.route('/test', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Avance endpoint funcionando'}), 200