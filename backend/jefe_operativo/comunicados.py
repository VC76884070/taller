from flask import Blueprint, request, jsonify
from config import config
import datetime
import logging
import jwt

# Importar decorador desde decorators.py
from decorators import jefe_operativo_required

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
jefe_operativo_comunicados_bp = Blueprint('jefe_operativo_comunicados', __name__, url_prefix='/api/jefe-operativo')

# Configuración
SECRET_KEY = config.SECRET_KEY
supabase = config.supabase


# =====================================================
# FUNCIÓN AUXILIAR PARA VERIFICAR TOKEN Y ROLES
# =====================================================
def verificar_token_y_roles(roles_permitidos):
    """Verifica token y retorna el usuario si tiene alguno de los roles permitidos"""
    token = None
    
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        try:
            token = auth_header.split(" ")[1]
        except IndexError:
            return None, "Token inválido", 401
    
    if not token:
        return None, "Token requerido", 401
    
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        current_user = data['user']
        
        # Obtener roles del usuario
        from decorators import obtener_roles_usuario
        roles = obtener_roles_usuario(current_user.get('id'))
        
        # Verificar si tiene al menos uno de los roles permitidos
        tiene_rol = any(rol in roles for rol in roles_permitidos)
        
        if not tiene_rol:
            return None, f"No autorizado - Se requiere rol: {', '.join(roles_permitidos)}", 403
        
        return current_user, None, None
        
    except jwt.ExpiredSignatureError:
        return None, "Token expirado", 401
    except jwt.InvalidTokenError:
        return None, "Token inválido", 401


# =====================================================
# ENDPOINTS PARA JEFE OPERATIVO (CON DECORADOR)
# =====================================================

