import amqp from 'amqplib';
import { AmqpClient } from '../amqpClient';
import { AmqpConnectionError, AmqpPublisherError, AmqpUninitializedError } from '../errors';

jest.mock('amqplib', () => ({
    __esModule: true,
    default: {
        connect: jest.fn(),
    },
}));

describe('AmqpClient', () => {
    const baseConfig = {
        amqpConnectionString: 'amqp://guest:guest@localhost:5672',
    };

    function createChannel(isPublished: boolean = true) {
        return {
            publish: jest.fn().mockReturnValue(isPublished),
            close: jest.fn().mockResolvedValue(undefined),
        };
    }

    function createConnection(channel: ReturnType<typeof createChannel>) {
        return {
            createChannel: jest.fn().mockResolvedValue(channel),
            close: jest.fn().mockResolvedValue(undefined),
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('starts client and starts all registered consumers', async () => {
        const firstConsumerStart = jest.fn().mockResolvedValue(undefined);
        const secondConsumerStart = jest.fn().mockResolvedValue(undefined);
        const firstConsumer = { start: firstConsumerStart } as any;
        const secondConsumer = { start: secondConsumerStart } as any;

        const channel = createChannel();
        const connection = createConnection(channel);
        (amqp.connect as unknown as jest.Mock).mockResolvedValue(connection);

        const client = new AmqpClient(baseConfig, [firstConsumer, secondConsumer]);
        await client.start();

        expect(amqp.connect).toHaveBeenCalledWith('amqp://guest:guest@localhost:5672');
        expect(connection.createChannel).toHaveBeenCalledTimes(1);
        expect(firstConsumerStart).toHaveBeenCalledWith(channel);
        expect(secondConsumerStart).toHaveBeenCalledWith(channel);
    });

    it('throws AmqpConnectionError when connect fails', async () => {
        (amqp.connect as unknown as jest.Mock).mockRejectedValue(new Error('boom'));
        const client = new AmqpClient(baseConfig, []);

        await expect(client.start()).rejects.toBeInstanceOf(AmqpConnectionError);
    });

    it('throws AmqpUninitializedError when publishing before start', () => {
        const client = new AmqpClient(baseConfig, []);

        expect(() => client.publish('ex', 'topic', { x: 1 })).toThrow(AmqpUninitializedError);
    });

    it('publishes serialized payload when initialized', async () => {
        const channel = createChannel(true);
        const connection = createConnection(channel);
        (amqp.connect as unknown as jest.Mock).mockResolvedValue(connection);

        const client = new AmqpClient(baseConfig, []);
        await client.start();

        const payload = { orderId: '1', total: 42 };
        client.publish('orders.exchange', 'orders.created', payload);

        expect(channel.publish).toHaveBeenCalledWith(
            'orders.exchange',
            'orders.created',
            Buffer.from(JSON.stringify(payload)),
        );
    });

    it('throws AmqpPublisherError when publish returns false', async () => {
        const channel = createChannel(false);
        const connection = createConnection(channel);
        (amqp.connect as unknown as jest.Mock).mockResolvedValue(connection);

        const client = new AmqpClient(baseConfig, []);
        await client.start();

        expect(() => client.publish('ex', 'rk', { ok: true })).toThrow(AmqpPublisherError);
    });

    it('stops by closing channel and connection', async () => {
        const channel = createChannel();
        const connection = createConnection(channel);
        (amqp.connect as unknown as jest.Mock).mockResolvedValue(connection);

        const client = new AmqpClient(baseConfig, []);
        await client.start();
        await client.stop();

        expect(channel.close).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
    });

    it('stopping before start does not throw', async () => {
        const client = new AmqpClient(baseConfig, []);
        await expect(client.stop()).resolves.toBeUndefined();
    });
});
