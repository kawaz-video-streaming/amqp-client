import { Consumer } from '../consumer';
import { AmqpRetriableError } from '../errors';

describe('Consumer', () => {
    function createMessage(deliveryCount?: number | string): any {
        return {
            properties: {
                headers: deliveryCount === undefined ? {} : { 'x-delivery-count': deliveryCount },
            },
            content: Buffer.from(JSON.stringify({ id: '1' })),
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

    it('binds queue and acknowledges message on success', async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const consumer = new Consumer('orders.queue', 'orders.exchange', 'orders.created', handler);
        const channel = createChannel();
        const message = createMessage();

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any);

        expect(channel.assertQueue).toHaveBeenCalledWith('orders.queue', {
            durable: true,
            arguments: { 'x-queue-type': 'quorum' },
        });
        expect(channel.assertExchange).toHaveBeenCalledWith('orders.exchange', 'topic', { durable: true });
        expect(channel.bindQueue).toHaveBeenCalledWith('orders.queue', 'orders.exchange', 'orders.created');
        expect(handler).toHaveBeenCalledWith(message);
        expect(channel.ack).toHaveBeenCalledWith(message);
        expect(channel.nack).not.toHaveBeenCalled();
    });

    it('requeues retriable error when delivery count is below retry limit', async () => {
        const handler = jest.fn().mockRejectedValue(new AmqpRetriableError(new Error('retry'), 3));
        const consumer = new Consumer('q', 'ex', 'topic', handler);
        const channel = createChannel();
        const message = createMessage(1);

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any);

        expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    });

    it('does not requeue retriable error after retry limit', async () => {
        const handler = jest.fn().mockRejectedValue(new AmqpRetriableError(new Error('retry'), 2));
        const consumer = new Consumer('q', 'ex', 'topic', handler);
        const channel = createChannel();
        const message = createMessage('2');

        channel.consume.mockImplementation(async (_queue: string, onMessage: (msg: any) => Promise<void>) => {
            await onMessage(message);
            return { consumerTag: 'tag' };
        });

        await consumer.start(channel as any);

        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('nacks without requeue for non-retriable errors', async () => {
        const handler = jest.fn().mockRejectedValue(new Error('bad-message'));
        const consumer = new Consumer('q', 'ex', 'topic', handler);
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
