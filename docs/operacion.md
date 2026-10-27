# Operación y recuperación

## Comandos habituales en PowerShell

```powershell
docker compose ps
docker compose logs --tail=100 operations documents notifications
docker compose logs --tail=100 bootstrap
docker compose down
node scripts/setup.mjs
```

`down` conserva el volumen PostgreSQL. **`down -v` elimina los datos locales**; úsalo únicamente cuando quieras empezar de nuevo.

Para editar el código desde Node usa el procedimiento de desarrollo del README. `npm run dev` ejecuta los tres servicios, el compilador en modo observación y Vite. Primero debe existir `dist`, creado con `npm run build:server`.

## Salud

`/health` verifica el proceso. `/ready` comprueba una consulta a PostgreSQL. No valida IAM, la disponibilidad completa de AWS ni la antigüedad de mensajes. El éxito de readiness no significa que se haya completado todo el trabajo asíncrono.

## Seguir una petición

Cada respuesta devuelve `X-Request-Id`. Si el cliente envía un identificador con formato válido se conserva. Los eventos mantienen esa correlación y la auditoría también la registra. Busca ese valor en los logs para unir una petición con su cambio de negocio.

Los logs incluyen servicio, ruta, código de respuesta y duración; no incluyen cuerpos ni credenciales.

## Pedido registrado y documento pendiente

1. Comprueba que documentos y su consumidor estén activos.
2. Busca el pedido en operaciones y verifica que la outbox tenga un evento.
3. Comprueba los intentos de publicación y `last_error`.
4. Revisa la cantidad de mensajes pendientes y la DLQ.
5. Corrige el motivo del error antes de volver a entregar mensajes.

Consultas de diagnóstico, ejecutadas contra la base del servicio correspondiente:

```sql
select id, attempts, available_at, locked_until, last_error
from outbox where published_at is null order by created_at;

select count(*), min(created_at)
from outbox where published_at is null;

select id, processed_at from inbox order by processed_at desc limit 20;
```

No marques manualmente un evento como publicado para ocultar un error. Un evento ya procesado puede entregarse de nuevo sin repetir sus efectos de base de datos.

## Emulador local y reinicios

Moto conserva sus recursos en memoria. Después de recrearlo, vuelve a ejecutar la inicialización (`node scripts/setup.mjs` para Compose, o `npm run infra:bootstrap` durante desarrollo). El bootstrap local recrea los recursos y vuelve a poner las outbox existentes en estado pendiente.

La inbox evita duplicar las notificaciones. Documentos comprueba la existencia del objeto al recibir un evento repetido y puede regenerar el PDF perdido del emulador. Este mecanismo está limitado al bootstrap de desarrollo y no ejecuta un replay global en producción.

El emulador no ofrece la durabilidad, los controles de acceso ni todas las características de los servicios AWS reales. Para una validación real usa una cuenta de pruebas y la configuración documentada en `aws.md`.

## DLQ

Las colas redirigen un mensaje después de cinco recepciones fallidas. Conserva el evento, identifica si falla el contrato, la infraestructura o el procesamiento y corrige la causa. El redrive en AWS debe realizarlo una persona con permisos de operación. Las políticas de los servicios no conceden administración de colas ni vaciado de DLQ.

## Migraciones y despliegue

Aplica migraciones mediante un único proceso administrativo antes de iniciar una nueva versión. No se ejecuta sincronización destructiva automática del esquema. Los métodos `down` existen para entornos controlados; en producción prioriza migraciones correctivas y una copia de seguridad verificada.

El proceso administrativo y la aplicación no tienen por qué compartir las mismas credenciales en producción. La separación entre permisos DDL y DML forma parte de la configuración del entorno de destino.
