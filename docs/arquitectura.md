# Decisiones de arquitectura

## 1. Monorepositorio con tres unidades de despliegue

Operaciones concentra clientes, catálogo, stock y pedidos para mantener atómica la reserva. Separar inventario y pedidos en dos bases exigiría una saga o compensaciones distribuidas sin mejorar el caso de uso actual. Documentos y notificaciones tienen cargas, persistencia y ciclos de despliegue independientes.

Los módulos compartidos contienen contratos y herramientas técnicas. No contienen entidades de negocio compartidas entre las tres bases. Los identificadores de cliente y pedido en documentos y notificaciones son referencias externas sin claves foráneas entre servicios.

## 2. DDD pragmático

`Money`, `Stock` y `OrderAggregate` expresan las reglas esenciales. El dominio no importa NestJS, MikroORM ni SDK de AWS. El caso de uso de pedidos depende del puerto `OrderStore`; `MikroOrderStore` implementa la transacción y las consultas.

El catálogo y la identidad utilizan servicios de aplicación con persistencia directa, porque añadir interfaces que solo repitan las operaciones del ORM no aportaría otra implementación en este alcance. No se declara que todos los módulos tengan una arquitectura hexagonal estricta.

## 3. Stock físico y reservado

Disponible = físico − reservado. Crear reserva; cancelar libera; despachar reduce físico y reservado. Entregar no vuelve a descontar unidades. PostgreSQL conserva restricciones para impedir valores negativos o reservas superiores al físico.

Los productos se bloquean con `FOR UPDATE` en orden de UUID para reducir interbloqueos. Los pedidos se bloquean antes de cambiar de estado. La versión debe coincidir con `expectedVersion` para impedir actualizaciones basadas en una pantalla antigua.

Los importes son enteros en céntimos PEN. El servidor calcula los totales con el precio vigente y guarda una instantánea de nombre, SKU y precio en las líneas del pedido. Cambiar el catálogo no reescribe ventas anteriores. El modelo no incluye impuestos, descuentos ni conversión de divisas.

## 4. Idempotencia HTTP

La clave se limita al usuario autenticado. Se serializan peticiones de la misma clave mediante un advisory lock transaccional. Se normalizan y consolidan las líneas antes de calcular el hash del contenido. La petición, el pedido, sus movimientos y su evento se confirman en la misma transacción.

Un reintento devuelve el recurso que ya existe. Un contenido distinto con la misma clave produce conflicto. Las claves permanecen conservadas; una política de expiración necesita acordar primero la ventana de reintentos del cliente.

## 5. Outbox e inbox

La outbox comparte la transacción del negocio. El publicador reclama lotes mediante `SKIP LOCKED` y una concesión temporal; publica fuera de la transacción y marca el resultado solo si conserva esa concesión. Un proceso interrumpido deja vencer la concesión. Los fallos incrementan los intentos y aplican espera exponencial limitada.

Publicar y confirmar el envío no es una operación atómica; por eso pueden aparecer duplicados. Cada consumidor guarda el identificador del evento en una inbox con restricción única. Los mensajes solo se eliminan de SQS después de procesarse; los errores terminan en DLQ al superar cinco recepciones.

La escritura en S3 utiliza una clave determinista por pedido y tipo de documento. Una repetición puede reescribir el mismo objeto, pero no crea una segunda referencia de negocio. Un fallo entre S3 y PostgreSQL puede dejar un objeto aún sin metadatos; un reintento lo vuelve a utilizar. El bucket permite versionado en AWS; debe incorporarse una política de retención acorde al negocio antes de operar con datos reales.

## 6. Eventos y tiempo real

Los contratos contienen `id`, `schemaVersion`, `type`, `occurredAt`, `correlationId` y `data`. Los consumidores rechazan contratos desconocidos. SNS filtra la cola de documentos a confirmaciones y despachos.

Los eventos pueden llegar fuera de orden. La bandeja es un historial de avisos; no mantiene el estado oficial de un pedido. El panel vuelve a leer operaciones para mostrar su estado vigente. Al reconectar hace una consulta de recuperación y también actualiza al recuperar el foco.

Una notificación se persiste antes de emitirse. Si el proceso cae después del commit y antes de emitir, permanece accesible mediante REST. No se promete que todos los navegadores reciban todos los paquetes del WebSocket.

## 7. Escala y límites explícitos

Operaciones y documentos pueden ejecutar varios consumidores con sus conexiones y tablas compartidas. Los bloqueos e inbox coordinan su trabajo. Escalar requiere observar conexiones de PostgreSQL, tiempo de respuesta, antigüedad de outbox y colas.

**Notificaciones ejecuta una réplica del gateway.** Para varias réplicas se necesita un adaptador de Socket.IO respaldado por un canal compartido, por ejemplo Redis, y configurar correctamente el balanceador. Aumentar réplicas sin ese cambio repartiría eventos entre procesos cuyos clientes no comparten salas.

El listado de clientes y productos admite paginación; el selector inicial de un pedido carga hasta cien referencias. Un catálogo mayor necesita un selector con búsqueda remota. Esta limitación de interfaz no modifica la paginación de la API.

No se incluyen pagos, integración de transportistas, tributación, multiempresa, Web3, facturación electrónica ni Kubernetes. Son ampliaciones que necesitan requisitos propios.
