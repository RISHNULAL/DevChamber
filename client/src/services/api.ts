const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function getStoredToken(): string | null {
  return localStorage.getItem('dc-token');
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem('dc-token', token);
  } else {
    localStorage.removeItem('dc-token');
  }
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  // Fallback demo headers if no JWT is stored
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

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders,
        ...(options.headers || {}),
      },
    });
  } catch (_netErr) {
    throw new Error('Authentication service unavailable. Please check backend connection.');
  }

  if (!response.ok) {
    let errorMsg = response.status === 503 ? 'Database connection unavailable' : `HTTP Error ${response.status}`;
    try {
      const err = await response.json();
      if (err && typeof err === 'object') {
        if (typeof err.error === 'string' && err.error) {
          errorMsg = err.error;
        } else if (typeof err.message === 'string' && err.message) {
          errorMsg = err.message;
        }
      }
    } catch {
      // Use fallback errorMsg
    }
    throw new Error(errorMsg);
  }

  return response.json() as Promise<T>;
}

// Authentication API
export async function apiSignup(data: { fullName: string; email: string; password: string; role?: string }) {
  const res = await apiFetch<{ user: any; token: string }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (res.token) {
    setStoredToken(res.token);
  }
  return res;
}

export async function apiLogin(data: { email: string; password: string }) {
  const res = await apiFetch<{ user: any; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (res.token) {
    setStoredToken(res.token);
  }
  return res;
}

export async function apiGetMe() {
  return apiFetch<{ user: any }>('/api/auth/me');
}

export async function apiLogout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore error on logout
  } finally {
    setStoredToken(null);
  }
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
export async function fetchPersonalWorkspace() {
  return apiFetch<any>(`/api/workspaces/personal`);
}

export async function fetchSharedWorkspaces() {
  return apiFetch<any[]>(`/api/workspaces/shared`);
}

export async function searchClassmateUsers(query: string) {
  return apiFetch<any[]>(`/api/users/search?q=${encodeURIComponent(query)}`);
}

export async function shareWorkspaceWithUser(workspaceId: string, userId: string, permission: 'editor' | 'viewer') {
  return apiFetch<any>(`/api/workspaces/${workspaceId}/share`, {
    method: 'POST',
    body: JSON.stringify({ userId, permission }),
  });
}

export async function fetchClassroomStudents(classroomId: string) {
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/students`);
}

export async function fetchMyWorkspace(classroomId?: string) {
  if (!classroomId) {
    return fetchPersonalWorkspace();
  }
  return apiFetch<any>(`/api/classrooms/${classroomId}/workspace`);
}

export async function fetchClassroomWorkspaces(classroomId: string) {
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/workspaces`);
}

export async function fetchWorkspaceById(workspaceId: string) {
  return apiFetch<any>(`/api/workspaces/${workspaceId}`);
}

export async function saveWorkspaceFile(workspaceId: string, name: string, content: string) {
  return apiFetch<any>(`/api/workspaces/${workspaceId}/file`, {
    method: 'PUT',
    body: JSON.stringify({ name, content }),
  });
}

export async function deleteWorkspaceFile(workspaceId: string, name: string) {
  return apiFetch<any>(`/api/workspaces/${workspaceId}/file/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export async function grantWorkspacePermission(workspaceId: string, userId: string, permission: 'editor' | 'viewer') {
  return apiFetch<any>(`/api/workspaces/${workspaceId}/permission`, {
    method: 'PUT',
    body: JSON.stringify({ userId, permission }),
  });
}

export async function revokeWorkspacePermission(workspaceId: string, userId: string) {
  return apiFetch<any>(`/api/workspaces/${workspaceId}/permission/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
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

// Chat & Messages API
export async function fetchClassroomMessages(classroomId: string, limit: number = 50, before?: string) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (before) q.append('before', before);
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/messages?${q.toString()}`);
}

export async function sendClassroomMessage(classroomId: string, text: string, replyTo?: any) {
  return apiFetch<any>(`/api/classrooms/${classroomId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text, replyTo }),
  });
}

export async function fetchWorkspaceMessages(workspaceId: string, limit: number = 50, before?: string) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (before) q.append('before', before);
  return apiFetch<any[]>(`/api/workspaces/${workspaceId}/messages?${q.toString()}`);
}

export async function sendWorkspaceMessage(workspaceId: string, text: string, replyTo?: any) {
  return apiFetch<any>(`/api/workspaces/${workspaceId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text, replyTo }),
  });
}

// Code Execution API
export async function runPythonCode(code: string) {
  return apiFetch<{ stdout: string; stderr: string; exitCode: number; executionTimeMs?: number }>('/api/code/run', {
    method: 'POST',
    body: JSON.stringify({ language: 'python', code }),
  });
}

// Sessions API
export async function fetchClassroomSessions(classroomId: string) {
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/sessions`);
}

