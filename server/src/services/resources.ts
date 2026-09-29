import { v4 as uuidv4 } from 'uuid';
import { Resource, Classroom, ClassroomMember, Profile, User } from '../models/index.js';

export interface ResourceRecord {
  id: string;
  classroom_id: string;
  created_by: string;
  author_name: string;
  title: string;
  kind: 'pdf' | 'ppt' | 'doc' | 'image' | 'video' | 'link' | 'code' | 'text' | 'file';
  url: string;
  content: string;
  storage_path: string;
  description: string;
  session_id?: string | null;
  status: 'draft' | 'published';
  is_published: boolean;
  downloads_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateResourceInput {
  title: string;
  kind?: 'pdf' | 'ppt' | 'doc' | 'image' | 'video' | 'link' | 'code' | 'text' | 'file';
  url?: string;
  content?: string;
  description?: string;
  sessionId?: string | null;
  status?: 'draft' | 'published';
}

async function verifyClassroomAccess(classroomId: string, userId: string, userRole: string) {
  if (userRole === 'admin') return { isTeacher: true, isMember: true };

  const classroom = await Classroom.findById(classroomId).lean();
  if (!classroom) {
    const err: any = new Error('Classroom not found');
    err.statusCode = 404;
    throw err;
  }

  if (classroom.teacherId === userId) return { isTeacher: true, isMember: true, classroom };

  const member = await ClassroomMember.findOne({ classroomId, userId }).lean();
  if (!member) {
    const err: any = new Error('Access denied: You are not enrolled in this classroom');
    err.statusCode = 403;
    throw err;
  }

  return { isTeacher: member.role === 'teacher', isMember: true, classroom };
}

export async function listResources(
  classroomId: string,
  userId?: string,
  userRole?: string
): Promise<ResourceRecord[]> {
  const filter: any = { classroomId };

  if (userId && userRole) {
    const access = await verifyClassroomAccess(classroomId, userId, userRole);
    if (!access.isTeacher) {
      filter.isPublished = true;
    }
  }

  const docs = await Resource.find(filter).sort({ createdAt: -1 }).lean();
  return docs.map((r: any) => ({
    id: r._id,
    classroom_id: r.classroomId,
    created_by: r.createdBy,
    author_name: r.authorName || 'Instructor',
    title: r.title,
    kind: r.kind || 'pdf',
    url: r.url || '',
    content: r.content || '',
    storage_path: r.storagePath || '',
    description: r.description || '',
    session_id: r.sessionId || null,
    status: r.status || (r.isPublished ? 'published' : 'draft'),
    is_published: r.isPublished ?? true,
    downloads_count: r.downloadsCount || 0,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
  }));
}

export async function createResource(
  classroomId: string,
  userId: string,
  userRole: string,
  input: CreateResourceInput
): Promise<ResourceRecord> {
  const access = await verifyClassroomAccess(classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can upload learning resources');
    err.statusCode = 403;
    throw err;
  }

  const profile = await Profile.findById(userId).lean();
  const user = await User.findById(userId).lean();
  const authorName = profile?.fullName || user?.name || 'Instructor';

  const resourceId = uuidv4();
  const status = input.status || 'published';
  const isPublished = status === 'published';

  const doc = await Resource.create({
    _id: resourceId,
    classroomId,
    createdBy: userId,
    authorName,
    title: input.title.trim(),
    kind: input.kind || 'pdf',
    url: (input.url || '').trim(),
    content: input.content || '',
    description: (input.description || '').trim(),
    sessionId: input.sessionId || null,
    status,
    isPublished,
    downloadsCount: 0,
  });

  return {
    id: doc._id,
    classroom_id: doc.classroomId,
    created_by: doc.createdBy,
    author_name: doc.authorName,
    title: doc.title,
    kind: doc.kind,
    url: doc.url,
    content: doc.content,
    storage_path: doc.storagePath,
    description: doc.description,
    session_id: doc.sessionId,
    status: doc.status,
    is_published: doc.isPublished,
    downloads_count: doc.downloadsCount,
    created_at: doc.createdAt?.toISOString(),
    updated_at: doc.updatedAt?.toISOString(),
  };
}

export async function updateResourceStatus(
  resourceId: string,
  userId: string,
  userRole: string,
  status: 'draft' | 'published'
) {
  const resource = await Resource.findById(resourceId);
  if (!resource) {
    const err: any = new Error('Resource not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(resource.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can update resource status');
    err.statusCode = 403;
    throw err;
  }

  resource.status = status;
  resource.isPublished = status === 'published';
  await resource.save();

  return resource.toJSON();
}

export async function deleteResource(resourceId: string, userId: string, userRole: string) {
  const resource = await Resource.findById(resourceId);
  if (!resource) {
    const err: any = new Error('Resource not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(resource.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can delete resources');
    err.statusCode = 403;
    throw err;
  }

  await Resource.findByIdAndDelete(resourceId);
  return { success: true, resourceId };
}
