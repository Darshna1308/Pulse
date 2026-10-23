import { randomBytes } from 'node:crypto';

const base = process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.MONGODB_URI = `${base.replace(/\/$/, '')}/pulse_test_${randomBytes(4).toString('hex')}`;
process.env.JWT_ACCESS_SECRET = randomBytes(32).toString('hex');
process.env.API_KEY_PEPPER = randomBytes(32).toString('hex');
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.ML_SERVICE_TOKEN = 'test-internal-token';
process.env.ML_TIMEOUT_MS = '2000';
process.env.ALLOW_DEMO_DATA = 'true';
// Many tests register accounts from the same IP; login and ingestion limits stay at defaults.
process.env.RATE_LIMIT_REGISTER_PER_HOUR = '1000';
