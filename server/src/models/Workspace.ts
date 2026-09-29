import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IWorkspace {
  _id: string;
  classroomId?: string | null;
  ownerId: string;
  title: string;
  name?: string;
  workspaceType?: 'personal' | 'shared' | 'classroom';
  activeControllerId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    _id: { type: String, default: () => uuidv4() },
    classroomId: { type: String, required: false, index: true, default: null },
    ownerId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, default: 'My Workspace' },
    name: { type: String, trim: true },
    workspaceType: {
      type: String,
      enum: ['personal', 'shared', 'classroom'],
      default: 'personal',
      index: true,
    },
    activeControllerId: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.classroom_id = ret.classroomId;
        ret.owner_id = ret.ownerId;
        ret.workspace_type = ret.workspaceType;
        ret.active_controller_id = ret.activeControllerId;
        delete ret.__v;
        return ret;
      },
    },
  }
);

WorkspaceSchema.index({ ownerId: 1, workspaceType: 1 });
WorkspaceSchema.index({ classroomId: 1, ownerId: 1 });

export const Workspace =
  mongoose.models.Workspace || mongoose.model<IWorkspace>('Workspace', WorkspaceSchema, 'workspaces');
