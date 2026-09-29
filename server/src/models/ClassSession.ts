import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IClassSession {
  _id: string;
  classroomId: string;
  teacherId: string;
  teacherName?: string;
  title: string;
  description: string;
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  agenda: string[];
  attachedResourceIds: string[];
  attachedAssignmentIds: string[];
  status: 'draft' | 'scheduled' | 'live' | 'completed' | 'cancelled';
  isLive: boolean;
  startedAt?: Date | null;
  endedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const ClassSessionSchema = new Schema<IClassSession>(
  {
    _id: { type: String, default: () => uuidv4() },
    classroomId: { type: String, required: true, index: true },
    teacherId: { type: String, required: true },
    teacherName: { type: String, default: 'Instructor' },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    scheduledDate: { type: String, default: '' },
    startTime: { type: String, default: '10:00 AM' },
    endTime: { type: String, default: '11:30 AM' },
    agenda: { type: [String], default: [] },
    attachedResourceIds: { type: [String], default: [] },
    attachedAssignmentIds: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'live', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    isLive: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.classroom_id = ret.classroomId;
        ret.teacher_id = ret.teacherId;
        ret.teacher_name = ret.teacherName;
        ret.scheduled_date = ret.scheduledDate;
        ret.start_time = ret.startTime;
        ret.end_time = ret.endTime;
        ret.attached_resource_ids = ret.attachedResourceIds;
        ret.attached_assignment_ids = ret.attachedAssignmentIds;
        ret.is_live = ret.isLive;
        ret.started_at = ret.startedAt;
        ret.ended_at = ret.endedAt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

ClassSessionSchema.index({ classroomId: 1, status: 1 });

export const ClassSession =
  mongoose.models.ClassSession ||
  mongoose.model<IClassSession>('ClassSession', ClassSessionSchema, 'classSessions');
