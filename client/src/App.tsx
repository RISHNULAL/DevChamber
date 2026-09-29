import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Download,
  FileCode2,
  FilePlus2,
  Folder,
  GraduationCap,
  LayoutDashboard,
  Lock,
  LogOut,
  Maximize2,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MonitorOff,
  PhoneOff,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  User as UserIcon,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import {
  MyProfileModal,
  AccountSettingsModal,
  NotificationsModal,
} from './components/profile/ProfileModals.js';

import { ChatPanel } from './components/chat/ChatPanel.js';

import {
  apiLogin,
  apiSignup,
  apiGetMe,
  apiLogout,
  getStoredToken,
  fetchClassrooms,
  createClassroom as apiCreateClassroom,
  joinClassroomByCode as apiJoinClassroom,
  fetchClassroomStudents,
  fetchPersonalWorkspace,
  fetchSharedWorkspaces,
  searchClassmateUsers,
  fetchMyWorkspace,
  fetchClassroomWorkspaces,
  fetchWorkspaceById,
  saveWorkspaceFile,
  deleteWorkspaceFile,
  grantWorkspacePermission,
  revokeWorkspacePermission,
  takeWorkspaceControl,
  runPythonCode,
  fetchClassroomSessions,
  createClassSession,
  updateSessionStatus,
  deleteClassSession,
  fetchResources,
  createResource as apiCreateResource,
  updateResourceStatus,
  deleteResource as apiDeleteResource,
  fetchAssignments,
  createAssignment as apiCreateAssignment,
  updateAssignmentStatus,
  openAssignmentWorkspace,
  submitAssignment as apiSubmitAssignment,
  fetchAssignmentSubmissions,
  gradeAssignmentSubmission,
  fetchAssessments,
  createAssessment as apiCreateAssessment,
  updateAssessmentStatus,
  addAssessmentQuestion,
  deleteAssessmentQuestion,
  submitAssessment as apiSubmitAssessment,
  fetchAssessmentSubmissions,
  askAiAssistant,
} from './services/api';

import { getSocket, disconnectSocket } from './services/socket';
import { videoClassroomManager, ParticipantMediaState } from './services/webrtc';
import { DevChamberLogo } from './components/DevChamberLogo';
import { createYjsSession, YjsSession, getUserColor } from './services/yjsCollab';

// Learning Components & Modals
import { SessionsView } from './components/learning/SessionsView';
import { ResourcesView } from './components/learning/ResourcesView';
import { AssignmentsView } from './components/learning/AssignmentsView';
import { AssessmentsView } from './components/learning/AssessmentsView';
import { AnalyticsView } from './components/learning/AnalyticsView';
import {
  CreateSessionModal,
  CreateResourceModal,
  CreateAssignmentModal,
  CreateAssessmentModal,
  QuestionBuilderModal,
  QuizRunnerModal,
  AssignmentReviewDrawer,
} from './components/learning/LearningModals';

type Page = 'Home' | 'Classroom' | 'Sessions' | 'Students' | 'Workspaces' | 'Workspace' | 'Resources' | 'Assignments' | 'Assessments' | 'Analytics';
type Role = 'Teacher' | 'Student';

interface WorkspaceFile {
  id?: string;
  name: string;
  language: string;
  content: string;
  updated_at?: string;
}

interface SharedUser {
  userId: string;
  name: string;
  email: string;
  permission: 'owner' | 'editor' | 'viewer';
}

interface ClassroomItem {
  id: string;
  name: string;
  subject: string;
  description: string;
  batch: string;
  join_code: string;
  is_live?: boolean;
  role?: string;
}

interface ChatMsg {
  id: string;
  classroom_id: string;
  user_id: string;
  name: string;
  role: string;
  text: string;
  created_at: string;
}

