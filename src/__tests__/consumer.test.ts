import { Consumer } from '../consumer';
import { AmqpFatalError, AmqpRetriableError } from '../errors';
import { createConsumerBinding } from '../binding';

describe('Consumer', () => {
    interface TestPayload {
        id: string;
    }

    const binding = createConsumerBinding('orders.queue', 'orders.exchange', 'orders.created');

    function createMessage(payload: object = { id: '1' }, deliveryCount?: number | string): any {
        return {
            properties: {
                headers: deliveryCount === undefined ? {} : { 'x-delivery-count': deliveryCount },
            },
            content: Buffer.from(JSON.stringify(payload)),
        };
    }

    function createChannel() {
        return {
            assertQueue: jest.fn().mockResolvedValue(undefined),
            assertExchange: jest.fn().mockResolvedValue(undefined),
            bindQueue: jest.fn().mockResolvedValue(undefined),
            consume: jest.fn(),
            ack: jest.fn(),
            nack: jest.fn(),
        };
    }

    function isTestPayload(payload: object): payload is TestPayload {
        return typeof (payload as TestPayload).id === 'string';
    }

    function createConsumer(
        handleMessage: (payload: TestPayload) => Promise<void>,
        validateMessage: (payload: object) => payload is TestPayload = isTestPayload,
    ) {
        return new Consumer<TestPayload, typeof binding>('test-consumer', binding)
            .on('validateMessage', validateMessage)
            .on('handleMessage', handleMessage);
    }

    it('establishes binding and starts consuming from queue', async () => {
        const handleMessage = jest.fn().mockResolvedValue(undefined);
        const consumer = createConsumer(handleMessage);
        const channel = createChannel();
        channel.consume.mockResolvedValue({ consumerTag: 'tag' });

        await consumer.start(channel as any, 'test-service');

        expect(channel.assertQueue).toHaveBeenCalledWith('orders.queue', {
            durable: true,
            arguments: { 'x-queue-type': 'quorum' },
        });
        expect(channel.assertExchange).toHaveBeenCalledWith('orders.exchange', 'topic', { durable: true });
        expect(channel.bindQueue).toHaveBeenCalledWith('orders.queue', 'orders.exchange', 'orders.created');
        expect(channel.consume).toHaveBeenCalledWith('orders.queue', expect.any(Function));
    });

    it('ignores null message', async () => {
        const handleMessage = jest.fn().mockResolvedValue(undefined);
        const consumer = createConsumer(handleMessage);
        const channel = createChannel();

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(null);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(handleMessage).not.toHaveBeenCalled();
        expect(channel.ack).not.toHaveBeenCalled();
        expect(channel.nack).not.toHaveBeenCalled();
    });

    it('nacks without requeue when payload validation fails', async () => {
        const handleMessage = jest.fn().mockResolvedValue(undefined);
        const validateMock = jest.fn((_p: object) => false);
        const validateMessage = (p: object): p is TestPayload => validateMock(p);
        const consumer = createConsumer(handleMessage, validateMessage);
        const channel = createChannel();
        const message = createMessage({ invalid: true });

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(validateMock).toHaveBeenCalledWith({ invalid: true });
        expect(handleMessage).not.toHaveBeenCalled();
        expect(channel.ack).not.toHaveBeenCalled();
        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('nacks without requeue when no validateMessage handler is registered', async () => {
        const handleMessage = jest.fn().mockResolvedValue(undefined);
        const consumer = new Consumer<TestPayload, typeof binding>('test-consumer', binding)
            .on('handleMessage', handleMessage);
        const channel = createChannel();
        const message = createMessage({ id: '1' });

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(handleMessage).not.toHaveBeenCalled();
        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('nacks without requeue when no handleMessage handler is registered', async () => {
        const consumer = new Consumer<TestPayload, typeof binding>('test-consumer', binding)
            .on('validateMessage', isTestPayload);
        const channel = createChannel();
        const message = createMessage({ id: '1' });

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('acknowledges message when payload is valid and handler succeeds', async () => {
        const handleMessage = jest.fn().mockResolvedValue(undefined);
        const consumer = createConsumer(handleMessage);
        const channel = createChannel();
        const message = createMessage({ id: '123' });

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(handleMessage).toHaveBeenCalledWith({ id: '123' });
        expect(channel.ack).toHaveBeenCalledWith(message);
        expect(channel.nack).not.toHaveBeenCalled();
    });

    it('calls handleSuccess handler after successful processing', async () => {
        const handleMessage = jest.fn().mockResolvedValue(undefined);
        const handleSuccess = jest.fn().mockResolvedValue(undefined);
        const consumer = createConsumer(handleMessage)
            .on('handleSuccess', handleSuccess);
        const channel = createChannel();
        const message = createMessage({ id: '42' });

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(handleSuccess).toHaveBeenCalledWith({ id: '42' });
        expect(channel.ack).toHaveBeenCalledWith(message);
    });

    it('requeues retriable error when delivery count is below retry limit', async () => {
        const payload = { id: '1' };
        const handleMessage = jest.fn().mockRejectedValue(
            new AmqpRetriableError(payload, 'retry', undefined, 3),
        );
        const consumer = createConsumer(handleMessage);
        const channel = createChannel();
        const message = createMessage(payload, 1);

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    });

    it('does not requeue retriable error after retry limit', async () => {
        const payload = { id: '1' };
        const handleMessage = jest.fn().mockRejectedValue(
            new AmqpRetriableError(payload, 'retry', undefined, 2),
        );
        const consumer = createConsumer(handleMessage);
        const channel = createChannel();
        const message = createMessage(payload, '2');

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('calls handleRetriableError handler on retriable errors', async () => {
        const payload = { id: '1' };
        const retriableError = new AmqpRetriableError(payload, 'retry', undefined, 3);
        const handleMessage = jest.fn().mockRejectedValue(retriableError);
        const handleRetriableError = jest.fn().mockResolvedValue(undefined);
        const consumer = createConsumer(handleMessage)
            .on('handleRetriableError', handleRetriableError);
        const channel = createChannel();
        const message = createMessage(payload, 1);

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(handleRetriableError).toHaveBeenCalledWith(retriableError, payload);
        expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    });

    it('calls handleFatalError handler on fatal errors', async () => {
        const payload = { id: '1' };
        const fatalError = new AmqpFatalError(payload, 'fatal');
        const handleMessage = jest.fn().mockRejectedValue(fatalError);
        const handleFatalError = jest.fn().mockResolvedValue(undefined);
        const consumer = createConsumer(handleMessage)
            .on('handleFatalError', handleFatalError);
        const channel = createChannel();
        const message = createMessage(payload);

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(handleFatalError).toHaveBeenCalledWith(fatalError, payload);
        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('nacks without requeue for non-retriable errors', async () => {
        const handleMessage = jest.fn().mockRejectedValue(new Error('bad-message'));
        const consumer = createConsumer(handleMessage);
        const channel = createChannel();
        const message = createMessage();

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any, 'test-service');

        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });
});
