import amqp, { Channel } from 'amqplib';
import pino, { Logger } from 'pino';
import { isNil, isNotNil } from 'ramda';
import { AmqpFatalError, AmqpRetriableError, InvalidPayloadFormatError, MissingPayloadHandlerError } from './errors';

interface ConsumerBinding {
    queue: string;
    exchange: string;
    topic: string;
}

interface ConsumerEvents<Payload extends object> {
    validateMessage: (payload: object) => payload is Payload;
    handleMessage: (payload: Payload) => Promise<void>;
    handleRetriableError: (error: AmqpRetriableError<Payload>, payload: Payload) => Promise<void>;
    handleFatalError: (error: AmqpFatalError, payload: any) => Promise<void>;
    handleSuccess: (payload: Payload) => Promise<void>;
}

export class Consumer<Payload extends object, Binding extends ConsumerBinding> {
    private handlers: Partial<ConsumerEvents<Payload>> = {};

    constructor(
        private readonly consumerName: string,
        private readonly binding: Binding
    ) { }

    async start(channel: Channel, serviceName: string): Promise<void> {
        const logger = pino({ name: serviceName });
        await this.establishConsumerBinding(channel);
        await channel.consume(this.binding.queue, async (message) => {
            if (isNil(message)) {
                return;
            }
            await this.handleMessage(channel, logger, message);
        });
    }

    on<E extends keyof ConsumerEvents<Payload>>(event: E, handler: ConsumerEvents<Payload>[E]): this {
        this.handlers[event] = handler;
        return this;
    }

    private validateAndParse(payload: object): Payload {
        if (isNil(this.handlers.validateMessage) || !this.handlers.validateMessage(payload)) {
            throw new InvalidPayloadFormatError(payload);
        }
        return payload;
    }

    private handlePayload(payload: Payload): Promise<void> {
        if (isNil(this.handlers.handleMessage)) {
            throw new MissingPayloadHandlerError(payload);
        }
        return this.handlers.handleMessage(payload);
    }

    private async handleSuccess(payload: Payload): Promise<void> {
        if (isNotNil(this.handlers.handleSuccess)) {
            await this.handlers.handleSuccess(payload);
        }
    }

    private async handleRetriableError(
        channel: Channel,
        logger: Logger,
        message: amqp.Message,
        error: AmqpRetriableError<Payload>,
        payload: Payload,
        messageInfo: object,
        startTime: number
    ): Promise<void> {
        if (isNotNil(this.handlers.handleRetriableError)) {
            await this.handlers.handleRetriableError(error, payload);
        }
        const retryCount = this.getDeliveryCount(message);
        const shouldRequeue = retryCount < error.retryLimit;
        logger.error({ ...messageInfo, type: 'retriable', durationMs: Date.now() - startTime, retryLimit: error.retryLimit, retryCount, error: error.message },
            `Error handling message, ${shouldRequeue ? 'will retry' : 'retry limit reached, will not retry'}`);
        channel.nack(message, false, shouldRequeue);
    }

    private async handleFatalError(
        channel: Channel,
        logger: Logger,
        message: amqp.Message,
        error: AmqpFatalError,
        payload: any,
        messageInfo: object,
        startTime: number
    ): Promise<void> {
        if (isNotNil(this.handlers.handleFatalError)) {
            await this.handlers.handleFatalError(error, payload);
        }
        logger.error({ ...messageInfo, type: 'fatal', durationMs: Date.now() - startTime, error: error.message }, 'Error handling message, will not retry');
        channel.nack(message, false, false);
    }

    private async handleError(
        channel: Channel,
        logger: Logger,
        message: amqp.Message,
        payload: object,
        error: Error,
        messageInfo: object,
        startTime: number
    ): Promise<void> {
        if (error instanceof AmqpRetriableError) {
            await this.handleRetriableError(channel, logger, message, error, payload as Payload, messageInfo, startTime);
        } else {
            const fatalError = error instanceof AmqpFatalError ? error : new AmqpFatalError(payload, error.message, error);
            await this.handleFatalError(channel, logger, message, fatalError, payload, messageInfo, startTime);
        }
    }

    private async handleMessage(channel: Channel, logger: Logger, message: amqp.Message): Promise<void> {
        const startTime = Date.now();
        const messageInfo = { request: 'amqp', consumer: this.consumerName };
        const rawPayload: object = JSON.parse(message.content.toString());
        try {
            const payload = this.validateAndParse(rawPayload);
            logger.info(messageInfo, 'started handling message');
            await this.handlePayload(payload);
            await this.handleSuccess(payload);
            logger.info({ ...messageInfo, payload, durationMs: Date.now() - startTime }, 'finished handling message');
            channel.ack(message);
        } catch (error) {
            await this.handleError(channel, logger, message, rawPayload, error as Error, messageInfo, startTime);
        }
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
