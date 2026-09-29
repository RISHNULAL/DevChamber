import { v4 as uuidv4 } from 'uuid';
import {
  Assignment,
  AssignmentSubmission,
  Classroom,
  ClassroomMember,
  Profile,
  User,
  Workspace,
  WorkspaceFile,
} from '../models/index.js';
import { getOrCreatePersonalWorkspace } from './workspaces.js';

export interface CreateAssignmentInput {
  title: string;
  description?: string;
  instructions?: string;
  dueAt?: string | null;
  maxMarks?: number;
  starterCode?: string;
  starterFiles?: Array<{ name: string; content: string; language: string }>;
  attachedResourceIds?: string[];
  status?: 'draft' | 'published' | 'closed';
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

export async function listClassroomAssignments(
  classroomId: string,
  userId: string,
  userRole: string
) {
  const access = await verifyClassroomAccess(classroomId, userId, userRole);

  const filter: any = { classroomId };
  if (!access.isTeacher) {
    filter.isPublished = true;
  }

  const assignments = await Assignment.find(filter).sort({ createdAt: -1 }).lean();

  // If student, attach their individual submission status
  let studentSubmissionsMap = new Map<string, any>();
  if (!access.isTeacher) {
    const subs = await AssignmentSubmission.find({ classroomId, studentId: userId }).lean();
    for (const s of subs) {
      studentSubmissionsMap.set(s.assignmentId, s);
    }
  } else {
    // If teacher, attach count of submissions
    const allSubs = await AssignmentSubmission.find({ classroomId }).lean();
    for (const s of allSubs) {
      const existing = studentSubmissionsMap.get(s.assignmentId) || [];
      existing.push(s);
      studentSubmissionsMap.set(s.assignmentId, existing);
    }
  }

  return assignments.map((a: any) => {
    let studentStatus = 'not_started';
    let studentSubmission = null;
    let submissionsCount = 0;

    if (!access.isTeacher) {
      const sub = studentSubmissionsMap.get(a._id);
      if (sub) {
        studentStatus = sub.status;
        studentSubmission = {
          id: sub._id,
          status: sub.status,
          marks: sub.marks,
          max_marks: sub.maxMarks || a.maxMarks,
          feedback: sub.feedback || '',
          submitted_at: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : null,
          graded_at: sub.gradedAt ? new Date(sub.gradedAt).toISOString() : null,
        };
      }
    } else {
      const subs = studentSubmissionsMap.get(a._id) || [];
      submissionsCount = subs.filter((s: any) => s.status === 'submitted' || s.status === 'graded').length;
    }

    return {
      id: a._id,
      classroom_id: a.classroomId,
      created_by: a.createdBy,
      author_name: a.authorName || 'Instructor',
      title: a.title,
      description: a.description || '',
      instructions: a.instructions || '',
      due_at: a.dueAt ? new Date(a.dueAt).toISOString() : null,
      max_marks: a.maxMarks || 20,
      starter_code: a.starterCode || '',
      starter_files: a.starterFiles || [],
      attached_resource_ids: a.attachedResourceIds || [],
      status: a.status || (a.isPublished ? 'published' : 'draft'),
      is_published: a.isPublished ?? true,
      submissions_count: submissionsCount,
      my_status: studentStatus,
      my_submission: studentSubmission,
      created_at: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
      updated_at: a.updatedAt ? new Date(a.updatedAt).toISOString() : new Date().toISOString(),
    };
  });
}

export async function createClassroomAssignment(
  classroomId: string,
  userId: string,
  userRole: string,
  input: CreateAssignmentInput
) {
  const access = await verifyClassroomAccess(classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can create assignments');
    err.statusCode = 403;
    throw err;
  }

  const profile = await Profile.findById(userId).lean();
  const user = await User.findById(userId).lean();
  const authorName = profile?.fullName || user?.name || 'Instructor';

  let dueAt: Date | null = null;
  if (input.dueAt && !isNaN(Date.parse(input.dueAt))) {
    dueAt = new Date(input.dueAt);
  }

  const status = input.status || 'published';
  const isPublished = status === 'published';

  const defaultStarterFiles = input.starterFiles && input.starterFiles.length > 0
    ? input.starterFiles
    : [
        {
          name: 'solution.py',
          language: 'python',
          content: input.starterCode || '# Write your assignment solution here\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()\n',
        },
        {
          name: 'README.md',
          language: 'markdown',
          content: `# ${input.title}\n\n${input.instructions || input.description || 'Follow the instructions provided.'}\n`,
        },
      ];

  const assignment = await Assignment.create({
    _id: uuidv4(),
    classroomId,
    createdBy: userId,
    authorName,
    title: input.title.trim(),
    description: (input.description || '').trim(),
    instructions: (input.instructions || '').trim(),
    dueAt,
    maxMarks: input.maxMarks || 20,
    starterCode: input.starterCode || '',
    starterFiles: defaultStarterFiles,
    attachedResourceIds: input.attachedResourceIds || [],
    status,
    isPublished,
    submissionsCount: 0,
  });

  return assignment.toJSON();
}

export async function updateAssignmentStatus(
  assignmentId: string,
  userId: string,
  userRole: string,
  status: 'draft' | 'published' | 'closed'
) {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    const err: any = new Error('Assignment not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(assignment.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can update assignment status');
    err.statusCode = 403;
    throw err;
  }

