import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface ISubmission {
  _id: string;
  assessmentId: string;
  classroomId: string;
  studentId: string;
  studentName?: string;
  answers: Record<string, any>;
  score: number;
  totalPoints: number;
  percentage: number;
  isPassed: boolean;
  timeTakenSeconds?: number;
  submittedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const SubmissionSchema = new Schema<ISubmission>(
  {
    _id: { type: String, default: () => uuidv4() },
    assessmentId: { type: String, required: true, index: true },
    classroomId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, default: 'Student' },
    answers: { type: Schema.Types.Mixed, default: {} },
    score: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    isPassed: { type: Boolean, default: false },
    timeTakenSeconds: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.assessment_id = ret.assessmentId;
        ret.classroom_id = ret.classroomId;
        ret.student_id = ret.studentId;
        ret.student_name = ret.studentName;
        ret.total_points = ret.totalPoints;
        ret.is_passed = ret.isPassed;
        ret.time_taken_seconds = ret.timeTakenSeconds;
        ret.submitted_at = ret.submittedAt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

SubmissionSchema.index({ assessmentId: 1, studentId: 1 });

export const Submission =
  mongoose.models.Submission || mongoose.model<ISubmission>('Submission', SubmissionSchema, 'submissions');
