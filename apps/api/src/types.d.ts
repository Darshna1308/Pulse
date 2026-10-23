import type { ApiKeyDoc } from './models/apiKey.model.js';
import type { ProjectDoc } from './models/project.model.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: { userId: string; sessionId: string };
      project?: ProjectDoc;
      apiKey?: ApiKeyDoc;
    }
  }
}

export {};
