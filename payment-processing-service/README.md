# Payment Processing Service

API REST para procesamiento de pagos construida con **NestJS**, **MongoDB (Mongoose)** y **TypeScript**.

---

## Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INTERNET / MERCHANTS                        │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Payment Processing Service                       │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐    │
│  │  Controller  │──▶│  PaymentsService │──▶│ AcquirerService  │    │
│  │  (HTTP/REST) │   │  (Business Logic)│   │  (HTTP Client +  │    │
│  └──────────────┘   └────────┬─────────┘   │   Retry Logic)   │    │
│                              │             └────────┬─────────┘    │
│  ┌──────────────────────┐    │                      │              │
│  │  GlobalExceptionFilter│    │             ┌────────▼─────────┐    │
│  │  LoggingInterceptor  │    │             │  Acquirer Mock   │    │
│  │  ValidationPipe      │    │             │  (HTTP Server)   │    │
│  └──────────────────────┘    │             └──────────────────┘    │
│                              ▼                                      │
│                   ┌─────────────────────┐                          │
│                   │  PaymentsRepository │                          │
│                   │  (Data Access Layer)│                          │
│                   └──────────┬──────────┘                          │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                               ▼
                   ┌─────────────────────┐
                   │      MongoDB        │
                   │  (transactions col) │
                   └─────────────────────┘
```

### Componentes principales

| Componente | Responsabilidad |
|---|---|
| **PaymentsController** | Recibe peticiones HTTP, extrae headers (idempotency key, correlation ID), delega al servicio |
| **PaymentsService** | Orquesta el flujo completo: idempotencia → validación → persistencia → adquirente → actualización |
| **PaymentsRepository** | Acceso a datos con Mongoose. Mantiene historial de transiciones de estado |
| **AcquirerService** | Llama al adquirente externo con reintentos exponenciales. Simula respuestas en modo mock |
| **AppLogger** | Logger estructurado (Winston) con `transactionId` y `correlationId` en cada log |
| **GlobalExceptionFilter** | Captura todas las excepciones y devuelve respuestas uniformes con `correlationId` |
| **LoggingInterceptor** | Registra entrada/salida de cada request con duración. Enmascara datos sensibles de tarjeta |

### Flujo de una transacción

```
Merchant → POST /api/v1/payments
    │
    ├─ [1] Idempotency check (busca por idempotency_key)
    │       └─ Si existe → devuelve transacción existente (no reprocesa)
    │
    ├─ [2] Validación de reglas de negocio (monto mín/máx)
    │
    ├─ [3] Persiste transacción con estado PENDING
    │
    ├─ [4] Valida tarjeta (Luhn algorithm + fecha de expiración)
    │       └─ Si inválida → DECLINED (sin llamar al adquirente)
    │
    ├─ [5] Transición a PROCESSING
    │
    ├─ [6] Llama al adquirente (con retry exponencial: 200ms, 400ms, 800ms)
    │       ├─ Aprobado → APPROVED + authorization_code
    │       ├─ Rechazado → DECLINED + response_code
    │       └─ Error de red → FAILED + failure_reason
    │
    └─ [7] Responde al merchant con estado final + historial
