# @ido_kawaz/amqp-client

TypeScript AMQP client library for interacting with RabbitMQ.

## Install

```bash
npm install @ido_kawaz/amqp-client
```

## Quick start

```ts
import { createAmqpClient } from '@ido_kawaz/amqp-client';

async function bootstrap() {
	const client = await createAmqpClient({
		amqpConnectionString: 'localhost',
		amqpUser: 'guest',
		amqpPassword: 'guest',
	});

	await client.assertExchange('orders.exchange');
	await client.assertQueue('orders.queue', { durable: true });
	await client.bindQueue('orders.queue', 'orders.exchange', 'orders.created');

	await client.publish('orders.exchange', 'orders.created', {
		orderId: '123',
		total: 45.5,
	});

	await client.consume('orders.queue', async (msg) => {
		if (!msg) return;
		const payload = JSON.parse(msg.content.toString());
		console.log('received:', payload);
	});
}

bootstrap().catch(console.error);
```

## Configuration

`createAmqpClient` accepts:

- `amqpConnectionString`: RabbitMQ hostname
- `amqpUser`: RabbitMQ username
- `amqpPassword`: RabbitMQ password

## API

### `createAmqpClient(config: AmqpConfig): Promise<AmqpClient>`

Creates a channel and returns an `AmqpClient` instance.

### `AmqpClient` methods

- `publish(exchange, routingKey, message)`
	- Publishes a JSON-serialized message.
- `consume(queue, handler)`
	- Consumes messages from a queue.
	- Acknowledges (`ack`) on successful handler execution.
	- Rejects with requeue (`nack(..., true)`) if handler throws.
- `assertQueue(queue, options?)`
	- Ensures a queue exists.
- `assertExchange(exchange)`
	- Ensures a durable `topic` exchange exists.
- `bindQueue(queue, exchange, routingKey)`
	- Binds a queue to an exchange using a routing key.
- `stop()`
	- Closes the channel.

## Development

- `npm run build` - clean and compile TypeScript
- `npm run build:watch` - compile in watch mode
- `npm run clean` - remove `dist`

## Publish flow

- `npm run package`
	- Runs `clean:advanced`
	- Reinstalls dependencies
	- Builds
	- Publishes with `--access public`
