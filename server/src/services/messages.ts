import { v4 as uuidv4 } from 'uuid';
import { Message, ClassroomMember, Classroom, Workspace } from '../models/index.js';

export interface ChatMessage {
  id: string;
  classroom_id?: string;
  workspace_id?: string;
  session_id?: string;
  user_id: string;
  sender_id: string;
  name: string;
  sender_name: string;
  role: string;
  sender_role: string;
  text: string;
  content: string;
  type: 'text' | 'code' | 'system';
  reply_to?: {
    id: string;
    name: string;
    text: string;
  };
  created_at: string;
  createdAt?: string;
}

export async function saveMessage(
  classroomId: string,
  userId: string,
  name: string,
  role: string,
  text: string,
  replyTo?: { id: string; name: string; text: string }
): Promise<ChatMessage> {
  const messageId = uuidv4();

  const msg = await Message.create({
    _id: messageId,
    classroomId,
    userId,
    name,
    role,
    body: text,
    type: 'text',
    replyTo,
  });

  return {
    id: msg._id,
    classroom_id: msg.classroomId,
    user_id: msg.userId,
    sender_id: msg.userId,
    name: msg.name,
    sender_name: msg.name,
    role: msg.role,
    sender_role: msg.role,
    text: msg.body,
    content: msg.body,
    type: msg.type || 'text',
    reply_to: msg.replyTo,
    created_at: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
    createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
  };
}

export async function saveWorkspaceMessage(
  workspaceId: string,
  userId: string,
  name: string,
  role: string,
  text: string,
  replyTo?: { id: string; name: string; text: string }
): Promise<ChatMessage> {
  const messageId = uuidv4();

  const msg = await Message.create({
    _id: messageId,
    workspaceId,
    userId,
    name,
    role,
    body: text,
    type: 'text',
    replyTo,
  });

  return {
    id: msg._id,
    workspace_id: msg.workspaceId,
    user_id: msg.userId,
    sender_id: msg.userId,
    name: msg.name,
    sender_name: msg.name,
    role: msg.role,
    sender_role: msg.role,
    text: msg.body,
    content: msg.body,
    type: msg.type || 'text',
    reply_to: msg.replyTo,
    created_at: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
    createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
  };
}

export async function getClassroomMessages(
  classroomId: string,
  limit: number = 50,
  before?: string
): Promise<ChatMessage[]> {
  const query: any = { classroomId };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  return messages.map((m: any) => ({
    id: m._id,
    classroom_id: m.classroomId,
    user_id: m.userId,
    sender_id: m.userId,
    name: m.name || 'User',
    sender_name: m.name || 'User',
    role: m.role || 'student',
    sender_role: m.role || 'student',
    text: m.body,
    content: m.body,
    type: m.type || 'text',
    reply_to: m.replyTo,
    created_at: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
  }));
}

export async function getWorkspaceMessages(
  workspaceId: string,
  limit: number = 50,
  before?: string
): Promise<ChatMessage[]> {
  const query: any = { workspaceId };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  return messages.map((m: any) => ({
    id: m._id,
    workspace_id: m.workspaceId,
    user_id: m.userId,
    sender_id: m.userId,
    name: m.name || 'User',
    sender_name: m.name || 'User',
    role: m.role || 'student',
    sender_role: m.role || 'student',
    text: m.body,
    content: m.body,
    type: m.type || 'text',
    reply_to: m.replyTo,
    created_at: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
  }));
}
