import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { signupUser, loginUser, getUserById } from '../services/auth.js';
import {
  User,
  Profile,
  Classroom,
  ClassroomMember,
  ClassSession,
  Assignment,
  AssignmentSubmission,
  Assessment,
  Submission,
  Workspace,
} from '../models/index.js';
import {
  createClassroom,
  joinClassroom,
  joinClassroomByCode,
  listClassrooms,
  getClassroomDetails,
} from '../services/classrooms.js';
import {
  getOrCreatePersonalWorkspace,
  getOrCreateStudentWorkspace,
  listClassroomWorkspaces,
  listSharedWorkspaces,
  getWorkspaceById,
  getWorkspaceUserPermission,
  listClassroomStudents,
  searchStudents,
  updateWorkspaceFile,
  deleteWorkspaceFile,
  updateWorkspacePermission,
  revokeWorkspacePermission,
  takeWorkspaceControl,
} from '../services/workspaces.js';
import {
  listClassroomSessions,
  createClassSession,
  updateClassSessionStatus,
  deleteClassSession,
} from '../services/sessions.js';
import {
  listResources,
  createResource,
  updateResourceStatus,
  deleteResource,
} from '../services/resources.js';
import {
  listClassroomAssignments,
  createClassroomAssignment,
  updateAssignmentStatus,
  openAssignmentWorkspace,
  submitAssignment,
  listAssignmentSubmissions,
  gradeAssignmentSubmission,
} from '../services/assignments.js';
import {
  listAssessments,
  createAssessment,
  addQuestionToAssessment,
  deleteQuestionFromAssessment,
  updateAssessmentStatus,
  submitAssessmentAnswers,
  getAssessmentSubmissions,
} from '../services/assessments.js';
import { getClassroomAnalytics } from '../services/analytics.js';
import {
  getClassroomMessages,
  saveMessage,
  getWorkspaceMessages,
  saveWorkspaceMessage,
} from '../services/messages.js';
import { runPython } from '../services/runner.js';
import { assist } from '../services/ai/index.js';
import { checkDbConnection } from '../config/database.js';

