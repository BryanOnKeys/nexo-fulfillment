# API y ejemplos en PowerShell

OpenAPI se sirve en `/docs` y su JSON en `/docs-json`, en el puerto de cada servicio. Las cantidades monetarias se expresan en céntimos: `1290` representa S/ 12.90. Los listados usan `page`, `pageSize` y, cuando aplica, `search`.

## Autenticación y consultas

```powershell
$base = "http://localhost:3001/api/v1"
$credencial = Read-Host "Contraseña local" -AsSecureString
$texto = [System.Net.NetworkCredential]::new("", $credencial).Password
$login = @{ email = "admin@nexo.local"; password = $texto } | ConvertTo-Json
$sesion = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType "application/json" -Body $login -SessionVariable cookieSession
Remove-Variable texto, login
$cabeceras = @{ Authorization = "Bearer $($sesion.accessToken)" }
$clientes = Invoke-RestMethod "$base/customers?pageSize=20" -Headers $cabeceras
$productos = Invoke-RestMethod "$base/products?pageSize=20" -Headers $cabeceras
```

## Crear un pedido

```powershell
$clave = [guid]::NewGuid().ToString()
$cabeceras["Idempotency-Key"] = $clave
$cuerpo = @{
  customerId = $clientes.data[0].id
  deliveryAddress = $clientes.data[0].address
  notes = "Coordinar entrega durante la mañana."
  items = @(@{ productId = $productos.data[0].id; quantity = 1 })
} | ConvertTo-Json -Depth 6
$pedido = Invoke-RestMethod "$base/orders" -Method Post -Headers $cabeceras -ContentType "application/json" -Body $cuerpo
```

Para reintentar la misma operación conserva `$clave` y el cuerpo. Cambia la clave cuando sea un pedido distinto.

## Actualizar el estado

```powershell
$cambio = @{ status = "PREPARING"; expectedVersion = $pedido.version; note = "Preparación iniciada." } | ConvertTo-Json
$pedido = Invoke-RestMethod "$base/orders/$($pedido.id)/status" -Method Patch -Headers $cabeceras -ContentType "application/json" -Body $cambio
```

Transiciones: `CONFIRMED → PREPARING → DISPATCHED → DELIVERED`. Ventas o administración pueden cancelar desde `CONFIRMED` o `PREPARING`. Las transiciones de almacén requieren ese rol o administración.

## Documentos y notificaciones

```powershell
$documentos = Invoke-RestMethod "http://localhost:3002/api/v1/documents?orderId=$($pedido.id)" -Headers $cabeceras
$avisos = Invoke-RestMethod "http://localhost:3003/api/v1/notifications" -Headers $cabeceras
```

Los documentos son asíncronos; el listado puede estar vacío inmediatamente después de confirmar el pedido. `/documents/:id/download` devuelve `{ url, expiresIn: 120 }` después de comprobar la autorización.

## Rutas principales

| Servicio       | Método y ruta                                  | Uso                                 |
| -------------- | ---------------------------------------------- | ----------------------------------- |
| Operaciones    | `POST /api/v1/auth/login`, `refresh`, `logout` | Sesiones                            |
| Operaciones    | `GET /api/v1/auth/me`                          | Usuario actual                      |
| Operaciones    | `GET /api/v1/dashboard`                        | Indicadores de la cuenta autorizada |
| Operaciones    | `GET, POST /api/v1/products`                   | Catálogo                            |
| Operaciones    | `PATCH /api/v1/products/:id`                   | Datos y precio de un producto       |
| Operaciones    | `POST /api/v1/products/:id/adjustments`        | Ajuste con `delta` y `reason`       |
| Operaciones    | `GET /api/v1/products/:id/movements`           | Movimientos recientes               |
| Operaciones    | `GET, POST /api/v1/customers`                  | Clientes                            |
| Operaciones    | `PATCH /api/v1/customers/:id`                  | Actualizar un cliente               |
| Operaciones    | `GET, POST /api/v1/orders`                     | Consultar y registrar pedidos       |
| Operaciones    | `GET /api/v1/orders/:id`                       | Líneas e historial                  |
| Operaciones    | `PATCH /api/v1/orders/:id/status`              | Transición con versión esperada     |
| Operaciones    | `GET, POST /api/v1/users`                      | Usuarios, solo administración       |
| Operaciones    | `GET /api/v1/audit`                            | Auditoría, solo administración      |
| Documentos     | `GET /api/v1/documents`                        | Documentos autorizados              |
| Documentos     | `GET /api/v1/documents/:id/download`           | URL temporal                        |
| Notificaciones | `GET /api/v1/notifications`                    | Bandeja y contador sin leer         |
| Notificaciones | `POST /api/v1/notifications/:id/read`          | Marcar una notificación             |
| Notificaciones | `POST /api/v1/notifications/read-all`          | Marcar la bandeja                   |

## WebSocket

Socket.IO en el servicio de notificaciones, namespace `/live`. El handshake utiliza `auth: { token: accessToken }`. `session.ready` confirma la sesión, `notification.created` avisa de un registro nuevo y `session.error` informa de un rechazo de autenticación. El navegador consulta REST después de reconectar.

## Errores

Las respuestas `application/problem+json` contienen `title`, `status`, `code` y `requestId`. La validación añade `details`. Algunos conflictos esperados son `INSUFFICIENT_STOCK`, `STALE_ORDER`, `INVALID_TRANSITION` e `IDEMPOTENCY_CONFLICT`. El estado 401 indica una sesión no válida; 403, un permiso insuficiente; 404, un recurso inexistente o no accesible.
