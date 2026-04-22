import { z } from 'zod';

export interface AmqpConfig {
    amqpConnectionString: string;
    amqpPrefetchCount?: number;
}


const amqpEnvSchema = z.object({
    AMQP_CONNECTION_STRING: z.url({ protocol: /^amqp(s)?$/ }),
    AMQP_PREFETCH_COUNT: z.coerce.number().optional(),

});

export const createAmqpConfig = (): AmqpConfig => {
    const amqpEnv = amqpEnvSchema.parse(process.env);
    return {
        amqpConnectionString: amqpEnv.AMQP_CONNECTION_STRING,
        amqpPrefetchCount: amqpEnv.AMQP_PREFETCH_COUNT
    };
}