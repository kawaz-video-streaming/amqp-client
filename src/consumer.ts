import amqp, { Channel } from 'amqplib';
import { AmqpRetriableError } from './errors';

export class Consumer {
    constructor(
        private readonly queue: string,
        private readonly exchange: string,
        private readonly topic: string,
        private readonly handler: (message: amqp.Message | null) => Promise<void>,
    ) { }

    async start(channel: Channel): Promise<void> {
        await this.createAndBindQueue(channel, this.queue, this.exchange, this.topic);
        await channel.consume(this.queue, async (message) => {
            if (!message) {
                return;
            }
            try {
                await this.handler(message);
                channel.ack(message);
            } catch (error) {
                if (error instanceof AmqpRetriableError) {
                    channel.nack(message, false, this.shouldRequeue(message, error.retryLimit));
                } else {
                    channel.nack(message, false, false);
                }
            }
        });
    }

    private shouldRequeue(message: amqp.Message, retryLimit: number): boolean {
        return this.getDeliveryCount(message) < retryLimit;
    }

    private getDeliveryCount(message: amqp.Message): number {
        const deliveryCount = message.properties.headers?.['x-delivery-count'];
        if (typeof deliveryCount === 'number') {
            return deliveryCount;
        } else if (typeof deliveryCount === 'string') {
            const parsedValue = Number(deliveryCount);
            if (!Number.isNaN(parsedValue)) {
                return parsedValue;
            }
        }
        return 0;
    }
    private async createAndBindQueue(channel: Channel, queue: string, exchange: string, topic: string): Promise<void> {
        await this.assertQueue(channel, queue);
        await this.assertExchange(channel, exchange);
        await this.bindQueue(channel, queue, exchange, topic);
    }

    private async assertQueue(channel: Channel, queue: string): Promise<void> {
        await channel.assertQueue(queue, { durable: true, arguments: { 'x-queue-type': 'quorum' } });
    }

    private async assertExchange(channel: Channel, exchange: string): Promise<void> {
        await channel.assertExchange(exchange, "topic", { durable: true });
    }

    private async bindQueue(channel: Channel, queue: string, exchange: string, topic: string): Promise<void> {
        await channel.bindQueue(queue, exchange, topic);
    }
}
