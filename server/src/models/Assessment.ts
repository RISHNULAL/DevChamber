import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IAssessment {
  _id: string;
  classroomId: string;
  createdBy: string;
  authorName?: string;
  title: string;
  description: string;
  type: 'quiz' | 'mcq' | 'coding' | 'timed';
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  passingScore: number;
  attemptsAllowed: number;
  startTime?: Date | null;
  endTime?: Date | null;
  status: 'draft' | 'published' | 'active' | 'ended';
  isPublished: boolean;
  isResultsReleased: boolean;
  participantsCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const AssessmentSchema = new Schema<IAssessment>(
  {
    _id: { type: String, default: () => uuidv4() },
    classroomId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    authorName: { type: String, default: 'Instructor' },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    type: { type: String, enum: ['quiz', 'mcq', 'coding', 'timed'], default: 'quiz' },
    durationMinutes: { type: Number, default: 20 },
    totalQuestions: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 20 },
    passingScore: { type: Number, default: 10 },
    attemptsAllowed: { type: Number, default: 1 },
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    status: { type: String, enum: ['draft', 'published', 'active', 'ended'], default: 'published' },
    isPublished: { type: Boolean, default: true },
    isResultsReleased: { type: Boolean, default: true },
    participantsCount: { type: Number, default: 0 },
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
        ret.duration_minutes = ret.durationMinutes;
        ret.total_questions = ret.totalQuestions;
        ret.total_marks = ret.totalMarks;
        ret.passing_score = ret.passingScore;
        ret.attempts_allowed = ret.attemptsAllowed;
        ret.start_time = ret.startTime;
        ret.end_time = ret.endTime;
        ret.is_published = ret.isPublished;
        ret.is_results_released = ret.isResultsReleased;
        ret.participants_count = ret.participantsCount;
        ret.created_at = ret.createdAt;
        ret.updated_at = ret.updatedAt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

AssessmentSchema.index({ classroomId: 1, isPublished: 1 });

export const Assessment =
  mongoose.models.Assessment || mongoose.model<IAssessment>('Assessment', AssessmentSchema, 'assessments');
