import { ConsumerBinding } from "./types";

export const createConsumerBinding =
    (queue: string, exchange: string, topic: string): ConsumerBinding => ({
        queue,
        exchange,
        topic,
    });