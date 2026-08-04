# =====================================================
# AVANCES.PY - CLIENTE
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
import jwt
import datetime
import logging
import json
from functools import wraps

logger = logging.getLogger(__name__)

avances_cliente_bp = Blueprint('avances_cliente', __name__)

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# DECORADOR
# =====================================================

def cliente_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Token inválido'}), 401
        
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user = data.get('user') if 'user' in data else data
            
            if not current_user.get('id'):
                return jsonify({'error': 'Token inválido'}), 401
            
            roles = current_user.get('roles', [])
            if 'cliente' not in roles:
                return jsonify({'error': 'Acceso denegado'}), 403
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except:
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    return decorated


# =====================================================
# ENDPOINTS
# =====================================================

@avances_cliente_bp.route('/mis-vehiculos', methods=['GET'])
@cliente_required
def obtener_mis_vehiculos(current_user):
    try:
        cliente = supabase.table('cliente').select('id').eq('id_usuario', current_user['id']).execute()
        if not cliente.data:
            return jsonify({'success': True, 'vehiculos': []}), 200
        
        vehiculos = supabase.table('vehiculo') \
            .select('id, placa, marca, modelo, anio') \
            .eq('id_cliente', cliente.data[0]['id']) \
            .execute()
        
        return jsonify({'success': True, 'vehiculos': vehiculos.data or []}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@avances_cliente_bp.route('/ordenes-vehiculo/<int:id_vehiculo>', methods=['GET'])
@cliente_required
def obtener_ordenes_vehiculo(current_user, id_vehiculo):
    try:
        ordenes = supabase.table('ordentrabajo') \
            .select('id, codigo_unico, estado_global, fecha_ingreso') \
            .eq('id_vehiculo', id_vehiculo) \
            .order('fecha_ingreso', desc=True) \
            .execute()
        
        return jsonify({'success': True, 'ordenes': ordenes.data or []}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@avances_cliente_bp.route('/avances-orden/<int:id_orden>', methods=['GET'])
@cliente_required
def obtener_avances_orden(current_user, id_orden):
    try:
        avances = supabase.table('avance_trabajo') \
            .select('*') \
            .eq('id_orden_trabajo', id_orden) \
            .in_('estado', ['aprobado']) \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        resultado = []
        for a in (avances.data or []):
            fotos = []
            if a.get('fotos'):
                try:
                    fotos = json.loads(a['fotos']) if isinstance(a['fotos'], str) else a['fotos']
                except:
                    fotos = []
            
            resultado.append({
                'id': a.get('id'),
                'titulo': a.get('titulo'),
                'descripcion': a.get('descripcion'),
                'fotos': fotos,
                'estado': a.get('estado'),
                'fecha_creacion': a.get('fecha_creacion'),
                'fecha_aprobacion': a.get('fecha_aprobacion')
            })
        
        return jsonify({'success': True, 'avances': resultado}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500