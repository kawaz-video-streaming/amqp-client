import { AmqpConfig } from "./config";
import { AmqpPublishArgs } from "./types";

export class AmqpError extends Error {
    constructor(message: string, args?: Object) {
        super(`amqp error: ${message}, ${args ? JSON.stringify(args) : ''}`);
    }
}

export class AmqpUninitializedError extends AmqpError {
    constructor() {
        super("AMQP client is not initialized");
    }
}

export class AmqpConnectionError extends AmqpError {
    constructor(errorMessage: string, args: AmqpConfig) {
        super(`Failed to connect to AMQP server: ${errorMessage}`, args);
    }
}


export class AmqpPublisherError<T> extends AmqpError {
    constructor(...args: AmqpPublishArgs<T>) {
        super("Failed to publish message", args);
    }
}

export class AmqpConsumerError extends AmqpError {
    constructor(error: Error) {
        super("Failed to consume message", { error });
    }
}

export class AmqpRetriableError extends AmqpConsumerError {
    constructor(error: Error, public readonly retryLimit: number = 0) {
        super(error);
    }
}

export class AmqpFatalError extends AmqpConsumerError {
    constructor(error: Error) {
        super(error);
    }
}