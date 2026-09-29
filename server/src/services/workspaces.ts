import { v4 as uuidv4 } from 'uuid';
import {
  Workspace,
  WorkspaceFile,
  WorkspacePermission,
  Classroom,
  ClassroomMember,
  Profile,
  User,
} from '../models/index.js';

export interface WorkspaceFileRecord {
  id?: string;
  name: string;
  language: string;
  content: string;
  updated_at?: string;
}

export interface SharedUser {
  userId: string;
  name: string;
  email: string;
  permission: 'owner' | 'editor' | 'viewer';
}

export interface WorkspaceRecord {
  id: string;
  classroom_id?: string | null;
  owner_id: string;
  owner_name?: string;
  owner_email?: string;
  title: string;
  name?: string;
  workspaceType: 'personal' | 'shared' | 'classroom';
  active_controller_id?: string | null;
  active_controller_name?: string | null;
  files: WorkspaceFileRecord[];
  permissions: Record<string, 'owner' | 'editor' | 'viewer'>;
  sharedWith: SharedUser[];
  myPermission: 'owner' | 'editor' | 'viewer';
  isPrivate: boolean;
  created_at: string;
  updated_at: string;
}

const starterPy = `def binary_search(values, target):
    low = 0
    high = len(values) - 1

    while low <= high:
        middle = (low + high) // 2
        guess = values[middle]

        if guess == target:
            return middle
        if guess < target:
            low = middle + 1
        else:
            high = middle - 1

    return -1

values = [2, 5, 8, 12, 16, 23, 38]
print(f"Searching for 16: {binary_search(values, 16)}")
print(f"Searching for 42: {binary_search(values, 42)}")`;

const starterReadme = `# My Personal Workspace

Welcome to your private coding environment in DevChamber!

## Features
- **Persistent Files**: Your files and projects are automatically saved in MongoDB.
- **Python Sandbox**: Run and test Python code directly in the integrated terminal.
- **Real-Time Collaboration**: Click **Share Workspace** to invite classmates to edit or view your code simultaneously.
- **Conflict-Free Synchronization**: Simultaneous edits synchronize in real time.
`;

/**
 * Check if the user is the teacher/instructor of the workspace's classroom or has admin role.
 */
async function isClassroomInstructor(
  classroomId: string | null | undefined,
  userId: string,
  userRole: string,
  ownerId?: string
): Promise<boolean> {
  if (userRole === 'admin') return true;
  if (userRole !== 'teacher') return false;

  if (classroomId) {
    const room = await Classroom.findOne({ _id: classroomId, teacherId: userId }).lean();
    if (room) return true;

    const member = await ClassroomMember.findOne({ classroomId, userId, role: 'teacher' }).lean();
    return Boolean(member);
  }

  // If workspace is personal without classroomId, check if teacher teaches any classroom student is in
  if (ownerId) {
    const studentMemberships = await ClassroomMember.find({ userId: ownerId }).lean();
    const studentClassroomIds = studentMemberships.map((m) => m.classroomId);

    if (studentClassroomIds.length > 0) {
      const teacherClassrooms = await Classroom.find({
        _id: { $in: studentClassroomIds },
        teacherId: userId,
      }).lean();
      if (teacherClassrooms.length > 0) return true;

      const teacherMembership = await ClassroomMember.findOne({
        classroomId: { $in: studentClassroomIds },
        userId,
        role: 'teacher',
      }).lean();
      if (teacherMembership) return true;
    }
  }

  return false;
}

/**
 * Determine permission for a specific user on a workspace.
 */
