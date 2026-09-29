import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { connectDatabase, disconnectDatabase, mongoose } from '../config/database.js';
import {
  User,
  Profile,
  Classroom,
  ClassroomMember,
  ClassSession,
  Workspace,
  WorkspaceFile,
  WorkspacePermission,
  Message,
  Assessment,
  Question,
  Submission,
  Resource,
  Assignment,
} from '../models/index.js';

export async function initDatabase() {
  console.log('[DB Init] Connecting to MongoDB...');
  await connectDatabase();

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database instance is undefined');
  }

  try {
    console.log('[DB Init] Ensuring all 14 target collections exist in MongoDB...');
    const existing = await db.listCollections().toArray();
    const existingNames = new Set(existing.map((c) => c.name));

    const targetModels = [
      User,
      Profile,
      Classroom,
      ClassroomMember,
      ClassSession,
      Workspace,
      WorkspaceFile,
      WorkspacePermission,
      Message,
      Resource,
      Assignment,
      Assessment,
      Question,
      Submission,
    ];

    for (const model of targetModels) {
      const collName = model.collection.name;
      if (!existingNames.has(collName)) {
        await db.createCollection(collName);
        console.log(` + Created collection '${collName}'`);
      }
    }

    console.log('[DB Init] Syncing indexes for all collections...');
    await Promise.all([
      User.syncIndexes(),
      Profile.syncIndexes(),
      Classroom.syncIndexes(),
      ClassroomMember.syncIndexes(),
      ClassSession.syncIndexes(),
      Workspace.syncIndexes(),
      WorkspaceFile.syncIndexes(),
      WorkspacePermission.syncIndexes(),
      Message.syncIndexes(),
      Resource.syncIndexes(),
      Assignment.syncIndexes(),
      Assessment.syncIndexes(),
      Question.syncIndexes(),
      Submission.syncIndexes(),
    ]);

    console.log('[DB Init] Seeding initial users & demo classroom if empty...');
    await seedInitialData();

    console.log('[DB Init] DevChamber MongoDB initialized successfully!');
  } catch (err) {
    console.error('[DB Init Error]:', err);
    throw err;
  }
}