export function createApiRouter() {
  const router = Router();

  // --- Health Check ---
  router.get('/health', async (_req, res) => {
    const dbStatus = await checkDbConnection();
    if (dbStatus.ok) {
      return res.json({
        status: 'ok',
        database: 'mongodb',
        databaseStatus: 'connected',
        databaseName: dbStatus.database,
        timestamp: new Date().toISOString(),
      });
    } else {
      return res.status(503).json({
        status: 'error',
        database: 'mongodb',
        databaseStatus: 'disconnected',
        error: dbStatus.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // --- Authentication ---
  router.post('/auth/signup', async (req, res, next) => {
    try {
      const input = z
        .object({
          fullName: z.string().trim().min(1).max(100),
          email: z.string().trim().email(),
          password: z.string().min(6).max(100),
          role: z.enum(['student', 'teacher', 'admin']).optional(),
        })
        .parse(req.body);

      const result = await signupUser(input);
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post('/auth/login', async (req, res, next) => {
    try {
      const input = z
        .object({
          email: z.string().trim().email(),
          password: z.string().min(1),
        })
        .parse(req.body);

      const result = await loginUser(input);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.get('/auth/me', requireUser, async (req, res, next) => {
    try {
      const user = await getUserById(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: 'User profile not found' });
      }
      res.json({ user });
    } catch (e) {
      next(e);
    }
  });

  router.post('/auth/logout', (_req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // --- Classrooms ---
  router.get('/classrooms', requireUser, async (req, res, next) => {
    try {
      res.json(await listClassrooms(req.user!.id));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms', requireUser, async (req, res, next) => {
    try {
      const input = z
        .object({
          name: z.string().trim().min(2).max(100),
          subject: z.string().max(100).optional(),
          description: z.string().max(1000).optional(),
          batch: z.string().max(80).optional(),
        })
        .parse(req.body);
      res.status(201).json(await createClassroom(req.user!.id, input));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/join', requireUser, async (req, res, next) => {
    try {
      const input = z.object({ joinCode: z.string().trim().min(3).max(24) }).parse(req.body);
      res.json(await joinClassroomByCode(req.user!.id, input.joinCode));
    } catch (e) {
      next(e);
    }
  });

  router.get('/classrooms/:id', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await getClassroomDetails(classroomId));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/join', requireUser, async (req, res, next) => {
    try {
      const input = z.object({ joinCode: z.string().trim().min(3).max(24) }).parse(req.body);
      const classroomId = String(req.params.id);
      res.json(await joinClassroom(req.user!.id, classroomId, input.joinCode));
    } catch (e) {
      next(e);
    }
  });

  router.get('/classrooms/:id/messages', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const before = req.query.before ? String(req.query.before) : undefined;
      res.json(await getClassroomMessages(classroomId, limit, before));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/messages', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const { text, replyTo } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Message text cannot be empty' });
      }

      // Verify classroom membership
      const isMember = await ClassroomMember.findOne({
        classroomId,
        userId: req.user!.id,
      }).lean();
      const isTeacher = await Classroom.findOne({
        _id: classroomId,
        instructorId: req.user!.id,
      }).lean();

      if (!isMember && !isTeacher && req.user!.role !== 'admin') {
        return res
          .status(403)
          .json({ error: 'You are not enrolled in this classroom' });
      }

      const saved = await saveMessage(
        classroomId,
        req.user!.id,
        req.user!.name,
        req.user!.role,
        text.trim(),
        replyTo
      );
      res.json(saved);
    } catch (e) {
      next(e);
    }
  });

  router.get('/workspaces/:id/messages', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const before = req.query.before ? String(req.query.before) : undefined;

      const permCheck = await getWorkspaceUserPermission(workspaceId, req.user!.id, req.user!.role);
      if (!permCheck.allowed) {
        return res.status(403).json({ error: 'Unauthorized: You do not have access to this workspace chat' });
      }

      res.json(await getWorkspaceMessages(workspaceId, limit, before));
    } catch (e) {
      next(e);
    }
  });

  router.post('/workspaces/:id/messages', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const { text, replyTo } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Message text cannot be empty' });
      }

      const permCheck = await getWorkspaceUserPermission(workspaceId, req.user!.id, req.user!.role);
      if (!permCheck.allowed) {
        return res.status(403).json({ error: 'Unauthorized: You do not have access to this workspace chat' });
      }

      if (permCheck.permission === 'viewer') {
        return res.status(403).json({ error: 'You have read-only access to this workspace chat' });
      }

      let senderRole = 'Student';
      if (permCheck.permission === 'owner') {
        senderRole = 'Owner';
      } else if (permCheck.isInstructor) {
        senderRole = 'Teacher';
      } else if (permCheck.permission === 'editor') {
        senderRole = 'Editor';
      }

      const saved = await saveWorkspaceMessage(
        workspaceId,
        req.user!.id,
        req.user!.name,
        senderRole,
        text.trim(),
        replyTo
      );
      res.json(saved);
    } catch (e) {
      next(e);
    }
  });

  // --- Classroom Live Session Controls ---
  router.get('/classrooms/:id/live/status', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const classroom = await Classroom.findById(classroomId).lean();
      if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
      res.json({
        classroomId,
        isLive: Boolean((classroom as any).isLive),
        teacherId: (classroom as any).teacherId,
        updatedAt: (classroom as any).updatedAt,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/live/start', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const classroom = await Classroom.findById(classroomId);
      if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
      if (req.user!.role !== 'teacher' && req.user!.role !== 'admin' && classroom.teacherId !== req.user!.id) {
        return res.status(403).json({ error: 'Only instructors can start a live class' });
      }
      classroom.isLive = true;
      await classroom.save();
      res.json({
        success: true,
        classroomId,
        status: 'live',
        isLive: true,
        startedAt: new Date(),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/live/end', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const classroom = await Classroom.findById(classroomId);
      if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
      if (req.user!.role !== 'teacher' && req.user!.role !== 'admin' && classroom.teacherId !== req.user!.id) {
        return res.status(403).json({ error: 'Only instructors can end a live class' });
      }
      classroom.isLive = false;
      await classroom.save();
      res.json({
        success: true,
        classroomId,
        status: 'ended',
        isLive: false,
        endedAt: new Date(),
      });
    } catch (e) {
      next(e);
    }
  });

  // --- Workspaces & Student Roster ---
  router.get('/users/profile-stats', requireUser, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const userDoc = await User.findById(userId).lean();
      const profileDoc = await Profile.findById(userId).lean();
      const role = req.user!.role;

      if (role === 'teacher') {
        const [classrooms, assignments, assessments, sessions] = await Promise.all([
          Classroom.find({ instructorId: userId }).lean(),
          Assignment.find({ instructorId: userId }).lean(),
          Assessment.find({ createdBy: userId }).lean(),
          ClassSession.find({ instructorId: userId }).lean(),
        ]);
        const classroomIds = classrooms.map((c) => c._id);
        const membersCount = await ClassroomMember.countDocuments({
          classroomId: { $in: classroomIds },
          role: 'student',
        });

        return res.json({
          user: {
            id: userId,
            full_name: profileDoc?.fullName || userDoc?.name || 'Instructor',
            email: userDoc?.email || profileDoc?.email || '',
            role: 'teacher',
            created_at: userDoc?.createdAt || profileDoc?.createdAt,
          },
          stats: {
            classrooms_count: classrooms.length,
            students_count: membersCount,
            assignments_created: assignments.length,
            assessments_created: assessments.length,
            sessions_count: sessions.length,
          },
        });
      } else {
        const [memberships, workspaces, completedAssignments, completedAssessments] =
          await Promise.all([
            ClassroomMember.find({ userId, role: 'student' }).lean(),
            Workspace.find({
              $or: [{ ownerId: userId }, { 'permissions.userId': userId }],
            }).lean(),
            AssignmentSubmission.find({
              studentId: userId,
              status: { $in: ['submitted', 'graded'] },
            }).lean(),
            Submission.find({ studentId: userId }).lean(),
          ]);

        return res.json({
          user: {
            id: userId,
            full_name: profileDoc?.fullName || userDoc?.name || 'Student',
            email: userDoc?.email || profileDoc?.email || '',
            role: 'student',
            created_at: userDoc?.createdAt || profileDoc?.createdAt,
          },
          stats: {
            classrooms_count: memberships.length,
            workspaces_count: workspaces.length,
            assignments_completed: completedAssignments.length,
            assessments_completed: completedAssessments.length,
          },
        });
      }
    } catch (e) {
      next(e);
    }
  });

  router.put('/users/profile', requireUser, async (req, res, next) => {
    try {
      const { full_name } = req.body;
      const userId = req.user!.id;
      if (full_name) {
        await Profile.findByIdAndUpdate(
          userId,
          { fullName: String(full_name).trim() },
          { upsert: true }
        );
        await User.findByIdAndUpdate(userId, { name: String(full_name).trim() });
      }
      res.json({ success: true, message: 'Profile updated successfully' });
    } catch (e) {
      next(e);
    }
  });

  router.get('/users/search', requireUser, async (req, res, next) => {
    try {
      const q = String(req.query.q || '');
      res.json(await searchStudents(q, req.user!.id));
    } catch (e) {
      next(e);
    }
  });

  router.get('/workspaces/personal', requireUser, async (req, res, next) => {
    try {
      res.json(await getOrCreatePersonalWorkspace(req.user!.id, req.user!.name));
    } catch (e) {
      next(e);
    }
  });

  router.get('/workspaces/shared', requireUser, async (req, res, next) => {
    try {
      res.json(await listSharedWorkspaces(req.user!.id));
    } catch (e) {
      next(e);
    }
  });

  router.get('/classrooms/:id/students', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await listClassroomStudents(classroomId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.get('/classrooms/:id/workspace', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await getOrCreateStudentWorkspace(classroomId, req.user!.id, req.user!.name));
    } catch (e) {
      next(e);
    }
  });

  router.get('/classrooms/:id/workspaces', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await listClassroomWorkspaces(classroomId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.get('/workspaces/:id', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      res.json(await getWorkspaceById(workspaceId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.post('/workspaces/:id/share', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const input = z
        .object({
          userId: z.string().min(1),
          permission: z.enum(['editor', 'viewer']),
        })
        .parse(req.body);
      res.json(
        await updateWorkspacePermission(workspaceId, input.userId, input.permission, req.user!.id, req.user!.role)
      );
    } catch (e) {
      next(e);
    }
  });

  router.put('/workspaces/:id/file', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const input = z
        .object({
          name: z.string().min(1).max(100),
          content: z.string().max(200_000),
        })
        .parse(req.body);
      res.json(await updateWorkspaceFile(workspaceId, input.name, input.content, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.delete('/workspaces/:id/file/:name', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const fileName = String(req.params.name);
      res.json(await deleteWorkspaceFile(workspaceId, fileName, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.put('/workspaces/:id/permission', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const input = z
        .object({
          userId: z.string().min(1),
          permission: z.enum(['editor', 'viewer']),
        })
        .parse(req.body);
      res.json(
        await updateWorkspacePermission(workspaceId, input.userId, input.permission, req.user!.id, req.user!.role)
      );
    } catch (e) {
      next(e);
    }
  });

  router.delete('/workspaces/:id/permission/:userId', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const targetUserId = String(req.params.userId);
      res.json(await revokeWorkspacePermission(workspaceId, targetUserId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.post('/workspaces/:id/take-control', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const input = z.object({ release: z.boolean().optional() }).parse(req.body);
      res.json(await takeWorkspaceControl(workspaceId, req.user!.id, req.user!.role, input.release));
    } catch (e) {
      next(e);
    }
  });

  // --- Class Sessions ---
  router.get('/classrooms/:id/sessions', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await listClassroomSessions(classroomId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/sessions', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const input = z
        .object({
          title: z.string().trim().min(2).max(120),
          description: z.string().max(1000).optional(),
          scheduledDate: z.string().optional(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
          agenda: z.array(z.string()).optional(),
          attachedResourceIds: z.array(z.string()).optional(),
          attachedAssignmentIds: z.array(z.string()).optional(),
          status: z.enum(['draft', 'scheduled', 'live', 'completed', 'cancelled']).optional(),
        })
        .parse(req.body);

      res.status(201).json(await createClassSession(classroomId, req.user!.id, req.user!.role, input));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/sessions/:id/status', requireUser, async (req, res, next) => {
    try {
      const sessionId = String(req.params.id);
      const input = z
        .object({
          status: z.enum(['draft', 'scheduled', 'live', 'completed', 'cancelled']),
        })
        .parse(req.body);

      res.json(await updateClassSessionStatus(sessionId, req.user!.id, req.user!.role, input.status));
    } catch (e) {
      next(e);
    }
  });

  router.delete('/sessions/:id', requireUser, async (req, res, next) => {
    try {
      const sessionId = String(req.params.id);
      res.json(await deleteClassSession(sessionId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  // --- Resources ---
  router.get('/classrooms/:id/resources', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await listResources(classroomId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/resources', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const input = z
        .object({
          title: z.string().trim().min(1).max(120),
          kind: z.enum(['pdf', 'ppt', 'doc', 'image', 'video', 'link', 'code', 'text', 'file']).optional(),
          url: z.string().optional(),
          content: z.string().optional(),
          description: z.string().max(1000).optional(),
          sessionId: z.string().nullable().optional(),
          status: z.enum(['draft', 'published']).optional(),
        })
        .parse(req.body);

      res.status(201).json(await createResource(classroomId, req.user!.id, req.user!.role, input));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/resources/:id/status', requireUser, async (req, res, next) => {
    try {
      const resourceId = String(req.params.id);
      const input = z.object({ status: z.enum(['draft', 'published']) }).parse(req.body);
      res.json(await updateResourceStatus(resourceId, req.user!.id, req.user!.role, input.status));
    } catch (e) {
      next(e);
    }
  });

  router.delete('/resources/:id', requireUser, async (req, res, next) => {
    try {
      const resourceId = String(req.params.id);
      res.json(await deleteResource(resourceId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  // --- Assignments ---
  router.get('/classrooms/:id/assignments', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await listClassroomAssignments(classroomId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/assignments', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const input = z
        .object({
          title: z.string().trim().min(1).max(120),
          description: z.string().max(2000).optional(),
          instructions: z.string().max(4000).optional(),
          dueAt: z.string().nullable().optional(),
          maxMarks: z.number().min(1).max(1000).optional(),
          starterCode: z.string().optional(),
          starterFiles: z.array(z.object({ name: z.string(), content: z.string(), language: z.string() })).optional(),
          attachedResourceIds: z.array(z.string()).optional(),
          status: z.enum(['draft', 'published', 'closed']).optional(),
        })
        .parse(req.body);

      res.status(201).json(await createClassroomAssignment(classroomId, req.user!.id, req.user!.role, input));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/assignments/:id/status', requireUser, async (req, res, next) => {
    try {
      const assignmentId = String(req.params.id);
      const input = z.object({ status: z.enum(['draft', 'published', 'closed']) }).parse(req.body);
      res.json(await updateAssignmentStatus(assignmentId, req.user!.id, req.user!.role, input.status));
    } catch (e) {
      next(e);
    }
  });

  router.post('/assignments/:id/open-workspace', requireUser, async (req, res, next) => {
    try {
      const assignmentId = String(req.params.id);
      res.json(await openAssignmentWorkspace(assignmentId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.post('/assignments/:id/submit', requireUser, async (req, res, next) => {
    try {
      const assignmentId = String(req.params.id);
      res.json(await submitAssignment(assignmentId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.get('/assignments/:id/submissions', requireUser, async (req, res, next) => {
    try {
      const assignmentId = String(req.params.id);
      res.json(await listAssignmentSubmissions(assignmentId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.post('/assignments/:id/submissions/:studentId/grade', requireUser, async (req, res, next) => {
    try {
      const assignmentId = String(req.params.id);
      const studentId = String(req.params.studentId);
      const input = z
        .object({
          marks: z.number().min(0),
          feedback: z.string().max(2000).optional(),
        })
        .parse(req.body);

      res.json(await gradeAssignmentSubmission(assignmentId, studentId, req.user!.id, req.user!.role, input));
    } catch (e) {
      next(e);
    }
  });

  // --- Assessments ---
  router.get('/classrooms/:id/assessments', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await listAssessments(classroomId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/assessments', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const input = z
        .object({
          title: z.string().trim().min(2).max(120),
          description: z.string().max(1000).optional(),
          type: z.enum(['quiz', 'mcq', 'coding', 'timed']).optional(),
          duration_minutes: z.number().min(1).max(360).optional(),
          passing_score: z.number().min(1).optional(),
          attempts_allowed: z.number().min(1).optional(),
          status: z.enum(['draft', 'published', 'active', 'ended']).optional(),
          questions: z
            .array(
              z.object({
                prompt: z.string().min(1),
                options: z.array(z.string().min(1)).min(2),
                answer_key: z.any(),
                points: z.number().min(1).optional(),
                kind: z.enum(['mcq', 'short_answer', 'coding']).optional(),
                explanation: z.string().optional(),
              })
            )
            .optional(),
        })
        .parse(req.body);

      res.status(201).json(await createAssessment(classroomId, req.user!.id, req.user!.role, input));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/assessments/:id/status', requireUser, async (req, res, next) => {
    try {
      const assessmentId = String(req.params.id);
      const input = z.object({ status: z.enum(['draft', 'published', 'active', 'ended']) }).parse(req.body);
      res.json(await updateAssessmentStatus(assessmentId, req.user!.id, req.user!.role, input.status));
    } catch (e) {
      next(e);
    }
  });

  router.post('/assessments/:id/questions', requireUser, async (req, res, next) => {
    try {
      const assessmentId = String(req.params.id);
      const input = z
        .object({
          prompt: z.string().min(1),
          options: z.array(z.string().min(1)).min(2),
          answer_key: z.any(),
          points: z.number().min(1).optional(),
          kind: z.enum(['mcq', 'short_answer', 'coding']).optional(),
          explanation: z.string().optional(),
        })
        .parse(req.body);

      res.status(201).json(await addQuestionToAssessment(assessmentId, req.user!.id, req.user!.role, input));
    } catch (e) {
      next(e);
    }
  });

  router.delete('/questions/:id', requireUser, async (req, res, next) => {
    try {
      const questionId = String(req.params.id);
      res.json(await deleteQuestionFromAssessment(questionId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.post('/assessments/:id/submit', requireUser, async (req, res, next) => {
    try {
      const assessmentId = String(req.params.id);
      const input = z
        .object({
          answers: z.record(z.any()),
          timeTakenSeconds: z.number().optional(),
        })
        .parse(req.body);

      res.json(
        await submitAssessmentAnswers(
          assessmentId,
          req.user!.id,
          req.user!.role,
          input.answers,
          input.timeTakenSeconds || 0
        )
      );
    } catch (e) {
      next(e);
    }
  });

  router.get('/assessments/:id/submissions', requireUser, async (req, res, next) => {
    try {
      const assessmentId = String(req.params.id);
      res.json(await getAssessmentSubmissions(assessmentId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  // --- Analytics ---
  router.get('/classrooms/:id/analytics', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await getClassroomAnalytics(classroomId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  // --- Code Execution ---
  router.post('/code/run', requireUser, async (req, res, next) => {
    try {
      const input = z
        .object({
          language: z.literal('python'),
          code: z.string().max(30_000),
        })
        .parse(req.body);
      res.json(await runPython(input.code));
    } catch (e) {
      next(e);
    }
  });

  // --- AI Learning Assistant ---
  router.post('/ai/assist', requireUser, async (req, res, next) => {
    try {
      const input = z
        .object({
          question: z.string().trim().min(1).max(5000),
          context: z.string().max(30000).optional(),
          language: z.string().max(60).optional(),
          errorMessage: z.string().max(10000).optional(),
          mode: z.enum(['hint', 'explain', 'debug', 'concept', 'summary', 'practice']).default('hint'),
        })
        .parse(req.body);
      res.json({ answer: await assist(input) });
    } catch (e) {
      next(e);
    }
  });

  // Global Error Handler
  router.use((error: any, req: import('express').Request, res: import('express').Response, _next: unknown) => {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.flatten() });
    }

    // MongoDB connection failure
    if (
      error?.name === 'MongoServerSelectionError' ||
      error?.name === 'MongoNetworkError' ||
      error?.code === 'ECONNREFUSED' ||
      error?.message?.includes('connect ECONNREFUSED') ||
      error?.message?.includes('buffering timed out')
    ) {
      console.error(`[DB Connection Error] [${req.method} ${req.path}]: MongoDB service is unreachable.`);
      return res.status(503).json({ error: 'Database connection unavailable. Please check MongoDB server.' });
    }

    // MongoDB duplicate key error (E11000)
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'A record with this information already exists.' });
    }

    let statusCode = error?.statusCode || error?.status;
    if (!statusCode) {
      if (error?.message?.includes('Only teachers') || error?.message?.includes('Access denied') || error?.message?.includes('Unauthorized')) {
        statusCode = 403;
      } else if (error?.message?.includes('not found') || error?.message?.includes('Not Found')) {
        statusCode = 404;
      } else if (error?.message?.includes('Invalid') || error?.message?.includes('required') || error?.message?.includes('must be')) {
        statusCode = 400;
      } else {
        statusCode = 500;
      }
    }

    const msg = error instanceof Error ? error.message : 'An unexpected server error occurred';

    if (statusCode >= 500) {
      console.error(`[Server Error ${statusCode}] [${req.method} ${req.path}]:`, msg);
    }

    return res.status(statusCode).json({ error: msg });
  });

  return router;
}
