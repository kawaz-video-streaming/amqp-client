import { z } from 'zod';

export interface AmqpConfig {
    amqpConnectionString: string;
}


const amqpEnvSchema = z.object({
    AMQP_CONNECTION_STRING: z.url({ protocol: /^amqp(s)?$/ }),
});

export const createAmqpConfig = (): AmqpConfig => {
    const amqpEnv = amqpEnvSchema.parse(process.env);
    return {
        amqpConnectionString: amqpEnv.AMQP_CONNECTION_STRING
    };
}