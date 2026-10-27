# Trabajo asistido por IA en NEXO

Este archivo orienta a herramientas agentivas que trabajan sobre el repositorio. Las decisiones de negocio y el código generado se revisan mediante evidencia, pruebas y diffs.

## Antes de editar

- Lee el README y la decisión de arquitectura relacionada con la tarea.
- Define un cambio acotado y el comportamiento observable que debe mejorar.
- Recorre controlador, caso de uso, dominio y persistencia antes de modificar un flujo.
- No incluyas secretos, cuerpos de peticiones ni datos reales de clientes en prompts, logs o commits.

## Límites de arquitectura

- El dominio de operaciones no puede importar NestJS, MikroORM, SDK de AWS ni controladores.
- Un servicio no puede consultar las tablas de otro servicio durante tráfico de negocio.
- Un cambio de datos y su evento deben compartir una transacción de outbox.
- Un consumidor debe tolerar la repetición de un evento.
- Conserva las restricciones SQL y el orden de bloqueo de productos.
- Las migraciones ejecutadas se conservan; evoluciona el esquema con una nueva migración.
- Conserva los importes en céntimos y los contratos de eventos versionados.

## Validación y revisión

Ejecuta `npm run typecheck`, `npm run lint` y las pruebas relacionadas con el cambio. Para una entrega completa, ejecuta `npm run verify`, `npm run format:check` y la integración con un entorno de pruebas inicializado.

Revisa entradas no confiables, autorización por recurso, reintentos, fallos parciales y compatibilidad de eventos. Una respuesta generada por IA no cuenta como comprobación: incluye la salida observada de herramientas o pruebas.

El pull request explica el problema, el resultado, cómo se comprobó y las limitaciones. No inventes revisiones humanas, métricas de cobertura, pruebas en AWS o resultados de CI.
