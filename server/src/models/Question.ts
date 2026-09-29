import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IQuestion {
  _id: string;
  assessmentId: string;
  kind: 'mcq' | 'short_answer' | 'coding';
  prompt: string;
  options: string[];
  answerKey?: any;
  points: number;
  position: number;
  explanation?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const QuestionSchema = new Schema<IQuestion>(
  {
    _id: { type: String, default: () => uuidv4() },
    assessmentId: { type: String, required: true, index: true },
    kind: { type: String, enum: ['mcq', 'short_answer', 'coding'], default: 'mcq' },
    prompt: { type: String, required: true, trim: true },
    options: { type: [String], default: [] },
    answerKey: { type: Schema.Types.Mixed },
    points: { type: Number, default: 1 },
    position: { type: Number, default: 0 },
    explanation: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.assessment_id = ret.assessmentId;
        ret.answer_key = ret.answerKey;
        delete ret.__v;
        return ret;
      },
    },
  }
);

QuestionSchema.index({ assessmentId: 1, position: 1 });

export const Question =
  mongoose.models.Question || mongoose.model<IQuestion>('Question', QuestionSchema, 'questions');
