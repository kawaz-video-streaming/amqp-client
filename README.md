# @ido_kawaz/amqp-client

[![CI](https://github.com/kawaz-video-streaming/amqp-client/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kawaz-video-streaming/amqp-client/actions/workflows/ci.yml)

TypeScript AMQP client for RabbitMQ publishers and consumers.

## Installation

```bash
npm install @ido_kawaz/amqp-client
```

## Quick Start

```ts
import {
	AmqpClient,
	Consumer,
	createConsumerBinding,
	type AmqpConfig,
	createAmqpConfig,
	AmqpRetriableError,
} from '@ido_kawaz/amqp-client';

type OrderCreatedPayload = {
	orderId: string;
	total: number;
};

const binding = createConsumerBinding(
	'orders.created.queue',
	'orders.exchange',
	'orders.created',
);

const isOrderCreatedPayload = (payload: object): payload is OrderCreatedPayload => {
	const candidate = payload as Partial<OrderCreatedPayload>;
	return typeof candidate.orderId === 'string' && typeof candidate.total === 'number';
};

const config: AmqpConfig = {
	amqpConnectionString: 'amqp://guest:guest@localhost:5672',
};

async function bootstrap() {
	const consumer = new Consumer<OrderCreatedPayload>(
		binding,
		isOrderCreatedPayload,
		async (payload) => {
			if (payload.total <= 0) {
				throw new AmqpRetriableError(new Error('Amount not ready yet'), 5);
			}

			console.log('received order:', payload.orderId);
		}
	);

	const client = new AmqpClient(config, [consumer]);
	await client.start();

	client.publish('orders.exchange', 'orders.created', {
		orderId: '123',
		total: 45.5,
	});

	process.on('SIGTERM', async () => {
		await client.stop();
	});
}

bootstrap().catch(console.error);
```

## Configuration

`AmqpConfig`

- `amqpConnectionString`: Full RabbitMQ connection URL (for example `amqp://guest:guest@localhost:5672`)

`createAmqpConfig(): AmqpConfig`

- Validates `AMQP_CONNECTION_STRING` from `process.env` using Joi
- Requires URI scheme `amqp` or `amqps`
- Throws Joi validation error for invalid or missing env value

## API

### `AmqpClient`

- `new AmqpClient(config: AmqpConfig, consumers: Consumer[])`
- `start(): Promise<void>`
	- Connects to RabbitMQ and starts all consumer registrations.
- `publish<T>(exchange: string, topic: string, message: T): void`
	- Serializes payload to JSON and publishes it.
	- Throws `AmqpUninitializedError` if `start()` has not been called.
	- Throws `AmqpPublisherError` if publish returns `false`.
- `stop(): Promise<void>`
	- Closes channel and connection (if initialized).

### `Consumer`

- `new Consumer<Payload>(binding, validatePayload, handlePayload)`
	- Generic `Payload` type is required; binding type is inferred from the binding parameter.
	- `binding: ConsumerBinding` contains `queue`, `exchange`, `topic`.
	- `validatePayload(payload): payload is Payload` validates parsed JSON before handling.
	- `handlePayload(payload)` runs only for valid payloads.
	- `ack`s on success.
	- `nack`s invalid payloads without requeue.
	- `nack`s with requeue for `AmqpRetriableError` while `x-delivery-count < retryLimit`.
	- `nack`s without requeue for all other errors.

### `createConsumerBinding`

- `createConsumerBinding(queue, exchange, topic): ConsumerBinding`
- Helper for creating typed queue/exchange/topic bindings.

## Errors

- `AmqpError`
- `AmqpConnectionError`
- `AmqpUninitializedError`
- `AmqpPublisherError`
- `AmqpConsumerError`
- `AmqpRetriableError`
- `AmqpFatalError`

## Development

- `npm run build` — clean and compile TypeScript
- `npm run build:watch` — compile TypeScript in watch mode
- `npm run clean` — remove build output
- `npm test` — run unit tests

## Publishing


- `npm run package`
	- Cleans workspace deeply
	- Reinstalls dependencies
	- Builds library
	- Publishes with public access
