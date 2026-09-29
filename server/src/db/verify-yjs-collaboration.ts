import { io as ClientIO } from 'socket.io-client';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User, Profile, Workspace, WorkspaceFile, WorkspacePermission } from '../models/index.js';
import { signupUser, loginUser } from '../services/auth.js';
import {
  getOrCreatePersonalWorkspace,
  updateWorkspacePermission,
} from '../services/workspaces.js';

async function runVerification() {
  console.log('====================================================');
  console.log('🚀 TESTING REAL-TIME YJS COLLABORATIVE CODE EDITING');
  console.log('====================================================\n');

  await connectDatabase();

  const timestamp = Date.now();
  const studentAEmail = `rishnu_collab_${timestamp}@test.com`;
  const studentBEmail = `jordan_collab_${timestamp}@test.com`;

  console.log('1. Provisioning Student A (Rishnu) & Student B (Jordan)...');
  const userA = await signupUser({
    email: studentAEmail,
    password: 'Password123!',
    fullName: 'Rishnu Lal',
    role: 'student',
  });

  const userB = await signupUser({
    email: studentBEmail,
    password: 'Password123!',
    fullName: 'Jordan Lee',
    role: 'student',
  });

  console.log(`✓ Student A ID: ${userA.user.id} (${userA.user.full_name})`);
  console.log(`✓ Student B ID: ${userB.user.id} (${userB.user.full_name})`);

  // 2. Fetch Personal Workspace for Student A
  console.log('\n2. Initializing Student A Personal Workspace...');
  const wsA = await getOrCreatePersonalWorkspace(userA.user.id, userA.user.full_name);
  console.log(`✓ Student A Workspace ID: ${wsA.id} ("${wsA.title}")`);

  // 3. Share Workspace with Student B (Editor)
  console.log('\n3. Student A grants Student B Editor permission...');
  await updateWorkspacePermission(wsA.id, userB.user.id, 'editor', userA.user.id, 'student');
  console.log(`✓ Permission granted: Jordan is now an Editor on ${wsA.title}`);

  // 4. Connect Sockets for both Student A and Student B
  const serverUrl = 'http://localhost:3001';
  console.log(`\n4. Connecting Socket.IO clients to ${serverUrl}...`);

  const socketA = ClientIO(serverUrl, {
    auth: { token: userA.token },
    transports: ['websocket'],
  });

  const socketB = ClientIO(serverUrl, {
    auth: { token: userB.token },
    transports: ['websocket'],
  });

  await new Promise<void>((resolve) => {
    let connectedCount = 0;
    const check = () => {
      connectedCount++;
      if (connectedCount === 2) resolve();
    };
    socketA.on('connect', check);
    socketB.on('connect', check);
  });

  console.log('✓ Both Socket.IO clients connected and authenticated.');

  // Setup Client Yjs documents
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const awarenessA = new awarenessProtocol.Awareness(docA);
  const awarenessB = new awarenessProtocol.Awareness(docB);

  awarenessA.setLocalStateField('user', {
    name: 'Rishnu Lal',
    color: '#3b82f6',
    userId: userA.user.id,
  });

  awarenessB.setLocalStateField('user', {
    name: 'Jordan Lee',
    color: '#10b981',
    userId: userB.user.id,
  });

  const ytextA = docA.getText('monaco');
  const ytextB = docB.getText('monaco');

  // Socket wireup for Doc A
  docA.on('update', (update: Uint8Array, origin: any) => {
    if (origin !== 'socket' && origin !== 'sync') {
      socketA.emit('yjs:update', {
        workspaceId: wsA.id,
        fileName: 'main.py',
        update: Array.from(update),
      });
    }
  });

  awarenessA.on('update', ({ added, updated, removed }: any, origin: any) => {
    if (origin !== 'socket') {
      const changed = added.concat(updated).concat(removed);
      const enc = awarenessProtocol.encodeAwarenessUpdate(awarenessA, changed);
      socketA.emit('yjs:awareness', {
        workspaceId: wsA.id,
        fileName: 'main.py',
        update: Array.from(enc),
      });
    }
  });

  socketA.on('yjs:sync', ({ update }: any) => {
    if (update) Y.applyUpdate(docA, new Uint8Array(update), 'sync');
  });

  socketA.on('yjs:update', ({ update }: any) => {
    if (update) Y.applyUpdate(docA, new Uint8Array(update), 'socket');
  });

  socketA.on('yjs:awareness', ({ update }: any) => {
    if (update) awarenessProtocol.applyAwarenessUpdate(awarenessA, new Uint8Array(update), 'socket');
  });

  // Socket wireup for Doc B
  docB.on('update', (update: Uint8Array, origin: any) => {
    if (origin !== 'socket' && origin !== 'sync') {
      socketB.emit('yjs:update', {
        workspaceId: wsA.id,
        fileName: 'main.py',
        update: Array.from(update),
      });
    }
  });

  awarenessB.on('update', ({ added, updated, removed }: any, origin: any) => {
    if (origin !== 'socket') {
      const changed = added.concat(updated).concat(removed);
      const enc = awarenessProtocol.encodeAwarenessUpdate(awarenessB, changed);
      socketB.emit('yjs:awareness', {
        workspaceId: wsA.id,
        fileName: 'main.py',
        update: Array.from(enc),
      });
    }
  });

  socketB.on('yjs:sync', ({ update }: any) => {
    if (update) Y.applyUpdate(docB, new Uint8Array(update), 'sync');
  });

  socketB.on('yjs:update', ({ update }: any) => {
    if (update) Y.applyUpdate(docB, new Uint8Array(update), 'socket');
  });

  socketB.on('yjs:awareness', ({ update }: any) => {
    if (update) awarenessProtocol.applyAwarenessUpdate(awarenessB, new Uint8Array(update), 'socket');
  });

  // 5. Join Room & Sync Initial Document
  console.log('\n5. Joining collaborative room: workspace:' + wsA.id + ':file:main.py');
  socketA.emit('yjs:join', { workspaceId: wsA.id, fileName: 'main.py' });
  socketB.emit('yjs:join', { workspaceId: wsA.id, fileName: 'main.py' });

  await new Promise((r) => setTimeout(r, 400));
  console.log(`✓ Initial Doc A length: ${ytextA.toString().length} chars`);
  console.log(`✓ Initial Doc B length: ${ytextB.toString().length} chars`);

  // 6. TEST: Real-Time Live Typing Without Save
  console.log('\n6. [TEST 1] Student A types new Python function WITHOUT pressing Save...');
  const newFunctionCode = '\ndef greet_user(name):\n    return f"Hello, {name}!"\n';
  ytextA.insert(ytextA.length, newFunctionCode);

  // Wait 150ms for WebSocket CRDT replication
  await new Promise((r) => setTimeout(r, 200));

  if (!ytextB.toString().includes('def greet_user(name):')) {
    throw new Error('TEST 1 FAILED: Student B did not receive live code changes without save!');
  }
  console.log('✓ PASS: Student B immediately received live code update without Save button!');

  // 7. TEST: Simultaneous Typing & Conflict-Free CRDT Merging
  console.log('\n7. [TEST 2] Simultaneous Typing: Student A and Student B type concurrently...');
  const aAddition = '\n# Rishnu comment at bottom';
  const bAddition = '# Jordan header at top\n';

  // Both insert concurrently
  ytextA.insert(ytextA.length, aAddition);
  ytextB.insert(0, bAddition);

  // Allow CRDT convergence
  await new Promise((r) => setTimeout(r, 400));

  console.log(`Doc A content preview:\n${ytextA.toString().slice(0, 100)}...`);
  console.log(`Doc B content preview:\n${ytextB.toString().slice(0, 100)}...`);

  if (ytextA.toString() !== ytextB.toString()) {
    throw new Error('TEST 2 FAILED: CRDT document states did not converge!');
  }
  if (!ytextA.toString().includes('# Jordan header at top') || !ytextA.toString().includes('# Rishnu comment at bottom')) {
    throw new Error('TEST 2 FAILED: Simultaneous changes were lost!');
  }
  console.log('✓ PASS: Simultaneous typing safely converged conflict-free across both users!');

  // 8. TEST: Remote Awareness & Cursor Tracking
  console.log('\n8. [TEST 3] Real-time Cursor & Selection Awareness...');
  awarenessA.setLocalStateField('cursor', { line: 5, column: 12 });

  await new Promise((r) => setTimeout(r, 200));

  let sawRemoteCursor = false;
  awarenessB.getStates().forEach((state: any) => {
    if (state.user?.name === 'Rishnu Lal' && state.cursor?.line === 5) {
      sawRemoteCursor = true;
    }
  });

  if (!sawRemoteCursor) {
    throw new Error('TEST 3 FAILED: Remote collaborator cursor awareness was not received!');
  }
  console.log('✓ PASS: Student B received Student A cursor position and identity!');

  // 9. TEST: Background MongoDB Persistence & Flush
  console.log('\n9. [TEST 4] MongoDB Document Persistence...');
  await new Promise<void>((resolve, reject) => {
    socketA.emit('yjs:flush', { workspaceId: wsA.id, fileName: 'main.py' }, (res: any) => {
      if (res?.error) reject(new Error(res.error));
      else resolve();
    });
  });

  const savedFile = await WorkspaceFile.findOne({ workspaceId: wsA.id, name: 'main.py' }).lean();
  if (!savedFile || savedFile.content !== ytextA.toString()) {
    throw new Error('TEST 4 FAILED: MongoDB file content does not match active collaborative document!');
  }
  console.log('✓ PASS: MongoDB accurately persisted the latest collaborative document state!');

  // 10. Cleanup
  socketA.disconnect();
  socketB.disconnect();
  await disconnectDatabase();

  console.log('\n====================================================');
  console.log('🎉 ALL YJS REAL-TIME COLLABORATION TESTS PASSED 100%');
  console.log('====================================================\n');
}

runVerification().catch(async (err) => {
  console.error('\n❌ Verification Failed:', err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