@jefe_operativo_comunicados_bp.route('/comunicados', methods=['GET'])
@jefe_operativo_required
def listar_comunicados(current_user):
    """Listar todos los comunicados (Jefe Operativo)"""
    try:
        resultado = supabase.table('comunicado') \
            .select('*') \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        comunicados = []
        if resultado.data:
            for c in resultado.data:
                comunicados.append({
                    'id': c['id'],
                    'titulo': c['titulo'],
                    'contenido': c['contenido'],
                    'prioridad': c.get('prioridad', 'normal'),
                    'estado': c.get('estado', 'activo'),
                    'destinatarios': c.get('destinatarios', []),
                    'fecha_creacion': c['fecha_creacion'],
                    'fecha_actualizacion': c.get('fecha_actualizacion'),
                    'creado_por': c.get('creado_por')
                })
        
        return jsonify({'success': True, 'data': comunicados}), 200
        
    except Exception as e:
        logger.error(f"Error listando comunicados: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_comunicados_bp.route('/comunicados', methods=['POST'])
@jefe_operativo_required
def crear_comunicado(current_user):
    """Crear un nuevo comunicado (Jefe Operativo)"""
    try:
        data = request.get_json()
        
        titulo = data.get('titulo')
        contenido = data.get('contenido')
        prioridad = data.get('prioridad', 'normal')
        estado = data.get('estado', 'activo')
        destinatarios = data.get('destinatarios', [])
        
        if not titulo or not titulo.strip():
            return jsonify({'error': 'El título es requerido'}), 400
        
        if not contenido or contenido == '<p><br></p>' or len(contenido.strip()) < 10:
            return jsonify({'error': 'El contenido debe tener al menos 10 caracteres'}), 400
        
        if len(destinatarios) == 0:
            return jsonify({'error': 'Selecciona al menos un destinatario'}), 400
        
        resultado = supabase.table('comunicado').insert({
            'titulo': titulo.strip(),
            'contenido': contenido,
            'prioridad': prioridad,
            'estado': estado,
            'destinatarios': destinatarios,
            'creado_por': current_user['id'],
            'fecha_creacion': datetime.datetime.now().isoformat(),
            'fecha_actualizacion': datetime.datetime.now().isoformat()
        }).execute()
        
        if not resultado.data:
            return jsonify({'error': 'Error al crear comunicado'}), 500
        
        comunicado = resultado.data[0]
        
        logger.info(f"Comunicado '{titulo}' creado por {current_user.get('nombre')}")
        
        return jsonify({
            'success': True,
            'data': {
                'id': comunicado['id'],
                'titulo': comunicado['titulo'],
                'contenido': comunicado['contenido'],
                'prioridad': comunicado.get('prioridad', 'normal'),
                'estado': comunicado.get('estado', 'activo'),
                'destinatarios': comunicado.get('destinatarios', []),
                'fecha_creacion': comunicado['fecha_creacion']
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Error creando comunicado: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_comunicados_bp.route('/comunicados/<int:id_comunicado>', methods=['PUT'])
@jefe_operativo_required
def actualizar_comunicado(current_user, id_comunicado):
    """Actualizar un comunicado existente (Jefe Operativo)"""
    try:
        data = request.get_json()
        
        existente = supabase.table('comunicado') \
            .select('id') \
            .eq('id', id_comunicado) \
            .execute()
        
        if not existente.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        update_data = {}
        
        if 'titulo' in data:
            if not data['titulo'] or not data['titulo'].strip():
                return jsonify({'error': 'El título es requerido'}), 400
            update_data['titulo'] = data['titulo'].strip()
        
        if 'contenido' in data:
            if not data['contenido'] or data['contenido'] == '<p><br></p>' or len(data['contenido'].strip()) < 10:
                return jsonify({'error': 'El contenido debe tener al menos 10 caracteres'}), 400
            update_data['contenido'] = data['contenido']
        
        if 'prioridad' in data:
            update_data['prioridad'] = data['prioridad']
        
        if 'estado' in data:
            update_data['estado'] = data['estado']
        
        if 'destinatarios' in data:
            if len(data['destinatarios']) == 0:
                return jsonify({'error': 'Selecciona al menos un destinatario'}), 400
            update_data['destinatarios'] = data['destinatarios']
        
        if not update_data:
            return jsonify({'error': 'No hay datos para actualizar'}), 400
        
        update_data['fecha_actualizacion'] = datetime.datetime.now().isoformat()
        
        resultado = supabase.table('comunicado') \
            .update(update_data) \
            .eq('id', id_comunicado) \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Error al actualizar comunicado'}), 500
        
        logger.info(f"Comunicado {id_comunicado} actualizado por {current_user.get('nombre')}")
        
        return jsonify({
            'success': True,
            'message': 'Comunicado actualizado correctamente',
            'data': resultado.data[0]
        }), 200
        
    except Exception as e:
        logger.error(f"Error actualizando comunicado: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@jefe_operativo_comunicados_bp.route('/comunicados/<int:id_comunicado>', methods=['PATCH'])
@jefe_operativo_required
def cambiar_estado_comunicado(current_user, id_comunicado):
    """Cambiar el estado de un comunicado (activar/desactivar)"""
    try:
        data = request.get_json()
        nuevo_estado = data.get('estado')
        
        if not nuevo_estado or nuevo_estado not in ['activo', 'inactivo']:
            return jsonify({'error': 'Estado inválido. Debe ser "activo" o "inactivo"'}), 400
        
        existente = supabase.table('comunicado') \
            .select('id') \
            .eq('id', id_comunicado) \
            .execute()
        
        if not existente.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        resultado = supabase.table('comunicado') \
            .update({
                'estado': nuevo_estado,
                'fecha_actualizacion': datetime.datetime.now().isoformat()
            }) \
            .eq('id', id_comunicado) \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Error al cambiar estado'}), 500
        
        if nuevo_estado == 'activo':
            mensaje = 'Comunicado activado correctamente'
        else:
            mensaje = 'Comunicado desactivado correctamente'
        
        logger.info(f"Comunicado {id_comunicado} cambiado a {nuevo_estado} por {current_user.get('nombre')}")
        
        return jsonify({
            'success': True,
            'message': mensaje,
            'data': {'id': id_comunicado, 'estado': nuevo_estado}
        }), 200
        
    except Exception as e:
        logger.error(f"Error cambiando estado: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_comunicados_bp.route('/comunicados/<int:id_comunicado>', methods=['DELETE'])
@jefe_operativo_required
def eliminar_comunicado(current_user, id_comunicado):
    """Eliminar un comunicado (Jefe Operativo)"""
    try:
        existente = supabase.table('comunicado') \
            .select('id, titulo') \
            .eq('id', id_comunicado) \
            .execute()
        
        if not existente.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        supabase.table('comunicado') \
            .delete() \
            .eq('id', id_comunicado) \
            .execute()
        
        titulo = existente.data[0].get('titulo', str(id_comunicado))
        logger.info(f"Comunicado '{titulo}' eliminado por {current_user.get('nombre')}")
        
        return jsonify({
            'success': True,
            'message': 'Comunicado eliminado correctamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error eliminando comunicado: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_comunicados_bp.route('/comunicados/destinatarios', methods=['GET'])
@jefe_operativo_required
def obtener_destinatarios_disponibles(current_user):
    """Obtener lista de roles disponibles para enviar comunicados"""
    try:
        roles = [
            {'id': 'jefe_operativo', 'nombre': 'Jefe Operativo'},
            {'id': 'jefe_taller', 'nombre': 'Jefe de Taller'},
            {'id': 'tecnico', 'nombre': 'Técnicos'},
            {'id': 'encargado_repuestos', 'nombre': 'Encargado Repuestos'}
        ]
        
        return jsonify({'success': True, 'data': roles}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo destinatarios: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS PARA TÉCNICOS (ACCESO PÚBLICO CON VERIFICACIÓN)
# =====================================================

@jefe_operativo_comunicados_bp.route('/comunicados/tecnico', methods=['GET'])
def obtener_comunicados_tecnico():
    """Endpoint para que los técnicos vean comunicados dirigidos a ellos"""
    try:
        # Verificar token y rol de técnico
        current_user, error, status = verificar_token_y_roles(['tecnico'])
        
        if error:
            return jsonify({'error': error}), status
        
        # Obtener comunicados activos que tengan 'tecnico' como destinatario
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('estado', 'activo') \
            .contains('destinatarios', ['tecnico']) \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        comunicados = []
        if resultado.data:
            for c in resultado.data:
                comunicados.append({
                    'id': c['id'],
                    'titulo': c['titulo'],
                    'contenido': c['contenido'],
                    'prioridad': c.get('prioridad', 'normal'),
                    'estado': c.get('estado', 'activo'),
                    'destinatarios': c.get('destinatarios', []),
                    'fecha_creacion': c['fecha_creacion']
                })
        
        return jsonify({'success': True, 'data': comunicados}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo comunicados para técnico: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_comunicados_bp.route('/comunicados/tecnico/<int:id_comunicado>', methods=['GET'])
def obtener_comunicado_tecnico(id_comunicado):
    """Endpoint para que los técnicos vean un comunicado específico"""
    try:
        # Verificar token y rol de técnico
        current_user, error, status = verificar_token_y_roles(['tecnico'])
        
        if error:
            return jsonify({'error': error}), status
        
        # Obtener comunicado específico (solo si está activo y tiene destinatario técnico)
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('id', id_comunicado) \
            .eq('estado', 'activo') \
            .contains('destinatarios', ['tecnico']) \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        c = resultado.data[0]
        
        return jsonify({
            'success': True,
            'data': {
                'id': c['id'],
                'titulo': c['titulo'],
                'contenido': c['contenido'],
                'prioridad': c.get('prioridad', 'normal'),
                'fecha_creacion': c['fecha_creacion']
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo comunicado: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS PARA JEFE TALLER (ACCESO PÚBLICO CON VERIFICACIÓN)
# =====================================================

@jefe_operativo_comunicados_bp.route('/comunicados/jefe-taller', methods=['GET'])
def obtener_comunicados_jefe_taller():
    """Endpoint para que el jefe de taller vea comunicados dirigidos a él"""
    try:
        # Verificar token y rol de jefe_taller
        current_user, error, status = verificar_token_y_roles(['jefe_taller'])
        
        if error:
            return jsonify({'error': error}), status
        
        # Obtener comunicados activos que tengan 'jefe_taller' como destinatario
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('estado', 'activo') \
            .contains('destinatarios', ['jefe_taller']) \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        comunicados = []
        if resultado.data:
            for c in resultado.data:
                comunicados.append({
                    'id': c['id'],
                    'titulo': c['titulo'],
                    'contenido': c['contenido'],
                    'prioridad': c.get('prioridad', 'normal'),
                    'estado': c.get('estado', 'activo'),
                    'destinatarios': c.get('destinatarios', []),
                    'fecha_creacion': c['fecha_creacion']
                })
        
        return jsonify({'success': True, 'data': comunicados}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo comunicados para jefe taller: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_comunicados_bp.route('/comunicados/jefe-taller/<int:id_comunicado>', methods=['GET'])
def obtener_comunicado_jefe_taller(id_comunicado):
    """Endpoint para que el jefe de taller vea un comunicado específico"""
    try:
        # Verificar token y rol de jefe_taller
        current_user, error, status = verificar_token_y_roles(['jefe_taller'])
        
        if error:
            return jsonify({'error': error}), status
        
        # Obtener comunicado específico
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('id', id_comunicado) \
            .eq('estado', 'activo') \
            .contains('destinatarios', ['jefe_taller']) \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        c = resultado.data[0]
        
        return jsonify({
            'success': True,
            'data': {
                'id': c['id'],
                'titulo': c['titulo'],
                'contenido': c['contenido'],
                'prioridad': c.get('prioridad', 'normal'),
                'fecha_creacion': c['fecha_creacion']
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo comunicado: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINTS PARA ENCARGADO DE REPUESTOS (ACCESO PÚBLICO CON VERIFICACIÓN)
# =====================================================

@jefe_operativo_comunicados_bp.route('/comunicados/encargado-repuestos', methods=['GET'])
def obtener_comunicados_encargado_repuestos():
    """Endpoint para que el encargado de repuestos vea comunicados dirigidos a él"""
    try:
        # Verificar token y rol de encargado_repuestos
        current_user, error, status = verificar_token_y_roles(['encargado_repuestos'])
        
        if error:
            return jsonify({'error': error}), status
        
        # Obtener comunicados activos que tengan 'encargado_repuestos' como destinatario
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('estado', 'activo') \
            .contains('destinatarios', ['encargado_repuestos']) \
            .order('fecha_creacion', desc=True) \
            .execute()
        
        comunicados = []
        if resultado.data:
            for c in resultado.data:
                comunicados.append({
                    'id': c['id'],
                    'titulo': c['titulo'],
                    'contenido': c['contenido'],
                    'prioridad': c.get('prioridad', 'normal'),
                    'estado': c.get('estado', 'activo'),
                    'destinatarios': c.get('destinatarios', []),
                    'fecha_creacion': c['fecha_creacion']
                })
        
        return jsonify({'success': True, 'data': comunicados}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo comunicados para encargado repuestos: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_comunicados_bp.route('/comunicados/encargado-repuestos/<int:id_comunicado>', methods=['GET'])
def obtener_comunicado_encargado_repuestos(id_comunicado):
    """Endpoint para que el encargado de repuestos vea un comunicado específico"""
    try:
        # Verificar token y rol de encargado_repuestos
        current_user, error, status = verificar_token_y_roles(['encargado_repuestos'])
        
        if error:
            return jsonify({'error': error}), status
        
        # Obtener comunicado específico
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('id', id_comunicado) \
            .eq('estado', 'activo') \
            .contains('destinatarios', ['encargado_repuestos']) \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        c = resultado.data[0]
        
        return jsonify({
            'success': True,
            'data': {
                'id': c['id'],
                'titulo': c['titulo'],
                'contenido': c['contenido'],
                'prioridad': c.get('prioridad', 'normal'),
                'fecha_creacion': c['fecha_creacion']
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo comunicado: {str(e)}")
        return jsonify({'error': str(e)}), 500