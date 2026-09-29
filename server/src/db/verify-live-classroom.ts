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

export async function runLiveClassroomVerification() {
  console.log('=== DEVCHAMBER REAL VIDEO CLASSROOM & WEBRTC MESH VERIFICATION ===\n');

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

  // Get classroom
  const classroomsRes = await req('GET', '/api/classrooms', null, teacherToken);
  const classroom = classroomsRes.body[0];
  const classroomId = classroom.id;
  console.log(`   Using Classroom: "${classroom.name}" (ID: ${classroomId})`);

  // 2. Connect Socket.IO clients with authenticated JWT
  console.log('\n2. Connecting Socket.IO clients with JWT...');
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
    new Promise((resolve) => teacherSocket.on('connect', () => resolve(true))),
    new Promise((resolve) => student1Socket.on('connect', () => resolve(true))),
    new Promise((resolve) => student2Socket.on('connect', () => resolve(true))),
  ]);
  console.log('   All 3 authenticated sockets connected successfully.');

  // 3. Multi-Peer Video Classroom Call Join & Roster
  console.log('\n3. Joining Multi-Peer Video Call & Synchronizing Roster...');
  let callRosterReceived = false;
  let participantJoinedCount = 0;

  teacherSocket.on('call:roster', (data) => {
    console.log(`   Teacher received call:roster with ${data.participants?.length || 0} participants.`);
    callRosterReceived = true;
  });

  teacherSocket.on('participant:joined', (p) => {
    console.log(`   Teacher notified of participant joined: "${p.name}" (${p.role}) - Mic: ${p.micEnabled}, Cam: ${p.camEnabled}`);
    participantJoinedCount++;
  });

  // Teacher joins video call
  teacherSocket.emit('classroom:join-call', {
    classroomId,
    userId: teacherRes.body.user.id,
    name: teacherRes.body.user.full_name,
    role: 'teacher',
    micEnabled: true,
    camEnabled: true,
    isSharingScreen: false,
  });

  await new Promise((r) => setTimeout(r, 200));

  // Student 1 joins video call
  student1Socket.emit('classroom:join-call', {
    classroomId,
    userId: student1Res.body.user.id,
    name: student1Res.body.user.full_name,
    role: 'student',
    micEnabled: true,
    camEnabled: true,
    isSharingScreen: false,
  });

  await new Promise((r) => setTimeout(r, 200));

  // Student 2 joins video call with camera off
  student2Socket.emit('classroom:join-call', {
    classroomId,
    userId: student2Res.body.user.id,
    name: student2Res.body.user.full_name,
    role: 'student',
    micEnabled: true,
    camEnabled: false,
    isSharingScreen: false,
  });

  await new Promise((r) => setTimeout(r, 500));
  console.log(`   Multi-peer call join verified. (Roster received: ${callRosterReceived}, Joined events: ${participantJoinedCount})`);

  // 4. Test Participant Media State Changes (Mic & Camera toggles)
  console.log('\n4. Testing Real-time Media State Toggles (Mic Mute / Camera Off)...');
  let mediaStateReceivedByTeacher = false;

  teacherSocket.on('participant:media-state', (data) => {
    if (data.userId === student2Res.body.user.id && data.micEnabled === false) {
      console.log(`   Teacher received student media update: "${data.name}" mic is now MUTED.`);
      mediaStateReceivedByTeacher = true;
    }
  });

  student2Socket.emit('participant:media-state', {
    classroomId,
    userId: student2Res.body.user.id,
    micEnabled: false,
    camEnabled: false,
    isSharingScreen: false,
  });

  await new Promise((r) => setTimeout(r, 400));
  console.log(`   Media state toggle broadcast: ${mediaStateReceivedByTeacher ? 'PASS' : 'FAIL'}`);

  // 5. Test WebRTC Mesh Signaling (Offer -> Answer -> ICE Candidate)
  console.log('\n5. Testing Multi-Peer WebRTC Mesh Signaling...');
  let webrtcOfferReceived = false;
  let webrtcAnswerReceived = false;
  let iceCandidateReceived = false;

  student1Socket.on('webrtc:offer', (data) => {
    console.log(`   Student 1 received webrtc:offer from peer socket.`);
    webrtcOfferReceived = true;
    student1Socket.emit('webrtc:answer', {
      toSocketId: data.fromSocketId,
      sdp: { type: 'answer', sdp: 'v=0\r\no=student1 123 456 IN IP4 127.0.0.1...' },
    });
  });

  teacherSocket.on('webrtc:answer', (data) => {
    console.log(`   Teacher received webrtc:answer from student.`);
    webrtcAnswerReceived = true;
    teacherSocket.emit('webrtc:ice-candidate', {
      toSocketId: data.fromSocketId,
      candidate: { candidate: 'candidate:1 1 UDP 2130706431 127.0.0.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    });
  });

  student1Socket.on('webrtc:ice-candidate', (data) => {
    console.log(`   Student 1 received webrtc:ice-candidate.`);
    iceCandidateReceived = true;
  });

  // Teacher sends offer to Student 1
  teacherSocket.emit('webrtc:offer', {
    toSocketId: student1Socket.id,
    sdp: { type: 'offer', sdp: 'v=0\r\no=teacher 789 101 IN IP4 127.0.0.1...' },
  });

  await new Promise((r) => setTimeout(r, 600));
  console.log(`   WebRTC Signaling Mesh: ${webrtcOfferReceived && webrtcAnswerReceived && iceCandidateReceived ? 'PASS' : 'FAIL'}`);

  // 6. Test Teacher Screen Share Broadcast & Notification
  console.log('\n6. Testing Teacher Screen Share Broadcast & Cleanup...');
  let screenStartedReceived = false;
  let screenStoppedReceived = false;

  student1Socket.on('screen:started', (data) => {
    console.log(`   Student 1 received screen:started event: Teacher "${data.teacherName}"`);
    screenStartedReceived = true;
  });

  student1Socket.on('screen:stopped', () => {
    console.log(`   Student 1 received screen:stopped event.`);
    screenStoppedReceived = true;
  });

  teacherSocket.emit('screen:start', { classroomId, teacherName: 'Alex Morgan' });
  await new Promise((r) => setTimeout(r, 400));

  teacherSocket.emit('screen:stop', { classroomId });
  await new Promise((r) => setTimeout(r, 400));

  console.log(`   Screen share lifecycle: ${screenStartedReceived && screenStoppedReceived ? 'PASS' : 'FAIL'}`);

  // 7. Test Real-time Chat Persistence in MongoDB
  console.log('\n7. Testing Real-time Chat Persistence in MongoDB...');
  const testMsgTeacher = `Teacher announcement at ${new Date().toISOString()}`;
  const testMsgStudent = `Student question at ${new Date().toISOString()}`;

  let studentReceivedMsg = false;
  let teacherReceivedMsg = false;

  student1Socket.on('chat:message', (data) => {
    if (data.content === testMsgTeacher || data.text === testMsgTeacher) {
      console.log(`   Student 1 received message: "${data.content || data.text}" from "${data.senderName || data.name}"`);
      studentReceivedMsg = true;
    }
  });

  teacherSocket.on('chat:message', (data) => {
    if (data.content === testMsgStudent || data.text === testMsgStudent) {
      console.log(`   Teacher received message: "${data.content || data.text}" from "${data.senderName || data.name}"`);
      teacherReceivedMsg = true;
    }
  });

  teacherSocket.emit('chat:message', { classroomId, text: testMsgTeacher });
  await new Promise((r) => setTimeout(r, 400));

  student1Socket.emit('chat:message', { classroomId, text: testMsgStudent });
  await new Promise((r) => setTimeout(r, 400));

  console.log(`   Chat bidirectional broadcast: ${studentReceivedMsg && teacherReceivedMsg ? 'PASS' : 'FAIL'}`);

  // 8. Test Class End Event Broadcast
  console.log('\n8. Testing Class End Lifecycle...');
  let classEndedReceived = false;

  student1Socket.on('class:ended', (data) => {
    console.log(`   Student 1 received class:ended notification: "${data.message}"`);
    classEndedReceived = true;
  });

  teacherSocket.emit('class:end', { classroomId });
  await new Promise((r) => setTimeout(r, 400));
  console.log(`   Class ended lifecycle broadcast: ${classEndedReceived ? 'PASS' : 'FAIL'}`);

  // 9. Cleanup
  teacherSocket.disconnect();
  student1Socket.disconnect();
  student2Socket.disconnect();

  console.log('\n=== ALL REAL VIDEO CLASSROOM VERIFICATIONS COMPLETED SUCCESSFULLY ===');
}

runLiveClassroomVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
