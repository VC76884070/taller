# =====================================================
# PROVEEDORES.PY - ENCARGADO DE REPUESTOS
# VERSIÓN CORREGIDA - SIN created_at/updated_at
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import encargado_repuestos_required
import datetime
import logging

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
proveedores_bp = Blueprint('proveedores', __name__, url_prefix='/api/encargado-repuestos')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# FUNCIONES AUXILIARES
# =====================================================

def obtener_nombre_filtro(id_filtro):
    """
    Obtener nombre del filtro/categoría por ID
    Args:
        id_filtro (int): ID del filtro en tabla filtro_herramienta
    Returns:
        str: Nombre del filtro o None si no existe
    """
    if not id_filtro:
        return None
    try:
        result = supabase.table('filtro_herramienta') \
            .select('nombre_filtro') \
            .eq('id', id_filtro) \
            .execute()
        if result.data:
            return result.data[0].get('nombre_filtro')
    except Exception as e:
        logger.error(f"Error obteniendo nombre filtro: {e}")
    return None


def proveedor_to_dict(proveedor_data):
    """
    Convertir datos de proveedor a diccionario para respuesta JSON
    Args:
        proveedor_data (dict): Datos crudos de la tabla proveedor
    Returns:
        dict: Proveedor formateado para el frontend
    """
    if not proveedor_data:
        return None
    
    nombre_categoria = obtener_nombre_filtro(proveedor_data.get('id_filtro'))
    
    return {
        'id': proveedor_data.get('id'),
        'nombre': proveedor_data.get('nombre'),
        'telefono': proveedor_data.get('telefono'),
        'ubicacion_gps': proveedor_data.get('ubicacion_gps'),
        'propietario': proveedor_data.get('propietario'),
        'id_filtro': proveedor_data.get('id_filtro'),
        'categoria': nombre_categoria
        # NOTA: No incluimos created_at/updated_at porque no existen en la tabla
    }


def obtener_todas_categorias():
    """
    Obtener lista de todas las categorías/filtros disponibles
    Returns:
        list: Lista de diccionarios con id, nombre_filtro y descripcion
    """
    try:
        result = supabase.table('filtro_herramienta') \
            .select('id, nombre_filtro, descripcion') \
            .order('nombre_filtro') \
            .execute()
        return result.data if result.data else []
    except Exception as e:
        logger.error(f"Error obteniendo categorías: {e}")
        return []


def validar_datos_proveedor(data):
    """
    Validar los datos del proveedor antes de guardar
    Args:
        data (dict): Datos del proveedor
    Returns:
        tuple: (es_valido, mensaje_error, datos_limpios)
    """
    errores = []
    
    # Validar nombre (requerido)
    nombre = data.get('nombre')
    if not nombre or not nombre.strip():
        errores.append('El nombre del proveedor es requerido')
    
    # Validar teléfono (requerido)
    telefono = data.get('telefono')
    if not telefono or not telefono.strip():
        errores.append('El teléfono es requerido')
    
    if errores:
        return False, ', '.join(errores), None
    
    # Limpiar datos
    datos_limpios = {
        'nombre': nombre.strip(),
        'telefono': telefono.strip()
    }
    
    # Agregar campos opcionales solo si tienen valor
    if data.get('propietario'):
        datos_limpios['propietario'] = data.get('propietario').strip()
    if data.get('ubicacion_gps'):
        datos_limpios['ubicacion_gps'] = data.get('ubicacion_gps').strip()
    if data.get('id_filtro'):
        datos_limpios['id_filtro'] = data.get('id_filtro')
    
    return True, None, datos_limpios


# =====================================================
# ENDPOINTS PRINCIPALES
# =====================================================

