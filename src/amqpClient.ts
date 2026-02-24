import amqp, { Channel, ChannelModel } from 'amqplib';
import { AmqpConfig } from './config';
import { AmqpConnectionError, AmqpPublisherError, AmqpUninitializedError } from './errors';
import { isNil, isNotNil } from 'ramda';
import { Consumer } from './consumer';

export class AmqpClient {
    connection: ChannelModel | undefined;
    channel: Channel | undefined;
    constructor(private readonly config: AmqpConfig, private readonly consumers: Consumer<any, any>[]) {
    }

    async start(): Promise<void> {
        try {
            const connection = await amqp.connect(this.config.amqpConnectionString);
            this.connection = connection;
            this.channel = await connection.createChannel().then(async (channel) => {
                await Promise.all(this.consumers.map((consumer) => consumer.start(channel)));
                return channel;
            });
        } catch (error) {
            throw new AmqpConnectionError((error as Error).message, { amqpConnectionString: this.config.amqpConnectionString });
        }
    }

    publish<T>(exchange: string, topic: string, message: T): void {
        if (isNil(this.channel)) {
            throw new AmqpUninitializedError();
        }
        const messageData = Buffer.from(JSON.stringify(message));
        const isPublished = this.channel.publish(exchange, topic, messageData);
        if (!isPublished) {
            throw new AmqpPublisherError({ exchange, topic, message });
        }
    }

    async stop(): Promise<void> {
        if (isNotNil(this.channel)) {
            await this.channel.close();
        }
        if (isNotNil(this.connection)) {
            await this.connection.close();
        }
    }
}