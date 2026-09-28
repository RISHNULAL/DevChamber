import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`;
      return headers;
    }
  }

  // Local Demo Session Header
  const demoRole = localStorage.getItem('dc-role') || 'Teacher';
  const demoName = localStorage.getItem('dc-name') || (demoRole === 'Teacher' ? 'Alex Morgan' : 'Jordan Lee');
  const demoUserId = localStorage.getItem('dc-user-id') || `${demoRole.toLowerCase()}-${demoName.toLowerCase().replace(/\s+/g, '')}`;

  headers['Authorization'] = `Bearer demo:${demoUserId}:${demoRole.toLowerCase()}:${encodeURIComponent(demoName)}`;
  headers['x-demo-role'] = demoRole.toLowerCase();
  return headers;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const url = `${SERVER_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const err = await response.json();
      errorMsg = err.error || err.message || errorMsg;
    } catch {
      // Use fallback errorMsg
    }
    throw new Error(errorMsg);
  }

  return response.json() as Promise<T>;
}

// Classroom API
export async function fetchClassrooms() {
  return apiFetch<any[]>('/api/classrooms');
}

export async function createClassroom(data: { name: string; subject?: string; batch?: string; description?: string }) {
  return apiFetch<any>('/api/classrooms', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function joinClassroomByCode(joinCode: string) {
  return apiFetch<any>('/api/classrooms/join', {
    method: 'POST',
    body: JSON.stringify({ joinCode }),
  });
}

export async function getClassroom(id: string) {
  return apiFetch<any>(`/api/classrooms/${id}`);
}

// Workspace API
export async function fetchMyWorkspace(classroomId: string) {
  return apiFetch<any>(`/api/classrooms/${classroomId}/workspace`);
}

export async function fetchClassroomWorkspaces(classroomId: string) {
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/workspaces`);
}

export async function saveWorkspaceFile(workspaceId: string, name: string, content: string) {
  return apiFetch<any>(`/api/workspaces/${workspaceId}/file`, {
    method: 'PUT',
    body: JSON.stringify({ name, content }),
  });
}

export async function updateWorkspacePermission(workspaceId: string, userId: string, permission: 'owner' | 'editor' | 'viewer') {
  return apiFetch<any>(`/api/workspaces/${workspaceId}/permission`, {
    method: 'PUT',
    body: JSON.stringify({ userId, permission }),
  });
}

export async function takeWorkspaceControl(workspaceId: string, release: boolean = false) {
  return apiFetch<any>(`/api/workspaces/${workspaceId}/take-control`, {
    method: 'POST',
    body: JSON.stringify({ release }),
  });
}

// Code Execution API
export async function runPythonCode(code: string) {
  return apiFetch<{ stdout: string; stderr: string; exitCode: number; executionTimeMs?: number }>('/api/code/run', {
    method: 'POST',
    body: JSON.stringify({ language: 'python', code }),
  });
}

// Assessments API
export async function fetchAssessments(classroomId: string) {
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/assessments`);
}

export async function createAssessment(classroomId: string, data: { title: string; description?: string; duration_minutes?: number; questions?: any[] }) {
  return apiFetch<any>(`/api/classrooms/${classroomId}/assessments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAssessmentStatus(assessmentId: string, status: 'draft' | 'published' | 'active' | 'ended') {
  return apiFetch<any>(`/api/assessments/${assessmentId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export async function submitAssessment(assessmentId: string, answers: Record<string, any>) {
  return apiFetch<any>(`/api/assessments/${assessmentId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export async function fetchAssessmentSubmissions(assessmentId: string) {
  return apiFetch<any[]>(`/api/assessments/${assessmentId}/submissions`);
}

// Resources & Assignments API
export async function fetchResources(classroomId: string) {
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/resources`);
}

export async function createResource(classroomId: string, data: { title: string; kind?: 'link' | 'file'; url: string; description?: string }) {
  return apiFetch<any>(`/api/classrooms/${classroomId}/resources`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchAssignments(classroomId: string) {
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/assignments`);
}

export async function createAssignment(classroomId: string, data: { title: string; description: string; due_at?: string }) {
  return apiFetch<any>(`/api/classrooms/${classroomId}/assignments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// AI Assistant API
export async function askAiAssistant(question: string, context?: string, mode: 'hint' | 'explain' | 'debug' | 'concept' = 'hint') {
  return apiFetch<{ answer: string }>('/api/ai/assist', {
    method: 'POST',
    body: JSON.stringify({ question, context, mode }),
  });
}
