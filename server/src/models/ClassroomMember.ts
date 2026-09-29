import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IClassroomMember {
  _id: string;
  classroomId: string;
  userId: string;
  role: 'teacher' | 'student';
  joinedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ClassroomMemberSchema = new Schema<IClassroomMember>(
  {
    _id: { type: String, default: () => uuidv4() },
    classroomId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ['teacher', 'student'], default: 'student' },
    joinedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.classroom_id = ret.classroomId;
        ret.user_id = ret.userId;
        delete ret.__v;
        return ret;
      },
    },
  }
);

ClassroomMemberSchema.index({ classroomId: 1, userId: 1 }, { unique: true });

export const ClassroomMember =
  mongoose.models.ClassroomMember ||
  mongoose.model<IClassroomMember>('ClassroomMember', ClassroomMemberSchema, 'classroomMembers');
