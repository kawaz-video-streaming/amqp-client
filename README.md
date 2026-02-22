# @ido_kawaz/amqp-client

[![CI](https://github.com/kawaz-video-streaming/amqp-client/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kawaz-video-streaming/amqp-client/actions/workflows/ci.yml)

TypeScript Amqp client for RabbitMQ publishers and consumers.

## Installation

```bash
npm install @ido_kawaz/amqp-client
```

## Quick start

```ts
import { AmqpClient, Consumer, AmqpConfig } from '@ido_kawaz/amqp-client';

const config: AmqpConfig = {
	amqpConnectionString: 'amqp://guest:guest@localhost:5672',
};

async function bootstrap() {
	const consumer = new Consumer(
		'orders.queue',
		'orders.exchange',
		'orders.created',
		async (message) => {
			if (!message) {
				return;
			}

			const payload = JSON.parse(message.content.toString());
			console.log('received:', payload);
		},
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

- `amqpConnectionString`: RabbitMQ hostname
- Full RabbitMQ connection URL (for example `amqp://guest:guest@localhost:5672`)

## API

### `AmqpClient`

- `new AmqpClient(config: AmqpConfig, consumers: Consumer[])`
- `start(): Promise<void>`
	- Connects to RabbitMQ and starts all consumer registrations.
- `publish<T>(exchange: string, topic: string, message: T): void`
	- JSON serializes payload and publishes it.
	- Throws `AmqpUninitializedError` if `start()` has not been called.
	- Throws `AmqpPublisherError` if publish returns false.
- `stop(): Promise<void>`
	- Closes channel and connection.

### `Consumer`

- `new Consumer(queue, exchange, topic, handler)`
	- Asserts queue and exchange and binds queue to topic.
	- Calls handler for each message.
	- `ack`s on success.
	- `nack`s with requeue logic for `AmqpRetriableError`.
	- `nack`s without requeue for all other errors.

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

## Publish

- `npm run publish`
	- Cleans workspace deeply
	- Reinstalls dependencies
	- Builds library
	- Publishes with public access
