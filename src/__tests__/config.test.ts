import { ZodError } from 'zod';
import { createAmqpConfig } from '../config';

const getZodError = () => {
    try {
        createAmqpConfig();
        throw new Error('Expected action to throw ZodError');
    } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        return error as ZodError;
    }
};

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

        const error = getZodError();

        expect(error.issues).toHaveLength(1);
        expect(error.issues[0]).toEqual(
            expect.objectContaining({ path: ['AMQP_CONNECTION_STRING'], code: 'invalid_type', expected: 'string', message: 'Invalid input: expected string, received undefined' })
        );
    });

    it('throws validation error when scheme is invalid', () => {
        process.env.AMQP_CONNECTION_STRING = 'http://localhost:5672';

        const error = getZodError();

        expect(error.issues).toHaveLength(1);
        expect(error.issues[0]).toEqual(
            expect.objectContaining({ path: ['AMQP_CONNECTION_STRING'], code: 'invalid_format', format: 'url', note: "Invalid protocol", message: 'Invalid URL' })
        );
    });
});
