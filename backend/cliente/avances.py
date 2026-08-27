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

# =====================================================
# ENDPOINT: PROXY PARA IMÁGENES DE AVANCES (CLIENTE)
# =====================================================

@avances_cliente_bp.route('/proxy-imagen-avance', methods=['GET'])
@cliente_required
def proxy_imagen_avance_cliente(current_user):
    """
    Proxy para imágenes de avances en Google Drive.
    Recibe una URL de Drive, extrae el file_id, descarga y devuelve en Base64.
    """
    url = request.args.get('url')
    if not url:
        return jsonify({'success': False, 'error': 'URL no proporcionada'}), 400
    
    try:
        from google_drive import google_drive
        import requests
        import base64
        import re
        
        # Extraer file_id
        file_id = google_drive.extract_file_id_from_url(url)
        if not file_id:
            return jsonify({'success': False, 'error': 'No se pudo extraer el ID'}), 400
        
        # Estrategias de descarga
        urls = [
            f"https://drive.google.com/thumbnail?id={file_id}&sz=w800",
            f"https://drive.google.com/uc?export=view&id={file_id}",
            f"https://drive.google.com/uc?export=download&id={file_id}",
        ]
        
        image_data = None
        mime_type = 'image/jpeg'
        
        for download_url in urls:
            try:
                response = requests.get(download_url, timeout=30, allow_redirects=True)
                
                # Manejar redirecciones de confirmación de Google
                if 'confirm' in response.url and 'download' in response.url:
                    confirm_match = re.search(r'confirm=([^&]+)', response.text)
                    if confirm_match:
                        confirm_token = confirm_match.group(1)
                        download_url_confirm = f"{response.url}&confirm={confirm_token}"
                        response = requests.get(download_url_confirm, timeout=30, allow_redirects=True)
                
                if response.status_code == 200:
                    content_type = response.headers.get('Content-Type', '')
                    if content_type.startswith('image/') or len(response.content) > 1000:
                        image_data = response.content
                        mime_type = content_type if content_type.startswith('image/') else 'image/jpeg'
                        break
            except Exception as e:
                logger.warning(f"Intento fallido con {download_url}: {str(e)}")
                continue
        
        if not image_data:
            return jsonify({'success': False, 'error': 'No se pudo descargar la imagen'}), 404
        
        # Convertir a Base64
        base64_data = base64.b64encode(image_data).decode('utf-8')
        
        return jsonify({
            'success': True,
            'base64': f'data:{mime_type};base64,{base64_data}'
        }), 200
        
    except Exception as e:
        logger.error(f"Error en proxy de imagen de avance (cliente): {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500