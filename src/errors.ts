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


export class AmqpPublisherError<T extends object> extends AmqpError {
    constructor(...args: AmqpPublishArgs<T>) {
        super("Failed to publish message", args);
    }
}

export class AmqpConsumerError<Payload extends object> extends AmqpError {
    constructor(public readonly payload: Payload, errorMessage: string, error?: Error) {
        super(`Failed to consume message: ${errorMessage}`, error ? { cause: JSON.stringify(error) } : undefined);
    }
}

export class AmqpRetriableError<Payload extends object> extends AmqpConsumerError<Payload> {
    constructor(payload: Payload, errorMessage: string, error?: Error, public readonly retryLimit: number = 0) {
        super(payload, errorMessage, error);
    }
}

export class AmqpFatalError extends AmqpConsumerError<any> {
    constructor(payload: any, errorMessage: string, error?: Error) {
        super(payload, errorMessage, error);
    }
}

export class InvalidPayloadFormatError extends AmqpFatalError {
    constructor(payload: any) {
        super(payload, 'Invalid payload format');
    }
}

export class MissingPayloadHandlerError<Payload extends object> extends AmqpFatalError {
    constructor(payload: Payload) {
        super(payload, 'No handler available for the message');
    }
}