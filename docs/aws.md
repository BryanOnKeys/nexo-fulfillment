# AWS y Terraform

## Recursos incluidos

`infra/terraform` declara un topic SNS cifrado, dos colas SQS con DLQ, suscripciones y filtros, un bucket S3 privado con cifrado y versionado, tres contenedores de secretos en Secrets Manager, roles IAM para cada servicio y alarmas por mensajes en DLQ.

No crea recursos de cómputo, red, dominio, certificados ni PostgreSQL administrado. Puedes ejecutar las imágenes en un entorno existente y conectar los recursos declarados. La política de confianza predeterminada corresponde a tareas ECS; EKS requiere una política OIDC propia y un adaptador para varias réplicas de WebSockets si se decide escalar el gateway.

## Preparar infraestructura

Requisitos: Terraform compatible y autenticación AWS mediante un perfil o rol autorizado. Revisa el plan y los costes del entorno antes de aplicar cambios.

```powershell
cd infra/terraform
Copy-Item terraform.tfvars.example terraform.tfvars
# Edita el nombre globalmente único del bucket y la región.
terraform init
terraform fmt -check
terraform validate
terraform plan -out=nexo.tfplan
# Después de revisar el plan:
terraform apply nexo.tfplan
```

No guardes credenciales en `.tfvars`, en el código o en archivos de planes versionados. El estado de Terraform requiere almacenamiento privado y control de acceso. Este repositorio no contiene un backend remoto preconfigurado para una cuenta particular.

## Valores de secretos

Los valores se cargan fuera de Terraform para evitar que las contraseñas aparezcan en su estado. Crea una clave JWT aleatoria compartida por los servicios y una URL de base de datos distinta para cada uno.

| Secreto        | JSON que debe contener                     |
| -------------- | ------------------------------------------ |
| Operaciones    | `JWT_SECRET`, `OPERATIONS_DATABASE_URL`    |
| Documentos     | `JWT_SECRET`, `DOCUMENTS_DATABASE_URL`     |
| Notificaciones | `JWT_SECRET`, `NOTIFICATIONS_DATABASE_URL` |

La URL debe incluir `sslmode=verify-full`. Usa cuentas con permisos acotados a cada base. Una rotación de la clave JWT invalida tokens emitidos y requiere coordinación de reinicios.

## Variables de ejecución

| Variable                  | Valor en AWS                                |
| ------------------------- | ------------------------------------------- |
| `NODE_ENV`                | `production`                                |
| `AWS_REGION`              | Región elegida                              |
| `AWS_SECRET_ID`           | ARN del secreto específico del servicio     |
| `SNS_TOPIC_ARN`           | Salida `topic_arn`                          |
| `DOCUMENTS_QUEUE_URL`     | Cola de documentos                          |
| `NOTIFICATIONS_QUEUE_URL` | Cola de notificaciones                      |
| `S3_BUCKET`               | Nombre del bucket creado                    |
| `WEB_ORIGIN`              | Origen HTTPS exacto del panel               |
| `NEXO_SERVICE`            | `operations`, `documents` o `notifications` |

Omite `AWS_ENDPOINT_URL` y `S3_PUBLIC_ENDPOINT`: los endpoints ficticios se rechazan en producción. No suministres `SEED_PASSWORD` ni ejecutes el seed. El rol de documentos puede guardar y leer objetos; el de notificaciones no recibe permisos de S3.

## Prueba de aceptación real

1. Aplicar las migraciones con el rol administrativo adecuado.
2. Iniciar los tres servicios con su rol y secreto independientes.
3. Crear un cliente, producto y pedido; comprobar que el evento llega a ambas colas.
4. Validar el PDF en S3, la descarga temporal y la denegación para otra cuenta.
5. Detener y recuperar consumidores; comprobar reintentos y DLQ sin efectos duplicados.
6. Confirmar permisos IAM, cifrado, TLS, backups y alarmas con las restricciones del entorno real.

Estas comprobaciones requieren una cuenta AWS y no se sustituyen por Moto ni por `terraform validate`. La creación de alarmas no configura por sí misma destinatarios de alertas; enlázalos con el canal de operación del entorno.
