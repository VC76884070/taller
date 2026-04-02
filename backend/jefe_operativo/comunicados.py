from flask import Blueprint, request, jsonify
from functools import wraps
from config import config
import jwt
import datetime
import logging
import uuid

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
# DECORADOR PARA VERIFICAR TOKEN Y ROL
# =====================================================
def jefe_operativo_required(f):
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
            current_user = data['user']
            
            if current_user.get('rol') != 'jefe_operativo' and current_user.get('id_rol') != 2:
                logger.warning(f"Usuario {current_user.get('nombre')} intentó acceder sin permisos")
                return jsonify({'error': 'No autorizado para esta operación'}), 403
                
        except jwt.ExpiredSignatureError:
            logger.warning("Token expirado")
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token inválido: {str(e)}")
            return jsonify({'error': 'Token inválido'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated


# =====================================================
# MODELO DE COMUNICADO (para referencia)
# =====================================================
"""
Tabla: comunicado
- id: SERIAL PRIMARY KEY
- titulo: VARCHAR(255) NOT NULL
- contenido: TEXT NOT NULL
- prioridad: VARCHAR(50) DEFAULT 'normal' (normal, importante, urgente)
- estado: VARCHAR(50) DEFAULT 'activo' (activo, inactivo)
- destinatarios: JSONB (array de roles: ['jefe_operativo', 'jefe_taller', 'tecnico', 'encargado_repuestos', 'admin_general'])
- fecha_creacion: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- fecha_actualizacion: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- creado_por: INTEGER (id del usuario que creó el comunicado)
"""


# =====================================================
# ENDPOINTS DE COMUNICADOS
# =====================================================

@jefe_operativo_comunicados_bp.route('/comunicados', methods=['GET'])
@jefe_operativo_required
def listar_comunicados(current_user):
    """Listar todos los comunicados"""
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
    """Crear un nuevo comunicado"""
    try:
        data = request.get_json()
        
        titulo = data.get('titulo')
        contenido = data.get('contenido')
        prioridad = data.get('prioridad', 'normal')
        estado = data.get('estado', 'activo')
        destinatarios = data.get('destinatarios', [])
        
        # Validaciones
        if not titulo or not titulo.strip():
            return jsonify({'error': 'El título es requerido'}), 400
        
        if not contenido or contenido == '<p><br></p>' or len(contenido.strip()) < 10:
            return jsonify({'error': 'El contenido debe tener al menos 10 caracteres'}), 400
        
        if len(destinatarios) == 0:
            return jsonify({'error': 'Selecciona al menos un destinatario'}), 400
        
        # Insertar comunicado
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


@jefe_operativo_comunicados_bp.route('/comunicados/<int:id_comunicado>', methods=['GET'])
@jefe_operativo_required
def obtener_comunicado(current_user, id_comunicado):
    """Obtener un comunicado específico"""
    try:
        resultado = supabase.table('comunicado') \
            .select('*') \
            .eq('id', id_comunicado) \
            .single() \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        c = resultado.data
        
        return jsonify({
            'success': True,
            'data': {
                'id': c['id'],
                'titulo': c['titulo'],
                'contenido': c['contenido'],
                'prioridad': c.get('prioridad', 'normal'),
                'estado': c.get('estado', 'activo'),
                'destinatarios': c.get('destinatarios', []),
                'fecha_creacion': c['fecha_creacion'],
                'fecha_actualizacion': c.get('fecha_actualizacion'),
                'creado_por': c.get('creado_por')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo comunicado: {str(e)}")
        return jsonify({'error': str(e)}), 500


@jefe_operativo_comunicados_bp.route('/comunicados/<int:id_comunicado>', methods=['PUT'])
@jefe_operativo_required
def actualizar_comunicado(current_user, id_comunicado):
    """Actualizar un comunicado existente"""
    try:
        data = request.get_json()
        
        # Verificar que el comunicado existe
        existente = supabase.table('comunicado') \
            .select('id') \
            .eq('id', id_comunicado) \
            .execute()
        
        if not existente.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        # Preparar datos para actualizar
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
        
        # Actualizar comunicado
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
        
        # Verificar que el comunicado existe
        existente = supabase.table('comunicado') \
            .select('id') \
            .eq('id', id_comunicado) \
            .execute()
        
        if not existente.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        # Actualizar estado
        resultado = supabase.table('comunicado') \
            .update({
                'estado': nuevo_estado,
                'fecha_actualizacion': datetime.datetime.now().isoformat()
            }) \
            .eq('id', id_comunicado) \
            .execute()
        
        if not resultado.data:
            return jsonify({'error': 'Error al cambiar estado'}), 500
        
        # CORREGIDO: Usar if-else en lugar de operador ternario
        mensaje = 'Comunicado activado correctamente' if nuevo_estado == 'activo' else 'Comunicado desactivado correctamente'
        
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
    """Eliminar un comunicado"""
    try:
        # Verificar que el comunicado existe
        existente = supabase.table('comunicado') \
            .select('id, titulo') \
            .eq('id', id_comunicado) \
            .execute()
        
        if not existente.data:
            return jsonify({'error': 'Comunicado no encontrado'}), 404
        
        # Eliminar comunicado
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


@jefe_operativo_comunicados_bp.route('/comunicados/filtrar', methods=['GET'])
@jefe_operativo_required
def filtrar_comunicados(current_user):
    """Filtrar comunicados por estado, prioridad o destinatario"""
    try:
        estado = request.args.get('estado')
        prioridad = request.args.get('prioridad')
        destinatario = request.args.get('destinatario')
        
        query = supabase.table('comunicado').select('*')
        
        if estado:
            query = query.eq('estado', estado)
        
        if prioridad:
            query = query.eq('prioridad', prioridad)
        
        if destinatario:
            # Filtrar por destinatario en JSONB
            query = query.contains('destinatarios', [destinatario])
        
        resultado = query.order('fecha_creacion', desc=True).execute()
        
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
        logger.error(f"Error filtrando comunicados: {str(e)}")
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
            {'id': 'encargado_repuestos', 'nombre': 'Encargado Repuestos'},
            {'id': 'admin_general', 'nombre': 'Administrador General'}
        ]
        
        return jsonify({'success': True, 'data': roles}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo destinatarios: {str(e)}")
        return jsonify({'error': str(e)}), 500