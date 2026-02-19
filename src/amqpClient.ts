import amqp, { Channel } from 'amqplib';
import { AmqpConfig } from './config';

export const createAmqpClient = async (config: AmqpConfig): Promise<AmqpClient> => {
    const channel = await (await amqp.connect({ username: config.amqpUser, password: config.amqpPassword, hostname: config.amqpConnectionString }))
        .createChannel();
    return new AmqpClient(channel);
}

export class AmqpClient {
    constructor(private readonly channel: Channel) {
    }

    async publish(exchange: string, routingKey: string, message: object): Promise<void> {
        const buffer = Buffer.from(JSON.stringify(message));
        this.channel.publish(exchange, routingKey, buffer);
    }

    async consume(
        queue: string,
        handler: (message: amqp.Message | null) => Promise<void>,
    ): Promise<void> {
        await this.channel.consume(queue, async (message) => {
            try {
                await handler(message);
                if (message) {
                    this.channel.ack(message);
                }
            } catch (error) {
                if (message) {
                    this.channel.nack(message, false, true);
                }
            }
        });
    }

    async assertQueue(queue: string, options?: amqp.Options.AssertQueue): Promise<void> {
        await this.channel.assertQueue(queue, options);
    }

    async assertExchange(exchange: string): Promise<void> {
        await this.channel.assertExchange(exchange, "topic", { durable: true });
    }

    async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
        await this.channel.bindQueue(queue, exchange, routingKey);
    }

    async stop(): Promise<void> {
        await this.channel.close();
    }
}