import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IMessage {
  _id: string;
  classroomId?: string;
  workspaceId?: string;
  sessionId?: string;
  userId: string;
  name: string;
  role: string;
  body: string;
  type?: 'text' | 'code' | 'system';
  replyTo?: {
    id: string;
    name: string;
    text: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    _id: { type: String, default: () => uuidv4() },
    classroomId: { type: String, index: true },
    workspaceId: { type: String, index: true },
    sessionId: { type: String },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, default: 'student' },
    body: { type: String, required: true, trim: true },
    type: { type: String, enum: ['text', 'code', 'system'], default: 'text' },
    replyTo: {
      id: { type: String },
      name: { type: String },
      text: { type: String },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: any) => {
        ret.id = ret._id;
        ret.classroom_id = ret.classroomId;
        ret.workspace_id = ret.workspaceId;
        ret.user_id = ret.userId;
        ret.sender_id = ret.userId;
        ret.sender_name = ret.name;
        ret.sender_role = ret.role;
        ret.text = ret.body;
        ret.content = ret.body;
        ret.reply_to = ret.replyTo;
        ret.created_at = ret.createdAt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

MessageSchema.index({ classroomId: 1, createdAt: 1 });
MessageSchema.index({ workspaceId: 1, createdAt: 1 });
MessageSchema.index({ userId: 1, createdAt: 1 });

export const Message =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema, 'messages');