export async function getWorkspaceUserPermission(
  workspaceId: string,
  userId: string,
  userRole: string
): Promise<{
  allowed: boolean;
  permission: 'owner' | 'editor' | 'viewer' | null;
  isInstructor: boolean;
  workspace: any;
}> {
  const ws = await Workspace.findById(workspaceId).lean();
  if (!ws) {
    const err: any = new Error('Workspace not found');
    err.statusCode = 404;
    throw err;
  }

  const isInstructor = await isClassroomInstructor(ws.classroomId, userId, userRole, ws.ownerId);

  // 1. Workspace Owner has owner permission
  if (ws.ownerId === userId) {
    return { allowed: true, permission: 'owner', isInstructor, workspace: ws };
  }

  // 2. Instructor of the associated classroom has instructor access
  if (isInstructor) {
    return { allowed: true, permission: 'editor', isInstructor: true, workspace: ws };
  }

  // 3. Check explicit permission in WorkspacePermission collection
  const permDoc = await WorkspacePermission.findOne({ workspaceId, userId }).lean();
  if (permDoc) {
    return { allowed: true, permission: permDoc.permission, isInstructor: false, workspace: ws };
  }

  // Otherwise access is strictly denied (student workspace is private)
  return { allowed: false, permission: null, isInstructor: false, workspace: ws };
}

export async function getWorkspaceById(
  workspaceId: string,
  userId: string,
  userRole: string
): Promise<WorkspaceRecord> {
  const check = await getWorkspaceUserPermission(workspaceId, userId, userRole);
  if (!check.allowed || !check.permission) {
    const err: any = new Error(
      'Access denied: This workspace is private. Only the workspace owner and authorized collaborators can access it.'
    );
    err.statusCode = 403;
    throw err;
  }

  const ws = check.workspace;

  // Load files
  const fileDocs = await WorkspaceFile.find({ workspaceId }).sort({ name: 1 }).lean();
  const files: WorkspaceFileRecord[] = fileDocs.map((f: any) => ({
    id: f._id,
    name: f.name,
    language: f.language,
    content: f.content,
    updated_at: f.updatedAt ? new Date(f.updatedAt).toISOString() : new Date().toISOString(),
  }));

  // Load permissions & shared profiles
  const permDocs = await WorkspacePermission.find({ workspaceId }).lean();
  const permUserIds = permDocs.map((p) => p.userId);

  const [profiles, users, ownerProfile, ownerUser] = await Promise.all([
    Profile.find({ _id: { $in: permUserIds } }).lean(),
    User.find({ _id: { $in: permUserIds } }).lean(),
    Profile.findById(ws.ownerId).lean(),
    User.findById(ws.ownerId).lean(),
  ]);

  const profileMap = new Map<string, any>();
  for (const p of profiles) profileMap.set(p._id, p);
  const userMap = new Map<string, any>();
  for (const u of users) userMap.set(u._id, u);

  const permissions: Record<string, 'owner' | 'editor' | 'viewer'> = { [ws.ownerId]: 'owner' };
  const sharedWith: SharedUser[] = [];

  for (const p of permDocs) {
    permissions[p.userId] = p.permission;
    if (p.userId !== ws.ownerId) {
      const prof = profileMap.get(p.userId);
      const usr = userMap.get(p.userId);
      sharedWith.push({
        userId: p.userId,
        name: prof?.fullName || usr?.name || 'Classmate',
        email: usr?.email || '',
        permission: p.permission,
      });
    }
  }

  // Active controller name
  let activeControllerName = null;
  if (ws.activeControllerId) {
    const ctrlProfile = await Profile.findById(ws.activeControllerId).lean();
    activeControllerName = ctrlProfile?.fullName || 'Instructor';
  }

  const ownerName = ownerProfile?.fullName || ownerUser?.name || 'Student';
  const ownerEmail = ownerUser?.email || '';

  return {
    id: ws._id,
    classroom_id: ws.classroomId || null,
    owner_id: ws.ownerId,
    owner_name: ownerName,
    owner_email: ownerEmail,
    title: ws.title || `${ownerName}'s Workspace`,
    name: ws.name || ws.title || 'My Workspace',
    workspaceType: ws.workspaceType || 'personal',
    active_controller_id: ws.activeControllerId || null,
    active_controller_name: activeControllerName,
    files: files.length > 0 ? files : [{ id: 'f-init', name: 'main.py', language: 'python', content: starterPy }],
    permissions,
    sharedWith,
    myPermission: check.permission,
    isPrivate: sharedWith.length === 0,
    created_at: ws.createdAt ? new Date(ws.createdAt).toISOString() : new Date().toISOString(),
    updated_at: ws.updatedAt ? new Date(ws.updatedAt).toISOString() : new Date().toISOString(),
  };
}

