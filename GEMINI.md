# GEMINI.md

# Sistema de Gestión de Taller Mecánico

## Descripción

Este es un sistema web desarrollado con Flask y PostgreSQL para la gestión integral de un taller mecánico.

Actualmente el sistema está en producción y desplegado en Render.

Antes de realizar cualquier modificación debes comprender completamente la arquitectura del proyecto.

---

# Tecnologías

Backend

- Python
- Flask
- PostgreSQL
- Supabase
- Google Drive API

Frontend

- HTML
- CSS
- JavaScript Vanilla

Servidor

- Render

---

# Arquitectura

El proyecto está dividido por roles.

Cada rol tiene:

Backend
Frontend HTML
CSS
JavaScript

Los nombres deben mantenerse sincronizados.

Ejemplo:

backend/jefe_taller/orden_trabajo.py

↓

jefe_taller/orden_trabajo.html

↓

jefe_taller/js/orden_trabajo.js

↓

jefe_taller/css/orden_trabajo.css

No romper esta estructura.

---

# Roles

Cliente

Jefe de Taller

Jefe Operativo

Técnico Mecánico

Encargado de Repuestos y Almacén

Cada rol es independiente.

No modificar un rol sin verificar el impacto en los demás.

---

# Convenciones

Mantener el estilo del código existente.

No renombrar archivos.

No renombrar carpetas.

No mover módulos.

No modificar rutas existentes.

No eliminar funciones sin autorización.

---

# Base de datos

No modificar la estructura de la base de datos sin autorización.

Antes de crear una nueva tabla verificar si ya existe una similar.

No eliminar columnas.

No cambiar nombres de tablas.

---

# Seguridad

Nunca eliminar validaciones.

Nunca eliminar autenticación.

Nunca modificar permisos de usuarios sin autorización.

---

# Cambios

Antes de escribir código debes:

1. Analizar el problema.

2. Explicar el plan.

3. Indicar qué archivos serán modificados.

4. Explicar por qué.

Esperar confirmación antes de modificar archivos.

---

# Límite de modificaciones

No modificar más de cinco archivos por tarea.

Si se requieren más archivos debes pedir autorización.

---

# Calidad del código

Evitar duplicar código.

Reutilizar funciones existentes.

Seguir la arquitectura actual.

Mantener nombres descriptivos.

Agregar comentarios únicamente cuando sean realmente necesarios.

---

# Render

Este proyecto está desplegado en producción.

No realizar cambios que rompan la compatibilidad con Render.

---

# Git

Actualmente se trabaja mediante ramas.

Nunca modificar directamente master.

Todos los cambios deben realizarse sobre la rama activa.

---

# Al finalizar cualquier tarea

Siempre entregar:

Resumen de cambios.

Archivos modificados.

Posibles riesgos.

Pruebas recomendadas.

No asumir que el código está correcto.

Revisar posibles errores antes de finalizar.
