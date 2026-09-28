import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { store, type Classroom, type ClassroomMember } from './store.js';

type ClassroomInput = { name: string; subject?: string; description?: string; batch?: string };

function fail(error: unknown): never {
  throw new Error(error instanceof Error ? error.message : 'Database request failed');
}

export async function listClassrooms(db: SupabaseClient | null, userId: string) {
  if (db) {
    const { data, error } = await db
      .from('classrooms')
      .select('id,name,subject,description,batch,join_code,created_at,classroom_members!inner(role)')
      .eq('classroom_members.user_id', userId);
    if (error) fail(error);
    return data;
  }

  // Demo store fallback
  const userClassrooms: (Classroom & { role: 'teacher' | 'student' })[] = [];
  for (const member of store.members) {
    if (member.user_id === userId) {
      const room = store.classrooms.get(member.classroom_id);
      if (room) {
        userClassrooms.push({ ...room, role: member.role });
      }
    }
  }
  return userClassrooms;
}

export async function createClassroom(db: SupabaseClient | null, userId: string, input: ClassroomInput) {
  const joinCode = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();

  if (db) {
    const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', userId).single();
    if (profileError || !profile || !['teacher', 'admin'].includes(profile.role)) {
      throw new Error('Only teachers can create classrooms');
    }

    const { data: room, error } = await db
      .from('classrooms')
      .insert({ ...input, join_code: joinCode, teacher_id: userId })
      .select()
      .single();
    if (error) fail(error);

    const { error: memberError } = await db
      .from('classroom_members')
      .insert({ classroom_id: room.id, user_id: userId, role: 'teacher' });
    if (memberError) fail(memberError);

    return room;
  }

  // Demo store
  const id = `class-${Date.now()}`;
  const room: Classroom = {
    id,
    name: input.name,
    subject: input.subject || 'General Studies',
    description: input.description || '',
    batch: input.batch || 'Batch A',
    join_code: joinCode,
    teacher_id: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_live: false,
  };
  store.classrooms.set(id, room);
  store.members.push({
    classroom_id: id,
    user_id: userId,
    role: 'teacher',
    full_name: store.profiles.get(userId)?.full_name || 'Alex Morgan',
    joined_at: new Date().toISOString(),
  });

  return room;
}

export async function joinClassroom(db: SupabaseClient | null, userId: string, classroomId: string, joinCode: string) {
  if (db) {
    const { data: room, error } = await db.from('classrooms').select('id,join_code,name').eq('id', classroomId).single();
    if (error || !room || room.join_code !== joinCode.toUpperCase()) {
      throw new Error('Classroom or join code was not found');
    }
    const { data, error: joinError } = await db
      .from('classroom_members')
      .upsert({ classroom_id: classroomId, user_id: userId, role: 'student' }, { onConflict: 'classroom_id,user_id' })
      .select()
      .single();
    if (joinError) fail(joinError);
    return data;
  }

  // Demo store
  const room = store.classrooms.get(classroomId);
  if (!room || room.join_code !== joinCode.toUpperCase()) {
    throw new Error('Classroom or join code was not found');
  }

  const existing = store.members.find((m) => m.classroom_id === classroomId && m.user_id === userId);
  if (!existing) {
    store.members.push({
      classroom_id: classroomId,
      user_id: userId,
      role: 'student',
      full_name: store.profiles.get(userId)?.full_name || 'Student',
      joined_at: new Date().toISOString(),
    });
  }
  return { classroom_id: classroomId, user_id: userId, role: 'student', name: room.name };
}

export async function joinClassroomByCode(db: SupabaseClient | null, userId: string, joinCode: string) {
  const cleanCode = joinCode.trim().toUpperCase();

  if (db) {
    const { data: room, error } = await db.from('classrooms').select('id,name,join_code').eq('join_code', cleanCode).single();
    if (error || !room) throw new Error('Classroom code not found. Please check the code and try again.');
    const { error: joinError } = await db
      .from('classroom_members')
      .upsert({ classroom_id: room.id, user_id: userId, role: 'student' }, { onConflict: 'classroom_id,user_id' });
    if (joinError) fail(joinError);
    return { id: room.id, name: room.name, join_code: room.join_code };
  }

  // Demo store search by code
  let matchedRoom: Classroom | null = null;
  for (const r of store.classrooms.values()) {
    if (r.join_code === cleanCode) {
      matchedRoom = r;
      break;
    }
  }

  if (!matchedRoom) {
    throw new Error('Classroom code not found. Please check the code with your teacher.');
  }

  const existing = store.members.find((m) => m.classroom_id === matchedRoom!.id && m.user_id === userId);
  if (!existing) {
    store.members.push({
      classroom_id: matchedRoom.id,
      user_id: userId,
      role: 'student',
      full_name: store.profiles.get(userId)?.full_name || 'Student',
      joined_at: new Date().toISOString(),
    });
  }

  return { id: matchedRoom.id, name: matchedRoom.name, join_code: matchedRoom.join_code };
}

export async function getClassroomDetails(db: SupabaseClient | null, classroomId: string) {
  if (db) {
    const { data: room, error } = await db.from('classrooms').select('*').eq('id', classroomId).single();
    if (error) fail(error);
    const { data: members } = await db.from('classroom_members').select('user_id,role,profiles(full_name)').eq('classroom_id', classroomId);
    return { ...room, members };
  }

  const room = store.classrooms.get(classroomId);
  if (!room) throw new Error('Classroom not found');
  const members = store.members
    .filter((m) => m.classroom_id === classroomId)
    .map((m) => ({
      user_id: m.user_id,
      role: m.role,
      full_name: m.full_name || store.profiles.get(m.user_id)?.full_name || m.user_id,
    }));
  return { ...room, members };
}
