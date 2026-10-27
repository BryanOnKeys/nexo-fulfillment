# Validación

Validación realizada el 27 de octubre de 2026. La [primera ejecución de CI](https://github.com/BryanOnKeys/nexo-fulfillment/actions/runs/40601875358), sobre el commit `806b607`, terminó con los tres trabajos aprobados: `quality`, `integration` y `terraform`.

| Comprobación                                          | Resultado                            |
| ----------------------------------------------------- | ------------------------------------ |
| TypeScript estricto, backend y panel                  | Correcto                             |
| Construcción del backend y bundle de producción web   | Correcto                             |
| Pruebas unitarias                                     | 19 aprobadas                         |
| Pruebas de integración entre los tres servicios       | 23 aprobadas                         |
| Prueba del flujo SNS → SQS → PDF en S3 y notificación | Aprobada con Moto                    |
| WebSocket autenticado con aviso para el cliente       | Aprobado en integración              |
| Concurrencia de stock, idempotencia y versiones       | Aprobadas en la suite de integración |
| Integración contra PostgreSQL 17 en Docker            | 23 aprobadas en GitHub Actions       |
| Construcción de las imágenes de backend y panel       | Aprobada en GitHub Actions           |
| Terraform: formato, inicialización y validación       | Aprobados en GitHub Actions          |
| Auditoría de dependencias de ejecución                | Sin vulnerabilidades en CI           |

El entorno local de verificación ejecuta el motor PostgreSQL embebido PGlite mediante el protocolo PostgreSQL y el driver real de MikroORM. PGlite multiplexa conexiones y no reproduce todas las condiciones de concurrencia de PostgreSQL nativo. GitHub Actions ejecutó y aprobó la misma suite contra **PostgreSQL 17 en un contenedor**, incluyendo competencia por la última unidad, claves idempotentes concurrentes y versiones obsoletas.

La interfaz de acceso se inspeccionó en navegador. El entorno de vista previa disponible no conecta los procesos de backend del entorno de pruebas; el recorrido completo en navegador no se declara verificado. Los flujos de negocio, PDF, permisos y WebSockets sí se ejecutaron por sus interfaces de integración.

Las imágenes Docker se construyeron correctamente en GitHub Actions. El entorno local no dispone de motor Docker. `terraform validate` no completó su ejecución local por una discrepancia de checksums en la caché del proveedor; se conservaron los checksums oficiales para Linux y Windows sin desactivar la integridad. En el entorno limpio de CI sí aprobaron `terraform fmt -check`, `terraform init -backend=false` y `terraform validate`. Estas comprobaciones verifican la construcción y la configuración; no equivalen a un despliegue en AWS. Consulta la pestaña Actions para comprobar el resultado del commit que vayas a utilizar.

No se ha provisionado una cuenta AWS ni se han validado en AWS real los permisos IAM, el comportamiento de SNS/SQS, las alarmas o los enlaces de descarga. La prueba de aceptación para ese entorno se documenta en `aws.md`.
