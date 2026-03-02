import amqp, { Channel } from 'amqplib';
import { AmqpRetriableError } from './errors';
import pino from 'pino';

interface ConsumerBinding {
    queue: string;
    exchange: string;
    topic: string;
}

export class Consumer<Payload extends object, Binding extends ConsumerBinding> {
    constructor(
        private readonly consumerName: string,
        private readonly binding: Binding,
        private readonly validatePayload: (payload: object) => payload is Payload,
        private readonly handlePayload: (payload: Payload) => Promise<void>,
    ) {
    }

    async start(channel: Channel, serviceName: string): Promise<void> {
        const logger = pino({ name: serviceName });
        await this.establishConsumerBinding(channel);
        await channel.consume(this.binding.queue, async (message) => {
            if (!message) {
                return;
            }
            const startTime = Date.now();
            const messageInfo = { request: 'amqp', consumer: this.consumerName };
            try {
                const payload: object = JSON.parse(message.content.toString());
                if (!this.validatePayload(payload)) {
                    throw new Error('Invalid payload format');
                }
                logger.info(messageInfo, `started handling message`);
                await this.handlePayload(payload);
                const duration = Date.now() - startTime;
                logger.info({ ...messageInfo, payload, durationMs: duration }, `finished handling message`);
                channel.ack(message);
            } catch (error) {
                const duration = Date.now() - startTime;
                if (error instanceof AmqpRetriableError) {
                    const { message: errorMessage, retryLimit } = error;
                    const retryCount = this.getDeliveryCount(message);
                    const shouldRequeue = retryCount < retryLimit;
                    logger.error({ ...messageInfo, type: 'retriable', durationMs: duration, retryLimit, retryCount, error: errorMessage }, `Error handling message, ${shouldRequeue ? 'will retry' : 'retry limit reached, will not retry'}`);
                    channel.nack(message, false, shouldRequeue);
                } else {
                    logger.error({ ...messageInfo, type: 'fatal', durationMs: duration, error: (error as Error).message }, 'Error handling message, will not retry');
                    channel.nack(message, false, false);
                }
            }
        });
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
    private async establishConsumerBinding(channel: Channel): Promise<void> {
        await this.assertQueue(channel, this.binding.queue);
        await this.assertExchange(channel, this.binding.exchange);
        await this.bindQueue(channel, this.binding.queue, this.binding.exchange, this.binding.topic);
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