/**
 * Get or automatically create the student's personal workspace.
 */
export async function getOrCreatePersonalWorkspace(
  userId: string,
  userName?: string
): Promise<WorkspaceRecord> {
  let ws = await Workspace.findOne({ ownerId: userId, workspaceType: 'personal' }).lean();

  if (!ws) {
    const workspaceId = `ws-personal-${userId}`;
    const wsTitle = `${userName ? `${userName}'s Workspace` : 'My Workspace'}`;

    ws = (
      await Workspace.create({
        _id: workspaceId,
        ownerId: userId,
        workspaceType: 'personal',
        title: wsTitle,
        name: 'My Workspace',
      })
    ).toObject();

    // Create starter files
    await Promise.all([
      WorkspaceFile.create({
        _id: uuidv4(),
        workspaceId,
        name: 'main.py',
        language: 'python',
        content: starterPy,
      }),
      WorkspaceFile.create({
        _id: uuidv4(),
        workspaceId,
        name: 'README.md',
        language: 'markdown',
        content: starterReadme,
      }),
      WorkspacePermission.create({
        _id: uuidv4(),
        workspaceId,
        userId,
        permission: 'owner',
      }),
    ]);
  }

  return getWorkspaceById(ws._id, userId, 'student');
}

/**
 * Get or create classroom-associated student workspace.
 */
export async function getOrCreateStudentWorkspace(
  classroomId: string,
  userId: string,
  userName?: string
): Promise<WorkspaceRecord> {
  let ws = await Workspace.findOne({ classroomId, ownerId: userId }).lean();

  if (!ws) {
    // Check if personal workspace exists to link or create classroom-specific one
    const workspaceId = uuidv4();
    const wsTitle = `${userName || 'Student'}'s Workspace`;

    ws = (
      await Workspace.create({
        _id: workspaceId,
        classroomId,
        ownerId: userId,
        workspaceType: 'classroom',
        title: wsTitle,
      })
    ).toObject();

    // Create initial main.py file
    await WorkspaceFile.create({
      _id: uuidv4(),
      workspaceId,
      name: 'main.py',
      language: 'python',
      content: starterPy,
    });

    // Create owner permission
    await WorkspacePermission.create({
      _id: uuidv4(),
      workspaceId,
      userId,
      permission: 'owner',
    });
  }

  return getWorkspaceById(ws._id, userId, 'student');
}

/**
 * List all workspaces shared with a given student (where user is editor or viewer, not owner).
 */
export async function listSharedWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
  const sharedPermissions = await WorkspacePermission.find({
    userId,
    permission: { $in: ['editor', 'viewer'] },
  }).lean();

  const sharedWsIds = sharedPermissions.map((p) => p.workspaceId);
  const workspaces = await Workspace.find({
    _id: { $in: sharedWsIds },
    ownerId: { $ne: userId },
  })
    .sort({ updatedAt: -1 })
    .lean();

  const results: WorkspaceRecord[] = [];
  for (const ws of workspaces) {
    try {
      const full = await getWorkspaceById(ws._id, userId, 'student');
      results.push(full);
    } catch {
      // ignore unauthorized if permission was revoked
    }
  }

  return results;
}

