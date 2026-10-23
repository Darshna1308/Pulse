import type { RequestHandler } from 'express';
import { notFound } from '../lib/errors.js';
import { idParam } from '../lib/http.js';
import { ProjectModel } from '../models/project.model.js';

/**
 * Resolve :projectId and enforce ownership. Projects owned by someone else answer
 * 404, exactly like missing ones, so ids cannot be probed.
 */
export const loadProject: RequestHandler = async (req, _res, next) => {
  const projectId = idParam(req, 'projectId', 'Project');
  const project = await ProjectModel.findOne({ _id: projectId, ownerId: req.auth!.userId });
  if (!project) throw notFound('Project');
  req.project = project;
  next();
};
