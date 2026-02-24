export interface AmqpConnectionArgs {
    amqpConnectionString: string;
}

export interface AmqpPublishArgs<T> {
    exchange: string;
    topic: string;
    message: T;
}

export interface ConsumerBinding {
    queue: string;
    exchange: string;
    topic: string;
}