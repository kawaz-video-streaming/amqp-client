import Joi from 'joi';
import { createAmqpConfig } from '../config';

describe('createAmqpConfig', () => {
    it('returns config when AMQP_CONNECTION_STRING is valid', () => {
        const config = createAmqpConfig({
            AMQP_CONNECTION_STRING: 'amqp://guest:guest@localhost:5672',
        });

        expect(config).toEqual({
            amqpConnectionString: 'amqp://guest:guest@localhost:5672',
        });
    });

    it('accepts amqps scheme', () => {
        const config = createAmqpConfig({
            AMQP_CONNECTION_STRING: 'amqps://rabbitmq.example.com:5671',
        });

        expect(config).toEqual({
            amqpConnectionString: 'amqps://rabbitmq.example.com:5671',
        });
    });

    it('throws validation error when AMQP_CONNECTION_STRING is missing', () => {
        expect(() => createAmqpConfig({})).toThrow(Joi.ValidationError);
    });

    it('throws validation error when scheme is invalid', () => {
        expect(() => createAmqpConfig({
            AMQP_CONNECTION_STRING: 'http://localhost:5672',
        })).toThrow(Joi.ValidationError);
    });
});
