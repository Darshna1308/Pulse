import { notFound } from '../lib/errors.js';
import { AlertModel } from '../models/alert.model.js';
import { ApiEventModel } from '../models/apiEvent.model.js';
import { ApiKeyModel } from '../models/apiKey.model.js';
import { ProjectModel, publicProject, type ProjectDoc } from '../models/project.model.js';

export async function listProjects(userId: string) {
  const projects = await ProjectModel.find({ ownerId: userId }).sort({ isDemo: 1, createdAt: 1 });
  const ids = projects.map((p) => p._id);
  const [events, alerts] = await Promise.all([
    ApiEventModel.aggregate<{ _id: unknown; count: number; last: Date }>([
      { $match: { projectId: { $in: ids } } },
      { $group: { _id: '$projectId', count: { $sum: 1 }, last: { $max: '$timestamp' } } },
    ]),
    AlertModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { projectId: { $in: ids }, status: { $in: ['open', 'investigating'] } } },
      { $group: { _id: '$projectId', count: { $sum: 1 } } },
    ]),
  ]);
  const ev = new Map(events.map((e) => [String(e._id), e]));
  const al = new Map(alerts.map((a) => [String(a._id), a.count]));
  return projects.map((p) => ({
    ...publicProject(p),
    stats: {
      events: ev.get(String(p._id))?.count ?? 0,
      lastEventAt: ev.get(String(p._id))?.last ?? null,
      unresolvedAlerts: al.get(String(p._id)) ?? 0,
    },
  }));
}

export async function createProject(
  userId: string,
  input: { name: string; description?: string; environment?: 'production' | 'staging' | 'development' },
) {
  const project = await ProjectModel.create({ ownerId: userId, ...input });
  return publicProject(project);
}

export async function updateProject(project: ProjectDoc, input: Partial<{ name: string; description: string; environment: string }>) {
  Object.assign(project, input);
  await project.save();
  return publicProject(project);
}

/** Delete a project and everything scoped to it. */
export async function deleteProject(project: ProjectDoc) {
  const id = project._id;
  await Promise.all([
    ApiEventModel.deleteMany({ projectId: id }),
    AlertModel.deleteMany({ projectId: id }),
    ApiKeyModel.deleteMany({ projectId: id }),
  ]);
  const res = await ProjectModel.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw notFound('Project');
}
