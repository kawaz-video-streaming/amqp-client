export interface AmqpConnectionArgs {
    amqpConnectionString: string;
}

export interface AmqpPublishArgs<T> {
    exchange: string;
    topic: string;
    message: T;
}