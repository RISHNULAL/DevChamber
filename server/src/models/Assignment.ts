import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IAssignment {
  _id: string;
  classroomId: string;
  createdBy: string;
  authorName?: string;
  title: string;
  description: string;
  instructions: string;
  dueAt?: Date | null;
  maxMarks: number;
  starterCode?: string;
  starterFiles: Array<{ name: string; content: string; language: string }>;
  attachedResourceIds: string[];
  status: 'draft' | 'published' | 'closed';
  isPublished: boolean;
  submissionsCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const AssignmentSchema = new Schema<IAssignment>(
  {
    _id: { type: String, default: () => uuidv4() },
    classroomId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    authorName: { type: String, default: 'Instructor' },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    instructions: { type: String, default: '', trim: true },
    dueAt: { type: Date, default: null },
    maxMarks: { type: Number, default: 20 },
    starterCode: { type: String, default: '' },
    starterFiles: {
      type: [
        {
          name: { type: String, required: true },
          content: { type: String, default: '' },
          language: { type: String, default: 'python' },
        },
      ],
      default: [],
    },
    attachedResourceIds: { type: [String], default: [] },
    status: { type: String, enum: ['draft', 'published', 'closed'], default: 'published' },
    isPublished: { type: Boolean, default: true },
    submissionsCount: { type: Number, default: 0 },
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
        ret.due_at = ret.dueAt;
        ret.max_marks = ret.maxMarks;
        ret.starter_code = ret.starterCode;
        ret.starter_files = ret.starterFiles;
        ret.attached_resource_ids = ret.attachedResourceIds;
        ret.is_published = ret.isPublished;
        ret.submissions_count = ret.submissionsCount;
        ret.created_at = ret.createdAt;
        ret.updated_at = ret.updatedAt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

AssignmentSchema.index({ classroomId: 1, isPublished: 1 });

export const Assignment =
  mongoose.models.Assignment ||
  mongoose.model<IAssignment>('Assignment', AssignmentSchema, 'assignments');