async function seedInitialData() {
  const userCount = await User.countDocuments();
  if (userCount > 0) {
    console.log(`[DB Init] Database already contains ${userCount} user(s). Skipping seed.`);
    return;
  }

  const defaultPassword = 'password123';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(defaultPassword, salt);

  const teacherId = 'teacher-alex-uuid-000000000001';
  const student1Id = 'student-jordan-uuid-000000000002';
  const student2Id = 'student-maya-uuid-000000000003';

  // 1. Seed Users & Profiles
  await User.create([
    {
      _id: teacherId,
      email: 'teacher@school.edu',
      passwordHash,
      name: 'Alex Morgan',
      role: 'teacher',
    },
    {
      _id: student1Id,
      email: 'student@school.edu',
      passwordHash,
      name: 'Jordan Lee',
      role: 'student',
    },
    {
      _id: student2Id,
      email: 'maya@school.edu',
      passwordHash,
      name: 'Maya Chen',
      role: 'student',
    },
  ]);

  await Profile.create([
    {
      _id: teacherId,
      userId: teacherId,
      fullName: 'Alex Morgan',
      role: 'teacher',
      email: 'teacher@school.edu',
      avatarColor: 'blue',
    },
    {
      _id: student1Id,
      userId: student1Id,
      fullName: 'Jordan Lee',
      role: 'student',
      email: 'student@school.edu',
      avatarColor: 'green',
    },
    {
      _id: student2Id,
      userId: student2Id,
      fullName: 'Maya Chen',
      role: 'student',
      email: 'maya@school.edu',
      avatarColor: 'orange',
    },
  ]);

  // 2. Seed Demo Classroom
  const classroomId = 'class-ds-s5-cse-000000000001';
  await Classroom.create({
    _id: classroomId,
    teacherId,
    name: 'Data Structures',
    subject: 'Computer Science',
    description: 'Algorithms, data structures, and problem solving.',
    batch: 'S5 CSE',
    joinCode: 'DS5CSE',
    isLive: false,
  });

  // 3. Seed Classroom Members
  await ClassroomMember.create([
    { _id: uuidv4(), classroomId, userId: teacherId, role: 'teacher' },
    { _id: uuidv4(), classroomId, userId: student1Id, role: 'student' },
    { _id: uuidv4(), classroomId, userId: student2Id, role: 'student' },
  ]);

  // 4. Seed Starter Workspace for Jordan
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

  const wsId = 'ws-jordan-uuid-000000000001';
  await Workspace.create({
    _id: wsId,
    classroomId,
    ownerId: student1Id,
    title: "Jordan's Workspace",
  });

  await WorkspaceFile.create([
    {
      _id: uuidv4(),
      workspaceId: wsId,
      name: 'main.py',
      language: 'python',
      content: starterPy,
    },
    {
      _id: uuidv4(),
      workspaceId: wsId,
      name: 'notes.md',
      language: 'markdown',
      content: '# Binary Search Notes\n\n- Time Complexity: O(log n)\n- Space Complexity: O(1)',
    },
  ]);

  await WorkspacePermission.create([
    { _id: uuidv4(), workspaceId: wsId, userId: student1Id, permission: 'owner' },
    { _id: uuidv4(), workspaceId: wsId, userId: teacherId, permission: 'editor' },
  ]);

  // 5. Seed Sample Assessment
  const assessmentId = 'exam-ds-01-uuid-000000000001';
  await Assessment.create({
    _id: assessmentId,
    classroomId,
    createdBy: teacherId,
    title: 'Midterm Review: Trees & Graphs',
    description: 'Evaluates understanding of tree traversals and graph algorithms.',
    durationMinutes: 15,
    status: 'active',
  });

  await Question.create([
    {
      _id: uuidv4(),
      assessmentId,
      kind: 'mcq',
      prompt: 'What is the worst-case time complexity of lookup in an unbalanced Binary Search Tree?',
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
      answerKey: 2,
      points: 2,
      position: 0,
    },
    {
      _id: uuidv4(),
      assessmentId,
      kind: 'mcq',
      prompt: 'Which traversal strategy visits nodes level by level?',
      options: ['Pre-order', 'In-order', 'Post-order', 'Level-order (BFS)'],
      answerKey: 3,
      points: 2,
      position: 1,
    },
    {
      _id: uuidv4(),
      assessmentId,
      kind: 'mcq',
      prompt: 'What data structure is typically used to implement Breadth-First Search (BFS)?',
      options: ['Stack', 'Queue', 'Priority Queue', 'Array'],
      answerKey: 1,
      points: 2,
      position: 2,
    },
  ]);

  // 6. Seed Resources & Assignments
  await Resource.create({
    _id: uuidv4(),
    classroomId,
    createdBy: teacherId,
    title: 'Python Official Documentation',
    kind: 'link',
    url: 'https://docs.python.org/3/',
    description: 'Complete reference for Python 3 standard library.',
  });

  await Assignment.create({
    _id: uuidv4(),
    classroomId,
    createdBy: teacherId,
    title: 'Assignment 1: Binary Search Tree Implementation',
    description: 'Implement insert, search, and delete operations in Python with tests.',
    dueAt: new Date(Date.now() + 7 * 86400000),
  });

  console.log('[DB Init] Seeded demo users, classroom, workspace, assessment, and assignments.');
}

if (process.argv[1]?.includes('init.ts') || process.argv[1]?.includes('init.js')) {
  initDatabase()
    .then(async () => {
      console.log('Database initialization finished.');
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Database initialization failed:', err);
      await disconnectDatabase();
      process.exit(1);
    });
}
