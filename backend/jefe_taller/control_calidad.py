# =====================================================
# CONTROL_CALIDAD.PY - JEFE DE TALLER (CORREGIDO)
# =====================================================

from flask import Blueprint, request, jsonify, g
from config import config
from decorators import jefe_taller_required
import datetime
import logging
import json

logger = logging.getLogger(__name__)

# ✅ CORREGIDO: Solo la parte específica, SIN el prefijo /api/jefe-taller
control_calidad_bp = Blueprint('control_calidad', __name__, url_prefix='/api/jefe-taller/control-calidad')


SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_tecnicos_orden(id_orden):
    """Obtener nombres de técnicos asignados a una orden"""
    try:
        asignaciones = supabase.table('asignaciontecnico') \
            .select('id_tecnico, usuario!inner(id, nombre)') \
            .eq('id_orden_trabajo', id_orden) \
            .is_('fecha_hora_final', 'null') \
            .execute()
        
        nombres = []
        for a in (asignaciones.data or []):
            usuario = a.get('usuario', {})
            nombre = usuario.get('nombre') if isinstance(usuario, dict) else None
            if nombre:
                nombres.append(nombre)
        
        return ', '.join(nombres) if nombres else 'No asignado'
    except Exception as e:
        logger.error(f"Error obteniendo técnicos: {e}")
        return 'No asignado'

# =====================================================
# ENDPOINTS DE PRUEBA
# =====================================================

@control_calidad_bp.route('/test', methods=['GET'])
def test_endpoint():
    """Endpoint de prueba SIN autenticación"""
    return jsonify({
        'success': True, 
        'message': 'Control de Calidad blueprint funcionando correctamente'
    }), 200

@control_calidad_bp.route('/test-auth', methods=['GET'])
@jefe_taller_required
def test_auth_endpoint(current_user):
    """Endpoint de prueba CON autenticación"""
    return jsonify({
        'success': True, 
        'message': 'Autenticación exitosa',
        'user': {
            'id': current_user.get('id'),
            'nombre': current_user.get('nombre')
        }
    }), 200

# =====================================================
# ENDPOINTS PRINCIPALES (VERSIÓN SIMPLIFICADA PARA PRUEBAS)
# =====================================================

@control_calidad_bp.route('/ordenes-pendientes', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_pendientes(current_user):
    """Obtener órdenes pendientes de revisión"""
    try:
        logger.info(f"🔍 Usuario {current_user.get('id')} solicitando órdenes pendientes")
        
        # Versión simplificada para pruebas - devuelve datos de ejemplo
        # Reemplaza esto con tu consulta real a Supabase
        
        ordenes_ejemplo = [
            {
                'id_orden': 1,
                'codigo_unico': 'OT-001-2024',
                'estado_global': 'ReparacionCompletada',
                'vehiculo': 'Toyota Corolla (ABC-123)',
                'cliente_nombre': 'Juan Pérez',
                'tecnicos_nombres': 'Carlos López',
                'fecha_inicio': datetime.datetime.now().isoformat(),
                'fecha_fin': datetime.datetime.now().isoformat()
            }
        ]
        
        return jsonify({
            'success': True, 
            'ordenes': ordenes_ejemplo
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@control_calidad_bp.route('/ordenes-finalizadas', methods=['GET'])
@jefe_taller_required
def obtener_ordenes_finalizadas(current_user):
    """Obtener órdenes ya finalizadas"""
    try:
        logger.info(f"🔍 Usuario {current_user.get('id')} solicitando órdenes finalizadas")
        
        ordenes_ejemplo = [
            {
                'id_orden': 2,
                'codigo_unico': 'OT-002-2024',
                'estado_global': 'Finalizado',
                'vehiculo': 'Honda Civic (DEF-456)',
                'cliente_nombre': 'María Gómez',
                'tecnicos_nombres': 'Ana Rodríguez',
                'fecha_finalizacion': datetime.datetime.now().isoformat(),
                'comentarios_aprobacion': 'Trabajo excelente'
            }
        ]
        
        return jsonify({
            'success': True, 
            'ordenes': ordenes_ejemplo
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@control_calidad_bp.route('/detalle-orden/<int:id_orden>', methods=['GET'])
@jefe_taller_required
def obtener_detalle_orden(current_user, id_orden):
    """Obtener detalle completo de una orden"""
    try:
        logger.info(f"🔍 Usuario {current_user.get('id')} solicitando detalle de orden {id_orden}")
        
        return jsonify({
            'success': True,
            'detalle': {
                'orden': {
                    'id': id_orden,
                    'codigo_unico': f'OT-{id_orden:03d}-2024',
                    'estado_global': 'ReparacionCompletada',
                    'fecha_ingreso': datetime.datetime.now().isoformat()
                },
                'vehiculo': {
                    'placa': 'ABC-123',
                    'marca': 'Toyota',
                    'modelo': 'Corolla',
                    'anio': 2020,
                    'kilometraje': 50000
                },
                'cliente': {
                    'nombre': 'Juan Pérez',
                    'telefono': '12345678',
                    'email': 'juan@example.com'
                },
                'tecnicos_nombres': 'Carlos López',
                'historial_tecnicos': [],
                'recepcion': {
                    'transcripcion_problema': 'Problema con el motor',
                    'audio_url': None,
                    'fotos': {}
                },
                'servicios': []
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@control_calidad_bp.route('/finalizar-orden/<int:id_orden>', methods=['PUT'])
@jefe_taller_required
def finalizar_orden(current_user, id_orden):
    """Aprobar y finalizar una orden"""
    try:
        data = request.get_json() or {}
        comentarios = data.get('comentarios', '')
        
        logger.info(f"✅ Usuario {current_user.get('id')} finalizando orden {id_orden}")
        
        return jsonify({
            'success': True,
            'message': 'Orden finalizada correctamente',
            'nuevo_estado': 'Finalizado'
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@control_calidad_bp.route('/rechazar-orden/<int:id_orden>', methods=['PUT'])
@jefe_taller_required
def rechazar_orden(current_user, id_orden):
    """Rechazar orden y enviar a revisión"""
    try:
        data = request.get_json() or {}
        instrucciones = data.get('instrucciones', '')
        
        if not instrucciones:
            return jsonify({'success': False, 'error': 'Debes proporcionar instrucciones'}), 400
        
        logger.info(f"❌ Usuario {current_user.get('id')} rechazando orden {id_orden}")
        
        return jsonify({
            'success': True,
            'message': 'Orden enviada a revisión',
            'nuevo_estado': 'EnReparacion'
        }), 200
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500