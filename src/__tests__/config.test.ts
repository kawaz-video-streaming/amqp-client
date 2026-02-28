import Joi from 'joi';
import { createAmqpConfig } from '../config';

describe('createAmqpConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('returns config when AMQP_CONNECTION_STRING is valid', () => {
        process.env.AMQP_CONNECTION_STRING = 'amqp://guest:guest@localhost:5672';

        const config = createAmqpConfig();

        expect(config).toEqual({
            amqpConnectionString: 'amqp://guest:guest@localhost:5672',
        });
    });

    it('accepts amqps scheme', () => {
        process.env.AMQP_CONNECTION_STRING = 'amqps://rabbitmq.example.com:5671';

        const config = createAmqpConfig();

        expect(config).toEqual({
            amqpConnectionString: 'amqps://rabbitmq.example.com:5671',
        });
    });

    it('throws validation error when AMQP_CONNECTION_STRING is missing', () => {
        delete process.env.AMQP_CONNECTION_STRING;

        expect(() => createAmqpConfig()).toThrow(Joi.ValidationError);
    });

    it('throws validation error when scheme is invalid', () => {
        process.env.AMQP_CONNECTION_STRING = 'http://localhost:5672';

        expect(() => createAmqpConfig()).toThrow(Joi.ValidationError);
    });
});
