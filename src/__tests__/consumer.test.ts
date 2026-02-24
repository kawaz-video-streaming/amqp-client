import { Consumer } from '../consumer';
import { AmqpRetriableError } from '../errors';
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

    function createConsumer(
        validatePayload: (payload: object) => payload is TestPayload,
        handlePayload: (payload: TestPayload) => Promise<void>,
    ) {
        return new Consumer(binding, validatePayload, handlePayload);
    }

    function createValidationHarness(
        implementation: (payload: object) => boolean,
    ): {
        validatePayload: (payload: object) => payload is TestPayload;
        validatePayloadMock: jest.Mock<boolean, [object]>;
    } {
        const validatePayloadMock = jest.fn(implementation);
        const validatePayload = (payload: object): payload is TestPayload => validatePayloadMock(payload);
        return { validatePayload, validatePayloadMock };
    }

    it('establishes binding and starts consuming from queue', async () => {
        const { validatePayload } = createValidationHarness(
            (payload: object) => typeof (payload as TestPayload).id === 'string',
        );
        const handlePayload = jest.fn().mockResolvedValue(undefined);
        const consumer = createConsumer(validatePayload, handlePayload);
        const channel = createChannel();
        channel.consume.mockResolvedValue({ consumerTag: 'tag' });

        await consumer.start(channel as any);

        expect(channel.assertQueue).toHaveBeenCalledWith('orders.queue', {
            durable: true,
            arguments: { 'x-queue-type': 'quorum' },
        });
        expect(channel.assertExchange).toHaveBeenCalledWith('orders.exchange', 'topic', { durable: true });
        expect(channel.bindQueue).toHaveBeenCalledWith('orders.queue', 'orders.exchange', 'orders.created');
        expect(channel.consume).toHaveBeenCalledWith('orders.queue', expect.any(Function));
    });

    it('ignores null message', async () => {
        const { validatePayload, validatePayloadMock } = createValidationHarness(
            (payload: object) => typeof (payload as TestPayload).id === 'string',
        );
        const handlePayload = jest.fn().mockResolvedValue(undefined);
        const consumer = createConsumer(validatePayload, handlePayload);
        const channel = createChannel();

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(null);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any);

        expect(validatePayloadMock).not.toHaveBeenCalled();
        expect(handlePayload).not.toHaveBeenCalled();
        expect(channel.ack).not.toHaveBeenCalled();
        expect(channel.nack).not.toHaveBeenCalled();
    });

    it('nacks without requeue when payload validation fails', async () => {
        const { validatePayload, validatePayloadMock } = createValidationHarness((_payload: object) => false);
        const handlePayload = jest.fn().mockResolvedValue(undefined);
        const consumer = createConsumer(validatePayload, handlePayload);
        const channel = createChannel();
        const message = createMessage({ invalid: true });

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any);

        expect(validatePayloadMock).toHaveBeenCalledWith({ invalid: true });
        expect(handlePayload).not.toHaveBeenCalled();
        expect(channel.ack).not.toHaveBeenCalled();
        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('acknowledges message when payload is valid and handler succeeds', async () => {
        const { validatePayload } = createValidationHarness(
            (payload: object) => typeof (payload as TestPayload).id === 'string',
        );
        const handlePayload = jest.fn().mockResolvedValue(undefined);
        const consumer = createConsumer(validatePayload, handlePayload);
        const channel = createChannel();
        const message = createMessage({ id: '123' });

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any);

        expect(handlePayload).toHaveBeenCalledWith({ id: '123' });
        expect(channel.ack).toHaveBeenCalledWith(message);
        expect(channel.nack).not.toHaveBeenCalled();
    });

    it('requeues retriable error when delivery count is below retry limit', async () => {
        const { validatePayload } = createValidationHarness(
            (payload: object) => typeof (payload as TestPayload).id === 'string',
        );
        const handlePayload = jest.fn().mockRejectedValue(new AmqpRetriableError(new Error('retry'), 3));
        const consumer = createConsumer(validatePayload, handlePayload);
        const channel = createChannel();
        const message = createMessage({ id: '1' }, 1);

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any);

        expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    });

    it('does not requeue retriable error after retry limit', async () => {
        const { validatePayload } = createValidationHarness(
            (payload: object) => typeof (payload as TestPayload).id === 'string',
        );
        const handlePayload = jest.fn().mockRejectedValue(new AmqpRetriableError(new Error('retry'), 2));
        const consumer = createConsumer(validatePayload, handlePayload);
        const channel = createChannel();
        const message = createMessage({ id: '1' }, '2');

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any);

        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('nacks without requeue for non-retriable errors', async () => {
        const { validatePayload } = createValidationHarness(
            (payload: object) => typeof (payload as TestPayload).id === 'string',
        );
        const handlePayload = jest.fn().mockRejectedValue(new Error('bad-message'));
        const consumer = createConsumer(validatePayload, handlePayload);
        const channel = createChannel();
        const message = createMessage();

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any);

        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });
});
