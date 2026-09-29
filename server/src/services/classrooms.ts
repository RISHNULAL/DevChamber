import { randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { Classroom, ClassroomMember, Profile } from '../models/index.js';

export interface ClassroomInput {
  name: string;
  subject?: string;
  description?: string;
  batch?: string;
}

export interface ClassroomRecord {
  id: string;
  teacher_id: string;
  name: string;
  subject: string;
  description: string;
  batch: string;
  join_code: string;
  is_live: boolean;
  role?: 'teacher' | 'student';
  created_at: string;
  updated_at: string;
}

export async function listClassrooms(userId: string) {
  // Find all memberships for this user
  const memberships = await ClassroomMember.find({ userId }).lean();
  const classroomIds = memberships.map((m) => m.classroomId);

  if (classroomIds.length === 0) {
    return [];
  }

  const classrooms = await Classroom.find({ _id: { $in: classroomIds } })
    .sort({ createdAt: -1 })
    .lean();

  const roleMap = new Map<string, 'teacher' | 'student'>();
  for (const m of memberships) {
    roleMap.set(m.classroomId, m.role);
  }

  return classrooms.map((c: any) => ({
    id: c._id,
    teacher_id: c.teacherId,
    name: c.name,
    subject: c.subject || 'General Studies',
    description: c.description || '',
    batch: c.batch || 'Batch A',
    join_code: c.joinCode,
    is_live: Boolean(c.isLive),
    role: roleMap.get(c._id) || 'student',
    created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
    updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
  }));
}

export async function createClassroom(userId: string, input: ClassroomInput) {
  // 1. Verify user is a teacher or admin
  const profile = await Profile.findById(userId).lean();
  if (!profile || !['teacher', 'admin'].includes(profile.role)) {
    throw new Error('Only teachers can create classrooms');
  }

  const classroomId = uuidv4();
  const joinCode = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();

  const classroom = await Classroom.create({
    _id: classroomId,
    teacherId: userId,
    name: input.name,
    subject: input.subject || 'General Studies',
    description: input.description || '',
    batch: input.batch || 'Batch A',
    joinCode,
    isLive: false,
  });

  await ClassroomMember.create({
    _id: uuidv4(),
    classroomId,
    userId,
    role: 'teacher',
  });

  return {
    id: classroom._id,
    teacher_id: classroom.teacherId,
    name: classroom.name,
    subject: classroom.subject,
    description: classroom.description,
    batch: classroom.batch,
    join_code: classroom.joinCode,
    is_live: Boolean(classroom.isLive),
    role: 'teacher',
    created_at: classroom.createdAt?.toISOString(),
    updated_at: classroom.updatedAt?.toISOString(),
  };
}

export async function joinClassroom(userId: string, classroomId: string, joinCode: string) {
  const cleanCode = joinCode.trim().toUpperCase();

  const room = await Classroom.findOne({ _id: classroomId, joinCode: cleanCode });
  if (!room) {
    throw new Error('Classroom or join code was not found');
  }

  await ClassroomMember.findOneAndUpdate(
    { classroomId, userId },
    { role: 'student', joinedAt: new Date() },
    { upsert: true, new: true }
  );

  return {
    classroom_id: classroomId,
    user_id: userId,
    role: 'student',
    name: room.name,
  };
}

export async function joinClassroomByCode(userId: string, joinCode: string) {
  const cleanCode = joinCode.trim().toUpperCase();

  const room = await Classroom.findOne({ joinCode: cleanCode });
  if (!room) {
    throw new Error('Classroom code not found. Please check the code and try again.');
  }

  await ClassroomMember.findOneAndUpdate(
    { classroomId: room._id, userId },
    { role: 'student', joinedAt: new Date() },
    { upsert: true, new: true }
  );

  return {
    id: room._id,
    name: room.name,
    join_code: room.joinCode,
  };
}

export async function getClassroomDetails(classroomId: string) {
  const room = await Classroom.findById(classroomId).lean();
  if (!room) {
    throw new Error('Classroom not found');
  }

  const members = await ClassroomMember.find({ classroomId }).lean();
  const userIds = members.map((m) => m.userId);
  const profiles = await Profile.find({ _id: { $in: userIds } }).lean();

  const profileMap = new Map<string, any>();
  for (const p of profiles) {
    profileMap.set(p._id, p);
  }

  return {
    id: room._id,
    teacher_id: room.teacherId,
    name: room.name,
    subject: room.subject,
    description: room.description,
    batch: room.batch,
    join_code: room.joinCode,
    is_live: Boolean(room.isLive),
    created_at: room.createdAt ? new Date(room.createdAt).toISOString() : new Date().toISOString(),
    updated_at: room.updatedAt ? new Date(room.updatedAt).toISOString() : new Date().toISOString(),
    members: members.map((m: any) => ({
      user_id: m.userId,
      role: m.role,
      full_name: profileMap.get(m.userId)?.fullName || 'Member',
    })),
  };
}