  assignment.status = status;
  assignment.isPublished = status === 'published';
  await assignment.save();

  return assignment.toJSON();
}

/**
 * Open or prepare the student's personal assignment workspace.
 */
export async function openAssignmentWorkspace(
  assignmentId: string,
  studentId: string,
  studentRole: string
) {
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) {
    const err: any = new Error('Assignment not found');
    err.statusCode = 404;
    throw err;
  }

  await verifyClassroomAccess(assignment.classroomId, studentId, studentRole);

  const profile = await Profile.findById(studentId).lean();
  const user = await User.findById(studentId).lean();
  const studentName = profile?.fullName || user?.name || 'Student';

  // Get student's personal workspace
  const personalWs = await getOrCreatePersonalWorkspace(studentId, studentName);

  // Check if an assignment file exists in student workspace, if not, create starter files
  const starterFiles = assignment.starterFiles || [];
  for (const sf of starterFiles) {
    const existingFile = await WorkspaceFile.findOne({
      workspaceId: personalWs.id,
      name: sf.name,
    }).lean();

    if (!existingFile) {
      await WorkspaceFile.create({
        _id: uuidv4(),
        workspaceId: personalWs.id,
        name: sf.name,
        language: sf.language || 'python',
        content: sf.content || '',
      });
    }
  }

  // Get or initialize student's AssignmentSubmission record
  let sub = await AssignmentSubmission.findOne({ assignmentId, studentId });
  if (!sub) {
    sub = await AssignmentSubmission.create({
      _id: uuidv4(),
      assignmentId,
      classroomId: assignment.classroomId,
      studentId,
      studentName,
      studentEmail: user?.email || '',
      workspaceId: personalWs.id,
      status: 'in_progress',
      maxMarks: assignment.maxMarks || 20,
    });
  }

  return {
    assignment,
    workspace: personalWs,
    submission: sub.toJSON(),
  };
}

/**
 * Student submits their assignment solution.
 */
