import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IWorkspacePermission {
  _id: string;
  workspaceId: string;
  userId: string;
  permission: 'owner' | 'editor' | 'viewer';
  grantedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const WorkspacePermissionSchema = new Schema<IWorkspacePermission>(
  {
    _id: { type: String, default: () => uuidv4() },
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    permission: { type: String, enum: ['owner', 'editor', 'viewer'], default: 'viewer' },
    grantedBy: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.workspace_id = ret.workspaceId;
        ret.user_id = ret.userId;
        ret.granted_by = ret.grantedBy;
        delete ret.__v;
        return ret;
      },
    },
  }
);

WorkspacePermissionSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const WorkspacePermission =
  mongoose.models.WorkspacePermission ||
  mongoose.model<IWorkspacePermission>('WorkspacePermission', WorkspacePermissionSchema, 'workspacePermissions');
