import type { SupabaseClient } from '@supabase/supabase-js';
import { store, type Resource, type Assignment } from './store.js';

export async function listResources(db: SupabaseClient | null, classroomId: string): Promise<Resource[]> {
  if (db) {
    const { data, error } = await db.from('resources').select('*').eq('classroom_id', classroomId);
    if (error) throw new Error(error.message);
    return data || [];
  }
  return store.resources.filter((r) => r.classroom_id === classroomId);
}

export async function createResource(
  db: SupabaseClient | null,
  classroomId: string,
  userId: string,
  input: { title: string; kind?: 'link' | 'file'; url: string; description?: string }
): Promise<Resource> {
  const resource: Resource = {
    id: `res-${Date.now()}`,
    classroom_id: classroomId,
    created_by: userId,
    title: input.title,
    kind: input.kind || 'link',
    url: input.url,
    description: input.description,
    created_at: new Date().toISOString(),
  };

  if (db) {
    const { data, error } = await db.from('resources').insert({ ...input, classroom_id: classroomId, created_by: userId }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  store.resources.push(resource);
  return resource;
}

export async function listAssignments(db: SupabaseClient | null, classroomId: string): Promise<Assignment[]> {
  if (db) {
    const { data, error } = await db.from('assignments').select('*').eq('classroom_id', classroomId);
    if (error) throw new Error(error.message);
    return data || [];
  }
  return store.assignments.filter((a) => a.classroom_id === classroomId);
}

export async function createAssignment(
  db: SupabaseClient | null,
  classroomId: string,
  userId: string,
  input: { title: string; description: string; due_at?: string }
): Promise<Assignment> {
  const assignment: Assignment = {
    id: `asg-${Date.now()}`,
    classroom_id: classroomId,
    created_by: userId,
    title: input.title,
    description: input.description,
    due_at: input.due_at,
    created_at: new Date().toISOString(),
  };

  if (db) {
    const { data, error } = await db.from('assignments').insert({ ...input, classroom_id: classroomId, created_by: userId }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  store.assignments.push(assignment);
  return assignment;
}