export async function submitAssignment(
  assignmentId: string,
  studentId: string,
  studentRole: string
) {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    const err: any = new Error('Assignment not found');
    err.statusCode = 404;
    throw err;
  }

  await verifyClassroomAccess(assignment.classroomId, studentId, studentRole);

  const profile = await Profile.findById(studentId).lean();
  const user = await User.findById(studentId).lean();
  const studentName = profile?.fullName || user?.name || 'Student';

  // Load student's files from personal workspace
  const personalWs = await getOrCreatePersonalWorkspace(studentId, studentName);
  const files = await WorkspaceFile.find({ workspaceId: personalWs.id }).lean();
  const fileRecords = files.map((f: any) => ({
    name: f.name,
    content: f.content,
    language: f.language || 'python',
  }));

  const isLate = assignment.dueAt ? new Date() > new Date(assignment.dueAt) : false;
  const status = isLate ? 'late' : 'submitted';

  let sub = await AssignmentSubmission.findOne({ assignmentId, studentId });
  if (sub) {
    sub.files = fileRecords;
    sub.status = status;
    sub.submittedAt = new Date();
    await sub.save();
  } else {
    sub = await AssignmentSubmission.create({
      _id: uuidv4(),
      assignmentId,
      classroomId: assignment.classroomId,
      studentId,
      studentName,
      studentEmail: user?.email || '',
      workspaceId: personalWs.id,
      files: fileRecords,
      status,
      maxMarks: assignment.maxMarks || 20,
      submittedAt: new Date(),
    });
  }

  // Increment submissions count on assignment
  await Assignment.findByIdAndUpdate(assignmentId, { $inc: { submissionsCount: 1 } });

  return sub.toJSON();
}

/**
 * Teacher views all student submissions for an assignment.
 */
export async function listAssignmentSubmissions(
  assignmentId: string,
  userId: string,
  userRole: string
) {
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) {
    const err: any = new Error('Assignment not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(assignment.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can review assignment submissions');
    err.statusCode = 403;
    throw err;
  }

  // Get enrolled students in classroom
  const members = await ClassroomMember.find({
    classroomId: assignment.classroomId,
    role: 'student',
  }).lean();
  const studentIds = members.map((m) => m.userId);

  const [profiles, users, submissions] = await Promise.all([
    Profile.find({ _id: { $in: studentIds } }).lean(),
    User.find({ _id: { $in: studentIds } }).lean(),
    AssignmentSubmission.find({ assignmentId }).lean(),
  ]);

  const profileMap = new Map<string, any>();
  for (const p of profiles) profileMap.set(p._id, p);

  const userMap = new Map<string, any>();
  for (const u of users) userMap.set(u._id, u);

  const subMap = new Map<string, any>();
  for (const s of submissions) subMap.set(s.studentId, s);

  return studentIds.map((sId) => {
    const prof = profileMap.get(sId);
    const usr = userMap.get(sId);
    const sub = subMap.get(sId);

    const studentName = prof?.fullName || usr?.name || 'Student';
    const studentEmail = usr?.email || '';

    return {
      student_id: sId,
      student_name: studentName,
      student_email: studentEmail,
      assignment_id: assignmentId,
      status: sub ? sub.status : 'not_started',
      marks: sub ? sub.marks : null,
      max_marks: assignment.maxMarks || 20,
      feedback: sub ? sub.feedback : '',
      files: sub ? sub.files : [],
      workspace_id: sub?.workspaceId || `ws-personal-${sId}`,
      submitted_at: sub?.submittedAt ? new Date(sub.submittedAt).toISOString() : null,
      graded_at: sub?.gradedAt ? new Date(sub.gradedAt).toISOString() : null,
    };
  });
}

/**
 * Teacher grades a student's submission.
 */
export async function gradeAssignmentSubmission(
  assignmentId: string,
  studentId: string,
  userId: string,
  userRole: string,
  input: { marks: number; feedback?: string }
) {
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) {
    const err: any = new Error('Assignment not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(assignment.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can grade submissions');
    err.statusCode = 403;
    throw err;
  }

  let sub = await AssignmentSubmission.findOne({ assignmentId, studentId });
  if (!sub) {
    const prof = await Profile.findById(studentId).lean();
    const usr = await User.findById(studentId).lean();
    sub = new AssignmentSubmission({
      _id: uuidv4(),
      assignmentId,
      classroomId: assignment.classroomId,
      studentId,
      studentName: prof?.fullName || usr?.name || 'Student',
      studentEmail: usr?.email || '',
      maxMarks: assignment.maxMarks || 20,
    });
  }

  sub.marks = Math.min(Math.max(0, input.marks), assignment.maxMarks || 100);
  sub.feedback = (input.feedback || '').trim();
  sub.status = 'graded';
  sub.gradedAt = new Date();
  await sub.save();

  return sub.toJSON();
}