@proveedores_bp.route('/proveedores', methods=['GET'])
@encargado_repuestos_required
def obtener_proveedores(current_user):
    """
    Obtener lista de proveedores con filtros opcionales
    """
    try:
        search = request.args.get('search', '')
        categoria_id = request.args.get('categoria')
        
        # Construir query base
        query = supabase.table('proveedor') \
            .select('*') \
            .order('nombre')
        
        # Aplicar filtro por categoría
        if categoria_id and categoria_id != 'all' and categoria_id != '':
            try:
                filtro_id = int(categoria_id)
                query = query.eq('id_filtro', filtro_id)
            except (ValueError, TypeError):
                pass
        
        result = query.execute()
        categorias = obtener_todas_categorias()
        
        if not result.data:
            return jsonify({
                'success': True,
                'proveedores': [],
                'categorias': categorias,
                'total': 0
            }), 200
        
        proveedores = [proveedor_to_dict(p) for p in result.data]
        
        # Aplicar búsqueda por texto
        if search and search.strip():
            search_lower = search.lower().strip()
            proveedores = [p for p in proveedores if 
                search_lower in (p.get('nombre') or '').lower() or
                search_lower in (p.get('propietario') or '').lower() or
                search_lower in (p.get('telefono') or '').lower()
            ]
        
        return jsonify({
            'success': True,
            'proveedores': proveedores,
            'categorias': categorias,
            'total': len(proveedores)
        }), 200
        
    except Exception as e:
        logger.error(f"Error en obtener_proveedores: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@proveedores_bp.route('/proveedores/categorias', methods=['GET'])
@encargado_repuestos_required
def obtener_categorias_endpoint(current_user):
    """
    Obtener lista de categorías/filtros para el select del formulario
    """
    try:
        categorias = obtener_todas_categorias()
        return jsonify({
            'success': True,
            'categorias': categorias
        }), 200
    except Exception as e:
        logger.error(f"Error en obtener_categorias_endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@proveedores_bp.route('/proveedores', methods=['POST'])
@encargado_repuestos_required
def crear_proveedor(current_user):
    """
    Crear un nuevo proveedor
    """
    try:
        data = request.get_json()
        
        # Validar datos
        es_valido, error, datos_limpios = validar_datos_proveedor(data)
        if not es_valido:
            return jsonify({'success': False, 'error': error}), 400
        
        # Insertar en la base de datos (SIN created_at/updated_at)
        result = supabase.table('proveedor') \
            .insert(datos_limpios) \
            .execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Error al insertar proveedor'}), 500
        
        proveedor_creado = proveedor_to_dict(result.data[0])
        
        return jsonify({
            'success': True,
            'message': 'Proveedor creado exitosamente',
            'proveedor': proveedor_creado
        }), 201
        
    except Exception as e:
        logger.error(f"Error en crear_proveedor: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@proveedores_bp.route('/proveedores/<int:id_proveedor>', methods=['GET'])
@encargado_repuestos_required
def obtener_proveedor(current_user, id_proveedor):
    """
    Obtener un proveedor específico por su ID
    """
    try:
        result = supabase.table('proveedor') \
            .select('*') \
            .eq('id', id_proveedor) \
            .execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Proveedor no encontrado'}), 404
        
        proveedor = proveedor_to_dict(result.data[0])
        
        return jsonify({
            'success': True,
            'proveedor': proveedor
        }), 200
        
    except Exception as e:
        logger.error(f"Error en obtener_proveedor: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@proveedores_bp.route('/proveedores/<int:id_proveedor>', methods=['PUT'])
@encargado_repuestos_required
def actualizar_proveedor(current_user, id_proveedor):
    """
    Actualizar un proveedor existente
    """
    try:
        # Verificar que el proveedor existe
        check = supabase.table('proveedor') \
            .select('id') \
            .eq('id', id_proveedor) \
            .execute()
        
        if not check.data:
            return jsonify({'success': False, 'error': 'Proveedor no encontrado'}), 404
        
        data = request.get_json()
        
        # Validar datos requeridos
        if not data.get('nombre'):
            return jsonify({'success': False, 'error': 'El nombre del proveedor es requerido'}), 400
        
        if not data.get('telefono'):
            return jsonify({'success': False, 'error': 'El teléfono es requerido'}), 400
        
        # Preparar datos para actualizar (SIN updated_at)
        update_data = {
            'nombre': data.get('nombre').strip(),
            'telefono': data.get('telefono').strip()
        }
        
        # Agregar campos opcionales solo si vienen en la request
        if data.get('propietario') is not None:
            update_data['propietario'] = data.get('propietario').strip() if data.get('propietario') else None
        if data.get('ubicacion_gps') is not None:
            update_data['ubicacion_gps'] = data.get('ubicacion_gps').strip() if data.get('ubicacion_gps') else None
        if data.get('id_filtro') is not None:
            update_data['id_filtro'] = data.get('id_filtro') if data.get('id_filtro') else None
        
        # Ejecutar actualización
        result = supabase.table('proveedor') \
            .update(update_data) \
            .eq('id', id_proveedor) \
            .execute()
        
        if not result.data:
            return jsonify({'success': False, 'error': 'Error al actualizar proveedor'}), 500
        
        proveedor_actualizado = proveedor_to_dict(result.data[0])
        
        return jsonify({
            'success': True,
            'message': 'Proveedor actualizado exitosamente',
            'proveedor': proveedor_actualizado
        }), 200
        
    except Exception as e:
        logger.error(f"Error en actualizar_proveedor: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@proveedores_bp.route('/proveedores/<int:id_proveedor>', methods=['DELETE'])
@encargado_repuestos_required
def eliminar_proveedor(current_user, id_proveedor):
    """
    Eliminar un proveedor
    """
    try:
        # Verificar que el proveedor existe
        check = supabase.table('proveedor') \
            .select('id, nombre') \
            .eq('id', id_proveedor) \
            .execute()
        
        if not check.data:
            return jsonify({'success': False, 'error': 'Proveedor no encontrado'}), 404
        
        nombre_proveedor = check.data[0].get('nombre', 'Unknown')
        
        # Eliminar proveedor
        supabase.table('proveedor') \
            .delete() \
            .eq('id', id_proveedor) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': f'Proveedor "{nombre_proveedor}" eliminado exitosamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error en eliminar_proveedor: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@proveedores_bp.route('/proveedores/stats', methods=['GET'])
@encargado_repuestos_required
def obtener_estadisticas_proveedores(current_user):
    """
    Obtener estadísticas de proveedores
    """
    try:
        # Total de proveedores
        total_result = supabase.table('proveedor') \
            .select('id', count='exact') \
            .execute()
        
        total = total_result.count if hasattr(total_result, 'count') else 0
        
        # Estadísticas por categoría
        categorias = obtener_todas_categorias()
        stats_por_categoria = []
        
        for cat in categorias:
            count_result = supabase.table('proveedor') \
                .select('id', count='exact') \
                .eq('id_filtro', cat['id']) \
                .execute()
            
            stats_por_categoria.append({
                'id': cat['id'],
                'categoria': cat['nombre_filtro'],
                'descripcion': cat.get('descripcion', ''),
                'total': count_result.count if hasattr(count_result, 'count') else 0
            })
        
        # Proveedores sin categoría
        sin_categoria_result = supabase.table('proveedor') \
            .select('id', count='exact') \
            .is_('id_filtro', 'null') \
            .execute()
        
        return jsonify({
            'success': True,
            'stats': {
                'total': total,
                'por_categoria': stats_por_categoria,
                'sin_categoria': sin_categoria_result.count if hasattr(sin_categoria_result, 'count') else 0
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error en obtener_estadisticas_proveedores: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@proveedores_bp.route('/test-proveedores', methods=['GET'])
def test_endpoint():
    return jsonify({
        'success': True, 
        'message': 'Endpoint de proveedores funcionando correctamente'
    }), 200