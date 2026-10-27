# Contribuir

Trabaja en una rama con un cambio concreto, por ejemplo `fix/prevent-negative-adjustment` o `feat/order-date-filter`. Relaciona la implementación con un comportamiento observable y mantén el diff fácil de revisar.

1. Inicializa el entorno según el README.
2. Reproduce el problema o define el caso de aceptación.
3. Revisa la ruta desde HTTP hasta persistencia.
4. Cambia el código y las pruebas que verifican el comportamiento.
5. Ejecuta las comprobaciones apropiadas y revisa `git diff` antes de confirmar.
6. Abre un pull request con la plantilla del repositorio.

Los nombres del código y los contratos usan inglés; la interfaz, los mensajes para el usuario y la documentación principal usan español. Evita registrar credenciales o datos reales.

Cambios de migraciones, permisos o contratos de eventos requieren explicar su compatibilidad y recuperación. Una dependencia nueva debe resolver una necesidad concreta. Las sugerencias de IA se evalúan con el mismo criterio que cualquier otro cambio.
