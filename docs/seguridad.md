# Seguridad y permisos

## Identidad

Las contraseñas se derivan con scrypt y una sal aleatoria; se comparan con `timingSafeEqual`. Los JWT expiran a los quince minutos, validan firma HS256, emisor y audiencia. La clave compartida de firma debe ser aleatoria y suficientemente larga.

El refresh dura como máximo siete días y se guarda en cookie HttpOnly, SameSite=Strict y Secure en producción. La base conserva únicamente su hash. Cada refresh rota el valor; reutilizar uno antiguo revoca la sesión. El cliente coordina sus renovaciones para evitar refresh simultáneos dentro de la pestaña. Dos pestañas que compitan por el mismo refresh pueden provocar una revocación; una coordinación entre pestañas o una ventana de gracia controlada sería una ampliación específica de sesiones.

Cerrar sesión revoca el refresh y elimina el token del panel. Un access token emitido anteriormente sigue siendo válido hasta su vencimiento, también en los otros servicios. El gateway desconecta al expirar el JWT. La revocación instantánea distribuida requeriría un registro compartido de sesiones o claves de verificación por servicio; no se afirma que esté implementada.

## Autorización

| Operación                        | Administración | Ventas | Almacén | Cliente        |
| -------------------------------- | -------------- | ------ | ------- | -------------- |
| Consultar catálogo               | Sí             | Sí     | Sí      | Sí             |
| Crear o editar producto          | Sí             | Sí     | No      | No             |
| Ajustar existencias              | Sí             | No     | Sí      | No             |
| Crear pedido                     | Sí             | Sí     | No      | Solo su cuenta |
| Cancelar antes del despacho      | Sí             | Sí     | No      | No             |
| Preparar, despachar y entregar   | Sí             | No     | Sí      | No             |
| Consultar pedidos y documentos   | Todos          | Todos  | Todos   | Solo su cuenta |
| Administrar usuarios y auditoría | Sí             | No     | No      | No             |

Los controles se aplican en el servidor. Los identificadores de cliente contenidos en un cuerpo no reemplazan la identidad del JWT. Los recursos de otra cuenta reciben 404 para evitar revelar su existencia. Las salas de Socket.IO las decide el servidor después de autenticar la conexión.

## Configuración

- `.env` y archivos de estado de Terraform están excluidos de Git y de las imágenes.
- En producción se exige Secrets Manager y `sslmode=verify-full` para PostgreSQL.
- El SDK obtiene credenciales de AWS del rol de ejecución; las credenciales ficticias solo se utilizan con el endpoint del emulador.
- S3 es privado, cifra los objetos y expone descargas autorizadas que duran 120 segundos.
- Los logs no registran contraseñas, tokens, cookies ni cuerpos de las peticiones.
- Las consultas con entradas de usuario usan parámetros; los DTO rechazan propiedades inesperadas.
- Los errores públicos no devuelven trazas de ejecución.
- Las imágenes de los servicios ejecutan un usuario sin privilegios; Compose elimina capacidades y usa sistema de archivos de solo lectura para los procesos Node.
- Existe limitación de peticiones y una cuota más baja para el login.

El Compose es de desarrollo. El entorno productivo debe suministrar a cada servicio exclusivamente su secreto y los recursos que necesita. Si se usa un proxy, configura una política de confianza limitada a ese proxy y sus límites de tráfico; no confíes de forma general en encabezados enviados por clientes.

## Datos ficticios y mantenimiento

El seed usa dominios `example.com` y cuentas `nexo.local`. No debe ejecutarse con datos de clientes reales. El usuario inicial y las cuentas de ejemplo se crean con una contraseña local generada.

Dependabot propone actualizaciones agrupadas; los cambios de versión pasan por las mismas comprobaciones. La rotación de secretos requiere reiniciar los servicios, porque la configuración se carga al arrancar. Para incidentes, conserva la correlación y utiliza los procedimientos de operación.
