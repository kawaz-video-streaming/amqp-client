export const createConsumerBinding = <
    Queue extends string,
    Exchange extends string,
    Topic extends string,
>(queue: Queue, exchange: Exchange, topic: Topic) => ({
    queue,
    exchange,
    topic,
} as const);