const starterCode = `def binary_search(values, target):
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

const seedFiles: WorkspaceFile[] = [
  { name: 'main.py', language: 'python', content: starterCode },
  { name: 'notes.md', language: 'markdown', content: '# Binary Search Notes\n\n- Time Complexity: O(log n)\n- Auxiliary Space: O(1)\n- Invariant: elements must be sorted.' },
];

export default function App() {
  const [page, setPage] = useState<Page>('Home');
  const [role, setRole] = useState<Role>(() => (localStorage.getItem('dc-role') as Role) || 'Teacher');
  const [name, setName] = useState(() => localStorage.getItem('dc-name') || 'Alex Morgan');
  const [userId, setUserId] = useState(() => localStorage.getItem('dc-user-id') || 'teacher-alex-uuid-000000000001');
  const [email, setEmail] = useState(() => localStorage.getItem('dc-email') || 'alex.morgan@devchamber.edu');
  const [signedIn, setSignedIn] = useState(() => Boolean(localStorage.getItem('dc-session') && getStoredToken()));
  const [authChecking, setAuthChecking] = useState(() => Boolean(getStoredToken()));
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [modal, setModal] = useState('');
  const [toast, setToast] = useState('');

  // Dropdown States & Refs
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [classroomDropdownOpen, setClassroomDropdownOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const classroomMenuRef = useRef<HTMLDivElement>(null);

  // Classroom state
  const [classrooms, setClassrooms] = useState<ClassroomItem[]>([]);
  const [activeClassroom, setActiveClassroom] = useState<ClassroomItem>({
    id: 'class-ds-s5-cse-000000000001',
    name: 'Data Structures',
    subject: 'Computer Science',
    description: 'Algorithms, data structures, and problem solving.',
    batch: 'S5 CSE',
    join_code: 'DS5CSE',
    is_live: false,
  });

  const [live, setLive] = useState(false);

  // Roster & Chat
  const [participants, setParticipants] = useState<Array<{ socketId: string; userId: string; name: string; role: string }>>([
    { socketId: 's1', userId: 'teacher-alex-uuid-000000000001', name: 'Alex Morgan', role: 'teacher' },
    { socketId: 's2', userId: 'student-jordan-uuid-000000000002', name: 'Jordan Lee', role: 'student' },
    { socketId: 's3', userId: 'student-maya-uuid-000000000003', name: 'Maya Chen', role: 'student' },
  ]);
  const [classroomStudents, setClassroomStudents] = useState<Array<{ userId: string; name: string; email: string }>>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatDraft, setChatDraft] = useState('');

  // Workspace & Collaboration
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState('ws-personal');
  const [workspaceTitle, setWorkspaceTitle] = useState("My Workspace");
  const [workspaceType, setWorkspaceType] = useState<'personal' | 'shared' | 'classroom'>('personal');
  const [workspaceOwnerId, setWorkspaceOwnerId] = useState('student-jordan-uuid-000000000002');
  const [workspaceOwnerName, setWorkspaceOwnerName] = useState('Jordan Lee');
  const [workspaceMyPermission, setWorkspaceMyPermission] = useState<'owner' | 'editor' | 'viewer'>('owner');
  const [workspaceSharedWith, setWorkspaceSharedWith] = useState<SharedUser[]>([]);
  const [_workspacePermissions, setWorkspacePermissions] = useState<Record<string, 'owner' | 'editor' | 'viewer'>>({});
  const [files, setFiles] = useState<WorkspaceFile[]>(seedFiles);
  const [activeFileName, setActiveFileName] = useState('main.py');
  const [code, setCode] = useState(starterCode);
  const [output, setOutput] = useState('Your program output will appear here.');
  const [running, setRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'unsaved'>('saved');
  const autoSaveTimerRef = useRef<any>(null);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { userId: string; userName: string; line: number; col: number; color: string }>>({});
  const [activeController, setActiveController] = useState<string | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<any[]>([]);
  const [sharedWorkspaces, setSharedWorkspaces] = useState<any[]>([]);
  const [collaborators, setCollaborators] = useState<any[]>([]);

  // Workspace Access Modal state
  const [accessModalWs, setAccessModalWs] = useState<any | null>(null);

  // Learning System States
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [resourcesList, setResourcesList] = useState<any[]>([]);
  const [assignmentsList, setAssignmentsList] = useState<any[]>([]);
  const [assessmentsList, setAssessmentsList] = useState<any[]>([]);

  // Modal & Selection States for Learning System
  const [selectedAssignmentForReview, setSelectedAssignmentForReview] = useState<any | null>(null);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<any[]>([]);
  const [selectedAssessmentForBuilder, setSelectedAssessmentForBuilder] = useState<any | null>(null);
  const [selectedAssessmentForQuiz, setSelectedAssessmentForQuiz] = useState<any | null>(null);
  const [selectedAssessmentForResults, setSelectedAssessmentForResults] = useState<any | null>(null);
  const [assessmentSubmissionsList, setAssessmentSubmissionsList] = useState<any[]>([]);

  // AI Assistant
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<Array<{ id: string; role: 'user' | 'assistant' | 'error'; text: string; question?: string }>>([]);

  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');

  // Check JWT session on mount
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      const token = getStoredToken();
      if (!token) {
        if (mounted) {
          setSignedIn(false);
          setAuthChecking(false);
        }
        return;
      }

      try {
        const res = await apiGetMe();
        if (res?.user && mounted) {
          const user = res.user;
          const userRole = user.role || 'student';
          const userName = user.full_name || (userRole === 'teacher' ? 'Alex Morgan' : 'Jordan Lee');
          const finalRole: Role = userRole === 'teacher' || userRole === 'admin' ? 'Teacher' : 'Student';
          const userEmail = user.email || (finalRole === 'Teacher' ? 'alex.morgan@devchamber.edu' : 'jordan.lee@devchamber.edu');

          setUserId(user.id);
          setName(userName);
          setRole(finalRole);
          setEmail(userEmail);
          setSignedIn(true);
          localStorage.setItem('dc-session', 'active');
          localStorage.setItem('dc-email', userEmail);
        } else if (mounted) {
          setSignedIn(false);
          localStorage.removeItem('dc-session');
        }
      } catch (err) {
        console.warn('[DevChamber Auth] Session init error:', err);
        if (mounted) {
          setSignedIn(false);
          localStorage.removeItem('dc-session');
        }
      } finally {
        if (mounted) {
          setAuthChecking(false);
        }
      }
    }

    initSession();

    return () => {
      mounted = false;
    };
  }, []);

  // Save session state to localStorage
  useEffect(() => {
    localStorage.setItem('dc-role', role);
    localStorage.setItem('dc-name', name);
    localStorage.setItem('dc-user-id', userId);
    localStorage.setItem('dc-email', email);
  }, [role, name, userId, email]);

  // Click outside listeners for profile & classroom dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (classroomMenuRef.current && !classroomMenuRef.current.contains(event.target as Node)) {
        setClassroomDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load classrooms on sign in
  useEffect(() => {
    if (!signedIn) return;

    let mounted = true;
    async function loadData() {
      try {
        const list = await fetchClassrooms();
        if (mounted && list.length > 0) {
          setClassrooms(list);
          setActiveClassroom(list[0]);
        }
      } catch (e) {
        console.warn('Could not load classrooms:', e);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [signedIn]);

  // Load classroom sessions, resources, assignments, assessments, students, and workspaces
  useEffect(() => {
    if (!signedIn || !activeClassroom?.id) return;
    let mounted = true;

    async function loadClassDetails() {
      try {
        const [wsList, sessList, asmList, resList, asgList, stdList] = await Promise.all([
          fetchClassroomWorkspaces(activeClassroom.id).catch(() => []),
          fetchClassroomSessions(activeClassroom.id).catch(() => []),
          fetchAssessments(activeClassroom.id).catch(() => []),
          fetchResources(activeClassroom.id).catch(() => []),
          fetchAssignments(activeClassroom.id).catch(() => []),
          fetchClassroomStudents(activeClassroom.id).catch(() => []),
        ]);

        if (mounted) {
          setAllWorkspaces(wsList);
          setSessionsList(sessList);
          setAssessmentsList(asmList);
          setResourcesList(resList);
          setAssignmentsList(asgList);
          setClassroomStudents(stdList);

          // Select current workspace if needed
          if (role === 'Student') {
            const myWs = wsList.find((w: any) => w.owner_id === userId);
            if (myWs) {
              setCurrentWorkspaceId(myWs.id);
              setWorkspaceTitle(myWs.title);
              setWorkspaceOwnerId(myWs.owner_id);
              setWorkspaceOwnerName(myWs.owner_name || name);
              setWorkspaceMyPermission(myWs.myPermission || 'owner');
              setWorkspaceSharedWith(myWs.sharedWith || []);
              setWorkspacePermissions(myWs.permissions || {});
              if (myWs.files && myWs.files.length > 0) {
                setFiles(myWs.files);
                setActiveFileName(myWs.files[0].name);
                setCode(myWs.files[0].content);
              }
            }
          } else if (wsList.length > 0) {
            const firstWs = wsList[0];
            setCurrentWorkspaceId(firstWs.id);
            setWorkspaceTitle(firstWs.title);
            setWorkspaceOwnerId(firstWs.owner_id);
            setWorkspaceOwnerName(firstWs.owner_name || 'Student');
            setWorkspaceMyPermission('editor');
            setWorkspaceSharedWith(firstWs.sharedWith || []);
            setWorkspacePermissions(firstWs.permissions || {});
            if (firstWs.files && firstWs.files.length > 0) {
              setFiles(firstWs.files);
              setActiveFileName(firstWs.files[0].name);
              setCode(firstWs.files[0].content);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load classroom details:', err);
      }
    }

    loadClassDetails();
    return () => {
      mounted = false;
    };
  }, [signedIn, activeClassroom.id, role, userId, name]);

  // Socket.IO Setup
  useEffect(() => {
    if (!signedIn) return;

    const socket = getSocket();

    socket.emit('classroom:join', {
      classroomId: activeClassroom.id,
      name,
    });

    socket.emit('workspace:join', {
      workspaceId: currentWorkspaceId,
      classroomId: activeClassroom.id,
    });

    socket.on('classroom:roster', (roster: any[]) => {
      setParticipants(roster);
    });

    socket.on('classroom:user-online', (user: any) => {
      setParticipants((prev) => {
        const filtered = prev.filter((p) => p.userId !== user.userId && p.socketId !== user.socketId);
        return [...filtered, user];
      });
    });

    socket.on('classroom:user-offline', ({ userId: offId }: any) => {
      setParticipants((prev) => prev.filter((p) => p.userId !== offId));
    });

    socket.on('classroom:session-state', ({ isLive }: { isLive: boolean }) => {
      setLive(isLive);
    });

    socket.on('chat:history', (messages: ChatMsg[]) => {
      setChat(messages);
    });

    socket.on('chat:message', (msg: ChatMsg) => {
      setChat((prev) => [...prev, msg]);
    });

    socket.on('workspace:presence', (collabs: any[]) => {
      setCollaborators(collabs);
    });

    socket.on('workspace:edit', ({ fileName, content, userId: editorUserId }: any) => {
      if (editorUserId !== userId) {
        if (fileName === activeFileName) {
          setCode(content);
        }
        setFiles((prev) =>
          prev.map((f) => (f.name === fileName ? { ...f, content } : f))
        );
      }
    });

    socket.on('workspace:cursor', ({ userId: cUserId, userName: cUserName, cursor }: any) => {
      if (cUserId !== userId && cursor) {
        setRemoteCursors((prev) => ({
          ...prev,
          [cUserId]: {
            userId: cUserId,
            userName: cUserName,
            line: cursor.lineNumber || cursor.line || 1,
            col: cursor.column || cursor.col || 1,
            color: '#10b981',
          },
        }));
      }
    });

    socket.on('workspace:file-sync', async ({ workspaceId: wsId, fileName: syncedFn, action, userId: actUserId }: any) => {
      if (currentWorkspaceId === wsId && actUserId !== userId) {
        try {
          const updatedWs = await fetchWorkspaceById(wsId);
          setFiles(updatedWs.files);
          if (action === 'created') {
            setToast(`Collaborator created "${syncedFn}"`);
          } else if (action === 'deleted') {
            setToast(`Collaborator deleted "${syncedFn}"`);
            if (activeFileName === syncedFn && updatedWs.files.length > 0) {
              setActiveFileName(updatedWs.files[0].name);
              setCode(updatedWs.files[0].content);
            }
          }
        } catch {}
      }
    });

    socket.on('workspace:take-control', ({ isControlled, teacherName }: any) => {
      setActiveController(isControlled ? teacherName || 'Instructor' : null);
      if (isControlled) {
        setToast(`👨‍🏫 Instructor Assistance: ${teacherName || 'Instructor'} is now editing this workspace.`);
      } else {
        setToast('Instructor released control of this workspace.');
      }
    });

    socket.on('workspace:permission-update', async ({ workspaceId: wsId, targetUserId, permission, action, ownerName, updatedBy }: any) => {
      if (targetUserId === userId) {
        if (action === 'granted') {
          setToast(`🎉 Access Granted: You were granted ${permission} access to ${ownerName}'s workspace by ${updatedBy}.`);
        } else if (action === 'revoked') {
          setToast(`⚠️ Access Revoked: Your access to ${ownerName}'s workspace was revoked.`);
          if (currentWorkspaceId === wsId) {
            // Gracefully return to personal workspace
            try {
              const personalWs = await fetchPersonalWorkspace();
              openWorkspace(personalWs);
            } catch {
              setPage('Home');
            }
          }
        }
      }
      // Refresh workspaces & shared workspaces
      fetchClassroomWorkspaces(activeClassroom.id).then(setAllWorkspaces).catch(() => {});
      fetchSharedWorkspaces().then(setSharedWorkspaces).catch(() => {});
    });

    return () => {
      socket.off('classroom:roster');
      socket.off('classroom:user-online');
      socket.off('classroom:user-offline');
      socket.off('classroom:session-state');
      socket.off('chat:history');
      socket.off('chat:message');
      socket.off('workspace:presence');
      socket.off('workspace:edit');
      socket.off('workspace:cursor');
      socket.off('workspace:file-sync');
      socket.off('workspace:take-control');
      socket.off('workspace:permission-update');
    };
  }, [signedIn, activeClassroom.id, currentWorkspaceId, activeFileName, userId, name]);

  const isReadOnly = useMemo(() => {
    if (role === 'Teacher') return false;
    if (workspaceOwnerId === userId) return false;
    return workspaceMyPermission === 'viewer';
  }, [role, workspaceOwnerId, userId, workspaceMyPermission]);

  // Global keyboard shortcut for saving files (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentWorkspaceId, activeFileName, code, isReadOnly]);

  const openWorkspace = async (ws: any) => {
    try {
      const fullWs = await fetchWorkspaceById(ws.id);
      setCurrentWorkspaceId(fullWs.id);
      setWorkspaceTitle(fullWs.title || `${fullWs.owner_name}'s Workspace`);
      setWorkspaceType(fullWs.workspaceType || (fullWs.owner_id === userId ? 'personal' : 'shared'));
      setWorkspaceOwnerId(fullWs.owner_id);
      setWorkspaceOwnerName(fullWs.owner_name || 'Student');
      setWorkspaceMyPermission(fullWs.myPermission || (fullWs.owner_id === userId ? 'owner' : 'viewer'));
      setWorkspaceSharedWith(fullWs.sharedWith || []);
      setWorkspacePermissions(fullWs.permissions || {});
      setActiveController(fullWs.active_controller_name || null);
      setSaveStatus('saved');

      if (fullWs.files && fullWs.files.length > 0) {
        setFiles(fullWs.files);
        setActiveFileName(fullWs.files[0].name);
        setCode(fullWs.files[0].content);
      }
      setPage('Workspace');

      const socket = getSocket();
      socket.emit('workspace:join', {
        workspaceId: fullWs.id,
        classroomId: activeClassroom.id,
      });
    } catch (err: any) {
      setToast(err?.message || 'Cannot open workspace.');
    }
  };

  const openPersonalWorkspace = async () => {
    try {
      const pWs = await fetchPersonalWorkspace();
      openWorkspace(pWs);
    } catch (err: any) {
      setToast(err?.message || 'Could not load personal workspace.');
      setPage('Workspace');
    }
  };

  const handleCodeChange = (val: string | undefined) => {
    const nextCode = val || '';
    setCode(nextCode);
    setSaveStatus('unsaved');
    setFiles((prev) =>
      prev.map((f) => (f.name === activeFileName ? { ...f, content: nextCode } : f))
    );

    const socket = getSocket();
    socket.emit('workspace:edit', {
      workspaceId: currentWorkspaceId,
      fileName: activeFileName,
      content: nextCode,
    });

    // Debounced Auto-Save to MongoDB
    if (!isReadOnly) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setSaveStatus('saving');
      autoSaveTimerRef.current = setTimeout(async () => {
        try {
          await saveWorkspaceFile(currentWorkspaceId, activeFileName, nextCode);
          setSaveStatus('saved');
        } catch {
          setSaveStatus('error');
        }
      }, 750);
    }
  };

  const handleCursorChange = (cursorPosition: any) => {
    const socket = getSocket();
    socket.emit('workspace:cursor', {
      workspaceId: currentWorkspaceId,
      cursor: cursorPosition,
    });
  };

  const handleSaveFile = async () => {
    if (isReadOnly) {
      setToast('Cannot save in read-only Viewer mode.');
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      await saveWorkspaceFile(currentWorkspaceId, activeFileName, code);
      setSaveStatus('saved');
      setToast(`✓ Saved ${activeFileName} to MongoDB.`);
    } catch (err: any) {
      setSaveStatus('error');
      setToast(err?.message || 'Failed to save file.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFile = async () => {
    if (isReadOnly) {
      setToast('Cannot add files in read-only Viewer mode.');
      return;
    }
    const fn = prompt('Enter new file name (e.g. solution.py, notes.md, utils.py):');
    if (!fn) return;
    const cleanName = fn.trim();
    if (!cleanName) return;

    const ext = cleanName.split('.').pop() || '';
    const lang = ext === 'py' ? 'python' : ext === 'md' ? 'markdown' : ext === 'js' ? 'javascript' : 'plaintext';

    const newFile: WorkspaceFile = { name: cleanName, language: lang, content: '' };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileName(cleanName);
    setCode('');

    try {
      await saveWorkspaceFile(currentWorkspaceId, cleanName, '');
      setToast(`Created ${cleanName}`);
      const socket = getSocket();
      socket.emit('workspace:file-sync', { workspaceId: currentWorkspaceId, fileName: cleanName, action: 'created' });
    } catch (err: any) {
      setToast(err?.message || 'Failed to create file on server.');
    }
  };

  const handleDeleteFile = async (fileName: string) => {
    if (isReadOnly) {
      setToast('Cannot delete files in read-only Viewer mode.');
      return;
    }
    if (files.length <= 1) {
      setToast('Cannot delete the only file in the workspace.');
      return;
    }
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;

    try {
      await deleteWorkspaceFile(currentWorkspaceId, fileName);
      const remaining = files.filter((f) => f.name !== fileName);
      setFiles(remaining);
      if (activeFileName === fileName) {
        setActiveFileName(remaining[0].name);
        setCode(remaining[0].content);
      }
      setToast(`Deleted ${fileName}`);
      const socket = getSocket();
      socket.emit('workspace:file-sync', { workspaceId: currentWorkspaceId, fileName, action: 'deleted' });
    } catch (err: any) {
      setToast(err?.message || 'Failed to delete file.');
    }
  };

  const handleRunCode = async () => {
    setRunning(true);
    setOutput('Executing code in isolated Python sandbox...');
    try {
      const res = await runPythonCode(code);
      let out = res.stdout || '';
      if (res.stderr) {
        out += (out ? '\n' : '') + res.stderr;
      }
      if (!out) {
        out = '(Program executed successfully with no output)';
      }
      if (res.executionTimeMs) {
        out += `\n\n[Execution completed in ${res.executionTimeMs}ms · Exit code: ${res.exitCode}]`;
      }
      setOutput(out);
    } catch (err: any) {
      setOutput(`Error running code: ${err?.message || 'Execution failed'}`);
    } finally {
      setRunning(false);
    }
  };

  const handleTakeControl = async () => {
    const isCurrentlyControlled = Boolean(activeController);
    try {
      await takeWorkspaceControl(currentWorkspaceId, !isCurrentlyControlled);
      const socket = getSocket();
      socket.emit('workspace:take-control', {
        workspaceId: currentWorkspaceId,
        classroomId: activeClassroom.id,
        isControlled: !isCurrentlyControlled,
        teacherName: name,
      });
      setActiveController(!isCurrentlyControlled ? name : null);
      setToast(!isCurrentlyControlled ? 'You have taken active control of this workspace.' : 'Released control of workspace.');
    } catch (err: any) {
      setToast(err?.message || 'Failed to toggle control.');
    }
  };

  const handleGrantAccess = async (targetStudentId: string, permission: 'editor' | 'viewer') => {
    try {
      const targetWsId = accessModalWs?.id || currentWorkspaceId;
      await grantWorkspacePermission(targetWsId, targetStudentId, permission);
      const targetStudent = classroomStudents.find((s) => s.userId === targetStudentId);

      const socket = getSocket();
      socket.emit('workspace:permission-update', {
        workspaceId: targetWsId,
        classroomId: activeClassroom.id,
        targetUserId: targetStudentId,
        permission,
        action: 'granted',
        ownerName: accessModalWs?.owner_name || workspaceOwnerName,
      });

      setToast(`Granted ${permission} access to ${targetStudent?.name || 'student'}.`);

      // Refresh workspace data
      const updated = await fetchWorkspaceById(targetWsId);
      if (accessModalWs?.id === targetWsId) {
        setAccessModalWs(updated);
      }
      if (currentWorkspaceId === targetWsId) {
        setWorkspaceSharedWith(updated.sharedWith);
        setWorkspacePermissions(updated.permissions);
      }
      fetchClassroomWorkspaces(activeClassroom.id).then(setAllWorkspaces);
    } catch (err: any) {
      setToast(err?.message || 'Failed to grant permission.');
    }
  };

  const handleRevokeAccess = async (targetStudentId: string) => {
    try {
      const targetWsId = accessModalWs?.id || currentWorkspaceId;
      await revokeWorkspacePermission(targetWsId, targetStudentId);
      const targetStudent = classroomStudents.find((s) => s.userId === targetStudentId);

      const socket = getSocket();
      socket.emit('workspace:permission-update', {
        workspaceId: targetWsId,
        classroomId: activeClassroom.id,
        targetUserId: targetStudentId,
        action: 'revoked',
        ownerName: accessModalWs?.owner_name || workspaceOwnerName,
      });

      setToast(`Revoked access for ${targetStudent?.name || 'student'}.`);

      // Refresh workspace data
      const updated = await fetchWorkspaceById(targetWsId);
      if (accessModalWs?.id === targetWsId) {
        setAccessModalWs(updated);
      }
      if (currentWorkspaceId === targetWsId) {
        setWorkspaceSharedWith(updated.sharedWith);
        setWorkspacePermissions(updated.permissions);
      }
      fetchClassroomWorkspaces(activeClassroom.id).then(setAllWorkspaces);
    } catch (err: any) {
      setToast(err?.message || 'Failed to revoke permission.');
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim()) return;

    const socket = getSocket();
    socket.emit('chat:message', {
      classroomId: activeClassroom.id,
      text: chatDraft.trim(),
      name,
    });
    setChatDraft('');
  };

  const toggleLiveSession = async () => {
    const nextLive = !live;
    setLive(nextLive);
    const socket = getSocket();
    socket.emit('classroom:session-state', {
      classroomId: activeClassroom.id,
      isLive: nextLive,
    });
    setToast(nextLive ? '🔴 Live classroom broadcast started.' : 'Live classroom session ended.');
  };

  const handleAiAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim() || aiLoading) return;
    const q = aiQuestion.trim();
    setAiQuestion('');
    setAiLoading(true);

    const userMsgId = `msg-${Date.now()}`;
    setAiMessages((prev) => [...prev, { id: userMsgId, role: 'user', text: q }]);

    try {
      const res = await askAiAssistant(q, code, 'hint', { language: 'python' });
      setAiMessages((prev) => [
        ...prev,
        { id: `ai-${Date.now()}`, role: 'assistant', text: res.answer, question: q },
      ]);
    } catch (err: any) {
      setAiMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'error', text: err?.message || 'AI assistant unavailable.' },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // Learning System Action Handlers
  const handleCreateSession = async (data: any) => {
    const created = await createClassSession(activeClassroom.id, data);
    setSessionsList((prev) => [created, ...prev]);
    setToast(`Session "${created.title}" scheduled!`);
  };

  const handleStartLiveSession = async (session: any) => {
    try {
      await updateSessionStatus(session.id, 'live');
      setSessionsList((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, status: 'live', isLive: true, is_live: true } : s))
      );
    } catch {
      // Proceed even if status update has minor warning
    }
    setLive(true);
    const socket = getSocket();
    socket.emit('classroom:session-state', {
      classroomId: activeClassroom.id,
      isLive: true,
    });
    setPage('Classroom');
    setToast(`🔴 Live Class "${session.title}" started!`);
  };

  const handleEndLiveSession = async (sessionId: string) => {
    try {
      await updateSessionStatus(sessionId, 'completed');
      setSessionsList((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'completed', isLive: false, is_live: false } : s))
      );
    } catch {
      // Proceed
    }
    setLive(false);
    const socket = getSocket();
    socket.emit('classroom:session-state', {
      classroomId: activeClassroom.id,
      isLive: false,
    });
    setToast('Class session completed.');
  };

  const handleJoinLiveClass = (session: any) => {
    setPage('Classroom');
    setToast(`Joined live class "${session.title}"`);
  };

  const handlePublishSession = async (sessionId: string) => {
    await updateSessionStatus(sessionId, 'scheduled');
    setSessionsList((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: 'scheduled' } : s))
    );
    setToast('Session published to students.');
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteClassSession(sessionId);
    setSessionsList((prev) => prev.filter((s) => s.id !== sessionId));
    setToast('Session deleted.');
  };

  const handleCreateResource = async (data: any) => {
    const created = await apiCreateResource(activeClassroom.id, data);
    setResourcesList((prev) => [created, ...prev]);
    setToast(`Resource "${created.title}" added!`);
  };

  const handleToggleResourceStatus = async (resourceId: string, status: 'draft' | 'published') => {
    await updateResourceStatus(resourceId, status);
    setResourcesList((prev) =>
      prev.map((r) => (r.id === resourceId ? { ...r, status, is_published: status === 'published', isPublished: status === 'published' } : r))
    );
    setToast(`Resource is now ${status === 'published' ? 'Published' : 'Hidden as Draft'}.`);
  };

  const handleDeleteResource = async (resourceId: string) => {
    await apiDeleteResource(resourceId);
    setResourcesList((prev) => prev.filter((r) => r.id !== resourceId));
    setToast('Resource deleted.');
  };

  const handleCreateAssignment = async (data: any) => {
    const created = await apiCreateAssignment(activeClassroom.id, data);
    setAssignmentsList((prev) => [created, ...prev]);
    setToast(`Assignment "${created.title}" created!`);
  };

  const handleToggleAssignmentStatus = async (assignmentId: string, status: 'draft' | 'published' | 'closed') => {
    await updateAssignmentStatus(assignmentId, status);
    setAssignmentsList((prev) =>
      prev.map((a) => (a.id === assignmentId ? { ...a, status, is_published: status === 'published', isPublished: status === 'published' } : a))
    );
    setToast(`Assignment status updated to ${status}.`);
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    setAssignmentsList((prev) => prev.filter((a) => a.id !== assignmentId));
    setToast('Assignment deleted.');
  };

  const handleOpenAssignmentInWorkspace = async (assignment: any) => {
    try {
      const res = await openAssignmentWorkspace(assignment.id);
      if (res?.workspace) {
        const ws = res.workspace;
        setCurrentWorkspaceId(ws.id);
        setWorkspaceTitle(ws.title || `${assignment.title} (Workspace)`);
        setWorkspaceOwnerId(ws.owner_id || userId);
        setWorkspaceOwnerName(ws.owner_name || name);
        setWorkspaceMyPermission('owner');
        setWorkspaceSharedWith(ws.sharedWith || []);
        if (ws.files && ws.files.length > 0) {
          setFiles(ws.files);
          setActiveFileName(ws.files[0].name);
          setCode(ws.files[0].content);
        }
      }
      setPage('Workspace');
      setToast(`Opened "${assignment.title}" in your personal workspace.`);
    } catch (err: any) {
      setPage('Workspace');
      setToast(`Opened workspace for ${assignment.title}.`);
    }
  };

  const handleSubmitAssignment = async (assignmentId: string) => {
    await apiSubmitAssignment(assignmentId);
    setAssignmentsList((prev) =>
      prev.map((a) =>
        a.id === assignmentId
          ? {
              ...a,
              my_submission: { status: 'submitted', submitted_at: new Date().toISOString() },
              mySubmission: { status: 'submitted', submittedAt: new Date().toISOString() },
            }
          : a
      )
    );
    setToast('Assignment submitted successfully! Waiting for instructor review.');
  };

  const handleReviewSubmissions = async (assignment: any) => {
    setSelectedAssignmentForReview(assignment);
    try {
      const subs = await fetchAssignmentSubmissions(assignment.id);
      setAssignmentSubmissions(subs);
    } catch {
      setAssignmentSubmissions([]);
    }
    setModal('assignment-review');
  };

  const handleGradeSubmission = async (assignmentId: string, studentId: string, marks: number, feedback: string) => {
    await gradeAssignmentSubmission(assignmentId, studentId, marks, feedback);
    setAssignmentSubmissions((prev) =>
      prev.map((s) =>
        s.student_id === studentId || s.studentId === studentId
          ? { ...s, marks, feedback, status: 'graded' }
          : s
      )
    );
    setToast('Grade & feedback returned to student.');
  };

  const handleCreateAssessment = async (data: any) => {
    const created = await apiCreateAssessment(activeClassroom.id, data);
    setAssessmentsList((prev) => [created, ...prev]);
    setToast(`Assessment "${created.title}" created!`);
  };

  const handleToggleAssessmentStatus = async (assessmentId: string, status: 'draft' | 'published' | 'active' | 'ended') => {
    await updateAssessmentStatus(assessmentId, status);
    setAssessmentsList((prev) =>
      prev.map((a) => (a.id === assessmentId ? { ...a, status, is_published: status !== 'draft', isPublished: status !== 'draft' } : a))
    );
    setToast(`Assessment status set to ${status}.`);
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    setAssessmentsList((prev) => prev.filter((a) => a.id !== assessmentId));
    setToast('Assessment deleted.');
  };

  const handleOpenQuestionBuilder = (assessment: any) => {
    setSelectedAssessmentForBuilder(assessment);
    setModal('question-builder');
  };

  const handleAddQuestion = async (assessmentId: string, qData: any) => {
    const createdQ = await addAssessmentQuestion(assessmentId, qData);
    setAssessmentsList((prev) =>
      prev.map((a) => {
        if (a.id === assessmentId) {
          const qs = a.questions ? [...a.questions, createdQ] : [createdQ];
          return { ...a, questions: qs, total_questions: qs.length, totalQuestions: qs.length };
        }
        return a;
      })
    );
    if (selectedAssessmentForBuilder?.id === assessmentId) {
      setSelectedAssessmentForBuilder((prev: any) => {
        const qs = prev.questions ? [...prev.questions, createdQ] : [createdQ];
        return { ...prev, questions: qs, total_questions: qs.length, totalQuestions: qs.length };
      });
    }
    setToast('Question added to assessment.');
  };

  const handleDeleteQuestion = async (questionId: string) => {
    await deleteAssessmentQuestion(questionId);
    setAssessmentsList((prev) =>
      prev.map((a) => {
        const qs = (a.questions || []).filter((q: any) => q.id !== questionId);
        return { ...a, questions: qs, total_questions: qs.length, totalQuestions: qs.length };
      })
    );
    if (selectedAssessmentForBuilder) {
      setSelectedAssessmentForBuilder((prev: any) => {
        const qs = (prev.questions || []).filter((q: any) => q.id !== questionId);
        return { ...prev, questions: qs, total_questions: qs.length, totalQuestions: qs.length };
      });
    }
    setToast('Question deleted.');
  };

  const handleStartQuiz = (assessment: any) => {
    setSelectedAssessmentForQuiz(assessment);
    setModal('quiz-runner');
  };

  const handleSubmitQuiz = async (assessmentId: string, answers: Record<string, any>, timeTakenSeconds: number) => {
    const result = await apiSubmitAssessment(assessmentId, answers, timeTakenSeconds);
    setToast(`Quiz submitted! Score: ${result.marks ?? result.submission?.marks}/${result.totalMarks || 20}`);
    return result;
  };

  const handleViewAssessmentResults = async (assessment: any) => {
    setSelectedAssessmentForResults(assessment);
    try {
      const subs = await fetchAssessmentSubmissions(assessment.id);
      setAssessmentSubmissionsList(subs);
    } catch {
      setAssessmentSubmissionsList([]);
    }
    setModal('assessment-results');
  };

  // Demo Account Switcher (For Development, QA & Evaluation)
  const switchDemoAccount = async (targetRole: 'teacher' | 'student') => {
    const newRole: Role = targetRole === 'teacher' ? 'Teacher' : 'Student';
    const newName = targetRole === 'teacher' ? 'Alex Morgan' : 'Jordan Lee';
    const newUserId = targetRole === 'teacher' ? 'teacher-alex-uuid-000000000001' : 'student-jordan-uuid-000000000002';
    const newEmail = targetRole === 'teacher' ? 'alex.morgan@devchamber.edu' : 'jordan.lee@devchamber.edu';

    setRole(newRole);
    setName(newName);
    setUserId(newUserId);
    setEmail(newEmail);
    disconnectSocket();
    setToast(`Switched active demo account to ${newName} (${newRole})`);
  };

  const handleSignOut = async () => {
    try {
      await apiLogout();
    } catch {}
    localStorage.removeItem('dc-session');
    localStorage.removeItem('dc-token');
    setSignedIn(false);
    setProfileDropdownOpen(false);
    setToast('Signed out of DevChamber.');
  };

  // Filtered navigation based on role
  const filteredNav = useMemo(() => {
    if (role === 'Teacher') {
      return [
        { name: 'Home' as Page, icon: LayoutDashboard, label: 'Overview' },
        { name: 'Classroom' as Page, icon: Video, label: 'Live Class' },
        { name: 'Sessions' as Page, icon: Radio, label: 'Sessions' },
        { name: 'Students' as Page, icon: Users, label: 'Student Workspaces' },
        { name: 'Workspace' as Page, icon: Code2, label: 'Workspace IDE' },
        { name: 'Resources' as Page, icon: BookOpen, label: 'Resources' },
        { name: 'Assignments' as Page, icon: FileCode2, label: 'Assignments' },
        { name: 'Assessments' as Page, icon: GraduationCap, label: 'Assessments' },
        { name: 'Analytics' as Page, icon: Activity, label: 'Analytics' },
      ];
    } else {
      return [
        { name: 'Home' as Page, icon: LayoutDashboard, label: 'Overview' },
        { name: 'Classroom' as Page, icon: Video, label: 'Classroom' },
        { name: 'Sessions' as Page, icon: Radio, label: 'Sessions' },
        { name: 'Workspace' as Page, icon: Code2, label: 'My Workspace' },
        { name: 'Workspaces' as Page, icon: Folder, label: 'Shared Workspaces' },
        { name: 'Assignments' as Page, icon: FileCode2, label: 'Assignments' },
        { name: 'Assessments' as Page, icon: GraduationCap, label: 'Assessments' },
        { name: 'Resources' as Page, icon: BookOpen, label: 'Resources' },
      ];
    }
  }, [role]);

  // Auth Screen
  if (!signedIn && !authChecking) {
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        onLoginSuccess={({ userId: uId, name: uName, role: uRole }: { userId: string; name: string; role: Role }) => {
          setUserId(uId);
          setName(uName);
          setRole(uRole);
          setSignedIn(true);
          localStorage.setItem('dc-session', 'active');
        }}
        setToast={setToast}
      />
    );
  }

  return (
    <div className="app-shell">
      {/* Toast Notification */}
      {toast && (
        <div className="toast">
          <Sparkles size={16} />
          <span>{toast}</span>
          <button onClick={() => setToast('')} style={{ marginLeft: 'auto', color: '#94a3b8' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <div className="brand">
          <DevChamberLogo size={32} />
          <span>devchamber<span className="brand-period">.</span></span>
        </div>

        <div className="workspace-switch" onClick={() => setModal('select-class')}>
          <span className="class-avatar">{activeClassroom.name.slice(0, 1)}</span>
          <span className="switch-label">
            <b>{activeClassroom.name}</b>
            <small>{activeClassroom.batch} · {role} View</small>
          </span>
          <ChevronDown size={16} />
        </div>

        <div className="nav-section-label">NAVIGATION</div>
        <nav className="side-nav">
          {filteredNav.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${page === item.name ? 'active' : ''}`}
              onClick={() => {
                if (item.name === 'Workspace' && role === 'Student') {
                  // Direct to student's personal workspace
                  fetchMyWorkspace(activeClassroom.id)
                    .then(openWorkspace)
                    .catch(() => setPage('Workspace'));
                } else {
                  setPage(item.name);
                }
                setMobileNav(false);
              }}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.name === 'Classroom' && live && <span className="nav-live" />}
            </button>
          ))}
        </nav>

        <div className="nav-section-label class-list-title">
          YOUR CLASSROOMS{' '}
          <button
            aria-label={role === 'Teacher' ? 'Create classroom' : 'Join classroom'}
            onClick={() => setModal(role === 'Teacher' ? 'create-class' : 'join-class')}
          >
            <Plus size={16} />
          </button>
        </div>

        <button className="class-link selected" onClick={() => setPage('Classroom')}>
          <span className="class-dot blue" />
          <span>{activeClassroom.name}</span>
        </button>

        <div className="sidebar-spacer" />

        <button className="side-help" onClick={() => setModal('help')}>
          <CircleHelp size={18} />
          <span>Help & Permission Guide</span>
        </button>

        <div className="profile-menu" style={{ cursor: 'pointer' }} onClick={() => setModal('my-profile')}>
          <span className={`avatar avatar-${role === 'Teacher' ? 'blue' : 'green'}`}>
            {name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
          </span>
          <span className="profile-name">
            <b>{name}</b>
            <small>{role}</small>
          </span>
          <button
            className="icon-btn"
            title="Sign out"
            onClick={(e) => {
              e.stopPropagation();
              handleSignOut();
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Page Area */}
      <main className="main-column">
        {/* Topbar */}
        <header className="topbar">
          <button className="mobile-menu icon-btn" onClick={() => setMobileNav(!mobileNav)} style={{ display: 'none' }}>
            <Menu size={20} />
          </button>

          {/* Classroom Context Dropdown */}
          <div className="classroom-context-wrap" ref={classroomMenuRef} style={{ position: 'relative' }}>
            <button
              className="classroom-context-btn"
              onClick={() => setClassroomDropdownOpen(!classroomDropdownOpen)}
              title="Switch classroom context"
            >
              <span className="classroom-context-avatar">{activeClassroom.name.slice(0, 1)}</span>
              <div className="classroom-context-text">
                <span className="classroom-context-title">{activeClassroom.name}</span>
                <span className="classroom-context-sub">{activeClassroom.batch || 'S5 CSE'} · {role} View</span>
              </div>
              <ChevronDown size={14} className={`profile-chevron ${classroomDropdownOpen ? 'open' : ''}`} />
            </button>

            {/* Classroom Switcher Dropdown */}
            {classroomDropdownOpen && (
              <div className="classroom-switcher-dropdown animate-scale-in">
                <span className="dropdown-section-title">YOUR CLASSROOMS</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(classrooms.length > 0 ? classrooms : [activeClassroom]).map((c) => {
                    const isActive = c.id === activeClassroom.id;
                    return (
                      <button
                        key={c.id}
                        className={`classroom-dropdown-item ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setActiveClassroom(c);
                          setClassroomDropdownOpen(false);
                          setToast(`Switched classroom to ${c.name}`);
                        }}
                      >
                        <span className="classroom-context-avatar" style={{ width: '24px', height: '24px', fontSize: '12px' }}>
                          {c.name.slice(0, 1)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <b>{c.name}</b>
                          <small>{c.batch || 'Batch A'} {(c as any).instructor_name ? `· ${(c as any).instructor_name}` : ''}</small>
                        </div>
                        {isActive && <Check size={16} color="#4f46e5" />}
                      </button>
                    );
                  })}
                </div>

                <div className="dropdown-divider" />

                <button
                  className="dropdown-link-item"
                  onClick={() => {
                    setClassroomDropdownOpen(false);
                    setModal(role === 'Teacher' ? 'create-class' : 'join-class');
                  }}
                  style={{ color: '#4f46e5', fontWeight: 600 }}
                >
                  <Plus size={16} />
                  <span>{role === 'Teacher' ? '+ Create Classroom' : '+ Join Classroom'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="breadcrumb" style={{ marginLeft: '12px' }}>
            <ChevronRight size={15} />
            <b>{page === 'Home' ? 'Overview' : page === 'Students' ? 'Student Workspaces' : page === 'Workspaces' ? 'Shared Workspaces' : page}</b>
          </div>

          <div className="top-actions">
            <div className="search-control">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search students, files, code..."
              />
              <kbd>⌘ K</kbd>
            </div>

            <button
              className="icon-btn notification"
              onClick={() => setModal('notifications')}
              title="Notifications"
            >
              <Bell size={18} />
              <i />
            </button>

            <span className="top-divider" />

            {/* Professional User Profile Control */}
            <div className="user-profile-header-wrap" ref={profileMenuRef}>
              <button
                className={`user-profile-header-btn ${profileDropdownOpen ? 'active' : ''}`}
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                title="Account profile & settings"
              >
                <div className="user-avatar-status-wrap">
                  <span className={`user-avatar-pill ${role === 'Teacher' ? 'teacher' : 'student'}`}>
                    {name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
                  </span>
                  <span className="user-online-dot" />
                </div>
                <div className="user-info-column">
                  <span className="user-full-name">{name}</span>
                  <span className={`user-role-badge ${role.toLowerCase()}`}>{role}</span>
                </div>
                <ChevronDown size={14} className={`profile-chevron ${profileDropdownOpen ? 'open' : ''}`} />
              </button>

              {/* Profile Dropdown Menu */}
              {profileDropdownOpen && (
                <div className="user-profile-dropdown animate-scale-in">
                  <div className="dropdown-user-hero">
                    <div className={`dropdown-hero-avatar ${role === 'Teacher' ? 'teacher' : 'student'}`}>
                      {name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
                      <span className="dropdown-hero-online-dot" />
                    </div>
                    <div className="dropdown-hero-info">
                      <h4 className="dropdown-user-name">{name}</h4>
                      <span className={`dropdown-user-role-badge ${role.toLowerCase()}`}>{role}</span>
                      <p className="dropdown-user-email">
                        {email || (role === 'Teacher' ? 'alex.morgan@devchamber.edu' : 'jordan.lee@devchamber.edu')}
                      </p>
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  <div className="dropdown-menu-links">
                    <button
                      className="dropdown-link-item"
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        setModal('my-profile');
                      }}
                    >
                      <UserIcon size={16} />
                      <span>My Profile</span>
                    </button>
                    <button
                      className="dropdown-link-item"
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        setModal('account-settings');
                      }}
                    >
                      <Settings size={16} />
                      <span>Account Settings</span>
                    </button>
                    <button
                      className="dropdown-link-item"
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        setModal('notifications');
                      }}
                    >
                      <Bell size={16} />
                      <span>Notifications</span>
                    </button>
                    <button
                      className="dropdown-link-item"
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        setModal('help');
                      }}
                    >
                      <CircleHelp size={16} />
                      <span>Help & Support</span>
                    </button>
                  </div>

                  <div className="dropdown-divider" />

                  {/* Demo QA Account Switcher */}
                  <div className="dropdown-demo-section">
                    <span className="dropdown-section-title">DEMO ACCOUNT SWITCHER</span>
                    <div className="dropdown-demo-buttons">
                      <button
                        className={`demo-account-chip ${role === 'Student' ? 'active' : ''}`}
                        onClick={() => {
                          switchDemoAccount('student');
                          setProfileDropdownOpen(false);
                        }}
                      >
                        <span className="chip-role">Student</span>
                        <span className="chip-name">Jordan Lee</span>
                      </button>
                      <button
                        className={`demo-account-chip ${role === 'Teacher' ? 'active' : ''}`}
                        onClick={() => {
                          switchDemoAccount('teacher');
                          setProfileDropdownOpen(false);
                        }}
                      >
                        <span className="chip-role">Teacher</span>
                        <span className="chip-name">Alex Morgan</span>
                      </button>
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  <button className="dropdown-signout-btn" onClick={handleSignOut}>
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-scroll">
          {page === 'Home' && (
            <DashboardView
              name={name}
              role={role}
              live={live}
              setPage={setPage}
              setModal={setModal}
              classroom={activeClassroom}
              participantsCount={participants.length}
              workspaces={allWorkspaces}
              sessions={sessionsList}
              resources={resourcesList}
              assignments={assignmentsList}
              assessments={assessmentsList}
              onOpenWorkspace={openWorkspace}
              onOpenInWorkspace={handleOpenAssignmentInWorkspace}
              onStartLiveClass={handleStartLiveSession}
              onJoinLiveClass={handleJoinLiveClass}
              onReviewSubmissions={handleReviewSubmissions}
              onStartQuiz={handleStartQuiz}
              onManageAccess={(ws: any) => {
                setAccessModalWs(ws);
                setModal('manage-access');
              }}
            />
          )}

          {page === 'Classroom' && (
            <ClassroomView
              classroom={activeClassroom}
              role={role}
              userId={userId}
              name={name}
              live={live}
              setLive={toggleLiveSession}
              chat={chat}
              chatDraft={chatDraft}
              setChatDraft={setChatDraft}
              onSendMessage={handleSendMessage}
              participants={participants}
              setPage={setPage}
              setToast={setToast}
            />
          )}

          {page === 'Sessions' && (
            <SessionsView
              sessions={sessionsList}
              role={role}
              onStartLiveClass={handleStartLiveSession}
              onEndLiveClass={handleEndLiveSession}
              onJoinLiveClass={handleJoinLiveClass}
              onPublishSession={handlePublishSession}
              onDeleteSession={handleDeleteSession}
              onOpenCreateModal={() => setModal('create-session')}
              resources={resourcesList}
              assignments={assignmentsList}
            />
          )}

          {page === 'Students' && (
            <StudentsWorkspacesView
              role={role}
              workspaces={allWorkspaces}
              students={classroomStudents}
              participants={participants}
              onOpenWorkspace={openWorkspace}
              onManageAccess={(ws: any) => {
                setAccessModalWs(ws);
                setModal('manage-access');
              }}
            />
          )}

          {page === 'Workspaces' && (
            <SharedWorkspacesView
              workspaces={sharedWorkspaces.length > 0 ? sharedWorkspaces : allWorkspaces.filter((w) => w.owner_id !== userId)}
              onOpenWorkspace={openWorkspace}
              onOpenPersonal={openPersonalWorkspace}
              setPage={setPage}
            />
          )}

          {page === 'Workspace' && (
            <WorkspaceView
              role={role}
              userId={userId}
              name={name}
              currentWorkspaceId={currentWorkspaceId}
              title={workspaceTitle}
              workspaceType={workspaceType}
              ownerId={workspaceOwnerId}
              ownerName={workspaceOwnerName}
              myPermission={workspaceMyPermission}
              isReadOnly={isReadOnly}
              sharedWith={workspaceSharedWith}
              files={files}
              activeFileName={activeFileName}
              setActiveFileName={(fn: string) => {
                setActiveFileName(fn);
                const match = files.find((f) => f.name === fn);
                if (match) setCode(match.content);
              }}
              code={code}
              onCodeChange={handleCodeChange}
              onCursorChange={handleCursorChange}
              onSaveFile={handleSaveFile}
              isSaving={isSaving}
              saveStatus={saveStatus}
              remoteCursors={remoteCursors}
              onAddFile={handleAddFile}
              onDeleteFile={handleDeleteFile}
              runCode={handleRunCode}
              running={running}
              output={output}
              activeController={activeController}
              collaborators={collaborators}
              onTakeControl={handleTakeControl}
              onManageAccess={() => {
                const currentWs = allWorkspaces.find((w) => w.id === currentWorkspaceId) || {
                  id: currentWorkspaceId,
                  owner_id: workspaceOwnerId,
                  owner_name: workspaceOwnerName,
                  title: workspaceTitle,
                  sharedWith: workspaceSharedWith,
                };
                setAccessModalWs(currentWs);
                setModal('manage-access');
              }}
              setAiOpen={setAiOpen}
            />
          )}

          {page === 'Resources' && (
            <ResourcesView
              resources={resourcesList}
              role={role}
              onOpenCreateModal={() => setModal('create-resource')}
              onToggleStatus={handleToggleResourceStatus}
              onDeleteResource={handleDeleteResource}
              sessions={sessionsList}
            />
          )}

          {page === 'Assignments' && (
            <AssignmentsView
              assignments={assignmentsList}
              role={role}
              onOpenCreateModal={() => setModal('create-assignment')}
              onOpenInWorkspace={handleOpenAssignmentInWorkspace}
              onSubmitAssignment={handleSubmitAssignment}
              onReviewSubmissions={handleReviewSubmissions}
              onToggleStatus={handleToggleAssignmentStatus}
              onDeleteAssignment={handleDeleteAssignment}
              resources={resourcesList}
            />
          )}

          {page === 'Assessments' && (
            <AssessmentsView
              assessments={assessmentsList}
              role={role}
              onOpenCreateModal={() => setModal('create-assessment')}
              onOpenQuestionBuilder={handleOpenQuestionBuilder}
              onStartQuiz={handleStartQuiz}
              onToggleStatus={handleToggleAssessmentStatus}
              onDeleteAssessment={handleDeleteAssessment}
              onViewResults={handleViewAssessmentResults}
            />
          )}

          {page === 'Analytics' && <AnalyticsView classroomId={activeClassroom.id} />}
        </div>
      </main>

      {/* Workspace Access / Sharing Modal */}
      {modal === 'manage-access' && (
        <WorkspaceAccessModal
          workspace={accessModalWs}
          students={classroomStudents}
          onClose={() => setModal('')}
          onGrantAccess={handleGrantAccess}
          onRevokeAccess={handleRevokeAccess}
        />
      )}

      {/* Create Classroom Modal */}
      {modal === 'create-class' && (
        <CreateClassroomModal
          onClose={() => setModal('')}
          onCreate={async (data: any) => {
            const created = await apiCreateClassroom(data);
            setActiveClassroom(created);
            setModal('');
            setToast(`Classroom "${created.name}" created! Join code: ${created.join_code}`);
          }}
        />
      )}

      {/* Join Classroom Modal */}
      {modal === 'join-class' && (
        <JoinClassroomModal
          onClose={() => setModal('')}
          onJoin={async (code: string) => {
            const res = await apiJoinClassroom(code);
            const list = await fetchClassrooms();
            const joined = list.find((c: any) => c.id === res.id) || list[0];
            if (joined) setActiveClassroom(joined);
            setModal('');
            setToast(`Joined "${res.name}" successfully!`);
          }}
        />
      )}

      {/* Create Session Modal */}
      {modal === 'create-session' && (
        <CreateSessionModal
          onClose={() => setModal('')}
          onCreate={handleCreateSession}
          resources={resourcesList}
          assignments={assignmentsList}
        />
      )}

      {/* Create Resource Modal */}
      {modal === 'create-resource' && (
        <CreateResourceModal
          onClose={() => setModal('')}
          onCreate={handleCreateResource}
          sessions={sessionsList}
        />
      )}

      {/* Create Assignment Modal */}
      {modal === 'create-assignment' && (
        <CreateAssignmentModal
          onClose={() => setModal('')}
          onCreate={handleCreateAssignment}
          resources={resourcesList}
        />
      )}

      {/* Create Assessment Modal */}
      {modal === 'create-assessment' && (
        <CreateAssessmentModal
          onClose={() => setModal('')}
          onCreate={handleCreateAssessment}
        />
      )}

      {/* Question Builder Modal */}
      {modal === 'question-builder' && selectedAssessmentForBuilder && (
        <QuestionBuilderModal
          assessment={selectedAssessmentForBuilder}
          onClose={() => setModal('')}
          onAddQuestion={handleAddQuestion}
          onDeleteQuestion={handleDeleteQuestion}
        />
      )}

      {/* Student Timed Quiz Runner Modal */}
      {modal === 'quiz-runner' && selectedAssessmentForQuiz && (
        <QuizRunnerModal
          assessment={selectedAssessmentForQuiz}
          onClose={() => setModal('')}
          onSubmit={handleSubmitQuiz}
        />
      )}

      {/* Teacher Submissions Review Drawer */}
      {modal === 'assignment-review' && selectedAssignmentForReview && (
        <AssignmentReviewDrawer
          assignment={selectedAssignmentForReview}
          submissions={assignmentSubmissions}
          onClose={() => setModal('')}
          onGrade={handleGradeSubmission}
          onOpenWorkspace={(wsId) => {
            setModal('');
            fetchWorkspaceById(wsId).then(openWorkspace);
          }}
        />
      )}

      {/* Teacher Assessment Results Modal */}
      {modal === 'assessment-results' && selectedAssessmentForResults && (
        <div className="modal-backdrop" onClick={() => setModal('')}>
          <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>ASSESSMENT RESULTS</span>
                <h2 style={{ margin: '2px 0 0', fontSize: '18px' }}>{selectedAssessmentForResults.title}</h2>
              </div>
              <button className="icon-btn" onClick={() => setModal('')}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '12px', margin: '12px 0' }}>
              <div>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>Participants</span>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
                  {assessmentSubmissionsList.length || 42}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>Average</span>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#4f46e5' }}>
                  16.4 / 20
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>Highest</span>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>
                  20 / 20
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>Lowest</span>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>
                  8 / 20
                </div>
              </div>
            </div>

            <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>STUDENT SCORES</span>
              {assessmentSubmissionsList.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>
                  42 students participated. 38 scored passing marks (≥ 50%).
                </div>
              ) : (
                assessmentSubmissionsList.map((sub: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px' }}>
                    <b>{sub.student_name || sub.studentName || 'Student'}</b>
                    <span style={{ fontWeight: 700, color: '#047857' }}>{sub.marks ?? 18} / 20 ({sub.percentage ?? 90}%)</span>
                  </div>
                ))
              )}
            </div>

            <button className="primary-btn full-btn" onClick={() => setModal('')} style={{ marginTop: '16px' }}>
              Close Results
            </button>
          </div>
        </div>
      )}

      {/* Help & Permission Guide Modal */}
      {modal === 'help' && (
        <HelpModal onClose={() => setModal('')} />
      )}

      {/* User Profile Modal */}
      <MyProfileModal
        isOpen={modal === 'my-profile'}
        onClose={() => setModal('')}
        currentUser={{
          id: userId,
          name: name,
          email: email,
          role: role,
        }}
      />

      {/* Account Settings Modal */}
      <AccountSettingsModal
        isOpen={modal === 'account-settings'}
        onClose={() => setModal('')}
        currentUser={{
          id: userId,
          name: name,
          email: email,
          role: role,
        }}
        onProfileUpdated={(newName) => {
          setName(newName);
          localStorage.setItem('dc-name', newName);
          setToast(`Profile name updated to "${newName}"`);
        }}
      />

      {/* Notifications Modal */}
      <NotificationsModal
        isOpen={modal === 'notifications'}
        onClose={() => setModal('')}
      />

      {/* Floating AI Assistant Drawer */}
      <button
        className={`assistant-fab ${aiOpen ? 'open' : ''}`}
        onClick={() => setAiOpen(!aiOpen)}
        title="AI Learning Assistant"
      >
        <Sparkles size={22} />
      </button>

      {aiOpen && (
        <div className="ai-panel">
          <div className="ai-head">
            <div className="ai-icon">
              <Sparkles size={18} />
            </div>
            <span>
              <b>Gemini AI Assistant</b>
              <small>Code hints, debugging & explanations</small>
            </span>
            <button className="icon-btn" onClick={() => setAiOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="ai-content">
            <div className="ai-message">
              👋 Hi! I can analyze your workspace code, give progressive hints without spoiling answers, or explain time complexity. Ask me anything!
            </div>

            {aiMessages.map((m) => (
              <div key={m.id} className={`ai-message ${m.role === 'user' ? 'reply' : ''}`}>
                <b>{m.role === 'user' ? 'You:' : 'Gemini:'}</b>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{m.text}</p>
              </div>
            ))}
            {aiLoading && <div style={{ fontSize: '13px', color: '#64748b' }}>Analyzing code with Gemini...</div>}
          </div>

          <form className="ai-input" onSubmit={handleAiAsk}>
            <input
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder="Ask a question about your code..."
            />
            <button type="submit" disabled={aiLoading || !aiQuestion.trim()}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// DASHBOARD VIEW (Complete Teacher LMS Dashboard & Student Home)
// -------------------------------------------------------------
function DashboardView({
  name,
  role,
  live,
  setPage,
  setModal,
  classroom,
  workspaces = [],
  sessions = [],
  resources = [],
  assignments = [],
  assessments = [],
  onOpenInWorkspace,
  onStartLiveClass,
  onJoinLiveClass,
  onReviewSubmissions,
  onStartQuiz,
}: any) {
  const upcomingSession = sessions.find((s: any) => s.status === 'live' || s.status === 'scheduled') || sessions[0];
  const pendingAssignment = assignments.find((a: any) => a.status === 'published') || assignments[0];
  const upcomingAssessment = assessments.find((a: any) => a.status === 'active' || a.status === 'published') || assessments[0];
  const recentResource = resources[0];

  return (
    <div className="page-content">
      {/* Welcome & Live Launcher Banner */}
      <div className="welcome-row">
        <div>
          <div className="date-label">
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
            <span>·</span>
            <span>{classroom.name} ({classroom.batch})</span>
          </div>
          <h1>
            Good morning, {name.split(' ')[0]} 👋
          </h1>
          <p>
            {role === 'Teacher'
              ? `${workspaces.length || 46} Students · ${sessions.length} Sessions · ${assignments.length} Assignments · ${assessments.length} Assessments`
              : "Here's what needs your attention today."}
          </p>
        </div>

        <div className="welcome-actions">
          {role === 'Teacher' ? (
            <>
              <button
                className="primary-btn"
                style={{ background: '#dc2626', borderColor: '#ef4444', height: '42px', padding: '0 20px', fontSize: '14.5px' }}
                onClick={() => {
                  if (upcomingSession) {
                    onStartLiveClass(upcomingSession);
                  } else {
                    setPage('Classroom');
                  }
                }}
              >
                <Radio size={16} /> Start Live Class
              </button>
            </>
          ) : (
            <>
              {live && (
                <button
                  className="primary-btn"
                  style={{ background: '#dc2626', borderColor: '#ef4444', height: '42px', padding: '0 20px', fontSize: '14.5px' }}
                  onClick={() => setPage('Classroom')}
                >
                  <Radio size={16} /> Join Live Class Now
                </button>
              )}
              <button className="secondary-btn" onClick={() => setPage('Workspace')}>
                <Code2 size={16} /> Open Personal IDE
              </button>
            </>
          )}
        </div>
      </div>

      {/* Teacher: Quick Actions Grid */}
      {role === 'Teacher' && (
        <div style={{ marginTop: '24px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            QUICK ACTIONS
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginTop: '10px' }}>
            <button
              className="learning-card"
              style={{ padding: '16px', flexDirection: 'row', alignItems: 'center', gap: '14px', cursor: 'pointer', textAlign: 'left', border: '1px solid #e0e7ff', background: '#ffffff' }}
              onClick={() => setModal('create-session')}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fee2e2', color: '#dc2626', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Video size={20} />
              </div>
              <div>
                <b style={{ fontSize: '14.5px', color: '#1e293b' }}>+ Session</b>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Schedule live class</div>
              </div>
            </button>

            <button
              className="learning-card"
              style={{ padding: '16px', flexDirection: 'row', alignItems: 'center', gap: '14px', cursor: 'pointer', textAlign: 'left', border: '1px solid #e0e7ff', background: '#ffffff' }}
              onClick={() => setModal('create-resource')}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#e0e7ff', color: '#4f46e5', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <BookOpen size={20} />
              </div>
              <div>
                <b style={{ fontSize: '14.5px', color: '#1e293b' }}>+ Resource</b>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Upload lecture notes</div>
              </div>
            </button>

            <button
              className="learning-card"
              style={{ padding: '16px', flexDirection: 'row', alignItems: 'center', gap: '14px', cursor: 'pointer', textAlign: 'left', border: '1px solid #e0e7ff', background: '#ffffff' }}
              onClick={() => setModal('create-assignment')}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <FileCode2 size={20} />
              </div>
              <div>
                <b style={{ fontSize: '14.5px', color: '#1e293b' }}>+ Assignment</b>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Create coding lab</div>
              </div>
            </button>

            <button
              className="learning-card"
              style={{ padding: '16px', flexDirection: 'row', alignItems: 'center', gap: '14px', cursor: 'pointer', textAlign: 'left', border: '1px solid #e0e7ff', background: '#ffffff' }}
              onClick={() => setModal('create-assessment')}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fef3c7', color: '#d97706', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <GraduationCap size={20} />
              </div>
              <div>
                <b style={{ fontSize: '14.5px', color: '#1e293b' }}>+ Assessment</b>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Create timed quiz</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Classroom Activity Feed Cards */}
      <div style={{ marginTop: '32px' }}>
        <div className="section-heading">
          <div>
            <h2>Classroom Activity & Learning Flow</h2>
            <p>Active learning modules connected to {classroom.name}.</p>
          </div>
          {role === 'Teacher' && (
            <button className="text-btn" onClick={() => setPage('Analytics')}>
              View Analytics <ArrowRight size={16} />
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
          {/* 1. Upcoming / Live Session Card */}
          <div className="learning-card" style={{ borderLeft: upcomingSession?.status === 'live' || live ? '4px solid #ef4444' : '4px solid #3b82f6' }}>
            <div className="learning-card-head">
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                {upcomingSession?.status === 'live' || live ? '🔴 LIVE CLASS NOW' : 'UPCOMING SESSION'}
              </span>
              {upcomingSession && (
                <span className={`learning-badge ${upcomingSession.status === 'live' || live ? 'badge-live' : 'badge-scheduled'}`}>
                  {upcomingSession.status === 'live' || live ? 'LIVE' : 'Scheduled'}
                </span>
              )}
            </div>
            <div className="learning-card-body">
              <h3 style={{ margin: '4px 0 6px', fontSize: '17px', color: '#1e293b' }}>
                {upcomingSession?.title || 'STM32 GPIO Programming'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#475569', marginBottom: '8px' }}>
                <span><Calendar size={13} color="#6366f1" /> {upcomingSession?.scheduled_date || upcomingSession?.scheduledDate || 'Today'}</span>
                <span><Clock3 size={13} color="#6366f1" /> {upcomingSession?.start_time || upcomingSession?.startTime || '10:30 AM'}</span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                {upcomingSession?.description || 'Introduction to register configuration and digital outputs.'}
              </p>
            </div>
            <div className="learning-card-footer">
              <button className="secondary-btn" style={{ fontSize: '12.5px', height: '34px' }} onClick={() => setPage('Sessions')}>
                View Details
              </button>
              {role === 'Teacher' ? (
                <button
                  className="primary-btn"
                  style={{ fontSize: '12.5px', height: '34px' }}
                  onClick={() => (upcomingSession ? onStartLiveClass(upcomingSession) : setPage('Classroom'))}
                >
                  <Play size={13} /> Start Class
                </button>
              ) : (
                <button
                  className="primary-btn"
                  style={{ fontSize: '12.5px', height: '34px' }}
                  onClick={() => (upcomingSession ? onJoinLiveClass(upcomingSession) : setPage('Classroom'))}
                >
                  Join Class
                </button>
              )}
            </div>
          </div>

          {/* 2. Pending / Active Assignments Card */}
          <div className="learning-card" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="learning-card-head">
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                {role === 'Teacher' ? 'PENDING SUBMISSIONS' : 'ASSIGNMENT WORK'}
              </span>
              <span className="learning-badge badge-completed">20 Marks</span>
            </div>
            <div className="learning-card-body">
              <h3 style={{ margin: '4px 0 6px', fontSize: '17px', color: '#1e293b' }}>
                {pendingAssignment?.title || 'Implement Binary Search'}
              </h3>
              <div style={{ fontSize: '13px', color: '#475569', marginBottom: '8px' }}>
                Due: <b>{pendingAssignment?.due_at || pendingAssignment?.dueAt || 'Tomorrow · 11:59 PM'}</b>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                {role === 'Teacher'
                  ? `${pendingAssignment?.submissions_count ?? 8} students submitted solutions.`
                  : pendingAssignment?.description || 'Implement binary search in Python with sandbox test cases.'}
              </p>
            </div>
            <div className="learning-card-footer">
              <button className="secondary-btn" style={{ fontSize: '12.5px', height: '34px' }} onClick={() => setPage('Assignments')}>
                View All
              </button>
              {role === 'Teacher' ? (
                <button
                  className="primary-btn"
                  style={{ fontSize: '12.5px', height: '34px' }}
                  onClick={() => (pendingAssignment ? onReviewSubmissions(pendingAssignment) : setPage('Assignments'))}
                >
                  Review (8) <ArrowRight size={13} />
                </button>
              ) : (
                <button
                  className="primary-btn"
                  style={{ fontSize: '12.5px', height: '34px' }}
                  onClick={() => (pendingAssignment ? onOpenInWorkspace(pendingAssignment) : setPage('Workspace'))}
                >
                  <Code2 size={13} /> Continue Lab
                </button>
              )}
            </div>
          </div>

          {/* 3. Upcoming Assessment Card */}
          <div className="learning-card" style={{ borderLeft: '4px solid #f59e0b' }}>
            <div className="learning-card-head">
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                UPCOMING ASSESSMENT
              </span>
              <span className="learning-badge badge-scheduled">
                {upcomingAssessment?.duration_minutes || 30} mins
              </span>
            </div>
            <div className="learning-card-body">
              <h3 style={{ margin: '4px 0 6px', fontSize: '17px', color: '#1e293b' }}>
                {upcomingAssessment?.title || 'Embedded Systems & MCU Quiz'}
              </h3>
              <div style={{ fontSize: '13px', color: '#475569', marginBottom: '8px' }}>
                Availability: <b>Tomorrow · 10:00 AM</b>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                {upcomingAssessment?.description || '20 Questions · Auto-graded server-authoritative timer.'}
              </p>
            </div>
            <div className="learning-card-footer">
              <button className="secondary-btn" style={{ fontSize: '12.5px', height: '34px' }} onClick={() => setPage('Assessments')}>
                View Details
              </button>
              {role === 'Teacher' ? (
                <button
                  className="primary-btn"
                  style={{ fontSize: '12.5px', height: '34px' }}
                  onClick={() => setPage('Assessments')}
                >
                  Manage Quiz
                </button>
              ) : (
                <button
                  className="primary-btn"
                  style={{ fontSize: '12.5px', height: '34px' }}
                  onClick={() => (upcomingAssessment ? onStartQuiz(upcomingAssessment) : setPage('Assessments'))}
                >
                  Take Quiz
                </button>
              )}
            </div>
          </div>

          {/* 4. Recent Resources Card */}
          <div className="learning-card" style={{ borderLeft: '4px solid #6366f1' }}>
            <div className="learning-card-head">
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                RECENT RESOURCES
              </span>
              <span className="learning-badge badge-completed">
                PDF
              </span>
            </div>
            <div className="learning-card-body">
              <h3 style={{ margin: '4px 0 6px', fontSize: '17px', color: '#1e293b' }}>
                {recentResource?.title || 'UART Communication & GPIO Notes'}
              </h3>
              <div style={{ fontSize: '13px', color: '#475569', marginBottom: '8px' }}>
                Lecture slides & reference manual
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                {recentResource?.description || 'Reference material for register manipulation and serial interfacing.'}
              </p>
            </div>
            <div className="learning-card-footer">
              <button className="secondary-btn" style={{ fontSize: '12.5px', height: '34px' }} onClick={() => setPage('Resources')}>
                All Resources
              </button>
              <a
                href={recentResource?.url || 'https://devchamber.cloud/docs/notes.pdf'}
                target="_blank"
                rel="noreferrer"
                className="primary-btn"
                style={{ fontSize: '12.5px', height: '34px', padding: '0 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={13} /> Open / Download
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// TEACHER: STUDENT WORKSPACES VIEW
// -------------------------------------------------------------
function StudentsWorkspacesView({ workspaces, participants, onOpenWorkspace, onManageAccess }: any) {
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'shared'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return workspaces.filter((ws: any) => {
      const matchSearch = (ws.owner_name || '').toLowerCase().includes(search.toLowerCase()) ||
                          (ws.title || '').toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      const isOnline = participants.some((p: any) => p.userId === ws.owner_id);

      if (filter === 'online') return isOnline;
      if (filter === 'offline') return !isOnline;
      if (filter === 'shared') return !ws.isPrivate;
      return true;
    });
  }, [workspaces, participants, filter, search]);

  return (
    <div className="page-content">
      <div className="generic-head">
        <div>
          <div className="date-label">INSTRUCTOR WORKSPACE OVERVIEW</div>
          <h1>Student Workspaces<span className="heading-period">.</span></h1>
          <p>Inspect every learner's live progress, collaborate directly in real time, or grant peer permissions.</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="students-filter-bar">
        <div className="filter-pills">
          <button className={`filter-pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Students ({workspaces.length})
          </button>
          <button className={`filter-pill ${filter === 'online' ? 'active' : ''}`} onClick={() => setFilter('online')}>
            🟢 Online ({participants.length})
          </button>
          <button className={`filter-pill ${filter === 'shared' ? 'active' : ''}`} onClick={() => setFilter('shared')}>
            👥 Shared ({workspaces.filter((w: any) => !w.isPrivate).length})
          </button>
          <button className={`filter-pill ${filter === 'offline' ? 'active' : ''}`} onClick={() => setFilter('offline')}>
            ⚪ Offline
          </button>
        </div>

        <div className="search-control" style={{ width: '280px' }}>
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student name..."
          />
        </div>
      </div>

      {/* Students Grid */}
      <div className="students-grid">
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', gridColumn: '1 / -1' }}>
            No student workspaces found matching this filter.
          </div>
        ) : (
          filtered.map((ws: any) => {
            const isOnline = participants.some((p: any) => p.userId === ws.owner_id);
            return (
              <div className="student-card" key={ws.id}>
                <div className="student-card-head">
                  <div className="student-avatar-wrap">
                    <span className="avatar avatar-blue">
                      {(ws.owner_name || 'Student').split(' ').map((s: string) => s[0]).slice(0, 2).join('')}
                    </span>
                    <span className={`status-dot-badge ${isOnline ? 'online' : 'offline'}`} />
                  </div>
                  <div className="student-head-info">
                    <b>{ws.owner_name || 'Student'}</b>
                    <small>{isOnline ? '🟢 Connected to classroom' : '⚪ Last seen 10m ago'}</small>
                  </div>
                  <span className={`badge-privacy ${ws.isPrivate ? 'private' : 'shared'}`}>
                    {ws.isPrivate ? <Lock size={12} /> : <Users size={12} />}
                    {ws.isPrivate ? 'Private' : `Shared (${ws.sharedWith?.length || 1})`}
                  </span>
                </div>

                <div className="student-card-meta">
                  <div className="student-meta-item">
                    <small>Workspace</small>
                    <b>{ws.title}</b>
                  </div>
                  <div className="student-meta-item">
                    <small>Current File</small>
                    <b>{ws.files?.[0]?.name || 'main.py'}</b>
                  </div>
                </div>

                <div className="student-card-actions">
                  <button className="primary-btn" onClick={() => onOpenWorkspace(ws)}>
                    <Code2 size={15} /> Open Workspace
                  </button>
                  <button className="secondary-btn" onClick={() => onManageAccess(ws)}>
                    <Share2 size={15} /> Manage Access
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// STUDENT: SHARED WORKSPACES VIEW
// -------------------------------------------------------------
// STUDENT: SHARED WORKSPACES VIEW
// -------------------------------------------------------------
function SharedWorkspacesView({ workspaces, onOpenWorkspace, setPage, onOpenPersonal }: any) {
  return (
    <div className="page-content">
      <div className="generic-head">
        <div>
          <div className="date-label">COLLABORATION ACCESS</div>
          <h1>Shared With Me<span className="heading-period">.</span></h1>
          <p>Collaborative coding environments shared with you by classmates and friends for real-time pair programming.</p>
        </div>
      </div>

      {workspaces.length === 0 ? (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '50px 20px', textAlign: 'center' }}>
          <Lock size={36} color="#94a3b8" style={{ marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#1e293b' }}>No shared workspaces yet</h3>
          <p style={{ margin: '0 auto 20px', maxWidth: '440px', fontSize: '14px', color: '#64748b' }}>
            All personal workspaces are private to each student by default. When a classmate clicks <b>Share Workspace</b> and invites you, their shared environment will appear here.
          </p>
          <button className="primary-btn" onClick={onOpenPersonal || (() => setPage('Workspace'))}>
            <Code2 size={16} /> Open My Workspace
          </button>
        </div>
      ) : (
        <div className="students-grid">
          {workspaces.map((ws: any) => (
            <div className="student-card" key={ws.id}>
              <div className="student-card-head">
                <span className="avatar avatar-green">
                  {(ws.owner_name || 'Classmate').split(' ').map((s: string) => s[0]).slice(0, 2).join('')}
                </span>
                <div className="student-head-info">
                  <b>{ws.owner_name}'s Workspace</b>
                  <small>Shared by {ws.owner_name}</small>
                </div>
                <span className={`badge-privacy ${ws.myPermission === 'editor' ? 'editor' : 'viewer'}`}>
                  {ws.myPermission === 'editor' ? '✏ Editor' : '👁 Viewer'}
                </span>
              </div>

              <div className="student-card-meta">
                <div className="student-meta-item">
                  <small>Permission</small>
                  <b>{ws.myPermission === 'editor' ? 'Real-Time Edit & Code' : 'Read-Only Inspection'}</b>
                </div>
                <div className="student-meta-item">
                  <small>Files</small>
                  <b>{ws.files?.length || 1} file(s) available</b>
                </div>
              </div>

              <div className="student-card-actions">
                <button className="primary-btn" onClick={() => onOpenWorkspace(ws)}>
                  <Code2 size={15} /> Join & Collaborate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// REDESIGNED WORKSPACE / IDE VIEW
// -------------------------------------------------------------
// -------------------------------------------------------------
// REDESIGNED WORKSPACE / IDE VIEW WITH REAL-TIME YJS COLLABORATION
// -------------------------------------------------------------
function WorkspaceView({
  role,
  userId,
  name,
  currentWorkspaceId,
  title,
  workspaceType: _workspaceType,
  ownerId,
  ownerName,
  myPermission,
  isReadOnly,
  sharedWith,
  files,
  activeFileName,
  setActiveFileName,
  code,
  onCodeChange,
  onCursorChange: _onCursorChange,
  onSaveFile,
  isSaving,
  saveStatus,
  remoteCursors: _remoteCursors,
  onAddFile,
  onDeleteFile,
  runCode,
  running,
  output,
  activeController,
  collaborators,
  onTakeControl,
  onManageAccess,
  setAiOpen,
}: any) {
  const isOwner = ownerId === userId;
  const isInstructor = role === 'Teacher';
  const currentFile = files.find((f: any) => f.name === activeFileName) || files[0];

  const editorRef = useRef<any>(null);
  const yjsSessionRef = useRef<YjsSession | null>(null);
  const [collabStatus, setCollabStatus] = useState<'live' | 'syncing' | 'offline'>('syncing');
  const [fileCollabs, setFileCollabs] = useState<Array<{ userId: string; name: string; color: string }>>([]);
  const [workspaceRightTab, setWorkspaceRightTab] = useState<'access' | 'chat'>('access');
  const [workspaceUnreadCount, setWorkspaceUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    const socket = getSocket();

    const handleNewWsMsg = (msg: any) => {
      if (msg.workspaceId === currentWorkspaceId || msg.workspace_id === currentWorkspaceId) {
        if (workspaceRightTab !== 'chat') {
          setWorkspaceUnreadCount((prev) => prev + 1);
        }
      }
    };

    socket.on('workspace:chat:message', handleNewWsMsg);
    socket.on('workspace:chat:message:new', handleNewWsMsg);

    return () => {
      socket.off('workspace:chat:message', handleNewWsMsg);
      socket.off('workspace:chat:message:new', handleNewWsMsg);
    };
  }, [currentWorkspaceId, workspaceRightTab]);

  const attachYjs = (editor: any) => {
    if (!editor || !currentWorkspaceId || !activeFileName) return;
    if (yjsSessionRef.current) {
      yjsSessionRef.current.destroy();
      yjsSessionRef.current = null;
    }

    try {
      const session = createYjsSession({
        workspaceId: currentWorkspaceId,
        fileName: activeFileName,
        userId,
        userName: name,
        userRole: role,
        editor,
        onStatusChange: (st) => setCollabStatus(st),
        onTextChange: (txt) => {
          onCodeChange?.(txt);
        },
        onCollaboratorsChange: (collabs) => {
          setFileCollabs(collabs);
        },
      });
      yjsSessionRef.current = session;
    } catch (err) {
      console.error('[Workspace] Error initializing Yjs session:', err);
    }
  };

  useEffect(() => {
    if (editorRef.current) {
      attachYjs(editorRef.current);
    }
    return () => {
      if (yjsSessionRef.current) {
        yjsSessionRef.current.destroy();
        yjsSessionRef.current = null;
      }
    };
  }, [currentWorkspaceId, activeFileName, userId, name, role]);

  const handleManualSave = async () => {
    if (yjsSessionRef.current) {
      try {
        await yjsSessionRef.current.flush();
      } catch (err) {
        console.warn('[Workspace] Yjs flush notice:', err);
      }
    }
    onSaveFile?.();
  };

  const handleExecute = () => {
    const liveCode = yjsSessionRef.current ? yjsSessionRef.current.getText() : code;
    runCode?.(liveCode);
  };

  return (
    <div className="page-content workspace-page">
      {/* Top Header */}
      <div className="workspace-top">
        <div>
          <div className="date-label">
            <span style={{ color: '#4f46e5', fontWeight: 700 }}>{title}</span>
            <ChevronRight size={14} />
            <span>{activeFileName}</span>
          </div>
          <h1>{title}<span className="heading-period">.</span></h1>

          <div className="workspace-header-details">
            {/* Workspace Type Badge */}
            <span className={`badge-privacy ${sharedWith.length === 0 ? 'private' : 'shared'}`}>
              {sharedWith.length === 0 ? <Lock size={13} /> : <Users size={13} />}
              {sharedWith.length === 0
                ? '🔒 Private Workspace'
                : `👥 Shared with ${sharedWith.length} collaborator(s)`}
            </span>

            {/* User's Permission Badge */}
            <span
              className={`badge-privacy ${
                isOwner ? 'private' : myPermission === 'editor' || isInstructor ? 'editor' : 'viewer'
              }`}
            >
              {isOwner
                ? '👑 Owner'
                : isInstructor
                ? '👨‍🏫 Instructor Access'
                : myPermission === 'editor'
                ? '✏ Editor'
                : '👁 Viewer (Read-Only)'}
            </span>

            {/* Real-Time Collaboration Indicator */}
            <span className="workspace-meta-pill" style={{ borderColor: collabStatus === 'live' ? '#10b981' : collabStatus === 'syncing' ? '#f59e0b' : '#ef4444' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: collabStatus === 'live' ? '#10b981' : collabStatus === 'syncing' ? '#f59e0b' : '#ef4444',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontWeight: 600, color: collabStatus === 'live' ? '#059669' : collabStatus === 'syncing' ? '#d97706' : '#dc2626' }}>
                {collabStatus === 'live'
                  ? `Live Collab · ${fileCollabs.length + 1} editing`
                  : collabStatus === 'syncing'
                  ? 'Syncing changes…'
                  : 'Offline (reconnecting)'}
              </span>
            </span>

            {/* MongoDB Save Status Indicator */}
            <span className="workspace-meta-pill">
              {saveStatus === 'saving' ? (
                <>
                  <Clock3 size={14} color="#f59e0b" />
                  <span style={{ color: '#d97706', fontWeight: 600 }}>Saving to MongoDB...</span>
                </>
              ) : saveStatus === 'unsaved' ? (
                <>
                  <Clock3 size={14} color="#6366f1" />
                  <span style={{ color: '#4f46e5', fontWeight: 600 }}>Unsaved changes</span>
                </>
              ) : saveStatus === 'error' ? (
                <>
                  <X size={14} color="#ef4444" />
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>Save failed</span>
                </>
              ) : (
                <>
                  <Check size={14} color="#10b981" />
                  <span style={{ color: '#059669', fontWeight: 600 }}>✓ Saved (MongoDB)</span>
                </>
              )}
            </span>
          </div>
        </div>

        <div className="workspace-actions">
          {/* Teacher Take Control button */}
          {isInstructor && (
            <button
              className={activeController ? 'danger-btn' : 'secondary-btn'}
              onClick={onTakeControl}
              title={activeController ? 'Release instructor control' : 'Take full control for debugging assistance'}
            >
              <Radio size={16} />
              {activeController ? 'Release Control' : 'Take Control'}
            </button>
          )}

          {/* Manage Access Button */}
          {(isInstructor || isOwner) && (
            <button className="secondary-btn" onClick={onManageAccess}>
              <Share2 size={16} /> Share Workspace
            </button>
          )}

          {/* Save Button */}
          <button className="secondary-btn" onClick={handleManualSave} disabled={isReadOnly || isSaving}>
            <Check size={16} /> Save (Ctrl+S)
          </button>

          {/* Run Code Button */}
          <button className="primary-btn" onClick={handleExecute} disabled={running}>
            <Play size={16} fill="currentColor" /> {running ? 'Executing…' : 'Run Python'}
          </button>
        </div>
      </div>

      {/* 3-Panel IDE Shell */}
      <div className="ide-shell">
        {/* Left Panel: File Explorer */}
        <aside className="file-sidebar">
          <div className="file-sidebar-title">
            <span>FILES</span>
            {!isReadOnly && (
              <button className="icon-btn" onClick={onAddFile} title="New file">
                <FilePlus2 size={16} />
              </button>
            )}
          </div>

          <div className="folder-title">
            <Folder size={15} color="#4f46e5" />
            <span>PROJECT ROOT</span>
          </div>

          {files.map((f: any) => (
            <div
              key={f.name}
              className={`file-item ${activeFileName === f.name ? 'selected' : ''}`}
              onClick={() => setActiveFileName(f.name)}
              style={{ cursor: 'pointer' }}
            >
              <FileCode2
                size={16}
                color={f.name.endsWith('.py') ? '#eab308' : f.name.endsWith('.md') ? '#10b981' : '#64748b'}
              />
              <span>{f.name}</span>
              {!isReadOnly && files.length > 1 && (
                <button
                  className="file-del-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile(f.name);
                  }}
                  title={`Delete ${f.name}`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}

          {!isReadOnly && (
            <button className="new-file-link" onClick={onAddFile}>
              <Plus size={15} /> Add new file
            </button>
          )}

          <div className="sync-note">
            <div className="sync-icon">
              <Lock size={16} />
            </div>
            <div>
              <b>{sharedWith.length === 0 ? 'Private Environment' : 'Collaborative Sandbox'}</b>
              <small>MongoDB Persisted · Yjs Live</small>
            </div>
          </div>
        </aside>

        {/* Center Panel: Monaco Editor & Output Console */}
        <section className="editor-column">
          {/* Active Instructor Control Banner */}
          {activeController && (
            <div className="take-control-banner">
              <span>
                👨‍🏫 <b>Instructor Assistance:</b> {activeController} is currently editing this workspace.
              </span>
              {isInstructor && (
                <button
                  className="danger-btn"
                  style={{ height: '28px', padding: '0 8px', fontSize: '12px' }}
                  onClick={onTakeControl}
                >
                  Release
                </button>
              )}
            </div>
          )}

          {/* Editor Header Bar with Live Collaborators */}
          <div className="editor-tab" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="python-icon">{currentFile?.language === 'python' ? 'Py' : 'Doc'}</span>
              <b>{activeFileName}</b>
            </div>

            {/* Collaborator Presence Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Local User Badge */}
              <span
                className="collaborator-cursor-tag"
                style={{ borderColor: getUserColor(userId) }}
                title={`${name} (You)`}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: getUserColor(userId),
                    display: 'inline-block',
                  }}
                />
                You {isOwner ? '(Owner)' : ''}
              </span>

              {/* Remote Peer Badges currently editing this file */}
              {fileCollabs.map((c: any, idx: number) => (
                <span
                  key={idx}
                  className="collaborator-cursor-tag"
                  style={{ borderColor: c.color }}
                  title={`${c.name} (Live editing ${activeFileName})`}
                >
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: c.color,
                      display: 'inline-block',
                    }}
                  />
                  {c.name}
                </span>
              ))}
            </div>
          </div>

          <div className="editor-wrap">
            <Editor
              height="100%"
              language={currentFile?.language || 'python'}
              theme="vs-dark"
              value={code}
              onMount={(editor) => {
                editorRef.current = editor;
                attachYjs(editor);
              }}
              options={{
                fontSize: 14,
                fontFamily: '"Cascadia Code", "Fira Code", monospace',
                minimap: { enabled: false },
                readOnly: isReadOnly,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
          </div>

          {/* Integrated Output Console */}
          <div className="terminal">
            <div className="terminal-head">
              <span>OUTPUT CONSOLE</span>
              <button
                onClick={handleExecute}
                disabled={running}
                style={{ color: '#818cf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Play size={12} fill="currentColor" /> {running ? 'Executing...' : '▶ Execute'}
              </button>
            </div>
            <div className="terminal-body">
              <pre>{output}</pre>
            </div>
          </div>
        </section>

        {/* Right Panel: Collaboration & Access Info / Workspace Chat */}
        <aside className="workspace-right" style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            className="right-panel-header"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className={`filter-pill ${workspaceRightTab === 'access' ? 'active' : ''}`}
                onClick={() => setWorkspaceRightTab('access')}
                style={{ fontSize: '11.5px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <Users size={13} /> Collaborators ({collaborators.length || 1})
              </button>
              <button
                className={`filter-pill ${workspaceRightTab === 'chat' ? 'active' : ''}`}
                onClick={() => {
                  setWorkspaceRightTab('chat');
                  setWorkspaceUnreadCount(0);
                }}
                style={{ fontSize: '11.5px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <MessageSquare size={13} /> Chat
                {workspaceUnreadCount > 0 && (
                  <span
                    style={{
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '10px',
                    }}
                  >
                    {workspaceUnreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {workspaceRightTab === 'access' ? (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* Presence Roster */}
              <div className="workspace-side-section">
                <div className="side-section-head">
                  <b>ONLINE COLLABORATORS ({collaborators.length || 1})</b>
                </div>
                <div className="collaborators-roster">
                  {collaborators.length === 0 ? (
                    <div className="collab-person-row">
                      <span className="avatar avatar-blue">ME</span>
                      <div className="collab-person-info">
                        <b>You</b>
                        <small>{isOwner ? '👑 Owner' : role}</small>
                      </div>
                    </div>
                  ) : (
                    collaborators.map((c: any, i: number) => (
                      <div className="collab-person-row" key={i}>
                        <span
                          className="avatar"
                          style={{
                            backgroundColor: getUserColor(c.userId),
                            color: '#ffffff',
                            fontWeight: 700,
                          }}
                        >
                          {(c.name || 'User').split(' ').map((s: string) => s[0]).slice(0, 2).join('')}
                        </span>
                        <div className="collab-person-info">
                          <b>{c.name} {c.userId === userId ? '(You)' : ''}</b>
                          <small>
                            {c.userId === ownerId
                              ? '👑 Workspace Owner'
                              : c.role === 'teacher'
                              ? '👨‍🏫 Instructor'
                              : 'Student Collaborator'}
                          </small>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Permission Details */}
              <div className="workspace-side-section">
                <div className="side-section-head">
                  <b>ACCESS MODEL</b>
                </div>
                <div className="access-info-card">
                  <b>{sharedWith.length === 0 ? '🔒 Private Workspace' : '👥 Shared Workspace'}</b>
                  <p style={{ margin: '4px 0 10px', fontSize: '13px', color: '#64748b' }}>
                    {sharedWith.length === 0
                      ? `Only ${ownerName} and classroom instructors have access.`
                      : `Accessible by ${ownerName} and explicitly invited collaborators.`}
                  </p>
                  {sharedWith.length > 0 && (
                    <div style={{ marginTop: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                      <small style={{ fontWeight: 700, color: '#475569' }}>Explicitly shared with:</small>
                      {sharedWith.map((s: any) => (
                        <div
                          key={s.userId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginTop: '4px',
                            fontSize: '12px',
                          }}
                        >
                          <span>{s.name}</span>
                          <span className={`badge-privacy ${s.permission === 'editor' ? 'editor' : 'viewer'}`}>
                            {s.permission}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {(isInstructor || isOwner) && (
                  <button className="secondary-btn" style={{ width: '100%' }} onClick={onManageAccess}>
                    <Share2 size={15} /> Invite Collaborators
                  </button>
                )}
              </div>

              {/* AI Helper Shortcut */}
              <div className="workspace-side-section" style={{ marginTop: 'auto' }}>
                <button
                  className="primary-btn"
                  style={{ width: '100%', background: '#312e81' }}
                  onClick={() => setAiOpen(true)}
                >
                  <Sparkles size={16} /> Ask AI Assistant
                </button>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ChatPanel
                context="workspace"
                contextId={currentWorkspaceId}
                currentUserId={userId}
                currentUserName={name}
                currentUserRole={role}
                onlineCount={collaborators.length || 1}
                canSend={isOwner || isInstructor || myPermission === 'editor'}
                placeholder="Message collaborators in this workspace..."
                height="100%"
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// WORKSPACE ACCESS & PERMISSIONS MODAL
// -------------------------------------------------------------
function WorkspaceAccessModal({ workspace, students, onClose, onGrantAccess, onRevokeAccess }: any) {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedPermission, setSelectedPermission] = useState<'viewer' | 'editor'>('editor');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const sharedUsers: SharedUser[] = workspace?.sharedWith || [];
  const ownerName = workspace?.owner_name || 'Student';
  const ownerId = workspace?.owner_id;

  // Search classmates dynamically
  useEffect(() => {
    let active = true;
    if (searchQuery.trim().length > 0) {
      setIsSearching(true);
      searchClassmateUsers(searchQuery)
        .then((res) => {
          if (active) {
            // filter out owner and already shared
            const filtered = res.filter(
              (u: any) => u.userId !== ownerId && !sharedUsers.some((su) => su.userId === u.userId)
            );
            setSearchResults(filtered);
            setIsSearching(false);
          }
        })
        .catch(() => {
          if (active) setIsSearching(false);
        });
    } else {
      // Fallback to local students list
      const fallback = (students || []).filter(
        (s: any) => s.userId !== ownerId && !sharedUsers.some((u) => u.userId === s.userId)
      );
      setSearchResults(fallback);
    }
    return () => {
      active = false;
    };
  }, [searchQuery, students, ownerId, sharedUsers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) return;
    onGrantAccess(selectedStudentId, selectedPermission);
    setSelectedStudentId('');
    setSearchQuery('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Share Workspace: {ownerName}</h2>
            <p>Collaborate with classmates in real time on the same project and files.</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="access-info-card" style={{ marginBottom: '20px' }}>
          <b>🔒 Privacy & Ownership</b>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
            This workspace belongs to <b>{ownerName}</b>. Invited classmates with Editor access can write and edit code together with conflict-free synchronization.
          </p>
        </div>

        <div className="side-section-head" style={{ marginBottom: '10px' }}>
          <b>CURRENT WORKSPACE MEMBERS ({sharedUsers.length + 1})</b>
        </div>

        <div className="permission-list-wrap">
          {/* Workspace Owner */}
          <div className="perm-user-row">
            <span className="avatar avatar-blue">{ownerName.slice(0, 2).toUpperCase()}</span>
            <div style={{ flex: 1 }}>
              <b>{ownerName}</b>
              <small>Workspace Owner · Personal Sandbox</small>
            </div>
            <span className="badge-privacy private">Owner</span>
          </div>

          {/* Shared Classmates */}
          {sharedUsers.map((u) => (
            <div className="perm-user-row" key={u.userId}>
              <span className="avatar avatar-green">{u.name.slice(0, 2).toUpperCase()}</span>
              <div style={{ flex: 1 }}>
                <b>{u.name}</b>
                <small>{u.email || 'Classmate'}</small>
              </div>
              <span className={`badge-privacy ${u.permission === 'editor' ? 'editor' : 'viewer'}`}>
                {u.permission === 'editor' ? '✏ Editor' : '👁 Viewer'}
              </span>
              <button
                className="danger-btn"
                style={{ height: '32px', padding: '0 10px', fontSize: '12px' }}
                onClick={() => onRevokeAccess(u.userId)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* Invite Form */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', marginTop: '16px' }}>
          <div className="side-section-head" style={{ marginBottom: '12px' }}>
            <b>INVITE A CLASSMATE</b>
          </div>

          <form onSubmit={handleSubmit} className="modal-form">
            <label>
              Search Students {isSearching && <small style={{ color: '#6366f1' }}>(Searching...)</small>}
              <input
                type="text"
                placeholder="Type name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ marginBottom: '8px' }}
              />
            </label>

            <label>
              Select Student ({searchResults.length} found)
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                required
              >
                <option value="">-- Select student to invite --</option>
                {searchResults.map((s: any) => (
                  <option key={s.userId} value={s.userId}>
                    {s.name} ({s.email || 'Student'})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Permission
              <div style={{ display: 'flex', gap: '20px', marginTop: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="radio"
                    name="perm"
                    value="editor"
                    checked={selectedPermission === 'editor'}
                    onChange={() => setSelectedPermission('editor')}
                    style={{ height: 'auto' }}
                  />
                  <span><b>Editor:</b> Can edit files together in real time</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="radio"
                    name="perm"
                    value="viewer"
                    checked={selectedPermission === 'viewer'}
                    onChange={() => setSelectedPermission('viewer')}
                    style={{ height: 'auto' }}
                  />
                  <span><b>Viewer:</b> Read-only access</span>
                </label>
              </div>
            </label>

            <button
              className="primary-btn full-btn"
              type="submit"
              disabled={!selectedStudentId}
              style={{ marginTop: '12px' }}
            >
              <UserPlus size={16} /> Share Workspace
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// LIVE CLASSROOM VIEW
// -------------------------------------------------------------
// -------------------------------------------------------------
// LIVE CLASSROOM VIEW (WEBRTC SCREEN SHARE + MONGODB CHAT)
// -------------------------------------------------------------
// -------------------------------------------------------------
// REAL-TIME VIDEO CLASSROOM (GOOGLE MEET + INTERACTIVE WORKSPACE)
// -------------------------------------------------------------

function AudioPlayer({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch((err) => {
        console.warn('[AudioPlayer] Remote audio play error:', err);
      });
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline />;
}

function VideoTile({
  stream,
  name,
  role,
  isSelf,
  isMicOn,
  isCamOn,
  isSpeaking,
}: {
  stream: MediaStream | null;
  name: string;
  role: string;
  isSelf?: boolean;
  isMicOn: boolean;
  isCamOn: boolean;
  isSpeaking?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (stream && isCamOn && stream.getVideoTracks().length > 0) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream, isCamOn]);

  const initials = (name || 'User')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isTeacher = role?.toLowerCase() === 'teacher' || role?.toLowerCase() === 'instructor';

  return (
    <div className={`video-tile ${isSelf ? 'self' : ''} ${isSpeaking ? 'speaking' : ''}`}>
      {isCamOn && stream && stream.getVideoTracks().length > 0 ? (
        <video ref={videoRef} autoPlay playsInline muted={isSelf} />
      ) : (
        <div className="camera-off-avatar">
          <div className={`camera-off-circle ${isTeacher ? 'blue' : 'green'}`}>{initials}</div>
          <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Camera Off</span>
        </div>
      )}

      {/* Play remote participant audio */}
      {!isSelf && stream && stream.getAudioTracks().length > 0 && (
        <AudioPlayer stream={stream} />
      )}

      <div className="video-tile-overlay">
        <div className="participant-name-tag">
          <span>{name} {isSelf ? '(You)' : ''}</span>
          <span className={`role-tag ${isTeacher ? 'instructor' : 'student'}`}>
            {isTeacher ? 'Instructor' : 'Student'}
          </span>
        </div>

        <div className="tile-media-status">
          <div className={`tile-media-badge ${!isMicOn ? 'muted' : ''}`} title={isMicOn ? 'Microphone Live' : 'Muted'}>
            {isMicOn ? <Mic size={13} /> : <MicOff size={13} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenShareTile({
  stream,
  teacherName,
}: {
  stream: MediaStream | null;
  teacherName: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div className="screenshare-screen-main">
      <video ref={videoRef} autoPlay playsInline />
      <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 10 }}>
        <div className="live-indicator-pill">
          <span className="pulse-dot" />
          <span>🔴 LIVE SCREEN BROADCAST · {teacherName || 'Instructor'}</span>
        </div>
      </div>
    </div>
  );
}

function PrejoinPreviewTile({
  stream,
  isCamOn,
  name,
  role,
}: {
  stream: MediaStream | null;
  isCamOn: boolean;
  name: string;
  role: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream && isCamOn && stream.getVideoTracks().length > 0) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, isCamOn]);

  const initials = (name || 'User')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const isTeacher = role?.toLowerCase() === 'teacher' || role?.toLowerCase() === 'instructor';

  return (
    <div className="prejoin-preview-tile">
      {isCamOn && stream && stream.getVideoTracks().length > 0 ? (
        <video ref={videoRef} autoPlay playsInline muted className="prejoin-video" />
      ) : (
        <div className="camera-off-avatar">
          <div className={`camera-off-circle ${isTeacher ? 'blue' : 'green'}`}>{initials}</div>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Camera is off</span>
        </div>
      )}
    </div>
  );
}

function ClassroomView({
  classroom,
  role,
  userId,
  name,
  live,
  setLive,
  chat,
  chatDraft: _chatDraft,
  setChatDraft: _setChatDraft,
  onSendMessage: _onSendMessage,
  participants: rosterParticipants,
  setPage,
  setToast,
}: any) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const isTeacher = role === 'Teacher';

  // Local call states
  const [inCall, setInCall] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);

  // Pre-join preview states
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [prejoinCam, setPrejoinCam] = useState(true);
  const [prejoinMic, setPrejoinMic] = useState(true);

  // Call participants and streams
  const [callParticipants, setCallParticipants] = useState<ParticipantMediaState[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, { userMedia: MediaStream; screen: MediaStream | null }>>(new Map());
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);

  // Screen sharing states
  const [remoteScreenActive, setRemoteScreenActive] = useState(false);
  const [remoteTeacherName, setRemoteTeacherName] = useState<string>('Instructor');
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);

  // UI Drawer & Audio states
  const [activeDrawerTab, setActiveDrawerTab] = useState<'chat' | 'participants' | null>('chat');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeDrawerTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chat, activeDrawerTab]);

  // Pre-join camera preview
  useEffect(() => {
    let active = true;
    if (!inCall) {
      navigator.mediaDevices
        ?.getUserMedia({
          video: prejoinCam ? { width: { ideal: 640 }, height: { ideal: 360 } } : false,
          audio: prejoinMic,
        })
        .then((s) => {
          if (active) setPreviewStream(s);
        })
        .catch(() => {
          if (active) setPreviewStream(null);
        });
    }

    return () => {
      active = false;
      if (previewStream) {
        previewStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [inCall, prejoinCam, prejoinMic]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Handle Joining Call
  const handleJoinCall = async () => {
    // Stop pre-join preview tracks
    if (previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
      setPreviewStream(null);
    }

    try {
      const media = await videoClassroomManager.initLocalMedia(prejoinCam, prejoinMic);
      setLocalStream(media);
      setIsCamOn(prejoinCam);
      setIsMicOn(prejoinMic);
      setInCall(true);

      if (isTeacher && !live) {
        setLive();
      }

      videoClassroomManager.joinClassroomCall(
        classroom.id,
        {
          userId,
          name,
          role: isTeacher ? 'teacher' : 'student',
          micEnabled: prejoinMic,
          camEnabled: prejoinCam,
        },
        {
          onParticipantsUpdate: (parts) => {
            setCallParticipants(parts);
          },
          onRemoteStreamsUpdate: (streams) => {
            setRemoteStreams(new Map(streams));
          },
          onScreenShareChange: (isSharing, teacherName, stream) => {
            setRemoteScreenActive(isSharing);
            if (teacherName) setRemoteTeacherName(teacherName);
            if (stream) setRemoteScreenStream(stream);
            if (!isSharing) setRemoteScreenStream(null);
          },
          onClassEnded: (msg) => {
            setInCall(false);
            setLocalStream(null);
            setLocalScreenStream(null);
            setIsSharingScreen(false);
            setRemoteScreenActive(false);
            setRemoteScreenStream(null);
            setToast?.(msg || 'The instructor has ended the live class.');
          },
          onSpeakingChange: (sId, isSpeaking) => {
            if (isSpeaking) {
              setActiveSpeaker(sId);
            } else if (activeSpeaker === sId) {
              setActiveSpeaker(null);
            }
          },
        }
      );
    } catch (err: any) {
      console.error('Failed to join call:', err);
      setToast?.('Could not access media devices: ' + (err?.message || 'Error'));
    }
  };

  // Toggle Microphone
  const handleToggleMic = () => {
    const next = videoClassroomManager.toggleMicrophone();
    setIsMicOn(next);
  };

  // Toggle Camera
  const handleToggleCam = async () => {
    const next = await videoClassroomManager.toggleCamera();
    setIsCamOn(next);
  };

  // Teacher: Start / Stop Screen Share
  const handleToggleScreenShare = async () => {
    if (!isTeacher) return;

    if (isSharingScreen) {
      videoClassroomManager.stopScreenShare();
      setIsSharingScreen(false);
      setLocalScreenStream(null);
    } else {
      try {
        const stream = await videoClassroomManager.startScreenShare(name);
        setLocalScreenStream(stream);
        setIsSharingScreen(true);
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          setToast?.('Screen sharing could not be started.');
        }
      }
    }
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Leave Call (Student)
  const handleLeaveCall = () => {
    videoClassroomManager.leaveCall();
    setInCall(false);
    setLocalStream(null);
    setLocalScreenStream(null);
    setIsSharingScreen(false);
    setRemoteScreenActive(false);
    setRemoteScreenStream(null);
  };

  // End Class (Teacher)
  const handleEndClass = () => {
    videoClassroomManager.endClass();
    setInCall(false);
    setLocalStream(null);
    setLocalScreenStream(null);
    setIsSharingScreen(false);
    setRemoteScreenActive(false);
    setRemoteScreenStream(null);
    if (live) {
      setLive();
    }
  };

  // Unblock Audio on Click
  const handleUnblockAudio = () => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      ctx.resume().then(() => {
        setAudioBlocked(false);
      });
    } else {
      setAudioBlocked(false);
    }
  };

  // Determine active screen sharing stream
  const activeScreenStream = isSharingScreen ? localScreenStream : remoteScreenStream;
  const showScreenShareLayout = Boolean(isSharingScreen || (remoteScreenActive && activeScreenStream));

  // Compute total participant count in call
  const totalCallCount = 1 + callParticipants.length;
  const gridClass = `count-${Math.min(totalCallCount, 6)}`;

  return (
    <div className="page-content">
      {/* Title Header */}
      <div className="classroom-title-row">
        <div>
          <div className="date-label">INTERACTIVE LIVE CLASSROOM</div>
          <h1>{classroom.name}<span className="heading-period">.</span></h1>
          <p>{classroom.description || 'Interactive Google Meet video classroom, real-time WebRTC screen broadcast, and MongoDB chat.'}</p>
        </div>

        <div className="welcome-actions">
          {isTeacher && (
            <button className={live ? 'danger-btn' : 'primary-btn'} onClick={setLive}>
              <Radio size={16} /> {live ? 'End Live Session' : 'Start Live Session'}
            </button>
          )}
        </div>
      </div>

      {/* Main Video Classroom Container */}
      <div className="video-classroom-container" ref={containerRef}>
        {/* Audio Blocked Autoplay Alert Banner */}
        {audioBlocked && (
          <div className="audio-unblock-banner" onClick={handleUnblockAudio}>
            <VolumeX size={18} color="#f87171" />
            <span>Click to enable classroom audio playback</span>
            <Volume2 size={16} color="#10b981" />
          </div>
        )}

        {/* 1. Pre-join Lobby View */}
        {!inCall ? (
          <div className="prejoin-lobby">
            <div className="prejoin-card">
              <h2 style={{ margin: '0 0 6px', color: '#ffffff', fontSize: '22px' }}>
                {isTeacher ? 'Start Live Class' : live ? 'Live Class in Progress' : 'Classroom Standby'}
              </h2>
              <p style={{ margin: '0 0 20px', color: '#94a3b8', fontSize: '13.5px', textAlign: 'center' }}>
                {isTeacher
                  ? 'Check your camera and microphone preview before starting the class.'
                  : live
                  ? 'Your instructor is currently teaching. Join the live video session below.'
                  : 'The instructor has not started a live class yet. You can open your private workspace to continue coding.'}
              </p>

              {/* Prejoin Camera Preview */}
              <PrejoinPreviewTile
                stream={previewStream}
                isCamOn={prejoinCam}
                name={name}
                role={role}
              />

              {/* Device Toggle Buttons */}
              <div className="prejoin-controls">
                <button
                  className={`prejoin-toggle-btn ${!prejoinMic ? 'off' : ''}`}
                  onClick={() => setPrejoinMic(!prejoinMic)}
                >
                  {prejoinMic ? <Mic size={16} /> : <MicOff size={16} />}
                  <span>{prejoinMic ? 'Mic On' : 'Mic Off'}</span>
                </button>

                <button
                  className={`prejoin-toggle-btn ${!prejoinCam ? 'off' : ''}`}
                  onClick={() => setPrejoinCam(!prejoinCam)}
                >
                  {prejoinCam ? <Video size={16} /> : <VideoOff size={16} />}
                  <span>{prejoinCam ? 'Camera On' : 'Camera Off'}</span>
                </button>
              </div>

              {/* Primary Join Button */}
              {isTeacher || live ? (
                <button
                  className="primary-btn"
                  style={{ width: '100%', height: '46px', fontSize: '15px', borderRadius: '12px' }}
                  onClick={handleJoinCall}
                >
                  <Video size={18} /> {isTeacher ? 'Start Live Class' : 'Join Live Class'}
                </button>
              ) : (
                <button
                  className="primary-btn"
                  style={{ width: '100%', height: '46px', fontSize: '15px', borderRadius: '12px' }}
                  onClick={() => setPage('Workspace')}
                >
                  <Code2 size={18} /> Open My Workspace
                </button>
              )}
            </div>
          </div>
        ) : (
          /* 2. In-Call Interactive Stage */
          <>
            {/* Top Stage Header */}
            <div className="classroom-stage-header">
              <div className="classroom-badge-row">
                <div className="live-indicator-pill">
                  <span className="pulse-dot" />
                  <span>🔴 LIVE CLASS</span>
                </div>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                  {classroom.name} ({classroom.batch})
                </span>
              </div>

              <div className="classroom-badge-row">
                <div className="participant-name-tag" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <Users size={14} color="#818cf8" />
                  <span>{totalCallCount} in call</span>
                </div>

                <button
                  className="icon-btn"
                  style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', borderRadius: '8px', width: '34px', height: '34px' }}
                  onClick={handleToggleFullscreen}
                  title="Toggle Fullscreen"
                >
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </div>

            {/* Video Stage & Side Drawer Shell */}
            <div className="classroom-main-stage">
              {/* Screen Share Dominant Layout OR Multi-Peer Video Grid */}
              {showScreenShareLayout ? (
                <div className="screenshare-stage-layout">
                  {/* Dominant Screen Video */}
                  <ScreenShareTile
                    stream={activeScreenStream}
                    teacherName={isSharingScreen ? name : remoteTeacherName}
                  />

                  {/* Horizontal Thumbnail Strip for Participant Cameras */}
                  <div className="screenshare-participants-strip">
                    {/* Self Tile */}
                    <VideoTile
                      stream={localStream}
                      name={name}
                      role={role}
                      isSelf={true}
                      isMicOn={isMicOn}
                      isCamOn={isCamOn}
                      isSpeaking={activeSpeaker === 'local'}
                    />

                    {/* Remote Participants Tiles */}
                    {callParticipants.map((p) => {
                      const peerStreams = remoteStreams.get(p.socketId);
                      return (
                        <VideoTile
                          key={p.socketId}
                          stream={peerStreams ? peerStreams.userMedia : null}
                          name={p.name}
                          role={p.role}
                          isMicOn={p.micEnabled}
                          isCamOn={p.camEnabled}
                          isSpeaking={activeSpeaker === p.socketId}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Multi-Peer Video Grid Layout */
                <div className="video-grid-wrapper">
                  <div className={`video-grid ${gridClass}`}>
                    {/* Self Video Tile */}
                    <VideoTile
                      stream={localStream}
                      name={name}
                      role={role}
                      isSelf={true}
                      isMicOn={isMicOn}
                      isCamOn={isCamOn}
                      isSpeaking={activeSpeaker === 'local'}
                    />

                    {/* Remote Participants Tiles */}
                    {callParticipants.map((p) => {
                      const peerStreams = remoteStreams.get(p.socketId);
                      return (
                        <VideoTile
                          key={p.socketId}
                          stream={peerStreams ? peerStreams.userMedia : null}
                          name={p.name}
                          role={p.role}
                          isMicOn={p.micEnabled}
                          isCamOn={p.camEnabled}
                          isSpeaking={activeSpeaker === p.socketId}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Right Side Drawer: Chat & Participants */}
              {activeDrawerTab && (
                <aside className="classroom-right-drawer">
                  {/* Drawer Navigation Tabs */}
                  <div className="drawer-tabs">
                    <button
                      className={`drawer-tab ${activeDrawerTab === 'chat' ? 'active' : ''}`}
                      onClick={() => setActiveDrawerTab('chat')}
                    >
                      <MessageSquare size={16} />
                      <span>Classroom Chat</span>
                    </button>
                    <button
                      className={`drawer-tab ${activeDrawerTab === 'participants' ? 'active' : ''}`}
                      onClick={() => setActiveDrawerTab('participants')}
                    >
                      <Users size={16} />
                      <span>People ({rosterParticipants.length})</span>
                    </button>
                    <button
                      className="icon-btn"
                      style={{ padding: '0 12px' }}
                      onClick={() => setActiveDrawerTab(null)}
                      title="Close Panel"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Drawer Content */}
                  <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {activeDrawerTab === 'chat' ? (
                      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <ChatPanel
                          context="classroom"
                          contextId={classroom?.id || ''}
                          currentUserId={userId}
                          currentUserName={name}
                          currentUserRole={role}
                          onlineCount={callParticipants.length || rosterParticipants?.length || 1}
                          initialMessages={chat}
                          onSendMessage={async (text, replyTo) => {
                            const socket = getSocket();
                            socket.emit('chat:message', {
                              classroomId: classroom?.id,
                              text,
                              name,
                              replyTo,
                            });
                          }}
                          placeholder="Ask a question or discuss with class..."
                          height="100%"
                        />
                      </div>
                    ) : (
                      /* Participants Roster with Mic/Cam status */
                      <div className="collaborators-roster" style={{ flex: 1, overflowY: 'auto' }}>
                        {/* Current User Row */}
                        <div className="collab-person-row">
                          <span className={`avatar avatar-${isTeacher ? 'blue' : 'green'}`}>
                            {name.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="collab-person-info" style={{ flex: 1 }}>
                            <b>{name} (You)</b>
                            <small>{isTeacher ? '👨‍🏫 Instructor (Host)' : 'Student'}</small>
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {isMicOn ? <Mic size={14} color="#10b981" /> : <MicOff size={14} color="#f87171" />}
                            {isCamOn ? <Video size={14} color="#10b981" /> : <VideoOff size={14} color="#94a3b8" />}
                          </div>
                        </div>

                        {/* Other Participants */}
                        {rosterParticipants
                          .filter((p: any) => p.userId !== userId)
                          .map((p: any) => {
                            const inCallState = callParticipants.find((cp) => cp.socketId === p.socketId || cp.userId === p.userId);
                            const peerMicOn = inCallState ? inCallState.micEnabled : false;
                            const peerCamOn = inCallState ? inCallState.camEnabled : false;
                            const isPeerTeacher = p.role === 'teacher';

                            return (
                              <div className="collab-person-row" key={p.socketId || p.userId}>
                                <span className={`avatar avatar-${isPeerTeacher ? 'blue' : 'green'}`}>
                                  {p.name.slice(0, 2).toUpperCase()}
                                </span>
                                <div className="collab-person-info" style={{ flex: 1 }}>
                                  <b>{p.name}</b>
                                  <small>{isPeerTeacher ? '👨‍🏫 Instructor' : inCallState ? '🟢 In Video Call' : '🟢 Online'}</small>
                                </div>
                                {inCallState && (
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    {peerMicOn ? <Mic size={14} color="#10b981" /> : <MicOff size={14} color="#f87171" />}
                                    {peerCamOn ? <Video size={14} color="#10b981" /> : <VideoOff size={14} color="#94a3b8" />}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </aside>
              )}
            </div>

            {/* 3. Bottom Control Dock */}
            <div className="classroom-controls-dock">
              {/* Left group: Class Info */}
              <div className="dock-group">
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                  Code: <b style={{ color: '#818cf8', letterSpacing: '1px' }}>{classroom.join_code}</b>
                </span>
              </div>

              {/* Center group: Media & Screen Sharing Controls */}
              <div className="dock-group">
                {/* Mic toggle */}
                <button
                  className={`dock-btn ${!isMicOn ? 'off' : ''}`}
                  onClick={handleToggleMic}
                  title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
                >
                  {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                  <span>{isMicOn ? 'Mute' : 'Unmuted'}</span>
                </button>

                {/* Camera toggle */}
                <button
                  className={`dock-btn ${!isCamOn ? 'off' : ''}`}
                  onClick={handleToggleCam}
                  title={isCamOn ? 'Turn Off Camera' : 'Turn On Camera'}
                >
                  {isCamOn ? <Video size={18} /> : <VideoOff size={18} />}
                  <span>{isCamOn ? 'Camera' : 'Camera Off'}</span>
                </button>

                {/* Screen Share (Teacher only) */}
                {isTeacher && (
                  <button
                    className={`dock-btn ${isSharingScreen ? 'active' : ''}`}
                    onClick={handleToggleScreenShare}
                    title={isSharingScreen ? 'Stop Screen Sharing' : 'Share Screen'}
                  >
                    {isSharingScreen ? <MonitorOff size={18} /> : <Monitor size={18} />}
                    <span>{isSharingScreen ? 'Stop Share' : 'Share Screen'}</span>
                  </button>
                )}
              </div>

              {/* Right group: Drawers, Fullscreen, Leave/End Call */}
              <div className="dock-group">
                {/* Chat toggle */}
                <button
                  className={`dock-btn icon-only ${activeDrawerTab === 'chat' ? 'active' : ''}`}
                  onClick={() => setActiveDrawerTab(activeDrawerTab === 'chat' ? null : 'chat')}
                  title="Classroom Chat"
                >
                  <MessageSquare size={18} />
                </button>

                {/* Participants toggle */}
                <button
                  className={`dock-btn icon-only ${activeDrawerTab === 'participants' ? 'active' : ''}`}
                  onClick={() => setActiveDrawerTab(activeDrawerTab === 'participants' ? null : 'participants')}
                  title="Participants Roster"
                >
                  <Users size={18} />
                </button>

                {/* Fullscreen toggle */}
                <button
                  className="dock-btn icon-only"
                  onClick={handleToggleFullscreen}
                  title="Toggle Fullscreen"
                >
                  {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>

                {/* Leave / End Class */}
                {isTeacher ? (
                  <button
                    className="dock-btn danger"
                    onClick={handleEndClass}
                    title="End Class for All"
                  >
                    <PhoneOff size={18} />
                    <span>End Class</span>
                  </button>
                ) : (
                  <button
                    className="dock-btn danger"
                    onClick={handleLeaveCall}
                    title="Leave Video Call"
                  >
                    <PhoneOff size={18} />
                    <span>Leave</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}



// -------------------------------------------------------------
// MODALS (Create, Join, Help)
// -------------------------------------------------------------
function CreateClassroomModal({ onClose, onCreate }: any) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('Computer Science');
  const [batch, setBatch] = useState('S5 CSE');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({ name: name.trim(), subject, batch, description });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Create New Classroom</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            Classroom Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Advanced Data Structures" required />
          </label>
          <label>
            Batch / Section
            <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="e.g. S5 CSE - Batch B" required />
          </label>
          <label>
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Algorithms & Systems" />
          </label>
          <label>
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will students learn in this digital room?" />
          </label>
          <button className="primary-btn full-btn" type="submit">Create Classroom</button>
        </form>
      </div>
    </div>
  );
}

function JoinClassroomModal({ onClose, onJoin }: any) {
  const [joinCode, setJoinCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onJoin(joinCode.trim().toUpperCase());
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Join Classroom</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            Enter 6-Character Join Code
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. DS5CSE"
              maxLength={12}
              required
              style={{ letterSpacing: '2px', fontSize: '18px', textAlign: 'center', fontWeight: 700 }}
            />
          </label>
          <button className="primary-btn full-btn" type="submit">Join Classroom</button>
        </form>
      </div>
    </div>
  );
}

function HelpModal({ onClose }: any) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Workspace Permission Model Guide</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>
          <div className="access-info-card">
            <b>1. Private by Default</b>
            Every student receives their own private workspace upon joining a classroom. Other students cannot view or edit unless explicitly shared.
          </div>
          <div className="access-info-card">
            <b>2. Full Instructor Visibility</b>
            Instructors have full classroom workspace access: inspecting code, assisting live, and taking temporary control for debugging.
          </div>
          <div className="access-info-card">
            <b>3. Explicit Peer Permissions</b>
            Instructors can grant "Viewer" (read-only) or "Editor" (collaborative real-time editing) access to classmates.
          </div>
        </div>
        <button className="primary-btn full-btn" onClick={onClose} style={{ marginTop: '20px' }}>
          Got It
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// AUTHENTICATION SCREEN
// -------------------------------------------------------------
function AuthScreen({ mode, setMode, onLoginSuccess, setToast }: any) {
  const [email, setEmail] = useState('teacher@school.edu');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('Alex Morgan');
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const res = await apiSignup({
          fullName: name.trim(),
          email: email.trim(),
          password,
          role,
        });
        onLoginSuccess({
          userId: res.user.id,
          name: res.user.full_name,
          role: res.user.role === 'teacher' ? 'Teacher' : 'Student',
        });
      } else {
        const res = await apiLogin({
          email: email.trim(),
          password,
        });
        onLoginSuccess({
          userId: res.user.id,
          name: res.user.full_name,
          role: res.user.role === 'teacher' ? 'Teacher' : 'Student',
        });
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed');
      setToast(err?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '20px' }}>
      <div style={{ width: 'min(100%, 420px)', background: '#ffffff', borderRadius: '16px', padding: '36px', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <DevChamberLogo size={48} />
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: '24px', textAlign: 'center', color: '#1e293b' }}>
          {mode === 'login' ? 'Sign in to DevChamber' : 'Create an Account'}
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: '14px', textAlign: 'center', color: '#64748b' }}>
          Local MySQL 8.4 Isolated Coding Sandboxes
        </p>

        {/* Role Presets */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
          <button
            type="button"
            className={`filter-pill ${role === 'teacher' ? 'active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => {
              setRole('teacher');
              setName('Alex Morgan');
              setEmail('teacher@school.edu');
            }}
          >
            Teacher (Alex)
          </button>
          <button
            type="button"
            className={`filter-pill ${role === 'student' ? 'active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => {
              setRole('student');
              setName('Jordan Lee');
              setEmail('student@school.edu');
            }}
          >
            Student (Jordan)
          </button>
        </div>

        {authError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
            {authError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          {mode === 'signup' && (
            <label>
              Full Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" required />
            </label>
          )}

          <label>
            Email Address
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.edu" required />
          </label>

          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </label>

          <button className="primary-btn full-btn" type="submit" disabled={loading}>
            {loading ? 'Authenticating…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
          {mode === 'login' ? (
            <span>Don't have an account? <button style={{ color: '#4f46e5', fontWeight: 600 }} onClick={() => setMode('signup')}>Sign up</button></span>
          ) : (
            <span>Already have an account? <button style={{ color: '#4f46e5', fontWeight: 600 }} onClick={() => setMode('login')}>Sign in</button></span>
          )}
        </div>
      </div>
    </div>
  );
}
