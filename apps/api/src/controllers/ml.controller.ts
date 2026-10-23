import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { ModelVersionModel } from '../models/modelVersion.model.js';
import { MlUnavailableError, mlClient } from '../services/ml.client.js';

function unavailable(err: unknown): never {
  if (err instanceof MlUnavailableError) {
    throw new AppError(503, 'ml_unavailable', 'The ML service is unavailable right now.', { reason: err.reason });
  }
  throw err;
}

export async function status(_req: Request, res: Response) {
  try {
    res.json({ data: await mlClient.health() });
  } catch (err) {
    if (err instanceof MlUnavailableError) {
      res.json({ data: { status: 'unreachable', model_loaded: false, model_version: null } });
      return;
    }
    throw err;
  }
}

export async function modelInfo(_req: Request, res: Response) {
  const info = await mlClient.modelInfo().catch(unavailable);
  const versions = await ModelVersionModel.find().sort({ lastSeenAt: -1 }).limit(10).lean();
  res.json({
    data: {
      model: info,
      versionsSeen: versions.map((v) => ({
        version: v.version,
        threshold: v.threshold,
        predictions: v.predictions,
        firstSeenAt: v.firstSeenAt,
        lastSeenAt: v.lastSeenAt,
      })),
    },
  });
}

export async function evaluation(_req: Request, res: Response) {
  res.json({ data: await mlClient.evaluation().catch(unavailable) });
}

export async function runEvaluation(_req: Request, res: Response) {
  res.json({ data: await mlClient.runEvaluation().catch(unavailable) });
}
