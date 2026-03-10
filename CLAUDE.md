# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Clean and compile TypeScript to CommonJS
npm run build:watch  # Watch mode compilation
npm test             # Build then run Jest tests (--runInBand --verbose)
npm run clean        # Remove dist/
```

To run a single test file:
```bash
npx jest src/__tests__/consumer.test.ts --runInBand
```

There is no lint command configured.

## Architecture

This is a TypeScript RabbitMQ client library (`@ido_kawaz/amqp-client`) that wraps `amqplib` with type-safe publishing/consuming and structured error handling.

### Core Flow

1. **`AmqpClient`** ([src/amqpClient.ts](src/amqpClient.ts)) — top-level orchestrator. Call `start(serviceName)` to connect and initialize all consumers, `publish<T>(exchange, topic, message)` to send, `stop()` to teardown.

2. **`Consumer<Payload, Binding>`** ([src/consumer.ts](src/consumer.ts)) — most complex class. Registers event handlers via `.on()`:
   - `validateMessage`: type guard `(payload: object) => payload is Payload`
   - `handleMessage`: business logic
   - `handleRetriableError` / `handleFatalError` / `handleSuccess`: lifecycle hooks

   On each message: deserialize JSON → validate → process → ack/nack. Uses `x-delivery-count` header to enforce `retryLimit`. Creates quorum queues (`x-queue-type: 'quorum'`) and durable topic exchanges.

3. **`createConsumerBinding`** ([src/binding.ts](src/binding.ts)) — factory that returns a typed `{queue, exchange, topic}` tuple with `as const` for literal type inference.

4. **`createAmqpConfig`** ([src/config.ts](src/config.ts)) — reads and validates `AMQP_CONNECTION_STRING` env var via Zod (must be `amqp://` or `amqps://` URI).

### Error Hierarchy ([src/errors.ts](src/errors.ts))

- `AmqpError` (base)
  - `AmqpConnectionError`, `AmqpUninitializedError`, `AmqpPublisherError`, `AmqpConsumerError`
  - `AmqpRetriableError` (has `retryLimit` property) → triggers requeue
  - `AmqpFatalError` → triggers nack without requeue
  - `InvalidPayloadFormatError`, `MissingPayloadHandlerError`

### Key Dependencies

- `amqplib` — AMQP protocol
- `pino` — structured logging (used in Consumer for per-message request tracking)
- `zod` — env var validation only
- `ramda` — `isNil`/`isNotNil` null checks

### Exports

All public API is re-exported from [src/index.ts](src/index.ts): `AmqpClient`, `Consumer`, `createConsumerBinding`, `createAmqpConfig`, all error classes, and `AmqpPublishArgs` type.
