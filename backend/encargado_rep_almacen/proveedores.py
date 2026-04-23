# =====================================================
# PROVEEDORES.PY - ENCARGADO DE REPUESTOS
# FURIA MOTOR COMPANY SRL
# =====================================================

from flask import Blueprint, request, jsonify
from config import config
from decorators import encargado_repuestos_required
import datetime
import logging
import json

logger = logging.getLogger(__name__)

# =====================================================
# CREAR BLUEPRINT
# =====================================================
proveedores_bp = Blueprint('proveedores', __name__, url_prefix='/api/encargado-repuestos')

SECRET_KEY = config.SECRET_KEY
supabase = config.supabase

# =====================================================
# ENDPOINTS
# =====================================================

@proveedores_bp.route('/proveedores', methods=['GET'])
@encargado_repuestos_required
def obtener_proveedores(current_user):
    """Obtener lista de proveedores"""
    try:
        estado = request.args.get('estado')
        
        query = supabase.table('proveedor') \
            .select('*') \
            .order('nombre', asc=True)
        
        if estado and estado != 'all':
            query = query.eq('estado', estado)
        
        result = query.execute()
        
        if not result.data:
            return jsonify({'success': True, 'proveedores': []}), 200
        
        proveedores = []
        for p in result.data:
            # Parsear categorías
            categorias = []
            if p.get('categorias'):
                try:
                    categorias = json.loads(p['categorias']) if isinstance(p['categorias'], str) else p['categorias']
                except:
                    categorias = []
            
            proveedores.append({
                'id': p.get('id'),
                'nombre': p.get('nombre'),
                'ruc': p.get('ruc'),
                'contacto': p.get('contacto'),
                'cargo': p.get('cargo'),
                'telefono': p.get('telefono'),
                'telefono2': p.get('telefono2'),
                'email': p.get('email'),
                'website': p.get('website'),
                'direccion': p.get('direccion'),
                'categorias': categorias,
                'estado': p.get('estado', 'activo'),
                'notas': p.get('notas'),
                'created_at': p.get('created_at'),
                'updated_at': p.get('updated_at')
            })
        
        return jsonify({'success': True, 'proveedores': proveedores}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo proveedores: {str(e)}")
        return jsonify({'error': str(e)}), 500


@proveedores_bp.route('/proveedores', methods=['POST'])
@encargado_repuestos_required
def crear_proveedor(current_user):
    """Crear nuevo proveedor"""
    try:
        data = request.get_json()
        
        nombre = data.get('nombre')
        if not nombre:
            return jsonify({'error': 'El nombre es requerido'}), 400
        
        telefono = data.get('telefono')
        if not telefono:
            return jsonify({'error': 'El teléfono es requerido'}), 400
        
        categorias = data.get('categorias', [])
        
        nuevo_proveedor = {
            'nombre': nombre,
            'ruc': data.get('ruc'),
            'contacto': data.get('contacto'),
            'cargo': data.get('cargo'),
            'telefono': telefono,
            'telefono2': data.get('telefono2'),
            'email': data.get('email'),
            'website': data.get('website'),
            'direccion': data.get('direccion'),
            'categorias': json.dumps(categorias) if categorias else None,
            'estado': data.get('estado', 'activo'),
            'notas': data.get('notas'),
            'created_at': datetime.datetime.now().isoformat(),
            'updated_at': datetime.datetime.now().isoformat()
        }
        
        result = supabase.table('proveedor') \
            .insert(nuevo_proveedor) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al crear proveedor'}), 500
        
        return jsonify({
            'success': True,
            'message': 'Proveedor creado exitosamente',
            'proveedor': result.data[0]
        }), 201
        
    except Exception as e:
        logger.error(f"Error creando proveedor: {str(e)}")
        return jsonify({'error': str(e)}), 500


@proveedores_bp.route('/proveedores/<int:id_proveedor>', methods=['PUT'])
@encargado_repuestos_required
def actualizar_proveedor(current_user, id_proveedor):
    """Actualizar proveedor existente"""
    try:
        data = request.get_json()
        
        # Verificar que existe
        check = supabase.table('proveedor') \
            .select('id') \
            .eq('id', id_proveedor) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Proveedor no encontrado'}), 404
        
        categorias = data.get('categorias', [])
        
        update_data = {
            'nombre': data.get('nombre'),
            'ruc': data.get('ruc'),
            'contacto': data.get('contacto'),
            'cargo': data.get('cargo'),
            'telefono': data.get('telefono'),
            'telefono2': data.get('telefono2'),
            'email': data.get('email'),
            'website': data.get('website'),
            'direccion': data.get('direccion'),
            'categorias': json.dumps(categorias) if categorias else None,
            'estado': data.get('estado', 'activo'),
            'notas': data.get('notas'),
            'updated_at': datetime.datetime.now().isoformat()
        }
        
        result = supabase.table('proveedor') \
            .update(update_data) \
            .eq('id', id_proveedor) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Error al actualizar proveedor'}), 500
        
        return jsonify({
            'success': True,
            'message': 'Proveedor actualizado exitosamente',
            'proveedor': result.data[0]
        }), 200
        
    except Exception as e:
        logger.error(f"Error actualizando proveedor: {str(e)}")
        return jsonify({'error': str(e)}), 500


@proveedores_bp.route('/proveedores/<int:id_proveedor>', methods=['DELETE'])
@encargado_repuestos_required
def eliminar_proveedor(current_user, id_proveedor):
    """Eliminar proveedor (soft delete o hard delete según necesidad)"""
    try:
        # Verificar que existe
        check = supabase.table('proveedor') \
            .select('id') \
            .eq('id', id_proveedor) \
            .execute()
        
        if not check.data:
            return jsonify({'error': 'Proveedor no encontrado'}), 404
        
        # Hard delete
        supabase.table('proveedor') \
            .delete() \
            .eq('id', id_proveedor) \
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Proveedor eliminado exitosamente'
        }), 200
        
    except Exception as e:
        logger.error(f"Error eliminando proveedor: {str(e)}")
        return jsonify({'error': str(e)}), 500


