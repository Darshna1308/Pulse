import type { Request, Response } from 'express';
import { z } from 'zod';
import { ENVIRONMENTS, publicProject } from '../models/project.model.js';
import { createDemoProject } from '../services/demo.service.js';
import * as projects from '../services/project.service.js';

const createSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    description: z.string().trim().max(500).optional(),
    environment: z.enum(ENVIRONMENTS).optional(),
  })
  .strict();
const updateSchema = createSchema.partial().refine((v) => Object.keys(v).length > 0, 'Provide at least one field');

export async function list(req: Request, res: Response) {
  res.json({ data: await projects.listProjects(req.auth!.userId) });
}

export async function create(req: Request, res: Response) {
  res.status(201).json({ data: await projects.createProject(req.auth!.userId, createSchema.parse(req.body)) });
}

export async function get(req: Request, res: Response) {
  res.json({ data: publicProject(req.project!) });
}

export async function update(req: Request, res: Response) {
  res.json({ data: await projects.updateProject(req.project!, updateSchema.parse(req.body)) });
}

export async function remove(req: Request, res: Response) {
  await projects.deleteProject(req.project!);
  res.status(204).end();
}

export async function createDemo(req: Request, res: Response) {
  res.status(201).json({ data: await createDemoProject(req.auth!.userId) });
}
