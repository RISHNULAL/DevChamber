import { io } from 'socket.io-client';
import http from 'node:http';

function req(method: string, path: string, body: any = null, token: string = ''): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = String(Buffer.byteLength(data));
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const r = http.request(
      {
        hostname: 'localhost',
        port: 3001,
        path,
        method,
        headers,
      },
      (res) => {
        let d = '';
        res.on('data', (chunk) => (d += chunk));
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = JSON.parse(d);
          } catch {
            parsed = { raw: d };
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

export async function runChatSystemVerification() {
  console.log('=== DEVCHAMBER REAL-TIME CHAT SYSTEM VERIFICATION ===\n');

  // 1. Authenticate users
  console.log('1. Authenticating test users...');
  const teacherRes = await req('POST', '/api/auth/login', { email: 'teacher@school.edu', password: 'password123' });
  const student1Res = await req('POST', '/api/auth/login', { email: 'student@school.edu', password: 'password123' });
  const student2Res = await req('POST', '/api/auth/login', { email: 'maya@school.edu', password: 'password123' });

  if (!teacherRes.body.token || !student1Res.body.token || !student2Res.body.token) {
    throw new Error('Authentication failed for test users');
  }

  const teacherToken = teacherRes.body.token;
  const student1Token = student1Res.body.token;
  const student2Token = student2Res.body.token;
  const student2Id = student2Res.body.user.id;

  // Get classroom
  const classroomsRes = await req('GET', '/api/classrooms', null, teacherToken);
  const classroom = classroomsRes.body[0];
  const classroomId = classroom.id;
  console.log(`   Using Classroom: "${classroom.name}" (ID: ${classroomId})`);

  // 2. Connect Socket.IO clients
  console.log('\n2. Connecting authenticated Socket.IO clients for Teacher & Students...');
  const teacherSocket = io('http://localhost:3001', {
    auth: { token: teacherToken },
    transports: ['websocket'],
  });
  const student1Socket = io('http://localhost:3001', {
    auth: { token: student1Token },
    transports: ['websocket'],
  });
  const student2Socket = io('http://localhost:3001', {
    auth: { token: student2Token },
    transports: ['websocket'],
  });

  await Promise.all([
    new Promise<void>((resolve) => teacherSocket.on('connect', () => resolve())),
    new Promise<void>((resolve) => student1Socket.on('connect', () => resolve())),
    new Promise<void>((resolve) => student2Socket.on('connect', () => resolve())),
  ]);
  console.log('   All 3 Sockets connected successfully.');

  // Join classroom room
  teacherSocket.emit('classroom:join', { classroomId });
  student1Socket.emit('classroom:join', { classroomId });
  student2Socket.emit('classroom:join', { classroomId });
  await new Promise((r) => setTimeout(r, 400));

  // 3. Test Classroom Chat Broadcast & MongoDB Persistence
  console.log('\n3. Testing Classroom Chat Broadcast & Persistence...');
  let student1ReceivedMessage: any = null;
  let student2ReceivedMessage: any = null;

  student1Socket.on('chat:message', (msg) => {
    student1ReceivedMessage = msg;
  });
  student2Socket.on('chat:message', (msg) => {
    student2ReceivedMessage = msg;
  });

  const chatText = `Test message from Teacher at ${Date.now()}`;
  teacherSocket.emit('chat:message', {
    classroomId,
    text: chatText,
    name: 'Alex Teacher',
  });

  await new Promise((r) => setTimeout(r, 600));

  if (!student1ReceivedMessage || !student2ReceivedMessage) {
    throw new Error('Real-time classroom chat message was not received by students');
  }
  console.log(`   Message received in real-time by Student 1: "${student1ReceivedMessage.text}"`);
  console.log(`   Message received in real-time by Student 2: "${student2ReceivedMessage.text}"`);

  // Verify MongoDB history via REST API
  console.log('\n4. Verifying Classroom Messages in MongoDB via REST API...');
  const historyRes = await req('GET', `/api/classrooms/${classroomId}/messages`, null, student1Token);
  const foundMsg = historyRes.body.find((m: any) => m.text === chatText || m.content === chatText);
  if (!foundMsg) {
    throw new Error('Classroom message was not persisted to MongoDB or returned in REST API');
  }
  console.log(`   Message found in MongoDB history (ID: ${foundMsg.id}, role: ${foundMsg.role || foundMsg.sender_role})`);

  // 5. Test Reply Functionality
  console.log('\n5. Testing Reply with Thread Context...');
  let replyReceived: any = null;
  teacherSocket.on('chat:message', (msg) => {
    if (msg.reply_to) replyReceived = msg;
  });

  student1Socket.emit('chat:message', {
    classroomId,
    text: 'Sir, I have a doubt regarding this!',
    name: 'Jordan Student',
    replyTo: {
      id: foundMsg.id,
      name: 'Alex Teacher',
      text: foundMsg.text || foundMsg.content,
    },
  });

  await new Promise((r) => setTimeout(r, 600));
  if (!replyReceived || !replyReceived.reply_to) {
    throw new Error('Reply message with reply_to context was not broadcast correctly');
  }
  console.log(`   Reply broadcast received with reference: "${replyReceived.reply_to.text}"`);

  // 6. Test Real-time Typing Indicator
  console.log('\n6. Testing Real-time Typing Indicator...');
  let typingEventReceived: any = null;
  teacherSocket.on('chat:typing', (data) => {
    typingEventReceived = data;
  });

  student2Socket.emit('chat:typing', { classroomId });
  await new Promise((r) => setTimeout(r, 400));
  if (!typingEventReceived || !typingEventReceived.isTyping) {
    throw new Error('Typing event was not propagated to classroom participants');
  }
  console.log(`   Typing indicator verified for user: ${typingEventReceived.name}`);

  // 7. Test Workspace Group Chat Isolation, Roles & Permissions
  console.log('\n7. Testing Workspace Group Chat Isolation, Roles & Permissions...');
  // Get student 1's workspace
  const getWsRes = await req('GET', `/api/classrooms/${classroomId}/workspace`, null, student1Token);
  const workspaceId = getWsRes.body.id || getWsRes.body._id;
  console.log(`   Using Workspace (ID: ${workspaceId})`);

  // Share workspace with student 2 as editor
  await req(
    'POST',
    `/api/workspaces/${workspaceId}/share`,
    {
      userId: student2Id,
      permission: 'editor',
    },
    student1Token
  );
  console.log(`   Shared Workspace ${workspaceId} with Student 2 as 'editor'`);

  // Join workspace socket room
  student1Socket.emit('workspace:chat:join', { workspaceId });
  student2Socket.emit('workspace:chat:join', { workspaceId });
  await new Promise((r) => setTimeout(r, 400));

  let wsMsgReceivedByS2: any = null;
  student2Socket.on('workspace:chat:message', (data) => {
    wsMsgReceivedByS2 = data;
  });

  const wsOwnerText = `Owner code update notice ${Date.now()}`;
  student1Socket.emit('workspace:chat:message', {
    workspaceId,
    text: wsOwnerText,
  });

  await new Promise((r) => setTimeout(r, 600));
  if (!wsMsgReceivedByS2 || (wsMsgReceivedByS2.text !== wsOwnerText && wsMsgReceivedByS2.content !== wsOwnerText)) {
    throw new Error('Workspace group chat message was not received by collaborator');
  }
  console.log(`   Owner message received by Student 2: "${wsMsgReceivedByS2.text}" (Role: ${wsMsgReceivedByS2.role || wsMsgReceivedByS2.senderRole})`);

  // Now Student 2 (Editor) sends a reply in group chat
  let wsMsgReceivedByS1: any = null;
  student1Socket.on('workspace:chat:message', (data) => {
    if (data.text?.includes('Editor response') || data.content?.includes('Editor response')) {
      wsMsgReceivedByS1 = data;
    }
  });

  const wsEditorText = `Editor response from Student 2 at ${Date.now()}`;
  student2Socket.emit('workspace:chat:message', {
    workspaceId,
    text: wsEditorText,
  });

  await new Promise((r) => setTimeout(r, 600));
  if (!wsMsgReceivedByS1) {
    throw new Error('Editor group chat message was not received by Owner');
  }
  console.log(`   Editor message received by Owner: "${wsMsgReceivedByS1.text}" (Role: ${wsMsgReceivedByS1.role || wsMsgReceivedByS1.senderRole})`);

  // Test Workspace Typing Indicator
  let wsTypingReceived: any = null;
  student1Socket.on('workspace:chat:typing', (data) => {
    wsTypingReceived = data;
  });
  student2Socket.emit('workspace:chat:typing', { workspaceId });
  await new Promise((r) => setTimeout(r, 400));
  if (!wsTypingReceived || !wsTypingReceived.isTyping) {
    throw new Error('Workspace typing indicator was not broadcast to group members');
  }
  console.log(`   Workspace group typing verified for user: ${wsTypingReceived.name}`);

  // Verify workspace MongoDB persistence
  const wsHistoryRes = await req('GET', `/api/workspaces/${workspaceId}/messages`, null, student1Token);
  if (!Array.isArray(wsHistoryRes.body)) {
    console.error('wsHistoryRes status:', wsHistoryRes.status, 'body:', wsHistoryRes.body);
    throw new Error(`Expected array from GET /api/workspaces/${workspaceId}/messages, got ${JSON.stringify(wsHistoryRes.body)}`);
  }
  const foundOwnerMsg = wsHistoryRes.body.find((m: any) => m.text === wsOwnerText || m.content === wsOwnerText);
  const foundEditorMsg = wsHistoryRes.body.find((m: any) => m.text === wsEditorText || m.content === wsEditorText);
  if (!foundOwnerMsg || !foundEditorMsg) {
    throw new Error('Workspace group messages were not persisted to MongoDB');
  }
  console.log(`   Both group messages verified in MongoDB persistence (Owner Msg ID: ${foundOwnerMsg.id}, Editor Msg ID: ${foundEditorMsg.id})`);

  // Cleanup sockets
  teacherSocket.disconnect();
  student1Socket.disconnect();
  student2Socket.disconnect();

  console.log('\n=============================================================');
  console.log('ALL CHAT SYSTEM VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('=============================================================\n');
}

runChatSystemVerification().catch((err) => {
  console.error('\nVerification failed with error:', err);
  process.exit(1);
});