@proveedores_bp.route('/proveedores/<int:id_proveedor>', methods=['GET'])
@encargado_repuestos_required
def obtener_proveedor(current_user, id_proveedor):
    """Obtener un proveedor específico"""
    try:
        result = supabase.table('proveedor') \
            .select('*') \
            .eq('id', id_proveedor) \
            .execute()
        
        if not result.data:
            return jsonify({'error': 'Proveedor no encontrado'}), 404
        
        p = result.data[0]
        
        categorias = []
        if p.get('categorias'):
            try:
                categorias = json.loads(p['categorias']) if isinstance(p['categorias'], str) else p['categorias']
            except:
                categorias = []
        
        proveedor = {
            'id': p.get('id'),
            'nombre': p.get('nombre'),
            'ruc': p.get('ruc'),
            'contacto': p.get('contacto'),
            'cargo': p.get('cargo'),
            'telefono': p.get('telefono'),
            'telefono2': p.get('telefono2'),
            'email': p.get('email'),
            'website': p.get('website'),
            'direccion': p.get('direccion'),
            'categorias': categorias,
            'estado': p.get('estado', 'activo'),
            'notas': p.get('notas'),
            'created_at': p.get('created_at'),
            'updated_at': p.get('updated_at')
        }
        
        return jsonify({'success': True, 'proveedor': proveedor}), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo proveedor: {str(e)}")
        return jsonify({'error': str(e)}), 500


@proveedores_bp.route('/proveedores/stats', methods=['GET'])
@encargado_repuestos_required
def obtener_estadisticas_proveedores(current_user):
    """Obtener estadísticas de proveedores"""
    try:
        activos = supabase.table('proveedor') \
            .select('id', count='exact') \
            .eq('estado', 'activo') \
            .execute()
        
        inactivos = supabase.table('proveedor') \
            .select('id', count='exact') \
            .eq('estado', 'inactivo') \
            .execute()
        
        total = supabase.table('proveedor') \
            .select('id', count='exact') \
            .execute()
        
        return jsonify({
            'success': True,
            'stats': {
                'activos': activos.count if hasattr(activos, 'count') else 0,
                'inactivos': inactivos.count if hasattr(inactivos, 'count') else 0,
                'total': total.count if hasattr(total, 'count') else 0
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {str(e)}")
        return jsonify({'error': str(e)}), 500


# =====================================================
# ENDPOINT DE PRUEBA
# =====================================================

@proveedores_bp.route('/test-proveedores', methods=['GET'])
def test_endpoint():
    return jsonify({'success': True, 'message': 'Endpoint de proveedores funcionando'}), 200