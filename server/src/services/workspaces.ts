import type { SupabaseClient } from '@supabase/supabase-js';
import { store, type Workspace, type WorkspaceFile } from './store.js';

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
print("Searching for 16:", binary_search(values, 16))
print("Searching for 42:", binary_search(values, 42))`;

export async function getOrCreateStudentWorkspace(
  db: SupabaseClient | null,
  classroomId: string,
  userId: string,
  userName?: string
): Promise<Workspace> {
  if (db) {
    let { data: ws } = await db
      .from('workspaces')
      .select('id,classroom_id,owner_id,title,workspace_files(id,name,language,content,updated_at),workspace_permissions(user_id,permission)')
      .eq('classroom_id', classroomId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (!ws) {
      const { data: newWs, error } = await db
        .from('workspaces')
        .insert({
          classroom_id: classroomId,
          owner_id: userId,
          title: `${userName || 'Student'}'s Workspace`,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      // Create default file
      await db.from('workspace_files').insert({
        workspace_id: newWs.id,
        name: 'main.py',
        language: 'python',
        content: starterPy,
      });

      return getOrCreateStudentWorkspace(db, classroomId, userId, userName);
    }

    const files: WorkspaceFile[] = (ws.workspace_files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      language: f.language,
      content: f.content,
      updated_at: f.updated_at,
    }));

    const permissions: Record<string, 'owner' | 'editor' | 'viewer'> = { [userId]: 'owner' };
    for (const p of ws.workspace_permissions || []) {
      permissions[p.user_id] = p.permission;
    }

    return {
      id: ws.id,
      classroom_id: ws.classroom_id,
      owner_id: ws.owner_id,
      owner_name: userName || 'Student',
      title: ws.title,
      files,
      permissions,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // Demo store
  for (const ws of store.workspaces.values()) {
    if (ws.classroom_id === classroomId && ws.owner_id === userId) {
      return ws;
    }
  }

  // Create new workspace in demo store
  const wsId = `ws-${userId}-${Date.now().toString().slice(-4)}`;
  const ownerName = userName || store.profiles.get(userId)?.full_name || 'Student';
  const newWorkspace: Workspace = {
    id: wsId,
    classroom_id: classroomId,
    owner_id: userId,
    owner_name: ownerName,
    title: `${ownerName}'s Workspace`,
    files: [
      { id: `f-${Date.now()}-1`, name: 'main.py', language: 'python', content: starterPy, updated_at: new Date().toISOString() },
      { id: `f-${Date.now()}-2`, name: 'notes.md', language: 'markdown', content: '# My Learning Notes\n- Record algorithmic steps\n- Track edge cases', updated_at: new Date().toISOString() },
    ],
    permissions: {
      [userId]: 'owner',
      'teacher-alex': 'editor',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.workspaces.set(wsId, newWorkspace);
  return newWorkspace;
}

export async function listClassroomWorkspaces(
  db: SupabaseClient | null,
  classroomId: string,
  userId: string,
  userRole: string
): Promise<Workspace[]> {
  if (db) {
    const { data, error } = await db
      .from('workspaces')
      .select('id,classroom_id,owner_id,title,workspace_files(id,name,language,content,updated_at),workspace_permissions(user_id,permission)')
      .eq('classroom_id', classroomId);
    if (error) throw new Error(error.message);

    return (data || []).map((ws: any) => ({
      id: ws.id,
      classroom_id: ws.classroom_id,
      owner_id: ws.owner_id,
      owner_name: ws.title.replace("'s Workspace", ""),
      title: ws.title,
      files: ws.workspace_files || [],
      permissions: (ws.workspace_permissions || []).reduce((acc: any, p: any) => {
        acc[p.user_id] = p.permission;
        return acc;
      }, { [ws.owner_id]: 'owner' }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  }

  // Demo store
  const results: Workspace[] = [];
  for (const ws of store.workspaces.values()) {
    if (ws.classroom_id === classroomId) {
      if (userRole === 'teacher' || ws.owner_id === userId || ws.permissions[userId]) {
        results.push(ws);
      }
    }
  }
  return results;
}

export async function updateWorkspaceFile(
  db: SupabaseClient | null,
  workspaceId: string,
  fileName: string,
  content: string,
  userId: string
) {
  if (db) {
    const { error } = await db
      .from('workspace_files')
      .upsert({ workspace_id: workspaceId, name: fileName, content, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,name' });
    if (error) throw new Error(error.message);
    return { success: true };
  }

  const ws = store.workspaces.get(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const file = ws.files.find((f) => f.name === fileName);
  if (file) {
    file.content = content;
    file.updated_at = new Date().toISOString();
  } else {
    const ext = fileName.split('.').pop();
    const language = ext === 'py' ? 'python' : ext === 'md' ? 'markdown' : ext === 'js' ? 'javascript' : 'plaintext';
    ws.files.push({
      id: `f-${Date.now()}`,
      name: fileName,
      language,
      content,
      updated_at: new Date().toISOString(),
    });
  }
  ws.updated_at = new Date().toISOString();
  return { success: true, workspace: ws };
}

export async function updateWorkspacePermission(
  db: SupabaseClient | null,
  workspaceId: string,
  targetUserId: string,
  permission: 'owner' | 'editor' | 'viewer'
) {
  if (db) {
    const { error } = await db
      .from('workspace_permissions')
      .upsert({ workspace_id: workspaceId, user_id: targetUserId, permission }, { onConflict: 'workspace_id,user_id' });
    if (error) throw new Error(error.message);
    return { success: true };
  }

  const ws = store.workspaces.get(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  ws.permissions[targetUserId] = permission;
  ws.updated_at = new Date().toISOString();
  return { success: true, permissions: ws.permissions };
}

export async function takeWorkspaceControl(
  workspaceId: string,
  teacherId: string,
  release: boolean = false
) {
  const ws = store.workspaces.get(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  if (release) {
    ws.active_controller_id = null;
  } else {
    ws.active_controller_id = teacherId;
    ws.permissions[teacherId] = 'editor';
  }
  ws.updated_at = new Date().toISOString();
  return { success: true, activeControllerId: ws.active_controller_id };
}
