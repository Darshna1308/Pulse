import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const ENVIRONMENTS = ['production', 'staging', 'development'] as const;

const projectSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    environment: { type: String, enum: ENVIRONMENTS, default: 'production' },
    /** Demo projects hold simulated traffic only and are labelled as such in the UI. */
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type Project = InferSchemaType<typeof projectSchema>;
export type ProjectDoc = HydratedDocument<Project>;
export const ProjectModel = model('Project', projectSchema);

export function publicProject(p: ProjectDoc) {
  return {
    id: String(p._id),
    name: p.name,
    description: p.description,
    environment: p.environment,
    isDemo: p.isDemo,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
