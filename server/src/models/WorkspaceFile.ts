import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IWorkspaceFile {
  _id: string;
  workspaceId: string;
  name: string;
  language: string;
  content: string;
  path?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const WorkspaceFileSchema = new Schema<IWorkspaceFile>(
  {
    _id: { type: String, default: () => uuidv4() },
    workspaceId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    language: { type: String, default: 'plaintext', trim: true },
    content: { type: String, default: '' },
    path: { type: String, default: '/' },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.workspace_id = ret.workspaceId;
        ret.created_at = ret.createdAt;
        ret.updated_at = ret.updatedAt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

WorkspaceFileSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

export const WorkspaceFile =
  mongoose.models.WorkspaceFile ||
  mongoose.model<IWorkspaceFile>('WorkspaceFile', WorkspaceFileSchema, 'workspaceFiles');
