import ioClient from 'socket.io-client';
import { connectDatabase } from '../config/database.js';
import { User, Workspace, WorkspaceFile, WorkspacePermission } from '../models/index.js';
import { loginUser } from '../services/auth.js';
import {
  getOrCreatePersonalWorkspace,
  getWorkspaceById,
  updateWorkspaceFile,
  updateWorkspacePermission,
  revokeWorkspacePermission,
  listSharedWorkspaces,
} from '../services/workspaces.js';

async function main() {
  console.log('=== DEVCHAMBER PERSONAL WORKSPACE & REAL-TIME COLLABORATION VERIFICATION ===\n');
  await connectDatabase();

  // 1. Authenticate Student A and Student B and Teacher
  console.log('1. Authenticating test users...');
  const studentAAuth = await loginUser({ email: 'student@school.edu', password: 'password123' });
  const studentBAuth = await loginUser({ email: 'maya@school.edu', password: 'password123' });
  const teacherAuth = await loginUser({ email: 'teacher@school.edu', password: 'password123' });

  const studentA = studentAAuth.user;
  const studentB = studentBAuth.user;
  const teacher = teacherAuth.user;
  console.log(`   Student A: ${studentA.full_name} (${studentA.id})`);
  console.log(`   Student B: ${studentB.full_name} (${studentB.id})`);
  console.log(`   Teacher:   ${teacher.full_name} (${teacher.id})\n`);

  // 2. Personal Workspace Verification for Student A
  console.log('2. Verifying Student A Personal Workspace...');
  const wsA = await getOrCreatePersonalWorkspace(studentA.id, studentA.full_name);
  console.log(`   Workspace Title: "${wsA.title}", Type: "${wsA.workspaceType}", Owner: "${wsA.owner_name}"`);
  console.log(`   Files (${wsA.files.length}): ${wsA.files.map((f) => f.name).join(', ')}`);
  if (wsA.owner_id !== studentA.id) {
    throw new Error('Student A is not the owner of personal workspace');
  }
  console.log('   Personal Workspace Ownership: PASS\n');

  // 3. File Creation and MongoDB Persistence in Student A Workspace
  console.log('3. Creating & Updating Files in Personal Workspace...');
  const testFileName = 'bubble_sort.py';
  const testCode = 'def bubble_sort(arr):\n    return sorted(arr)\n\nprint(bubble_sort([5, 2, 9, 1]))';
  await updateWorkspaceFile(wsA.id, testFileName, testCode, studentA.id, studentA.role);

  const updatedWsA = await getWorkspaceById(wsA.id, studentA.id, studentA.role);
  const createdFile = updatedWsA.files.find((f) => f.name === testFileName);
  if (!createdFile || createdFile.content !== testCode) {
    throw new Error('File was not saved properly in MongoDB');
  }
  console.log(`   File "${testFileName}" successfully saved to MongoDB.`);
  console.log('   File Persistence in MongoDB: PASS\n');

  // 4. Privacy & Authorization Check (Student B cannot access Student A workspace by default)
  console.log('4. Testing Privacy & Backend Security (Unauthorized Access Protection)...');
  await WorkspacePermission.deleteMany({ workspaceId: wsA.id, userId: studentB.id });
  let accessBlocked = false;
  try {
    await getWorkspaceById(wsA.id, studentB.id, studentB.role);
  } catch (err: any) {
    if (err.statusCode === 403 || err.message.includes('Access denied')) {
      accessBlocked = true;
      console.log('   Student B access denied (403 Forbidden): PASS');
    }
  }
  if (!accessBlocked) {
    throw new Error('Security failure: Student B accessed Student A private workspace without permission!');
  }

  // Teacher CAN access student workspace
  const teacherView = await getWorkspaceById(wsA.id, teacher.id, teacher.role);
  console.log(`   Teacher authorized access to student workspace: PASS (Files: ${teacherView.files.length})\n`);

  // 5. Sharing Workspace: Student A invites Student B as Editor
  console.log('5. Sharing Workspace: Student A invites Student B as Editor...');
  await updateWorkspacePermission(wsA.id, studentB.id, 'editor', studentA.id, studentA.role);
  
  const sharedWsForB = await getWorkspaceById(wsA.id, studentB.id, studentB.role);
  console.log(`   Student B permission on Student A workspace: "${sharedWsForB.myPermission}"`);
  if (sharedWsForB.myPermission !== 'editor') {
    throw new Error('Student B was not granted editor permission');
  }

  const listForB = await listSharedWorkspaces(studentB.id);
  const foundInShared = listForB.some((w) => w.id === wsA.id);
  console.log(`   Workspace appears in Student B "Shared With Me": ${foundInShared}`);
  if (!foundInShared) {
    throw new Error('Shared workspace did not appear in listSharedWorkspaces');
  }
  console.log('   Workspace Sharing & Permission Model: PASS\n');

  // 6. Real-Time Socket.IO Collaboration (Same File Editing & Cursor Sync)
  console.log('6. Connecting Sockets for Real-Time Same-File Collaboration...');
  const socketUrl = 'http://localhost:3001';

  const socketA = ioClient(socketUrl, {
    auth: { token: studentAAuth.token, userId: studentA.id, name: studentA.full_name, role: studentA.role },
    transports: ['websocket'],
  });

  const socketB = ioClient(socketUrl, {
    auth: { token: studentBAuth.token, userId: studentB.id, name: studentB.full_name, role: studentB.role },
    transports: ['websocket'],
  });

  await new Promise<void>((resolve) => {
    let count = 0;
    const checkDone = () => {
      count++;
      if (count === 2) resolve();
    };
    socketA.on('connect', checkDone);
    socketB.on('connect', checkDone);
  });

  // Join workspace room and wait for presence confirmation
  await Promise.all([
    new Promise<void>((resolve) => {
      socketA.once('workspace:presence', () => resolve());
      socketA.emit('workspace:join', { workspaceId: wsA.id, classroomId: 'class-ds-s5-cse-000000000001' });
    }),
    new Promise<void>((resolve) => {
      socketB.once('workspace:presence', () => resolve());
      socketB.emit('workspace:join', { workspaceId: wsA.id, classroomId: 'class-ds-s5-cse-000000000001' });
    }),
  ]);

  // Give brief tick for room joining
  await new Promise((r) => setTimeout(r, 100));

  // Test Real-Time Code Change broadcast
  console.log('   Testing bidirectional real-time code edit broadcast...');
  const collaborativeEditPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket edit broadcast timeout')), 4000);
    socketB.on('workspace:edit', (payload: any) => {
      if (payload.fileName === 'main.py' && payload.content.includes('Collaborative Code')) {
        console.log(`   Student B received real-time edit from ${payload.userName}`);
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  socketA.emit('workspace:edit', {
    workspaceId: wsA.id,
    fileName: 'main.py',
    content: '# Collaborative Code Streamed in Real-Time\nprint("Hello from Jordan and Maya")',
  });

  await collaborativeEditPromise;
  console.log('   Real-time same-file edit synchronization: PASS');

  // Test Cursor Presence broadcast
  console.log('   Testing collaborative cursor tracking...');
  const cursorPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Cursor sync timeout')), 4000);
    socketA.on('workspace:cursor', (payload: any) => {
      if (payload.userId === studentB.id && payload.cursor.lineNumber === 14) {
        console.log(`   Student A received cursor position from ${payload.userName} at line 14`);
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  socketB.emit('workspace:cursor', {
    workspaceId: wsA.id,
    cursor: { lineNumber: 14, column: 5 },
  });

  await cursorPromise;
  console.log('   Collaborator cursor & presence sync: PASS');

  // Test File Tree Sync
  console.log('   Testing real-time file tree synchronization...');
  const fileSyncPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('File sync timeout')), 4000);
    socketB.on('workspace:file-sync', (payload: any) => {
      if (payload.fileName === 'utils.py' && payload.action === 'created') {
        console.log(`   Student B received file-sync event: "${payload.fileName}" created`);
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  socketA.emit('workspace:file-sync', {
    workspaceId: wsA.id,
    fileName: 'utils.py',
    action: 'created',
  });

  await fileSyncPromise;
  console.log('   Real-time file tree sync: PASS\n');

  // 7. Revoke Access & Immediate Disconnect
  console.log('7. Testing Access Revocation...');
  await revokeWorkspacePermission(wsA.id, studentB.id, studentA.id, studentA.role);

  let revokedBlocked = false;
  try {
    await getWorkspaceById(wsA.id, studentB.id, studentB.role);
  } catch (err: any) {
    if (err.statusCode === 403) {
      revokedBlocked = true;
      console.log('   Student B access immediately revoked on backend (403): PASS');
    }
  }
  if (!revokedBlocked) {
    throw new Error('Revocation failed: Student B still has access after revocation');
  }

  socketA.disconnect();
  socketB.disconnect();

  console.log('\n=== ALL WORKSPACE & REAL-TIME COLLABORATION TESTS PASSED SUCCESSFULLY ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
