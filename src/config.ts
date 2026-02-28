import Joi from "joi";

export interface AmqpConfig {
    amqpConnectionString: string;
}

interface AmqpEnv {
    AMQP_CONNECTION_STRING: string;
}

const amqpEnvSchema = Joi.object<AmqpEnv>({
    AMQP_CONNECTION_STRING: Joi.string().uri({ scheme: ['amqp', 'amqps'] }).required(),
}).unknown();

export const createAmqpConfig = (env: NodeJS.ProcessEnv): AmqpConfig => {
    const { error, value } = amqpEnvSchema.validate(env, { abortEarly: false });
    if (error) {
        throw error;
    }
    const amqpEnv = value as AmqpEnv;
    return {
        amqpConnectionString: amqpEnv.AMQP_CONNECTION_STRING
    };
}