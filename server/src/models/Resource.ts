import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IResource {
  _id: string;
  classroomId: string;
  createdBy: string;
  authorName?: string;
  title: string;
  kind: 'pdf' | 'ppt' | 'doc' | 'image' | 'video' | 'link' | 'code' | 'text' | 'file';
  url?: string;
  content?: string;
  storagePath?: string;
  description?: string;
  sessionId?: string | null;
  status: 'draft' | 'published';
  isPublished: boolean;
  downloadsCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const ResourceSchema = new Schema<IResource>(
  {
    _id: { type: String, default: () => uuidv4() },
    classroomId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    authorName: { type: String, default: 'Instructor' },
    title: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: ['pdf', 'ppt', 'doc', 'image', 'video', 'link', 'code', 'text', 'file'],
      default: 'pdf',
    },
    url: { type: String, default: '', trim: true },
    content: { type: String, default: '' },
    storagePath: { type: String, default: '' },
    description: { type: String, default: '', trim: true },
    sessionId: { type: String, default: null, index: true },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    isPublished: { type: Boolean, default: true },
    downloadsCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.classroom_id = ret.classroomId;
        ret.created_by = ret.createdBy;
        ret.author_name = ret.authorName;
        ret.storage_path = ret.storagePath;
        ret.session_id = ret.sessionId;
        ret.is_published = ret.isPublished;
        ret.downloads_count = ret.downloadsCount;
        ret.created_at = ret.createdAt;
        ret.updated_at = ret.updatedAt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

ResourceSchema.index({ classroomId: 1, isPublished: 1 });

export const Resource =
  mongoose.models.Resource || mongoose.model<IResource>('Resource', ResourceSchema, 'resources');
