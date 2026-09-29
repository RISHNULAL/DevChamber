import { v4 as uuidv4 } from 'uuid';
import { ClassSession, Classroom, ClassroomMember, Profile, User } from '../models/index.js';

export interface CreateSessionInput {
  title: string;
  description?: string;
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  agenda?: string[];
  attachedResourceIds?: string[];
  attachedAssignmentIds?: string[];
  status?: 'draft' | 'scheduled' | 'live' | 'completed' | 'cancelled';
}

async function verifyClassroomAccess(classroomId: string, userId: string, userRole: string) {
  if (userRole === 'admin') return { isTeacher: true, isMember: true };

  const classroom = await Classroom.findById(classroomId).lean();
  if (!classroom) {
    const err: any = new Error('Classroom not found');
    err.statusCode = 404;
    throw err;
  }

  const isOwnerTeacher = classroom.teacherId === userId;
  if (isOwnerTeacher) return { isTeacher: true, isMember: true, classroom };

  const membership = await ClassroomMember.findOne({ classroomId, userId }).lean();
  if (!membership) {
    const err: any = new Error('Access denied: You are not enrolled in this classroom');
    err.statusCode = 403;
    throw err;
  }

  return { isTeacher: membership.role === 'teacher', isMember: true, classroom };
}

export async function listClassroomSessions(classroomId: string, userId: string, userRole: string) {
  const access = await verifyClassroomAccess(classroomId, userId, userRole);

  const filter: any = { classroomId };
  // Students only see non-draft sessions
  if (!access.isTeacher) {
    filter.status = { $in: ['scheduled', 'live', 'completed', 'cancelled'] };
  }

  const sessions = await ClassSession.find(filter).sort({ createdAt: -1 }).lean();
  return sessions.map((s: any) => ({
    id: s._id,
    classroom_id: s.classroomId,
    teacher_id: s.teacherId,
    teacher_name: s.teacherName || 'Instructor',
    title: s.title,
    description: s.description || '',
    scheduled_date: s.scheduledDate || '',
    start_time: s.startTime || '10:00 AM',
    end_time: s.endTime || '11:30 AM',
    agenda: s.agenda || [],
    attached_resource_ids: s.attachedResourceIds || [],
    attached_assignment_ids: s.attachedAssignmentIds || [],
    status: s.status || 'scheduled',
    is_live: s.isLive || s.status === 'live',
    started_at: s.startedAt ? new Date(s.startedAt).toISOString() : null,
    ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
    created_at: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
  }));
}

export async function createClassSession(
  classroomId: string,
  userId: string,
  userRole: string,
  input: CreateSessionInput
) {
  const access = await verifyClassroomAccess(classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can create class sessions');
    err.statusCode = 403;
    throw err;
  }

  const profile = await Profile.findById(userId).lean();
  const user = await User.findById(userId).lean();
  const teacherName = profile?.fullName || user?.name || 'Instructor';

  const status = input.status || 'scheduled';
  const session = await ClassSession.create({
    _id: uuidv4(),
    classroomId,
    teacherId: userId,
    teacherName,
    title: input.title.trim(),
    description: (input.description || '').trim(),
    scheduledDate: input.scheduledDate || new Date().toISOString().split('T')[0],
    startTime: input.startTime || '10:00 AM',
    endTime: input.endTime || '11:30 AM',
    agenda: input.agenda || [],
    attachedResourceIds: input.attachedResourceIds || [],
    attachedAssignmentIds: input.attachedAssignmentIds || [],
    status,
    isLive: status === 'live',
    startedAt: status === 'live' ? new Date() : null,
  });

  return session.toJSON();
}

export async function updateClassSessionStatus(
  sessionId: string,
  userId: string,
  userRole: string,
  status: 'draft' | 'scheduled' | 'live' | 'completed' | 'cancelled'
) {
  const session = await ClassSession.findById(sessionId);
  if (!session) {
    const err: any = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(session.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can update session status');
    err.statusCode = 403;
    throw err;
  }

  session.status = status;
  session.isLive = status === 'live';
  if (status === 'live' && !session.startedAt) {
    session.startedAt = new Date();
  }
  if (status === 'completed' || status === 'cancelled') {
    session.endedAt = new Date();
    session.isLive = false;
  }

  await session.save();
  return session.toJSON();
}

export async function deleteClassSession(sessionId: string, userId: string, userRole: string) {
  const session = await ClassSession.findById(sessionId);
  if (!session) {
    const err: any = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(session.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can delete class sessions');
    err.statusCode = 403;
    throw err;
  }

  await ClassSession.findByIdAndDelete(sessionId);
  return { success: true, sessionId };
}
