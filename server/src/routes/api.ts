import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { createClassroom, joinClassroom, joinClassroomByCode, listClassrooms, getClassroomDetails } from '../services/classrooms.js';
import { getOrCreateStudentWorkspace, listClassroomWorkspaces, updateWorkspaceFile, updateWorkspacePermission, takeWorkspaceControl } from '../services/workspaces.js';
import { listAssessments, createAssessment, updateAssessmentStatus, submitAssessmentAnswers, getAssessmentSubmissions } from '../services/assessments.js';
import { listResources, createResource, listAssignments, createAssignment } from '../services/resources.js';
import { runPython } from '../services/runner.js';
import { assist } from '../services/ai/index.js';

export function createApiRouter(supabase: SupabaseClient | null) {
  const router = Router();

  // --- Classrooms ---
  router.get('/classrooms', requireUser, async (req, res, next) => {
    try {
      res.json(await listClassrooms(supabase, req.user!.id));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms', requireUser, async (req, res, next) => {
    try {
      const input = z.object({
        name: z.string().trim().min(2).max(100),
        subject: z.string().max(100).optional(),
        description: z.string().max(1000).optional(),
        batch: z.string().max(80).optional(),
      }).parse(req.body);
      res.status(201).json(await createClassroom(supabase, req.user!.id, input));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/join', requireUser, async (req, res, next) => {
    try {
      const input = z.object({ joinCode: z.string().trim().min(3).max(24) }).parse(req.body);
      res.json(await joinClassroomByCode(supabase, req.user!.id, input.joinCode));
    } catch (e) {
      next(e);
    }
  });

  router.get('/classrooms/:id', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await getClassroomDetails(supabase, classroomId));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/join', requireUser, async (req, res, next) => {
    try {
      const input = z.object({ joinCode: z.string().trim().min(3).max(24) }).parse(req.body);
      const classroomId = String(req.params.id);
      res.json(await joinClassroom(supabase, req.user!.id, classroomId, input.joinCode));
    } catch (e) {
      next(e);
    }
  });

  // --- Workspaces ---
  router.get('/classrooms/:id/workspace', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await getOrCreateStudentWorkspace(supabase, classroomId, req.user!.id, req.user!.name));
    } catch (e) {
      next(e);
    }
  });

  router.get('/classrooms/:id/workspaces', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await listClassroomWorkspaces(supabase, classroomId, req.user!.id, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.put('/workspaces/:id/file', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const input = z.object({
        name: z.string().min(1).max(100),
        content: z.string().max(100_000),
      }).parse(req.body);
      res.json(await updateWorkspaceFile(supabase, workspaceId, input.name, input.content, req.user!.id));
    } catch (e) {
      next(e);
    }
  });

  router.put('/workspaces/:id/permission', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const input = z.object({
        userId: z.string(),
        permission: z.enum(['owner', 'editor', 'viewer']),
      }).parse(req.body);
      res.json(await updateWorkspacePermission(supabase, workspaceId, input.userId, input.permission));
    } catch (e) {
      next(e);
    }
  });

  router.post('/workspaces/:id/take-control', requireUser, async (req, res, next) => {
    try {
      const workspaceId = String(req.params.id);
      const input = z.object({ release: z.boolean().optional() }).parse(req.body);
      res.json(await takeWorkspaceControl(workspaceId, req.user!.id, input.release));
    } catch (e) {
      next(e);
    }
  });

  // --- Assessments ---
  router.get('/classrooms/:id/assessments', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await listAssessments(supabase, classroomId, req.user!.role));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/assessments', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const input = z.object({
        title: z.string().min(2).max(120),
        description: z.string().max(500).optional(),
        duration_minutes: z.number().min(1).max(360).optional(),
        questions: z.array(z.object({
          prompt: z.string().min(1),
          options: z.array(z.string().min(1)).min(2),
          answer_key: z.number().min(0),
          points: z.number().min(1).optional(),
        })).optional(),
      }).parse(req.body);
      res.status(201).json(await createAssessment(supabase, classroomId, req.user!.id, input));
    } catch (e) {
      next(e);
    }
  });

  router.put('/assessments/:id/status', requireUser, async (req, res, next) => {
    try {
      const assessmentId = String(req.params.id);
      const input = z.object({ status: z.enum(['draft', 'published', 'active', 'ended']) }).parse(req.body);
      res.json(await updateAssessmentStatus(supabase, assessmentId, input.status));
    } catch (e) {
      next(e);
    }
  });

  router.post('/assessments/:id/submit', requireUser, async (req, res, next) => {
    try {
      const assessmentId = String(req.params.id);
      const input = z.object({ answers: z.record(z.any()) }).parse(req.body);
      res.json(await submitAssessmentAnswers(supabase, assessmentId, req.user!.id, req.user!.name, input.answers));
    } catch (e) {
      next(e);
    }
  });

  router.get('/assessments/:id/submissions', requireUser, async (req, res, next) => {
    try {
      const assessmentId = String(req.params.id);
      res.json(await getAssessmentSubmissions(supabase, assessmentId));
    } catch (e) {
      next(e);
    }
  });

  // --- Resources & Assignments ---
  router.get('/classrooms/:id/resources', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await listResources(supabase, classroomId));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/resources', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const input = z.object({
        title: z.string().min(1).max(120),
        url: z.string().min(1),
        description: z.string().max(500).optional(),
        kind: z.enum(['link', 'file']).optional(),
      }).parse(req.body);
      res.status(201).json(await createResource(supabase, classroomId, req.user!.id, input));
    } catch (e) {
      next(e);
    }
  });

  router.get('/classrooms/:id/assignments', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      res.json(await listAssignments(supabase, classroomId));
    } catch (e) {
      next(e);
    }
  });

  router.post('/classrooms/:id/assignments', requireUser, async (req, res, next) => {
    try {
      const classroomId = String(req.params.id);
      const input = z.object({
        title: z.string().min(1).max(120),
        description: z.string().min(1).max(2000),
        due_at: z.string().optional(),
      }).parse(req.body);
      res.status(201).json(await createAssignment(supabase, classroomId, req.user!.id, input));
    } catch (e) {
      next(e);
    }
  });

  // --- Code Execution ---
  router.post('/code/run', requireUser, async (req, res, next) => {
    try {
      const input = z.object({
        language: z.literal('python'),
        code: z.string().max(30_000),
      }).parse(req.body);
      res.json(await runPython(input.code));
    } catch (e) {
      next(e);
    }
  });

  // --- AI Learning Assistant ---
  router.post('/ai/assist', requireUser, async (req, res, next) => {
    try {
      const input = z.object({
        question: z.string().trim().min(1).max(3000),
        context: z.string().max(15000).optional(),
        mode: z.enum(['hint', 'explain', 'debug', 'concept']).default('hint'),
      }).parse(req.body);
      res.json({ answer: await assist(input) });
    } catch (e) {
      next(e);
    }
  });

  // Global Error Handler
  router.use((error: unknown, _req: unknown, res: import('express').Response, _next: unknown) => {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.flatten() });
    }
    console.error('API Error:', error);
    const msg = error instanceof Error ? error.message : 'An unexpected error occurred';
    return res.status(500).json({ error: msg });
  });

  return router;
}
