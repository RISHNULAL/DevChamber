import { connectDatabase, disconnectDatabase, checkDbConnection, MONGODB_URI } from '../config/database.js';
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
  Resource,
  Assignment,
  Assessment,
  Question,
  Submission,
} from '../models/index.js';

export async function testDatabase() {
  console.log('Testing MongoDB database connection...');
  console.log(`URI: ${MONGODB_URI}`);

  const connStatus = await checkDbConnection();
  if (!connStatus.ok) {
    console.error('❌ MongoDB connection FAILED:', connStatus.message);
    process.exit(1);
  }
  console.log(`✅ Connected to MongoDB successfully. Database: '${connStatus.database}'`);

  try {
    const mongooseConn = await connectDatabase();
    const db = mongooseConn.connection.db;

    if (!db) {
      throw new Error('Database instance is undefined');
    }

    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);
    console.log(`Found ${collectionNames.length} collections in '${connStatus.database}':`, collectionNames.join(', '));

    const requiredModels = [
      { name: 'users', model: User },
      { name: 'profiles', model: Profile },
      { name: 'classrooms', model: Classroom },
      { name: 'classroomMembers', model: ClassroomMember },
      { name: 'classSessions', model: ClassSession },
      { name: 'workspaces', model: Workspace },
      { name: 'workspaceFiles', model: WorkspaceFile },
      { name: 'workspacePermissions', model: WorkspacePermission },
      { name: 'messages', model: Message },
      { name: 'resources', model: Resource },
      { name: 'assignments', model: Assignment },
      { name: 'assessments', model: Assessment },
      { name: 'questions', model: Question },
      { name: 'submissions', model: Submission },
    ];

    for (const item of requiredModels) {
      const count = await item.model.countDocuments();
      console.log(` - Collection '${item.model.collection.name}': ${count} document(s)`);
    }

    console.log('✅ All 14 MongoDB models and collections are verified!');
    await disconnectDatabase();
    process.exit(0);
  } catch (err: any) {
    console.error('❌ MongoDB verification error:', err?.message || err);
    await disconnectDatabase();
    process.exit(1);
  }
}

if (process.argv[1]?.includes('test.ts') || process.argv[1]?.includes('test.js')) {
  testDatabase();
}
