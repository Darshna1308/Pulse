/**
 * Development-only: create a demo account and a demo project filled with simulated
 * traffic scored by the running ML service.
 *
 *   npm run seed:demo            (uses DEMO_EMAIL / DEMO_PASSWORD if set)
 */
import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import { UserModel } from '../models/user.model.js';
import { ProjectModel } from '../models/project.model.js';
import { AlertModel } from '../models/alert.model.js';
import { ApiEventModel } from '../models/apiEvent.model.js';
import { ApiKeyModel } from '../models/apiKey.model.js';
import { hashPassword } from '../services/password.service.js';
import { createDemoProject } from '../services/demo.service.js';

async function main() {
  const config = env();
  if (config.NODE_ENV === 'production') throw new Error('seed:demo is disabled in production');
  await connectDb(config.MONGODB_URI);

  const email = (process.env.DEMO_EMAIL ?? 'demo@pulse.local').toLowerCase();
  const generated = !process.env.DEMO_PASSWORD;
  const password = process.env.DEMO_PASSWORD ?? `Demo-${randomBytes(6).toString('hex')}1`;

  let user = await UserModel.findOne({ email });
  if (user) {
    user.passwordHash = await hashPassword(password);
    await user.save();
  } else {
    user = await UserModel.create({ email, name: 'Demo User', passwordHash: await hashPassword(password) });
  }

  // Replace any previous demo project for this account only.
  const old = await ProjectModel.find({ ownerId: user._id, isDemo: true });
  for (const p of old) {
    await Promise.all([
      ApiEventModel.deleteMany({ projectId: p._id }),
      AlertModel.deleteMany({ projectId: p._id }),
      ApiKeyModel.deleteMany({ projectId: p._id }),
    ]);
    await p.deleteOne();
  }

  const started = Date.now();
  const result = await createDemoProject(String(user._id));
  console.log(`Demo project "${result.project.name}" created in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  events: ${result.events}, anomalies: ${result.anomalies}, alerts: ${result.alertsCreated}, failed: ${result.failed}`);
  console.log(`Sign in with ${email} / ${generated ? password + '  (generated; set DEMO_PASSWORD to choose one)' : '<DEMO_PASSWORD>'}`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
