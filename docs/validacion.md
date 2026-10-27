# Validación

Validación local realizada el 27 de octubre de 2026:

| Comprobación                                          | Resultado                            |
| ----------------------------------------------------- | ------------------------------------ |
| TypeScript estricto, backend y panel                  | Correcto                             |
| Construcción del backend y bundle de producción web   | Correcto                             |
| Pruebas unitarias                                     | 19 aprobadas                         |
| Pruebas de integración entre los tres servicios       | 23 aprobadas                         |
| Prueba del flujo SNS → SQS → PDF en S3 y notificación | Aprobada con Moto                    |
| WebSocket autenticado con aviso para el cliente       | Aprobado en integración              |
| Concurrencia de stock, idempotencia y versiones       | Aprobadas en la suite de integración |

El entorno local de verificación ejecuta el motor PostgreSQL embebido PGlite mediante el protocolo PostgreSQL y el driver real de MikroORM. PGlite multiplexa conexiones y no reproduce todas las condiciones de concurrencia de PostgreSQL nativo. El workflow de GitHub Actions ejecuta la misma suite contra **PostgreSQL 17 en un contenedor** para verificar ese comportamiento en el motor de destino.

La interfaz de acceso se inspeccionó en navegador. El entorno de vista previa disponible no conecta los procesos de backend del entorno de pruebas; el recorrido completo en navegador no se declara verificado. Los flujos de negocio, PDF, permisos y WebSockets sí se ejecutaron por sus interfaces de integración.

Las imágenes Docker y la configuración Terraform tienen comprobaciones específicas en CI. No se construyeron imágenes en este entorno porque no dispone de motor Docker. `terraform validate` no completó su ejecución local: el directorio de caché del proveedor no coincidió con los checksums del lock después de descargar el proveedor firmado. Se conservaron los checksums obtenidos del registro oficial para Linux y Windows; no se desactivó la comprobación de integridad. La validación completa queda pendiente en un entorno limpio. Un workflow configurado no equivale a una ejecución aprobada: consulta su resultado en la pestaña Actions del repositorio.

No se ha provisionado una cuenta AWS ni se han validado en AWS real los permisos IAM, el comportamiento de SNS/SQS, las alarmas o los enlaces de descarga. La prueba de aceptación para ese entorno se documenta en `aws.md`.