```

---

## Endpoints

### `POST /api/v1/payments`

Crea y procesa un nuevo pago.

**Headers opcionales:**
- `x-idempotency-key`: Clave para evitar duplicados
- `x-correlation-id`: ID de correlación para trazabilidad

**Body:**
```json
{
  "merchant_id": "merchant-001",
  "amount": 150.00,
  "currency": "USD",
  "card": {
    "card_number": "4111111111111111",
    "holder_name": "John Doe",
    "expiry_month": "12",
    "expiry_year": "2030",
    "cvv": "123"
  },
  "idempotency_key": "order-abc-123",
  "correlation_id": "req-xyz-456"
}
```

**Respuesta exitosa (201):**
```json
{
  "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
  "merchant_id": "merchant-001",
  "amount": 150.00,
  "currency": "USD",
  "status": "APPROVED",
  "card": {
    "last_four": "1111",
    "brand": "VISA",
    "holder_name": "John Doe"
  },
  "acquirer_response": {
    "authorization_code": "ABC123",
    "response_code": "00",
    "response_message": "Approved",
    "acquirer_transaction_id": "ACQ-001",
    "processed_at": "2024-01-01T12:00:00Z"
  },
  "status_history": [
    { "from": null, "to": "PENDING", "timestamp": "...", "reason": "Transaction created" },
    { "from": "PENDING", "to": "PROCESSING", "timestamp": "...", "reason": "Sending to acquirer" },
    { "from": "PROCESSING", "to": "APPROVED", "timestamp": "...", "reason": "Approved" }
  ]
}
```

### `GET /api/v1/payments/:transaction_id`

Consulta una transacción por ID.

### `GET /api/v1/payments?merchant_id=...&status=...&page=1&limit=20`

Lista transacciones con filtros y paginación.

**Query params:** `merchant_id`, `status` (PENDING | PROCESSING | APPROVED | DECLINED | FAILED), `page`, `limit`

---

## Tarjetas de prueba (Acquirer Mock)

| Número de tarjeta | Resultado |
|---|---|
| `4111111111111111` | Siempre APROBADA |
| `4000000000000002` | Siempre RECHAZADA |
| `5200000000000000` | Error 503 (reintentos) |
| Cualquier otra (Luhn válida) | 80% APROBADA / 20% RECHAZADA |

---

## Ejecución local

### Opción 1: Docker Compose (recomendado)

```bash
# Clonar y entrar al proyecto
git clone <repo-url>
cd payment-processing-service

# Copiar variables de entorno
cp .env.example .env

# Levantar todo (app + MongoDB + acquirer mock)
docker-compose up --build

# La API queda disponible en http://localhost:3000
```

### Opción 2: Local sin Docker

**Requisitos:** Node.js 20+, MongoDB 7.0 corriendo en localhost:27017

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar MONGODB_URI si es necesario

# Iniciar acquirer mock (en otra terminal)
node acquirer-mock/index.js

# Iniciar en modo desarrollo
npm run start:dev
```

### Correr tests

```bash
# Todos los tests
npm test

# Con cobertura
npm run test:cov

# En modo watch
npm run test:watch
```

---

## Modelo de datos (MongoDB)

```
transactions
├── transaction_id       String (UUID, unique, indexed)
├── merchant_id          String (indexed)
├── amount               Number
├── currency             String (enum)
├── status               String (enum, indexed)
├── card                 Object
│   ├── last_four        String (nunca se guarda el número completo)
│   ├── brand            String
│   ├── holder_name      String
│   ├── expiry_month     String
│   └── expiry_year      String
├── acquirer_response    Object (authorization_code, response_code, etc.)
├── status_history       Array<{from, to, timestamp, reason}>
├── failure_reason       String
├── idempotency_key      String (unique sparse index)
├── correlation_id       String
├── acquirer_retry_count Number
├── createdAt            Date (auto)
└── updatedAt            Date (auto)
```

**Índices compuestos:** `{merchant_id, status}`, `{createdAt: -1}`

---

## Decisiones técnicas

### Idempotencia
Se implementa vía `idempotency_key` (índice único sparse en MongoDB). Si llega una segunda solicitud con la misma clave antes de TTL, se devuelve la transacción original sin reprocesar. La clave puede enviarse en el body o en el header `x-idempotency-key`.

### Trazabilidad
Cada transacción mantiene un `status_history` con todas las transiciones. El `correlation_id` fluye desde el request hasta los logs y la base de datos. El logger incluye `transactionId` en cada línea relevante.

### Seguridad de datos de tarjeta
El número completo de tarjeta **nunca se persiste**. Solo se guarda `last_four` y `brand`. Los datos sensibles se enmascaran en los logs (`LoggingInterceptor`).

---

## Supuestos

1. El monto se maneja en la moneda nativa (sin conversión); la validación de moneda es solo de formato.
2. El adquirente mock simula latencia realista (100-400ms).
3. En producción, el `idempotency_key` debería tener TTL configurable; aquí es persistente.
4. Los reintentos aplican a errores transitorios del adquirente; errores de negocio (DECLINED) son definitivos.
5. La autenticación de merchants (JWT/API Key) está fuera del scope de este componente.
