import amqp, { Channel, Connection } from 'amqplib';
import pino from 'pino';

interface AMQPClientConfig {
    url: string;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
}

export class AMQPClient {
    private connection: Connection | null = null;
    private channel: Channel | null = null;
    private logger: pino.Logger;
    private config: AMQPClientConfig;
    private reconnectAttempts = 0;
    private maxReconnectAttempts: number;
    private reconnectInterval: number;

    constructor(config: AMQPClientConfig) {
        this.logger = pino();
        this.config = config;
        this.reconnectInterval = config.reconnectInterval || 5000;
        this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    }

    /**
     * Connect to AMQP server
     */
    async connect(): Promise<void> {
        try {
            this.connection = await amqp.connect(this.config.url);
            this.channel = await this.connection.createChannel();
            this.reconnectAttempts = 0;
            this.logger.info('Connected to AMQP server');

            this.connection.on('error', (err) => this.handleConnectionError(err));
            this.connection.on('close', () => this.handleConnectionClose());
        } catch (error) {
            this.logger.error({ error }, 'Failed to connect to AMQP server');
            throw error;
        }
    }

    /**
     * Publish a message to an exchange
     */
    async publish(exchange: string, routingKey: string, message: object): Promise<void> {
        if (!this.channel) {
            throw new Error('AMQP channel not initialized');
        }

        try {
            const buffer = Buffer.from(JSON.stringify(message));
            this.channel.publish(exchange, routingKey, buffer);
            this.logger.debug({ exchange, routingKey }, 'Message published');
        } catch (error) {
            this.logger.error({ exchange, routingKey, error }, 'Failed to publish message');
            throw error;
        }
    }

    /**
     * Consume messages from a queue
     */
    async consume(
        queue: string,
        handler: (message: amqp.Message | null) => Promise<void>,
    ): Promise<void> {
        if (!this.channel) {
            throw new Error('AMQP channel not initialized');
        }

        try {
            await this.channel.consume(queue, async (message) => {
                try {
                    await handler(message);
                    if (message) {
                        this.channel!.ack(message);
                    }
                } catch (error) {
                    this.logger.error({ queue, error }, 'Error handling consumed message');
                    if (message) {
                        this.channel!.nack(message, false, true);
                    }
                }
            });

            this.logger.info({ queue }, 'Started consuming messages');
        } catch (error) {
            this.logger.error({ queue, error }, 'Failed to consume messages');
            throw error;
        }
    }

    /**
     * Assert a queue
     */
    async assertQueue(queue: string, options?: amqp.Options.AssertQueue): Promise<void> {
        if (!this.channel) {
            throw new Error('AMQP channel not initialized');
        }

        try {
            await this.channel.assertQueue(queue, options);
            this.logger.debug({ queue }, 'Queue asserted');
        } catch (error) {
            this.logger.error({ queue, error }, 'Failed to assert queue');
            throw error;
        }
    }

    /**
     * Assert an exchange
     */
    async assertExchange(exchange: string, type: string, options?: amqp.Options.AssertExchange): Promise<void> {
        if (!this.channel) {
            throw new Error('AMQP channel not initialized');
        }

        try {
            await this.channel.assertExchange(exchange, type, options);
            this.logger.debug({ exchange, type }, 'Exchange asserted');
        } catch (error) {
            this.logger.error({ exchange, type, error }, 'Failed to assert exchange');
            throw error;
        }
    }

    /**
     * Close the connection
     */
    async close(): Promise<void> {
        try {
            if (this.channel) {
                await this.channel.close();
            }
            if (this.connection) {
                await this.connection.close();
            }
            this.logger.info('AMQP connection closed');
        } catch (error) {
            this.logger.error({ error }, 'Error closing AMQP connection');
            throw error;
        }
    }

    private handleConnectionError(error: Error): void {
        this.logger.error({ error }, 'AMQP connection error');
    }

    private handleConnectionClose(): void {
        this.logger.warn('AMQP connection closed unexpectedly, attempting to reconnect...');
        this.attemptReconnect();
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        setTimeout(() => {
            this.logger.info({ attempt: this.reconnectAttempts }, 'Attempting to reconnect to AMQP');
            this.connect().catch((error) => {
                this.logger.error({ error }, 'Reconnection failed');
            });
        }, this.reconnectInterval);
    }
}

export default AMQPClient;
