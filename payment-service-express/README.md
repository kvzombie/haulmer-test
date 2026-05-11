# Payment Processing Service (Express)

API REST de pagos con **Express.js**, **MongoDB (Mongoose)** y **JavaScript**.

---

## Arquitectura

```
Merchant → POST /api/v1/payments
    │
    ├─ [1] Validación de entrada (validator)
    ├─ [2] Idempotency check (idempotency_key)
    ├─ [3] Reglas de negocio (monto mín/máx)
    ├─ [4] Persiste como PENDING
    ├─ [5] Valida expiración de tarjeta → DECLINED si inválida
    ├─ [6] Transición a PROCESSING
    ├─ [7] Llama al adquirente (retry exponencial)
    └─ [8] Actualiza a APPROVED / DECLINED / FAILED
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v1/payments` | Crear y procesar un pago |
| GET  | `/api/v1/payments/:transaction_id` | Consultar transacción |
| GET  | `/api/v1/payments?merchant_id=&status=&page=&limit=` | Listar transacciones |

### Body POST /payments

```json
{
  "merchant_id": "merchant-001",
  "amount": 150.00,
  "currency": "USD",
  "card": {
    "card_number": "4111111111111111",
    "holder_name": "John Doe",
    "expiry_month": "12",
    "expiry_year": "2030"
  },
  "idempotency_key": "order-123",
  "correlation_id": "req-abc"
}
```

### Tarjetas de prueba

| Número | Resultado |
|--------|-----------|
| `4111111111111111` | Siempre APROBADA |
| `4000000000000002` | Siempre RECHAZADA |
| Cualquier otra válida | 80% APROBADA |

---

## Ejecución

### Con Docker (recomendado)

```bash
cp .env.example .env
docker-compose up --build
```

### Sin Docker

```bash
# Requiere MongoDB corriendo en localhost:27017
npm install
cp .env.example .env

# Terminal 1 — acquirer mock
node acquirer-mock/index.js

# Terminal 2 — app
npm run dev
```

### Tests

```bash
npm test
npm run test:cov
```

---

## Decisiones técnicas

- **Sin CVV en persistencia**: el CVV no se guarda ni se loguea en ningún momento.
- **Logger simple**: JSON por línea en stdout, sin dependencias externas (Winston, etc.).
- **Idempotencia**: índice único sparse en `idempotency_key`. Puede enviarse en body o header `x-idempotency-key`.
- **Trazabilidad**: cada transacción guarda `status_history` con todas las transiciones y su motivo.
- **Solo last_four**: el número de tarjeta completo nunca se persiste.

## Supuestos

1. El CVV se recibe opcionalmente pero no se valida ni persiste.
2. La autenticación de merchants está fuera del scope.
3. Los montos son en la moneda nativa, sin conversión.
