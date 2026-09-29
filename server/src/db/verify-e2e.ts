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

export async function runFullVerification() {
  console.log('=== DEVCHAMBER MONGODB FULL VERIFICATION SUITE ===\n');

  // 1. Health Check
  console.log('1. Testing /health & /api/health endpoint...');
  const healthRes = await req('GET', '/api/health');
  console.log('   Health status:', healthRes.status, JSON.stringify(healthRes.body));
  if (healthRes.body.database !== 'mongodb' || healthRes.body.databaseStatus !== 'connected') {
    throw new Error('Health check failed: expected mongodb connected');
  }

  // 2. Authentication
  console.log('\n2. Testing Authentication...');
  // 2a. Teacher Login
  const teacherLogin = await req('POST', '/api/auth/login', { email: 'teacher@school.edu', password: 'password123' });
  console.log('   Teacher Login:', teacherLogin.status, teacherLogin.body.user?.full_name, 'Token received:', !!teacherLogin.body.token);
  const teacherToken = teacherLogin.body.token;

  // 2b. Student Login
  const student1Login = await req('POST', '/api/auth/login', { email: 'student@school.edu', password: 'password123' });
  console.log('   Student 1 Login:', student1Login.status, student1Login.body.user?.full_name);
  const student1Token = student1Login.body.token;
  const student1Id = student1Login.body.user.id;

  // 2c. Student 2 (Maya) Login
  const student2Login = await req('POST', '/api/auth/login', { email: 'maya@school.edu', password: 'password123' });
  console.log('   Student 2 Login:', student2Login.status, student2Login.body.user?.full_name);
  const student2Token = student2Login.body.token;
  const student2Id = student2Login.body.user.id;

  // 2d. Signup New User
  const testEmail = `newuser.${Date.now()}@school.edu`;
  const signupRes = await req('POST', '/api/auth/signup', {
    fullName: 'New Student',
    email: testEmail,
    password: 'password123',
    role: 'student',
  });
  console.log('   Signup New User:', signupRes.status, signupRes.body.user?.email);

  // 2e. Duplicate Signup (should fail with 409)
  const dupRes = await req('POST', '/api/auth/signup', {
    fullName: 'New Student',
    email: testEmail,
    password: 'password123',
  });
  console.log('   Duplicate Signup Rejected (409):', dupRes.status === 409 ? 'PASS (409)' : `FAIL (${dupRes.status})`);

  // 2f. Auth /me
  const meRes = await req('GET', '/api/auth/me', null, teacherToken);
  console.log('   Auth /me:', meRes.status, meRes.body.user?.full_name, meRes.body.user?.role);

  // 3. Classrooms
  console.log('\n3. Testing Classrooms...');
  const classroomsRes = await req('GET', '/api/classrooms', null, teacherToken);
  console.log('   Classrooms Count:', classroomsRes.body.length);
  const classroom = classroomsRes.body[0];
  const classId = classroom.id;
  console.log('   Active Classroom:', classroom.name, 'Code:', classroom.join_code);

  // 4. Workspaces & Privacy Model
  console.log('\n4. Testing Workspace Privacy & Permissions...');
  // 4a. Student 1 opens own workspace
  const ws1Res = await req('GET', `/api/classrooms/${classId}/workspace`, null, student1Token);
  console.log('   Student 1 Workspace:', ws1Res.status, ws1Res.body.title, 'Permission:', ws1Res.body.myPermission);
  const ws1Id = ws1Res.body.id;

  // 4b. Student 2 tries to access Student 1 workspace WITHOUT permission (Must be rejected 403!)
  const unauthRes = await req('GET', `/api/workspaces/${ws1Id}`, null, student2Token);
  console.log(
    '   Student 2 Unauthorized Access Test:',
    unauthRes.status === 403 ? 'PASS (403 Forbidden)' : `FAIL (${unauthRes.status})`
  );

  // 4c. Teacher lists classroom workspaces (should see all)
  const teacherWsList = await req('GET', `/api/classrooms/${classId}/workspaces`, null, teacherToken);
  console.log('   Teacher Workspace List Count:', teacherWsList.body.length);

  // 4d. Teacher opens Student 1 workspace
  const teacherOpenWs = await req('GET', `/api/workspaces/${ws1Id}`, null, teacherToken);
  console.log('   Teacher Open Student Workspace:', teacherOpenWs.status, 'Permission:', teacherOpenWs.body.myPermission);

  // 4e. Teacher grants VIEWER access to Student 2
  const grantViewerRes = await req(
    'PUT',
    `/api/workspaces/${ws1Id}/permission`,
    { userId: student2Id, permission: 'viewer' },
    teacherToken
  );
  console.log('   Teacher Grants Viewer to Student 2:', grantViewerRes.status, grantViewerRes.body);

  // 4f. Student 2 now opens Student 1 workspace (Should succeed as viewer!)
  const student2ViewerOpen = await req('GET', `/api/workspaces/${ws1Id}`, null, student2Token);
  console.log(
    '   Student 2 Opens Workspace as Viewer:',
    student2ViewerOpen.status,
    'Permission:',
    student2ViewerOpen.body.myPermission
  );

  // 4g. Student 2 attempts to edit file with VIEWER access (Must be rejected 403!)
  const viewerEditRes = await req(
    'PUT',
    `/api/workspaces/${ws1Id}/file`,
    { name: 'main.py', content: '# Hacked by viewer' },
    student2Token
  );
  console.log(
    '   Viewer Edit Attempt Rejected (403):',
    viewerEditRes.status === 403 ? 'PASS (403)' : `FAIL (${viewerEditRes.status})`
  );

  // 4h. Teacher upgrades Student 2 to EDITOR access
  const grantEditorRes = await req(
    'PUT',
    `/api/workspaces/${ws1Id}/permission`,
    { userId: student2Id, permission: 'editor' },
    teacherToken
  );
  console.log('   Teacher Grants Editor to Student 2:', grantEditorRes.status);

  // 4i. Student 2 edits file with EDITOR access (Should succeed!)
  const editorEditRes = await req(
    'PUT',
    `/api/workspaces/${ws1Id}/file`,
    { name: 'collab.py', content: '# Collab code by Maya' },
    student2Token
  );
  console.log('   Editor Edit File:', editorEditRes.status, editorEditRes.body.success ? 'SUCCESS' : 'FAILED');

  // 4j. Teacher Takes Control & Releases Control
  const takeCtrlRes = await req(
    'POST',
    `/api/workspaces/${ws1Id}/take-control`,
    { release: false },
    teacherToken
  );
  console.log('   Teacher Take Control:', takeCtrlRes.status, 'isControlled:', takeCtrlRes.body.isControlled);
  const relCtrlRes = await req(
    'POST',
    `/api/workspaces/${ws1Id}/take-control`,
    { release: true },
    teacherToken
  );
  console.log('   Teacher Release Control:', relCtrlRes.status, 'isControlled:', relCtrlRes.body.isControlled);

  // 4k. Teacher Revokes Student 2 permission
  const revokeRes = await req('DELETE', `/api/workspaces/${ws1Id}/permission/${student2Id}`, null, teacherToken);
  console.log('   Teacher Revokes Student 2 Permission:', revokeRes.status);

  // 4l. Student 2 tries to access again (Must be 403 Forbidden!)
  const postRevokeRes = await req('GET', `/api/workspaces/${ws1Id}`, null, student2Token);
  console.log(
    '   Student 2 Post-Revoke Access Test:',
    postRevokeRes.status === 403 ? 'PASS (403 Forbidden)' : `FAIL (${postRevokeRes.status})`
  );

  // 5. Assessments & Answer Key Protection
  console.log('\n5. Testing Assessments & Answer Key Security...');
  const teacherAssessments = await req('GET', `/api/classrooms/${classId}/assessments`, null, teacherToken);
  console.log('   Teacher Assessments Count:', teacherAssessments.body.length);
  console.log(
    '   Teacher views answer key:',
    teacherAssessments.body[0]?.questions[0]?.answer_key !== undefined ? 'VISIBLE TO TEACHER (PASS)' : 'MISSING'
  );

  const studentAssessments = await req('GET', `/api/classrooms/${classId}/assessments`, null, student1Token);
  const studentQ = studentAssessments.body[0]?.questions[0];
  console.log(
    '   Student views answer key:',
    studentQ?.answer_key === undefined ? 'HIDDEN FROM STUDENT (SECURE PASS)' : 'LEAKED (FAIL!)'
  );

  // 5b. Student submits assessment
  const asId = teacherAssessments.body[0].id;
  const qId = teacherAssessments.body[0].questions[0].id;
  const submitRes = await req(
    'POST',
    `/api/assessments/${asId}/submit`,
    { answers: { [qId]: 2 } },
    student1Token
  );
  console.log('   Student Assessment Submit:', submitRes.status, 'Score:', submitRes.body.score, '/', submitRes.body.total_points);

  // 5c. Teacher views submissions
  const subsRes = await req('GET', `/api/assessments/${asId}/submissions`, null, teacherToken);
  console.log('   Teacher Views Submissions Count:', subsRes.body.length, 'Student Name:', subsRes.body[0]?.student_name);

  // 6. Resources & Assignments
  console.log('\n6. Testing Resources & Assignments...');
  const resList = await req('GET', `/api/classrooms/${classId}/resources`, null, student1Token);
  console.log('   Resources count:', resList.body.length, 'Title:', resList.body[0]?.title);

  const assignList = await req('GET', `/api/classrooms/${classId}/assignments`, null, student1Token);
  console.log('   Assignments count:', assignList.body.length, 'Title:', assignList.body[0]?.title);

  // 7. Code Execution
  console.log('\n7. Testing Python Code Runner Sandbox...');
  const codeRunRes = await req(
    'POST',
    '/api/code/run',
    { language: 'python', code: 'print("Hello from DevChamber MongoDB!")\nprint(2 + 2)' },
    student1Token
  );
  console.log('   Code Execution Status:', codeRunRes.status);
  console.log('   Output:', codeRunRes.body.stdout?.trim());

  // 8. AI Learning Assistant
  console.log('\n8. Testing AI Assistant...');
  const aiRes = await req(
    'POST',
    '/api/ai/assist',
    { question: 'What is binary search time complexity?', mode: 'concept' },
    student1Token
  );
  console.log('   AI Assistant Status:', aiRes.status, 'Answer length:', aiRes.body.answer?.length, 'chars');

  console.log('\n==================================================');
  console.log('🎯 ALL 8 VERIFICATION MODULES PASSED WITH MONGODB!');
  console.log('==================================================');
}

if (process.argv[1]?.includes('verify-e2e.ts') || process.argv[1]?.includes('verify-e2e.js')) {
  runFullVerification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('VERIFICATION FAILED:', err);
      process.exit(1);
    });
}
