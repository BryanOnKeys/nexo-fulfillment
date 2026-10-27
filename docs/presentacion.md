# Presentar NEXO en una entrevista

## Recorrido de cinco minutos

1. Abrir el resumen y explicar el problema: coordinar ventas, almacén y entregas.
2. Crear un pedido de dos productos y señalar que el precio se calcula en el servidor.
3. Mostrar que suben las unidades reservadas y bajan las disponibles, sin alterar todavía las físicas.
4. Abrir el historial y avanzar a preparación y despacho con el rol de almacén.
5. Descargar el PDF y mostrar la notificación en la cuenta del cliente.
6. Intentar reservar más existencias de las disponibles y explicar por qué se rechaza.
7. Abrir el caso de uso de pedidos, su adaptador de persistencia y la prueba de concurrencia.

## Explicaciones técnicas que debes poder dar

- Diferencia entre stock físico, reservado y disponible.
- Motivo para mantener pedidos e inventario dentro de una misma transacción.
- Función distinta de SNS y SQS.
- Ventana de fallo que resuelve la outbox y por qué siguen existiendo duplicados.
- Qué se guarda en la inbox y cuándo se elimina un mensaje.
- Motivo para conservar precios e información del cliente como instantáneas del pedido.
- Diferencia entre la validación del DTO, una regla de dominio y una restricción SQL.
- Protección de un documento ante un usuario de otra cuenta.
- Alcance del JWT, del refresh rotatorio y de la revocación.
- Límite actual del gateway de WebSockets y el cambio necesario para múltiples réplicas.

## Ejercicio de cambio pequeño

Agregar una observación obligatoria al cancelar un pedido: modificar el comando y la regla correspondiente, actualizar la documentación, añadir una prueba de rechazo y otra de aceptación, y presentar un pull request que explique el antes y después.

Otro ejercicio: añadir un filtro de pedidos por rango de fechas con validación, una consulta parametrizada, prueba de límites y su control en el panel.

La evidencia más útil es poder recorrer y modificar una parte del sistema, explicar las pruebas y reconocer sus límites. El repositorio no demuestra experiencia laboral en producción por sí mismo.
