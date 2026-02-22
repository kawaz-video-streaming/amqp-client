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

    it('starts client and starts registered consumers', async () => {
        const consumerStart = jest.fn().mockResolvedValue(undefined);
        const consumer = { start: consumerStart } as any;

        const channel = {
            publish: jest.fn().mockReturnValue(true),
            close: jest.fn().mockResolvedValue(undefined),
        };
        const connection = {
            createChannel: jest.fn().mockResolvedValue(channel),
            close: jest.fn().mockResolvedValue(undefined),
        };

        (amqp.connect as unknown as jest.Mock).mockResolvedValue(connection);

        const client = new AmqpClient(baseConfig, [consumer]);
        await client.start();

        expect(amqp.connect).toHaveBeenCalledWith('amqp://guest:guest@localhost:5672');
        expect(connection.createChannel).toHaveBeenCalledTimes(1);
        expect(consumerStart).toHaveBeenCalledWith(channel);
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

    it('throws AmqpPublisherError when publish returns false', async () => {
        const channel = {
            publish: jest.fn().mockReturnValue(false),
            close: jest.fn().mockResolvedValue(undefined),
        };
        const connection = {
            createChannel: jest.fn().mockResolvedValue(channel),
            close: jest.fn().mockResolvedValue(undefined),
        };
        (amqp.connect as unknown as jest.Mock).mockResolvedValue(connection);

        const client = new AmqpClient(baseConfig, []);
        await client.start();

        expect(() => client.publish('ex', 'rk', { ok: true })).toThrow(AmqpPublisherError);
    });

    it('stops by closing channel and connection', async () => {
        const channel = {
            publish: jest.fn().mockReturnValue(true),
            close: jest.fn().mockResolvedValue(undefined),
        };
        const connection = {
            createChannel: jest.fn().mockResolvedValue(channel),
            close: jest.fn().mockResolvedValue(undefined),
        };
        (amqp.connect as unknown as jest.Mock).mockResolvedValue(connection);

        const client = new AmqpClient(baseConfig, []);
        await client.start();
        await client.stop();

        expect(channel.close).toHaveBeenCalledTimes(1);
        expect(connection.close).toHaveBeenCalledTimes(1);
    });
});
