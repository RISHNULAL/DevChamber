import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IAssignmentSubmission {
  _id: string;
  assignmentId: string;
  classroomId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  workspaceId?: string;
  files: Array<{ name: string; content: string; language: string }>;
  status: 'not_started' | 'in_progress' | 'submitted' | 'late' | 'graded' | 'returned';
  marks?: number | null;
  maxMarks: number;
  feedback?: string;
  submittedAt?: Date | null;
  gradedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const AssignmentSubmissionSchema = new Schema<IAssignmentSubmission>(
  {
    _id: { type: String, default: () => uuidv4() },
    assignmentId: { type: String, required: true, index: true },
    classroomId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, default: 'Student' },
    studentEmail: { type: String, default: '' },
    workspaceId: { type: String, default: '' },
    files: {
      type: [
        {
          name: { type: String, required: true },
          content: { type: String, default: '' },
          language: { type: String, default: 'python' },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'submitted', 'late', 'graded', 'returned'],
      default: 'not_started',
    },
    marks: { type: Number, default: null },
    maxMarks: { type: Number, default: 20 },
    feedback: { type: String, default: '' },
    submittedAt: { type: Date, default: null },
    gradedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.assignment_id = ret.assignmentId;
        ret.classroom_id = ret.classroomId;
        ret.student_id = ret.studentId;
        ret.student_name = ret.studentName;
        ret.student_email = ret.studentEmail;
        ret.workspace_id = ret.workspaceId;
        ret.max_marks = ret.maxMarks;
        ret.submitted_at = ret.submittedAt;
        ret.graded_at = ret.gradedAt;
        ret.created_at = ret.createdAt;
        ret.updated_at = ret.updatedAt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

AssignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

export const AssignmentSubmission =
  mongoose.models.AssignmentSubmission ||
  mongoose.model<IAssignmentSubmission>(
    'AssignmentSubmission',
    AssignmentSubmissionSchema,
    'assignmentSubmissions'
  );