export async function createClassSession(classroomId: string, data: any) {
  return apiFetch<any>(`/api/classrooms/${classroomId}/sessions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSessionStatus(sessionId: string, status: 'draft' | 'scheduled' | 'live' | 'completed' | 'cancelled') {
  return apiFetch<any>(`/api/sessions/${sessionId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteClassSession(sessionId: string) {
  return apiFetch<any>(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

// Resources API
export async function fetchResources(classroomId: string) {
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/resources`);
}

export async function createResource(classroomId: string, data: any) {
  return apiFetch<any>(`/api/classrooms/${classroomId}/resources`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateResourceStatus(resourceId: string, status: 'draft' | 'published') {
  return apiFetch<any>(`/api/resources/${resourceId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteResource(resourceId: string) {
  return apiFetch<any>(`/api/resources/${resourceId}`, {
    method: 'DELETE',
  });
}

// Assignments API
export async function fetchAssignments(classroomId: string) {
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/assignments`);
}

export async function createAssignment(classroomId: string, data: any) {
  return apiFetch<any>(`/api/classrooms/${classroomId}/assignments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAssignmentStatus(assignmentId: string, status: 'draft' | 'published' | 'closed') {
  return apiFetch<any>(`/api/assignments/${assignmentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function openAssignmentWorkspace(assignmentId: string) {
  return apiFetch<any>(`/api/assignments/${assignmentId}/open-workspace`, {
    method: 'POST',
  });
}

export async function submitAssignment(assignmentId: string) {
  return apiFetch<any>(`/api/assignments/${assignmentId}/submit`, {
    method: 'POST',
  });
}

export async function fetchAssignmentSubmissions(assignmentId: string) {
  return apiFetch<any[]>(`/api/assignments/${assignmentId}/submissions`);
}

export async function gradeAssignmentSubmission(assignmentId: string, studentId: string, marks: number, feedback?: string) {
  return apiFetch<any>(`/api/assignments/${assignmentId}/submissions/${studentId}/grade`, {
    method: 'POST',
    body: JSON.stringify({ marks, feedback }),
  });
}

// Assessments API
export async function fetchAssessments(classroomId: string) {
  return apiFetch<any[]>(`/api/classrooms/${classroomId}/assessments`);
}

export async function createAssessment(classroomId: string, data: any) {
  return apiFetch<any>(`/api/classrooms/${classroomId}/assessments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAssessmentStatus(assessmentId: string, status: 'draft' | 'published' | 'active' | 'ended') {
  return apiFetch<any>(`/api/assessments/${assessmentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function addAssessmentQuestion(assessmentId: string, data: any) {
  return apiFetch<any>(`/api/assessments/${assessmentId}/questions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteAssessmentQuestion(questionId: string) {
  return apiFetch<any>(`/api/questions/${questionId}`, {
    method: 'DELETE',
  });
}

export async function submitAssessment(assessmentId: string, answers: Record<string, any>, timeTakenSeconds?: number) {
  return apiFetch<any>(`/api/assessments/${assessmentId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers, timeTakenSeconds }),
  });
}

export async function fetchAssessmentSubmissions(assessmentId: string) {
  return apiFetch<any>(`/api/assessments/${assessmentId}/submissions`);
}

// Analytics API
export async function fetchClassroomAnalytics(classroomId: string) {
  return apiFetch<any>(`/api/classrooms/${classroomId}/analytics`);
}

// User Profile & Stats API
export async function fetchUserProfileStats() {
  return apiFetch<{
    user: {
      id: string;
      full_name: string;
      email: string;
      role: 'teacher' | 'student' | 'admin';
      created_at?: string;
    };
    stats: {
      classrooms_count: number;
      workspaces_count?: number;
      students_count?: number;
      assignments_completed?: number;
      assignments_created?: number;
      assessments_completed?: number;
      assessments_created?: number;
      sessions_count?: number;
    };
  }>('/api/users/profile-stats');
}

export async function updateUserProfile(fullName: string) {
  return apiFetch<{ success: boolean; message: string }>('/api/users/profile', {
    method: 'PUT',
    body: JSON.stringify({ full_name: fullName }),
  });
}

// AI Assistant API
export async function askAiAssistant(
  question: string,
  context?: string,
  mode: 'hint' | 'explain' | 'debug' | 'concept' | 'summary' | 'practice' = 'hint',
  extra?: { language?: string; errorMessage?: string }
) {
  return apiFetch<{ answer: string }>('/api/ai/assist', {
    method: 'POST',
    body: JSON.stringify({
      question,
      context,
      mode,
      language: extra?.language,
      errorMessage: extra?.errorMessage,
    }),
  });
}