export async function listClassroomWorkspaces(
  classroomId: string,
  userId: string,
  userRole: string
): Promise<WorkspaceRecord[]> {
  const isInstructor = await isClassroomInstructor(classroomId, userId, userRole);

  let workspaces: any[] = [];

  if (isInstructor) {
    // Teachers see all workspaces in this classroom
    workspaces = await Workspace.find({ classroomId }).sort({ updatedAt: -1 }).lean();
  } else {
    // Students only see own workspace + shared workspaces
    const sharedPermissions = await WorkspacePermission.find({ userId }).lean();
    const sharedWsIds = sharedPermissions.map((p) => p.workspaceId);

    workspaces = await Workspace.find({
      classroomId,
      $or: [{ ownerId: userId }, { _id: { $in: sharedWsIds } }],
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  const results: WorkspaceRecord[] = [];

  for (const ws of workspaces) {
    const [filesDocs, permDocs, ownerProfile, ownerUser] = await Promise.all([
      WorkspaceFile.find({ workspaceId: ws._id }).sort({ name: 1 }).lean(),
      WorkspacePermission.find({ workspaceId: ws._id }).lean(),
      Profile.findById(ws.ownerId).lean(),
      User.findById(ws.ownerId).lean(),
    ]);

    const files: WorkspaceFileRecord[] = filesDocs.map((f: any) => ({
      id: f._id,
      name: f.name,
      language: f.language,
      content: f.content,
      updated_at: f.updatedAt ? new Date(f.updatedAt).toISOString() : new Date().toISOString(),
    }));

    const permissions: Record<string, 'owner' | 'editor' | 'viewer'> = { [ws.ownerId]: 'owner' };
    const sharedWith: SharedUser[] = [];

    const permUserIds = permDocs.map((p) => p.userId);
    const [profiles, users] = await Promise.all([
      Profile.find({ _id: { $in: permUserIds } }).lean(),
      User.find({ _id: { $in: permUserIds } }).lean(),
    ]);

    const profileMap = new Map<string, any>();
    for (const p of profiles) profileMap.set(p._id, p);
    const userMap = new Map<string, any>();
    for (const u of users) userMap.set(u._id, u);

    for (const p of permDocs) {
      permissions[p.userId] = p.permission;
      if (p.userId !== ws.ownerId) {
        const prof = profileMap.get(p.userId);
        const usr = userMap.get(p.userId);
        sharedWith.push({
          userId: p.userId,
          name: prof?.fullName || usr?.name || 'Student',
          email: usr?.email || '',
          permission: p.permission,
        });
      }
    }

    let myPermission: 'owner' | 'editor' | 'viewer' = 'viewer';
    if (ws.ownerId === userId) {
      myPermission = 'owner';
    } else if (isInstructor) {
      myPermission = 'editor';
    } else if (permissions[userId]) {
      myPermission = permissions[userId];
    }

    const ownerName = ownerProfile?.fullName || ownerUser?.name || ws.title?.replace("'s Workspace", '') || 'Student';

    results.push({
      id: ws._id,
      classroom_id: ws.classroomId,
      owner_id: ws.ownerId,
      owner_name: ownerName,
      owner_email: ownerUser?.email || '',
      title: ws.title || `${ownerName}'s Workspace`,
      workspaceType: ws.workspaceType || 'classroom',
      active_controller_id: ws.activeControllerId || null,
      files,
      permissions,
      sharedWith,
      myPermission,
      isPrivate: sharedWith.length === 0,
      created_at: ws.createdAt ? new Date(ws.createdAt).toISOString() : new Date().toISOString(),
      updated_at: ws.updatedAt ? new Date(ws.updatedAt).toISOString() : new Date().toISOString(),
    });
  }

  return results;
}

export async function listClassroomStudents(
  classroomId: string,
  _requestingUserId: string,
  _requestingUserRole: string
) {
  const members = await ClassroomMember.find({ classroomId, role: 'student' }).lean();
  const userIds = members.map((m) => m.userId);

  const [profiles, users] = await Promise.all([
    Profile.find({ _id: { $in: userIds } }).lean(),
    User.find({ _id: { $in: userIds } }).lean(),
  ]);

  const profileMap = new Map<string, any>();
  for (const p of profiles) profileMap.set(p._id, p);
  const userMap = new Map<string, any>();
  for (const u of users) userMap.set(u._id, u);

  return members.map((m: any) => ({
    userId: m.userId,
    name: profileMap.get(m.userId)?.fullName || userMap.get(m.userId)?.name || 'Student',
    email: userMap.get(m.userId)?.email || '',
    role: m.role,
  }));
}

export async function updateWorkspaceFile(
  workspaceId: string,
  fileName: string,
  content: string,
  userId: string,
  userRole: string
) {
  const check = await getWorkspaceUserPermission(workspaceId, userId, userRole);
  if (!check.allowed || check.permission === 'viewer') {
    const err: any = new Error(
      check.permission === 'viewer'
        ? 'Read-only access: Viewer permission cannot edit files.'
        : 'Access denied: You do not have edit permission for this workspace.'
    );
    err.statusCode = 403;
    throw err;
  }

  const ext = fileName.split('.').pop() || '';
  const language =
    ext === 'py'
      ? 'python'
      : ext === 'md'
      ? 'markdown'
      : ext === 'js'
      ? 'javascript'
      : ext === 'ts'
      ? 'typescript'
      : 'plaintext';

  await WorkspaceFile.findOneAndUpdate(
    { workspaceId, name: fileName },
    {
      language,
      content,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Workspace.findByIdAndUpdate(workspaceId, { updatedAt: new Date() });

  return { success: true, updated_at: new Date().toISOString() };
}

export async function deleteWorkspaceFile(
  workspaceId: string,
  fileName: string,
  userId: string,
  userRole: string
) {
  const check = await getWorkspaceUserPermission(workspaceId, userId, userRole);
  if (!check.allowed || check.permission === 'viewer') {
    const err: any = new Error('Access denied: You cannot delete files in this workspace.');
    err.statusCode = 403;
    throw err;
  }

  await WorkspaceFile.findOneAndDelete({ workspaceId, name: fileName });
  await Workspace.findByIdAndUpdate(workspaceId, { updatedAt: new Date() });

  return { success: true };
}

export async function updateWorkspacePermission(
  workspaceId: string,
  targetUserId: string,
  permission: 'editor' | 'viewer',
  requestingUserId: string,
  requestingUserRole: string
) {
  const check = await getWorkspaceUserPermission(workspaceId, requestingUserId, requestingUserRole);
  if (!check.isInstructor && check.workspace.ownerId !== requestingUserId) {
    const err: any = new Error('Only the classroom instructor or the workspace owner can grant permissions.');
    err.statusCode = 403;
    throw err;
  }

  await WorkspacePermission.findOneAndUpdate(
    { workspaceId, userId: targetUserId },
    { permission, grantedBy: requestingUserId, updatedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Workspace.findByIdAndUpdate(workspaceId, { updatedAt: new Date() });

  return { success: true, workspaceId, targetUserId, permission };
}

export async function revokeWorkspacePermission(
  workspaceId: string,
  targetUserId: string,
  requestingUserId: string,
  requestingUserRole: string
) {
  const check = await getWorkspaceUserPermission(workspaceId, requestingUserId, requestingUserRole);
  if (!check.isInstructor && check.workspace.ownerId !== requestingUserId) {
    const err: any = new Error('Only the classroom instructor or the workspace owner can revoke permissions.');
    err.statusCode = 403;
    throw err;
  }

  await WorkspacePermission.findOneAndDelete({ workspaceId, userId: targetUserId });
  await Workspace.findByIdAndUpdate(workspaceId, { updatedAt: new Date() });

  return { success: true, workspaceId, targetUserId };
}

export async function takeWorkspaceControl(
  workspaceId: string,
  requestingUserId: string,
  requestingUserRole: string,
  release: boolean = false
) {
  const check = await getWorkspaceUserPermission(workspaceId, requestingUserId, requestingUserRole);
  if (!check.isInstructor) {
    const err: any = new Error('Only the classroom instructor can take or release control of a student workspace.');
    err.statusCode = 403;
    throw err;
  }

  const activeControllerId = release ? null : requestingUserId;

  await Workspace.findByIdAndUpdate(workspaceId, {
    activeControllerId,
    updatedAt: new Date(),
  });

  return { success: true, activeControllerId, isControlled: !release };
}

export async function searchStudents(query: string, requestingUserId: string) {
  const cleanQ = (query || '').trim();
  const filter: any = {
    role: 'student',
    _id: { $ne: requestingUserId },
  };

  if (cleanQ) {
    filter.$or = [
      { fullName: { $regex: cleanQ, $options: 'i' } },
      { email: { $regex: cleanQ, $options: 'i' } },
    ];
  }

  const profiles = await Profile.find(filter).limit(20).lean();
  return profiles.map((p: any) => ({
    userId: p._id || p.userId,
    name: p.fullName,
    email: p.email,
    role: p.role,
  }));
}
