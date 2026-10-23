import { Schema, model, type InferSchemaType } from 'mongoose';

/** Model versions seen in predictions, so stored scores can be traced to the model that made them. */
const modelVersionSchema = new Schema(
  {
    version: { type: String, required: true, unique: true },
    threshold: Number,
    firstSeenAt: { type: Date, default: () => new Date() },
    lastSeenAt: { type: Date, default: () => new Date() },
    predictions: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type ModelVersion = InferSchemaType<typeof modelVersionSchema>;
export const ModelVersionModel = model('ModelVersion', modelVersionSchema);
