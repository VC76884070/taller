/**
 * Utilidad para compresión de imágenes en el navegador
 * Optimizado para fotos tomadas con celulares modernos
 */

class ImageCompressor {
    constructor(config = {}) {
        this.config = {
            maxWidth: config.maxWidth || 1920,
            maxHeight: config.maxHeight || 1920,
            quality: config.quality || 0.85,
            maxSizeMB: config.maxSizeMB || 2.5,
            minQuality: config.minQuality || 0.5,
            outputFormat: config.outputFormat || 'jpeg'
        };
    }

    /**
     * Comprime una imagen desde un archivo
     * @param {File} file - Archivo de imagen
     * @param {Object} options - Opciones específicas
     * @returns {Promise<File>}
     */
    async compress(file, options = {}) {
        const opts = { ...this.config, ...options };
        
        // Validar que sea imagen
        if (!file.type.startsWith('image/')) {
            throw new Error('El archivo no es una imagen válida');
        }

        const originalSizeMB = file.size / 1024 / 1024;
        console.log(`📸 Comprimiendo: ${file.name} (${originalSizeMB.toFixed(2)} MB)`);

        // Si ya es pequeña, devolver sin comprimir
        if (file.size <= opts.maxSizeMB * 1024 * 1024 && file.size <= 3 * 1024 * 1024) {
            console.log(`✅ Imagen ya óptima, sin compresión`);
            return file;
        }

        try {
            // Cargar imagen
            const img = await this._loadImage(file);
            
            // Calcular dimensiones
            const dimensions = this._calculateDimensions(
                img.width, img.height, opts.maxWidth, opts.maxHeight
            );
            
            console.log(`   Dimensiones: ${img.width}x${img.height} → ${dimensions.width}x${dimensions.height}`);
            
            // Comprimir
            const compressedFile = await this._compressWithAdaptiveQuality(img, dimensions, opts);
            
            const compressedSizeMB = compressedFile.size / 1024 / 1024;
            const reduction = Math.round((1 - compressedFile.size / file.size) * 100);
            console.log(`   Comprimido: ${compressedSizeMB.toFixed(2)} MB (${reduction}% menos)`);
            
            return compressedFile;
            
        } catch (error) {
            console.error('❌ Error en compresión:', error);
            return file;
        }
    }

    _loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('No se pudo cargar la imagen'));
            };
            
            img.src = url;
        });
    }

    _calculateDimensions(width, height, maxWidth, maxHeight) {
        let newWidth = width;
        let newHeight = height;
        
        if (newWidth > maxWidth) {
            newHeight = (newHeight * maxWidth) / newWidth;
            newWidth = maxWidth;
        }
        
        if (newHeight > maxHeight) {
            newWidth = (newWidth * maxHeight) / newHeight;
            newHeight = maxHeight;
        }
        
        return {
            width: Math.round(newWidth),
            height: Math.round(newHeight)
        };
    }

    _compressWithAdaptiveQuality(image, dimensions, opts) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = dimensions.width;
            canvas.height = dimensions.height;
            
            ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);
            
            let currentQuality = opts.quality;
            
            const tryCompression = () => {
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Error al generar blob'));
                            return;
                        }
                        
                        const sizeMB = blob.size / 1024 / 1024;
                        
                        if (sizeMB > opts.maxSizeMB && currentQuality > opts.minQuality) {
                            currentQuality -= 0.1;
                            console.log(`   Ajustando calidad: ${currentQuality.toFixed(2)} (${sizeMB.toFixed(2)} MB → objetivo ${opts.maxSizeMB} MB)`);
                            tryCompression();
                        } else {
                            const fileName = `compressed_${Date.now()}.${opts.outputFormat}`;
                            const compressedFile = new File([blob], fileName, {
                                type: `image/${opts.outputFormat}`,
                                lastModified: Date.now()
                            });
                            resolve(compressedFile);
                        }
                    },
                    `image/${opts.outputFormat}`,
                    currentQuality
                );
            };
            
            tryCompression();
        });
    }
}

// Instancia global para usar en toda la aplicación
const imageCompressor = new ImageCompressor({
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.85,
    maxSizeMB: 2.5,
    minQuality: 0.5
});