import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IClassroom {
  _id: string;
  teacherId: string;
  name: string;
  subject: string;
  description: string;
  batch: string;
  joinCode: string;
  isLive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const ClassroomSchema = new Schema<IClassroom>(
  {
    _id: { type: String, default: () => uuidv4() },
    teacherId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    subject: { type: String, default: 'General Studies', trim: true },
    description: { type: String, default: '', trim: true },
    batch: { type: String, default: 'Batch A', trim: true },
    joinCode: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    isLive: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.teacher_id = ret.teacherId;
        ret.join_code = ret.joinCode;
        ret.is_live = ret.isLive;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const Classroom = mongoose.models.Classroom || mongoose.model<IClassroom>('Classroom', ClassroomSchema, 'classrooms');
