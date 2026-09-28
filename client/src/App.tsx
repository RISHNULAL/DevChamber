import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Command,
  FileCode2,
  FilePlus2,
  Folder,
  GraduationCap,
  LayoutDashboard,
  Link2,
  LogOut,
  Maximize2,
  Menu,
  MessageCircle,
  Minimize2,
  PanelRightClose,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
  Video,
  X,
} from 'lucide-react';

import {
  supabase,
  fetchClassrooms,
  createClassroom as apiCreateClassroom,
  joinClassroomByCode as apiJoinClassroom,
  fetchMyWorkspace,
  fetchClassroomWorkspaces,
  saveWorkspaceFile,
  updateWorkspacePermission,
  takeWorkspaceControl,
  runPythonCode,
  fetchAssessments,
  createAssessment as apiCreateAssessment,
  updateAssessmentStatus,
  submitAssessment as apiSubmitAssessment,
  fetchAssessmentSubmissions,
  fetchResources,
  createResource as apiCreateResource,
  fetchAssignments,
  createAssignment as apiCreateAssignment,
  askAiAssistant,
} from './services/api';

import { getSocket, disconnectSocket } from './services/socket';
import { screenShareManager } from './services/webrtc';

type Page = 'Home' | 'Classroom' | 'Workspaces' | 'Workspace' | 'Resources' | 'Assignments' | 'Assessments' | 'Analytics';
type Role = 'Teacher' | 'Student';

interface WorkspaceFile {
  id?: string;
  name: string;
  language: string;
  content: string;
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

interface AssessmentItem {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  status: 'draft' | 'published' | 'active' | 'ended';
  questions?: Array<{
    id: string;
    prompt: string;
    options: string[];
    answer_key?: any;
    points: number;
  }>;
}

interface SubmissionItem {
  id: string;
  assessment_id: string;
  student_id: string;
  student_name: string;
  answers: Record<string, any>;
  score: number;
  total_points: number;
  submitted_at: string;
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
print(f"Index of 16: {binary_search(values, 16)}")
print(f"Index of 42: {binary_search(values, 42)}")`;

const seedFiles: WorkspaceFile[] = [
  { name: 'main.py', language: 'python', content: starterCode },
  { name: 'notes.md', language: 'markdown', content: '# Binary Search Notes\n\n- Time Complexity: O(log n)\n- Auxiliary Space: O(1)\n- Invariant: elements must be sorted.' },
];

const NAV: { name: Page; icon: typeof LayoutDashboard }[] = [
  { name: 'Home', icon: LayoutDashboard },
  { name: 'Classroom', icon: Video },
  { name: 'Workspaces', icon: Folder },
  { name: 'Workspace', icon: Code2 },
  { name: 'Resources', icon: BookOpen },
  { name: 'Assignments', icon: FileCode2 },
  { name: 'Assessments', icon: GraduationCap },
  { name: 'Analytics', icon: Activity },
];

export default function App() {
  const [page, setPage] = useState<Page>('Home');
  const [role, setRole] = useState<Role>(() => (localStorage.getItem('dc-role') as Role) || 'Teacher');
  const [name, setName] = useState(() => localStorage.getItem('dc-name') || 'Alex Morgan');
  const [userId, setUserId] = useState(() => localStorage.getItem('dc-user-id') || 'teacher-alex');
  const [signedIn, setSignedIn] = useState(() => Boolean(localStorage.getItem('dc-session')));
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [modal, setModal] = useState('');
  const [toast, setToast] = useState('');

  // Classroom state
  const [classrooms, setClassrooms] = useState<ClassroomItem[]>([]);
  const [activeClassroom, setActiveClassroom] = useState<ClassroomItem>({
    id: 'ds-s5-cse',
    name: 'Data Structures',
    subject: 'Computer Science',
    description: 'Algorithms, data structures, and problem solving.',
    batch: 'S5 CSE',
    join_code: 'DS5CSE',
    is_live: false,
  });

  const [live, setLive] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteScreenFrame, setRemoteScreenFrame] = useState<string | null>(null);
  const [pipOpen, setPipOpen] = useState(false);

  // Roster & Chat
  const [participants, setParticipants] = useState<Array<{ socketId: string; userId: string; name: string; role: string }>>([
    { socketId: 's1', userId: 'teacher-alex', name: 'Alex Morgan', role: 'teacher' },
    { socketId: 's2', userId: 'student-jordan', name: 'Jordan Lee', role: 'student' },
    { socketId: 's3', userId: 'student-maya', name: 'Maya Chen', role: 'student' },
  ]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatDraft, setChatDraft] = useState('');

  // Workspace & Collaboration
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState('ws-jordan');
  const [workspaceTitle, setWorkspaceTitle] = useState("Jordan's Workspace");
  const [workspaceOwnerId, setWorkspaceOwnerId] = useState('student-jordan');
  const [files, setFiles] = useState<WorkspaceFile[]>(seedFiles);
  const [activeFileName, setActiveFileName] = useState('main.py');
  const [code, setCode] = useState(starterCode);
  const [output, setOutput] = useState('Your program output will appear here.');
  const [running, setRunning] = useState(false);
  const [workspacePermissions, setWorkspacePermissions] = useState<Record<string, 'owner' | 'editor' | 'viewer'>>({
    'student-jordan': 'owner',
    'teacher-alex': 'editor',
  });
  const [activeController, setActiveController] = useState<string | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<any[]>([]);
  const [collaborators, setCollaborators] = useState<any[]>([]);

  // Assessments
  const [assessmentsList, setAssessmentsList] = useState<AssessmentItem[]>([]);
  const [activeExam, setActiveExam] = useState<AssessmentItem | null>(null);
  const [examSubmissions, setExamSubmissions] = useState<SubmissionItem[]>([]);
  const [examAnswers, setExamAnswers] = useState<Record<string, any>>({});
  const [examCurrentIndex, setExamCurrentIndex] = useState(0);
  const [examResult, setExamResult] = useState<SubmissionItem | null>(null);

  // Resources & Assignments
  const [resourcesList, setResourcesList] = useState<any[]>([]);
  const [assignmentsList, setAssignmentsList] = useState<any[]>([]);

  // AI Assistant
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const teacherVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  // Check Supabase session on mount
  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) {
          setSignedIn(true);
          const meta = data.session.user.user_metadata || {};
          if (meta.full_name) setName(meta.full_name);
          if (meta.role) setRole(meta.role === 'teacher' ? 'Teacher' : 'Student');
          setUserId(data.session.user.id);
        }
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setSignedIn(true);
          const meta = session.user.user_metadata || {};
          if (meta.full_name) setName(meta.full_name);
          if (meta.role) setRole(meta.role === 'teacher' ? 'Teacher' : 'Student');
          setUserId(session.user.id);
        } else {
          setSignedIn(false);
        }
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  // Save session state to localStorage
  useEffect(() => {
    localStorage.setItem('dc-role', role);
    localStorage.setItem('dc-name', name);
    localStorage.setItem('dc-user-id', userId);
  }, [role, name, userId]);

  // Toast timer
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load classrooms on sign in or classroom change
  const loadClassrooms = async () => {
    try {
      const list = await fetchClassrooms();
      if (list && list.length > 0) {
        setClassrooms(list);
        const match = list.find((c: any) => c.id === activeClassroom.id) || list[0];
        setActiveClassroom(match);
      }
    } catch {
      // Keep default active classroom
    }
  };

  useEffect(() => {
    if (signedIn) {
      loadClassrooms();
    }
  }, [signedIn, role]);

  // Setup Socket.IO connection and room subscriptions
  useEffect(() => {
    if (!signedIn || !activeClassroom.id) return;

    let cleanupListeners: (() => void) | undefined;

    getSocket().then((socket) => {
      socket.emit('classroom:join', { classroomId: activeClassroom.id, name });

      socket.on('classroom:roster', (roster: any[]) => {
        setParticipants(roster);
      });

      socket.on('classroom:user-online', (user: any) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.socketId === user.socketId || p.userId === user.userId)) return prev;
          return [...prev, user];
        });
      });

      socket.on('classroom:user-offline', ({ socketId, userId: offId }: any) => {
        setParticipants((prev) => prev.filter((p) => p.socketId !== socketId && p.userId !== offId));
      });

      socket.on('classroom:session-state', ({ isLive }: { isLive: boolean }) => {
        setLive(isLive);
      });

      socket.on('chat:history', (history: ChatMsg[]) => {
        setChat(history);
      });

      socket.on('chat:message', (msg: ChatMsg) => {
        setChat((prev) => [...prev, msg]);
      });

      socket.on('assessment:started', ({ assessment }: any) => {
        setToast(`🔔 Assessment started: ${assessment.title}`);
        loadAssessmentsData();
      });

      socket.on('assessment:submitted', ({ submission }: any) => {
        setToast(`📝 ${submission.student_name} submitted quiz (${submission.score}/${submission.total_points} pts)`);
        loadAssessmentsData();
      });

      // Listen for screen frames
      screenShareManager.setupStudentScreenListener(
        activeClassroom.id,
        (stream) => {
          if (pipVideoRef.current && stream) pipVideoRef.current.srcObject = stream;
        },
        (frame) => {
          setRemoteScreenFrame(frame);
          if (frame && !pipOpen && page === 'Workspace') {
            setPipOpen(true);
          }
        }
      ).then((cleanup) => {
        cleanupListeners = cleanup;
      });
    });

    return () => {
      if (cleanupListeners) cleanupListeners();
      getSocket().then((socket) => {
        socket.emit('classroom:leave', { classroomId: activeClassroom.id });
        socket.off('classroom:roster');
        socket.off('classroom:user-online');
        socket.off('classroom:user-offline');
        socket.off('classroom:session-state');
        socket.off('chat:history');
        socket.off('chat:message');
        socket.off('assessment:started');
        socket.off('assessment:submitted');
      });
    };
  }, [signedIn, activeClassroom.id, name, page]);

  // Load classroom tabs data (workspaces, assessments, resources, assignments)
  const loadWorkspaceData = async () => {
    try {
      if (role === 'Student') {
        const ws = await fetchMyWorkspace(activeClassroom.id);
        if (ws) {
          setCurrentWorkspaceId(ws.id);
          setWorkspaceTitle(ws.title);
          setWorkspaceOwnerId(ws.owner_id);
          if (ws.files && ws.files.length > 0) {
            setFiles(ws.files);
            const main = ws.files.find((f: any) => f.name === activeFileName) || ws.files[0];
            setActiveFileName(main.name);
            setCode(main.content);
          }
          if (ws.permissions) setWorkspacePermissions(ws.permissions);
        }
      } else {
        // Teacher
        const allWs = await fetchClassroomWorkspaces(activeClassroom.id);
        setAllWorkspaces(allWs);
        if (allWs && allWs.length > 0) {
          const current = allWs.find((w: any) => w.id === currentWorkspaceId) || allWs[0];
          setCurrentWorkspaceId(current.id);
          setWorkspaceTitle(current.title);
          setWorkspaceOwnerId(current.owner_id);
          if (current.files && current.files.length > 0) {
            setFiles(current.files);
            const main = current.files.find((f: any) => f.name === activeFileName) || current.files[0];
            setActiveFileName(main.name);
            setCode(main.content);
          }
          if (current.permissions) setWorkspacePermissions(current.permissions);
        }
      }
    } catch {
      // Use seeded workspace
    }
  };

  const loadAssessmentsData = async () => {
    try {
      const list = await fetchAssessments(activeClassroom.id);
      setAssessmentsList(list || []);
      if (list && list.length > 0) {
        const active = list.find((a: any) => a.status === 'active') || list[0];
        const subs = await fetchAssessmentSubmissions(active.id);
        setExamSubmissions(subs || []);
      }
    } catch {
      // Use fallback
    }
  };

  const loadResourcesData = async () => {
    try {
      const res = await fetchResources(activeClassroom.id);
      setResourcesList(res || []);
      const asg = await fetchAssignments(activeClassroom.id);
      setAssignmentsList(asg || []);
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    if (signedIn && activeClassroom.id) {
      loadWorkspaceData();
      loadAssessmentsData();
      loadResourcesData();
    }
  }, [signedIn, activeClassroom.id, role]);

  // Join workspace socket room for real-time collaboration
  useEffect(() => {
    if (!signedIn || !currentWorkspaceId) return;

    getSocket().then((socket) => {
      socket.emit('workspace:join', { workspaceId: currentWorkspaceId, classroomId: activeClassroom.id });

      socket.on('workspace:presence', (users: any[]) => {
        setCollaborators(users);
      });

      socket.on('workspace:edit', ({ fileName, content }: any) => {
        setFiles((prev) =>
          prev.map((f) => (f.name === fileName ? { ...f, content } : f))
        );
        if (fileName === activeFileName) {
          setCode(content);
        }
      });

      socket.on('workspace:take-control', ({ isControlled, teacherName }: any) => {
        if (isControlled) {
          setActiveController(teacherName);
          setToast(`👨‍🏫 ${teacherName} has taken control of this workspace.`);
        } else {
          setActiveController(null);
          setToast('Teacher released workspace control.');
        }
      });

      socket.on('workspace:permission-update', ({ permissions }: any) => {
        setWorkspacePermissions(permissions);
      });
    });

    return () => {
      getSocket().then((socket) => {
        socket.emit('workspace:leave', { workspaceId: currentWorkspaceId });
        socket.off('workspace:presence');
        socket.off('workspace:edit');
        socket.off('workspace:take-control');
        socket.off('workspace:permission-update');
      });
    };
  }, [signedIn, currentWorkspaceId, activeFileName]);

  // Broadcast code edits in real time
  const handleCodeChange = (newCode: string | undefined) => {
    const val = newCode ?? '';
    setCode(val);
    setFiles((prev) =>
      prev.map((f) => (f.name === activeFileName ? { ...f, content: val } : f))
    );

    getSocket().then((socket) => {
      socket.emit('workspace:edit', {
        workspaceId: currentWorkspaceId,
        fileName: activeFileName,
        content: val,
      });
    });
  };

  // Run Python code
  const handleRunCode = async () => {
    setRunning(true);
    setOutput('Running code in isolated sandbox…');
    try {
      const result = await runPythonCode(code);
      let formattedOutput = '';
      if (result.stdout) formattedOutput += result.stdout;
      if (result.stderr) formattedOutput += `\n[Error Output]:\n${result.stderr}`;
      if (!result.stdout && !result.stderr) formattedOutput = 'Program finished with exit code 0 (no stdout).';
      if (result.executionTimeMs) formattedOutput += `\n\n[Execution time: ${result.executionTimeMs}ms · Exit: ${result.exitCode}]`;
      setOutput(formattedOutput);
    } catch (err: any) {
      setOutput(`Execution failed: ${err.message || 'Runner unavailable.'}`);
    } finally {
      setRunning(false);
    }
  };

  // Save workspace file
  const handleSaveFile = async () => {
    try {
      await saveWorkspaceFile(currentWorkspaceId, activeFileName, code);
      setToast('Workspace saved successfully.');
    } catch (err: any) {
      setToast(err.message || 'Error saving file.');
    }
  };

  // Start / Stop Live Session
  const toggleLiveSession = async (shouldLive: boolean) => {
    setLive(shouldLive);
    const socket = await getSocket();
    socket.emit('classroom:session-state', { classroomId: activeClassroom.id, isLive: shouldLive });
    if (!shouldLive && screenSharing) {
      await handleStopScreenShare();
    }
    setToast(shouldLive ? 'Live classroom started!' : 'Live session ended.');
  };

  // Start / Stop Screen Sharing
  const handleStartScreenShare = async () => {
    try {
      await screenShareManager.startTeacherScreenShare(
        activeClassroom.id,
        (stream) => {
          setScreenSharing(true);
          if (teacherVideoRef.current) {
            teacherVideoRef.current.srcObject = stream;
          }
        },
        () => {
          setScreenSharing(false);
        }
      );
      setScreenSharing(true);
      setToast('Screen sharing started.');
    } catch {
      setToast('Screen sharing was cancelled or unavailable.');
    }
  };

  const handleStopScreenShare = async () => {
    await screenShareManager.stopScreenShare(activeClassroom.id);
    setScreenSharing(false);
    setToast('Screen sharing stopped.');
  };

  // Chat message send
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim()) return;
    const socket = await getSocket();
    socket.emit('chat:message', {
      classroomId: activeClassroom.id,
      text: chatDraft.trim(),
      name,
    });
    setChatDraft('');
  };

  // Create Classroom
  const handleCreateClassroom = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const newRoom = await apiCreateClassroom({
        name: String(fd.get('classroom')),
        subject: String(fd.get('subject')),
        batch: String(fd.get('batch')),
        description: String(fd.get('description')),
      });
      setClassrooms((prev) => [...prev, newRoom]);
      setActiveClassroom(newRoom);
      setModal('');
      setToast(`Classroom created! Join code: ${newRoom.join_code}`);
    } catch (err: any) {
      setToast(err.message || 'Could not create classroom.');
    }
  };

  // Join Classroom
  const handleJoinClassroom = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const codeInput = String(fd.get('joinCode')).trim();
    try {
      const joined = await apiJoinClassroom(codeInput);
      setClassrooms((prev) => [...prev, joined]);
      setActiveClassroom(joined);
      setModal('');
      setToast(`Joined ${joined.name}!`);
      loadWorkspaceData();
    } catch (err: any) {
      setToast(err.message || 'Invalid classroom join code.');
    }
  };

  // Switch demo roles
  const switchDemoRole = (newRole: Role) => {
    setRole(newRole);
    if (newRole === 'Teacher') {
      setName('Alex Morgan');
      setUserId('teacher-alex');
    } else {
      setName('Jordan Lee');
      setUserId('student-jordan');
    }
    disconnectSocket();
    setToast(`Switched view to ${newRole}: ${newRole === 'Teacher' ? 'Alex Morgan' : 'Jordan Lee'}`);
  };

  // Take Control (Instructor Mode)
  const handleTakeControl = async () => {
    try {
      const isCurrentlyControlled = activeController !== null;
      await takeWorkspaceControl(currentWorkspaceId, isCurrentlyControlled);
      const socket = await getSocket();
      socket.emit('workspace:take-control', {
        workspaceId: currentWorkspaceId,
        classroomId: activeClassroom.id,
        isControlled: !isCurrentlyControlled,
        teacherName: name,
      });
      setActiveController(isCurrentlyControlled ? null : name);
      setToast(isCurrentlyControlled ? 'Released workspace control.' : 'You have taken control of this workspace.');
    } catch (err: any) {
      setToast(err.message || 'Error updating control.');
    }
  };

  // AI query
  const handleAskAi = async (e?: React.FormEvent, presetQuestion?: string) => {
    if (e) e.preventDefault();
    const questionText = presetQuestion || aiQuestion;
    if (!questionText.trim()) return;

    setAiLoading(true);
    try {
      const res = await askAiAssistant(questionText, code, 'hint');
      setAiAnswer(res.answer);
    } catch {
      setAiAnswer('Try reviewing the loop bounds: what happens when middle element matches the target?');
    } finally {
      setAiLoading(false);
    }
  };

  // Submit Exam
  const handleExamSubmit = async () => {
    if (!activeExam) return;
    try {
      const sub = await apiSubmitAssessment(activeExam.id, examAnswers);
      setExamResult(sub);
      setToast(`Assessment submitted! Score: ${sub.score}/${sub.total_points}`);
      const socket = await getSocket();
      socket.emit('assessment:submitted', { classroomId: activeClassroom.id, submission: sub });
      loadAssessmentsData();
    } catch (err: any) {
      setToast(err.message || 'Error submitting assessment.');
    }
  };

  // Navigation Filter
  const filteredNav = useMemo(
    () => NAV.filter((item) => role === 'Teacher' || !['Analytics'].includes(item.name)),
    [role]
  );

  // Check editing permission
  const userPermission = workspacePermissions[userId] || (role === 'Teacher' ? 'editor' : 'viewer');
  const isReadOnly = userPermission === 'viewer' && activeController !== name && role !== 'Teacher';

  if (!signedIn) {
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        role={role}
        setRole={setRole}
        name={name}
        setName={setName}
        onLoginSuccess={() => {
          localStorage.setItem('dc-session', 'active');
          setSignedIn(true);
          setPage('Home');
        }}
        setToast={setToast}
      />
    );
  }

  // Fullscreen Exam Screen
  if (activeExam && !examResult) {
    const questions = activeExam.questions || [];
    const currentQ = questions[examCurrentIndex] || questions[0];

    return (
      <div className="exam-screen">
        <header className="exam-header">
          <div className="brand">
            <span className="brand-icon"><Command size={18} /></span>
            devchamber<span className="brand-period">.</span>
          </div>
          <div className="exam-header-title">
            <span className="exam-dot" />
            <span>{activeExam.title}</span>
          </div>
          <button className="icon-btn" onClick={() => setActiveExam(null)}>
            <X size={18} />
          </button>
        </header>

        <main className="exam-body">
          <div className="exam-progress-row">
            <span>Question {examCurrentIndex + 1} of {questions.length}</span>
            <div className="exam-timer">
              <Clock3 size={15} />
              <span>{activeExam.duration_minutes}:00 remaining</span>
            </div>
          </div>
          <div className="exam-progress">
            <span style={{ width: `${((examCurrentIndex + 1) / Math.max(1, questions.length)) * 100}%` }} />
          </div>

          <div className="exam-question-layout">
            <aside className="question-nav">
              <b>QUESTIONS</b>
              <div className="question-grid">
                {questions.map((_, i) => (
                  <button
                    key={i}
                    className={`${examCurrentIndex === i ? 'current' : ''} ${examAnswers[questions[i]?.id] !== undefined ? 'answered' : ''}`}
                    onClick={() => setExamCurrentIndex(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </aside>

            <section className="question-area">
              <div className="question-type">MULTIPLE CHOICE · {currentQ?.points || 1} POINT</div>
              <h1>{currentQ?.prompt}</h1>
              <p className="question-prompt">Select the best answer from the options below:</p>

              <div className="option-list">
                {currentQ?.options?.map((opt, optIdx) => {
                  const isSelected = examAnswers[currentQ.id] === optIdx || examAnswers[currentQ.id] === opt;
                  return (
                    <button
                      key={optIdx}
                      className={`answer-option ${isSelected ? 'chosen' : ''}`}
                      onClick={() => setExamAnswers({ ...examAnswers, [currentQ.id]: optIdx })}
                    >
                      <span className="option-letter">{String.fromCharCode(65 + optIdx)}</span>
                      <span>{opt}</span>
                      {isSelected && <Check size={16} />}
                    </button>
                  );
                })}
              </div>

              <div className="exam-question-controls">
                <button
                  className="secondary-btn"
                  disabled={examCurrentIndex === 0}
                  onClick={() => setExamCurrentIndex(Math.max(0, examCurrentIndex - 1))}
                >
                  <ArrowLeft size={15} /> Previous
                </button>
                {examCurrentIndex < questions.length - 1 ? (
                  <button className="primary-btn" onClick={() => setExamCurrentIndex(examCurrentIndex + 1)}>
                    Next question <ArrowRight size={15} />
                  </button>
                ) : (
                  <button className="primary-btn" onClick={handleExamSubmit}>
                    Submit Assessment <Check size={15} />
                  </button>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  // Exam Result Screen
  if (examResult) {
    return (
      <div className="exam-screen">
        <header className="exam-header">
          <div className="brand">
            <span className="brand-icon"><Command size={18} /></span>
            devchamber<span className="brand-period">.</span>
          </div>
          <button className="icon-btn" onClick={() => { setExamResult(null); setActiveExam(null); }}>
            <X size={18} />
          </button>
        </header>
        <main className="exam-body" style={{ textAlign: 'center', paddingTop: '60px' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#e7f6ed', color: '#41a776', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <Check size={32} />
          </div>
          <h1 style={{ fontSize: '28px', color: '#222a39', margin: '0 0 8px' }}>Assessment Completed!</h1>
          <p style={{ color: '#687790', fontSize: '14px', marginBottom: '24px' }}>
            Your submission has been recorded and evaluated.
          </p>
          <div style={{ display: 'inline-block', background: '#f8faff', border: '1px solid #dbe3f5', borderRadius: '12px', padding: '20px 40px', marginBottom: '32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#6378dc', letterSpacing: '1px' }}>FINAL SCORE</div>
            <div style={{ fontSize: '42px', fontWeight: 800, color: '#172236' }}>
              {examResult.score} <span style={{ fontSize: '20px', color: '#8895ad' }}>/ {examResult.total_points}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#52a77e', fontWeight: 600 }}>
              {Math.round((examResult.score / Math.max(1, examResult.total_points)) * 100)}% Accuracy
            </div>
          </div>
          <div>
            <button className="primary-btn" onClick={() => { setExamResult(null); setActiveExam(null); setPage('Assessments'); }}>
              Return to Assessments <ArrowRight size={15} />
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <button className="brand" onClick={() => setPage('Home')}>
          <span className="brand-icon"><Command size={18} /></span>
          <span>devchamber<span className="brand-period">.</span></span>
        </button>

        <div className="workspace-switch" onClick={() => setModal('select-class')}>
          <span className="class-avatar">{activeClassroom.name.slice(0, 1)}</span>
          <span className="switch-label">
            <b>{activeClassroom.name}</b>
            <small>{activeClassroom.batch} · {role} view</small>
          </span>
          <ChevronDown size={15} />
        </div>

        <div className="nav-section-label">WORKSPACE</div>
        <nav className="side-nav">
          {filteredNav.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${page === item.name ? 'active' : ''}`}
              onClick={() => {
                setPage(item.name);
                setMobileNav(false);
              }}
            >
              <item.icon size={17} />
              <span>{item.name}</span>
              {item.name === 'Classroom' && live && <span className="nav-live" />}
            </button>
          ))}
        </nav>

        <div className="nav-section-label class-list-title">
          YOUR CLASSROOMS{' '}
          <button
            aria-label={role === 'Teacher' ? 'Add classroom' : 'Join classroom'}
            onClick={() => setModal(role === 'Teacher' ? 'create-class' : 'join-class')}
          >
            <Plus size={15} />
          </button>
        </div>

        <button className="class-link selected" onClick={() => setPage('Classroom')}>
          <span className="class-dot blue" />
          {activeClassroom.name}
        </button>

        <div className="sidebar-spacer" />

        <button className="side-help" onClick={() => setModal('help')}>
          <CircleHelp size={16} />
          <span>Help & documentation</span>
        </button>

        <div className="profile-menu">
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
            onClick={async () => {
              if (supabase) await supabase.auth.signOut();
              localStorage.removeItem('dc-session');
              setSignedIn(false);
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Page Area */}
      <main className="main-column">
        {/* Topbar */}
        <header className="topbar">
          <button className="mobile-menu icon-btn" onClick={() => setMobileNav(!mobileNav)}>
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            <span>{activeClassroom.name}</span>
            <ChevronRight size={14} />
            <b>{page === 'Home' ? 'Overview' : page}</b>
          </div>

          <div className="top-actions">
            <button className="search-control" onClick={() => document.getElementById('global-search')?.focus()}>
              <Search size={15} />
              <input
                id="global-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search resources, files..."
              />
              <kbd>⌘ K</kbd>
            </button>

            <button className="icon-btn notification" onClick={() => setToast('Notifications: All synced.')}>
              <Bell size={17} />
              <i />
            </button>

            <span className="top-divider" />

            {/* Role Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className="top-role"
                style={{ cursor: 'pointer', background: '#f0f3fa', padding: '4px 8px', borderRadius: '6px' }}
                onClick={() => switchDemoRole(role === 'Teacher' ? 'Student' : 'Teacher')}
                title="Click to switch role between Teacher and Student"
              >
                <b>{role}</b>: {name.split(' ')[0]}
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        </header>

        <div className="page-scroll">
          {!supabase && (
            <div className="demo-data-banner">
              <Sparkles size={13} />
              <span>
                <b>LOCAL DEMO MODE</b> · Real-time Socket.IO & Python execution active. Multi-tab sessions supported.
              </span>
            </div>
          )}

          {page === 'Home' && (
            <DashboardView
              name={name}
              role={role}
              live={live}
              setPage={setPage}
              setModal={setModal}
              classroom={activeClassroom}
              participantsCount={participants.length}
            />
          )}

          {page === 'Classroom' && (
            <ClassroomView
              classroom={activeClassroom}
              role={role}
              live={live}
              setLive={toggleLiveSession}
              screenSharing={screenSharing}
              onStartScreenShare={handleStartScreenShare}
              onStopScreenShare={handleStopScreenShare}
              remoteScreenFrame={remoteScreenFrame}
              teacherVideoRef={teacherVideoRef}
              chat={chat}
              chatDraft={chatDraft}
              setChatDraft={setChatDraft}
              onSendMessage={handleSendMessage}
              participants={participants}
              setPage={setPage}
            />
          )}

          {page === 'Workspaces' && (
            <WorkspacesListView
              workspaces={allWorkspaces}
              currentWorkspaceId={currentWorkspaceId}
              onSelectWorkspace={(ws: any) => {
                setCurrentWorkspaceId(ws.id);
                setWorkspaceTitle(ws.title);
                setWorkspaceOwnerId(ws.owner_id);
                if (ws.files) setFiles(ws.files);
                if (ws.permissions) setWorkspacePermissions(ws.permissions);
                setPage('Workspace');
              }}
              setPage={setPage}
            />
          )}

          {page === 'Workspace' && (
            <WorkspaceView
              role={role}
              title={workspaceTitle}
              files={files}
              activeFileName={activeFileName}
              setActiveFileName={(fn: string) => {
                setActiveFileName(fn);
                const match = files.find((f) => f.name === fn);
                if (match) setCode(match.content);
              }}
              code={code}
              onCodeChange={handleCodeChange}
              onSaveFile={handleSaveFile}
              onAddFile={() => {
                const fn = prompt('File name (e.g. solution.py, notes.md):');
                if (!fn) return;
                const ext = fn.split('.').pop();
                const lang = ext === 'py' ? 'python' : ext === 'md' ? 'markdown' : 'plaintext';
                setFiles([...files, { name: fn, language: lang, content: '' }]);
                setActiveFileName(fn);
                setCode('');
              }}
              runCode={handleRunCode}
              running={running}
              output={output}
              isReadOnly={isReadOnly}
              activeController={activeController}
              collaborators={collaborators}
              permissions={workspacePermissions}
              onTakeControl={handleTakeControl}
              setModal={setModal}
            />
          )}

          {page === 'Resources' && (
            <ResourcesView
              resources={resourcesList}
              role={role}
              setModal={setModal}
            />
          )}

          {page === 'Assignments' && (
            <AssignmentsView
              assignments={assignmentsList}
              role={role}
              setModal={setModal}
              setToast={setToast}
            />
          )}

          {page === 'Assessments' && (
            <AssessmentsView
              assessments={assessmentsList}
              submissions={examSubmissions}
              role={role}
              onStartQuiz={(assessment: AssessmentItem) => {
                setActiveExam(assessment);
                setExamCurrentIndex(0);
                setExamAnswers({});
                setExamResult(null);
              }}
              onToggleStatus={async (assessmentId: string, status: 'draft' | 'published' | 'active' | 'ended') => {
                await updateAssessmentStatus(assessmentId, status);
                setToast(`Assessment status set to ${status}`);
                loadAssessmentsData();
              }}
              setModal={setModal}
            />
          )}

          {page === 'Analytics' && (
            <AnalyticsView
              activeCount={participants.length}
              submissions={examSubmissions}
            />
          )}
        </div>
      </main>

      {/* Floating Picture-in-Picture Mini Player for Student */}
      {pipOpen && (remoteScreenFrame || screenSharing) && page !== 'Classroom' && (
        <div className="pip-video-window">
          <div className="pip-video-header">
            <span><Video size={13} style={{ marginRight: 4 }} /> Teacher Live Screen</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="icon-btn" style={{ width: 20, height: 20 }} onClick={() => setPage('Classroom')}>
                <Maximize2 size={12} />
              </button>
              <button className="icon-btn" style={{ width: 20, height: 20 }} onClick={() => setPipOpen(false)}>
                <Minimize2 size={12} />
              </button>
            </div>
          </div>
          <div className="pip-video-body">
            {screenSharing ? (
              <video ref={pipVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : remoteScreenFrame ? (
              <img src={remoteScreenFrame} alt="Live Stream" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : null}
          </div>
        </div>
      )}

      {/* AI Assistant FAB & Panel */}
      <button
        className={`assistant-fab ${aiOpen ? 'open' : ''}`}
        onClick={() => setAiOpen(!aiOpen)}
        aria-label="AI Learning Assistant"
      >
        {aiOpen ? <X size={19} /> : <Sparkles size={19} />}
      </button>

      {aiOpen && (
        <div className="ai-panel">
          <div className="ai-head">
            <span className="ai-icon"><Sparkles size={17} /></span>
            <span>
              <b>Learning Assistant</b>
              <small>Socratic guidance & hints</small>
            </span>
            <button className="icon-btn" onClick={() => setAiOpen(false)}>
              <X size={16} />
            </button>
          </div>

          <div className="ai-content">
            <div className="ai-message">
              Hey {name.split(' ')[0]}! I can explain code invariants, clarify binary search bounds, or debug runtime errors. What would you like to explore?
            </div>
            {aiLoading && <div className="ai-message">Thinking through the concept…</div>}
            {aiAnswer && <div className="ai-message reply" style={{ whiteSpace: 'pre-wrap' }}>{aiAnswer}</div>}

            <div className="ai-suggestions">
              <button onClick={() => handleAskAi(undefined, 'Give me a hint on why binary search needs low = middle + 1')}>
                💡 Give me a bounds hint
              </button>
              <button onClick={() => handleAskAi(undefined, 'Explain the time complexity of binary search')}>
                📚 Explain O(log n)
              </button>
              <button onClick={() => handleAskAi(undefined, 'How do I debug an infinite loop in binary search?')}>
                🔍 Debug loop
              </button>
            </div>
          </div>

          <form className="ai-input" onSubmit={(e) => handleAskAi(e)}>
            <input
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder="Ask a question or request a hint…"
            />
            <button aria-label="Send" type="submit">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {/* Toast notifications */}
      {toast && (
        <div className="toast">
          <Check size={16} /> {toast}
        </div>
      )}

      {/* MODALS */}
      {modal === 'select-class' && (
        <Modal title="Switch Classroom" subtitle="Select an active course from your enrolled list." onClose={() => setModal('')}>
          <div style={{ display: 'grid', gap: 8 }}>
            {classrooms.map((c) => (
              <button
                key={c.id}
                className="secondary-btn"
                style={{ justifyContent: 'space-between', padding: '10px 14px', height: 'auto' }}
                onClick={() => {
                  setActiveClassroom(c);
                  setModal('');
                  setToast(`Switched to ${c.name}`);
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <b>{c.name}</b>
                  <div style={{ fontSize: '8px', color: '#828e9f' }}>{c.batch} · Code: {c.join_code}</div>
                </div>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modal === 'create-class' && (
        <Modal title="Create a classroom" subtitle="Start a new collaborative learning space." onClose={() => setModal('')}>
          <form className="modal-form" onSubmit={handleCreateClassroom}>
            <label>
              Classroom name
              <input required name="classroom" placeholder="e.g. Data Structures — S5 CSE" defaultValue="Data Structures — S5 CSE" />
            </label>
            <label>
              Subject
              <input required name="subject" placeholder="e.g. Computer Science" defaultValue="Computer Science" />
            </label>
            <label>
              Batch / Section
              <input name="batch" placeholder="e.g. S5 CSE" defaultValue="S5 CSE" />
            </label>
            <label>
              Description
              <textarea name="description" rows={3} placeholder="What will students learn in this classroom?" defaultValue="Interactive data structures, algorithms, and sandbox coding." />
            </label>
            <button className="primary-btn full-btn" type="submit">
              Create classroom <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}

      {modal === 'join-class' && (
        <Modal title="Join a classroom" subtitle="Enter the code provided by your teacher." onClose={() => setModal('')}>
          <form className="modal-form" onSubmit={handleJoinClassroom}>
            <label>
              Classroom code
              <input required name="joinCode" autoCapitalize="characters" placeholder="e.g. DS5CSE" defaultValue="DS5CSE" />
            </label>
            <button className="primary-btn full-btn" type="submit">
              Join classroom <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}

      {modal === 'permissions' && (
        <Modal title="Workspace Permissions" subtitle="Control who can view and edit this workspace." onClose={() => setModal('')}>
          <div className="permissions-modal">
            <div className="permission-owner-note">
              <ShieldCheck size={16} />
              <span>
                <b>{workspaceTitle}</b>
                <small>Owner: {workspaceOwnerId}</small>
              </span>
            </div>

            {Object.entries(workspacePermissions).map(([personId, perm]) => (
              <div className="permission-row" key={personId}>
                <span className="avatar avatar-blue">{personId.slice(0, 2).toUpperCase()}</span>
                <b>{personId}</b>
                {personId === workspaceOwnerId ? (
                  <span className="owner-tag">Owner</span>
                ) : (
                  <select
                    value={perm}
                    onChange={async (e) => {
                      const newPerm = e.target.value as 'editor' | 'viewer';
                      await updateWorkspacePermission(currentWorkspaceId, personId, newPerm);
                      setWorkspacePermissions({ ...workspacePermissions, [personId]: newPerm });
                      setToast(`Updated ${personId} to ${newPerm}`);
                    }}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                )}
              </div>
            ))}

            <div style={{ marginTop: 12 }}>
              <button
                className="secondary-btn full-btn"
                onClick={async () => {
                  const targetUser = prompt('Enter user ID to grant permission (e.g. student-maya):');
                  if (!targetUser) return;
                  await updateWorkspacePermission(currentWorkspaceId, targetUser, 'editor');
                  setWorkspacePermissions({ ...workspacePermissions, [targetUser]: 'editor' });
                  setToast(`Granted Editor access to ${targetUser}`);
                }}
              >
                + Add Collaborator
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'new-assessment' && (
        <Modal title="Create Assessment / Quiz" subtitle="Add questions to test student understanding." onClose={() => setModal('')}>
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const title = String(fd.get('title'));
              const duration = Number(fd.get('duration')) || 15;
              try {
                await apiCreateAssessment(activeClassroom.id, {
                  title,
                  duration_minutes: duration,
                  questions: [
                    {
                      prompt: 'What is the worst-case time complexity of Binary Search?',
                      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
                      answer_key: 1,
                      points: 1,
                    },
                    {
                      prompt: 'Which condition is strictly required before binary search can be applied?',
                      options: ['Values must be sorted', 'Values must be unique', 'Array size is even', 'Array size is prime'],
                      answer_key: 0,
                      points: 1,
                    },
                  ],
                });
                setModal('');
                setToast('Assessment created and published!');
                loadAssessmentsData();
              } catch (err: any) {
                setToast(err.message || 'Error creating assessment.');
              }
            }}
          >
            <label>
              Assessment Title
              <input required name="title" placeholder="e.g. Binary Search & Big-O Check" defaultValue="Searching Algorithms Quiz" />
            </label>
            <div className="form-row">
              <label>
                Duration (minutes)
                <input type="number" name="duration" defaultValue={15} min={1} />
              </label>
            </div>
            <button className="primary-btn full-btn" type="submit">
              Publish Assessment <ArrowRight size={15} />
            </button>
          </form>
        </Modal>
      )}

      {modal === 'new-resource' && (
        <Modal title="Add Learning Resource" subtitle="Share reference links or documents with your class." onClose={() => setModal('')}>
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              try {
                await apiCreateResource(activeClassroom.id, {
                  title: String(fd.get('title')),
                  url: String(fd.get('url')),
                  description: String(fd.get('description')),
                  kind: 'link',
                });
                setModal('');
                setToast('Resource added successfully!');
                loadResourcesData();
              } catch (err: any) {
                setToast(err.message || 'Error adding resource.');
              }
            }}
          >
            <label>
              Resource Title
              <input required name="title" placeholder="e.g. Visualgo Binary Search Animation" />
            </label>
            <label>
              URL / Link
              <input required name="url" placeholder="https://visualgo.net/en/bst" />
            </label>
            <label>
              Description
              <textarea name="description" rows={2} placeholder="Optional notes for students" />
            </label>
            <button className="primary-btn full-btn" type="submit">
              Save Resource <Check size={15} />
            </button>
          </form>
        </Modal>
      )}

      {modal === 'new-assignment' && (
        <Modal title="Create Assignment" subtitle="Set a coding challenge or problem set." onClose={() => setModal('')}>
          <form
            className="modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              try {
                await apiCreateAssignment(activeClassroom.id, {
                  title: String(fd.get('title')),
                  description: String(fd.get('description')),
                });
                setModal('');
                setToast('Assignment created!');
                loadResourcesData();
              } catch (err: any) {
                setToast(err.message || 'Error creating assignment.');
              }
            }}
          >
            <label>
              Assignment Title
              <input required name="title" placeholder="e.g. Implement Binary Search with Duplicates" />
            </label>
            <label>
              Instructions / Description
              <textarea required name="description" rows={3} placeholder="Detailed instructions and test requirements" />
            </label>
            <button className="primary-btn full-btn" type="submit">
              Create Assignment <ArrowRight size={15} />
            </button>
          </form>
        </Modal>
      )}

      {modal === 'help' && (
        <Modal title="Help & Guides" subtitle="DevChamber Interactive Classroom Platform" onClose={() => setModal('')}>
          <div className="help-list">
            <p><b>1. Live Classroom & Screen Share:</b> Teachers can start a live class and share their screen with WebRTC. Students can minimize the stream to a floating mini-player to code alongside the lecture.</p>
            <p><b>2. Personal Workspaces:</b> Every student has a personal sandbox with Python execution and Monaco editor.</p>
            <p><b>3. Instructor Take Control:</b> Teachers can view any student workspace in real-time, grant permissions, or click "Take Control" to demonstrate fixes directly.</p>
            <p><b>4. Assessments & Analytics:</b> Interactive quizzes with instant scoring and teacher analytics.</p>
            <button className="primary-btn full-btn" onClick={() => setModal('')}>Got it</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ==========================================
// SUB-VIEWS
// ==========================================

function DashboardView({ name, role, live, setPage, setModal, classroom, participantsCount }: any) {
  return (
    <div className="dashboard page-content">
      <div className="welcome-row">
        <div>
          <div className="date-label">
            TODAY'S CLASSROOM <span className="weather-sun">✳</span> <span>Active Session</span>
          </div>
          <h1>Welcome back, {name.split(' ')[0]}<span className="heading-period">.</span></h1>
          <p>{role === 'Teacher' ? 'Your digital classroom and student workspaces are ready.' : 'Ready to code, collaborate, and learn today.'}</p>
        </div>
        <div className="welcome-actions">
          <button className="secondary-btn" onClick={() => setPage('Classroom')}>
            <Video size={16} /> Enter Classroom
          </button>
          {role === 'Teacher' && (
            <button className="primary-btn" onClick={() => setModal('create-class')}>
              <Plus size={17} /> Create Classroom
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="ENROLLED LEARNERS" value={String(participantsCount + 45)} icon={<Users size={17} />} meta="Data Structures — S5 CSE" color="blue" trend="+3 joined today" />
        <StatCard label="LIVE STATUS" value={live ? 'ACTIVE' : 'READY'} icon={<Video size={17} />} meta={live ? 'Live Session in Progress' : 'No active broadcast'} color="green" trend={live ? 'Live now' : 'Ready'} />
        <StatCard label="CLASSROOM CODE" value={classroom.join_code} icon={<Command size={17} />} meta="Share with students" color="purple" trend="Code" />
        <StatCard label="SUBMISSION RATE" value="94%" icon={<Activity size={17} />} meta="Weekly problem sets" color="amber" trend="↑ High" />
      </div>

      <div className="section-heading">
        <div>
          <h2>Your Classrooms</h2>
          <p>Manage courses and live workspaces.</p>
        </div>
        <button className="text-btn" onClick={() => setPage('Classroom')}>
          View active classroom <ArrowRight size={15} />
        </button>
      </div>

      <div className="classroom-cards">
        <article className="classroom-card">
          <div className="classroom-card-top">
            <div className="subject-icon subject-blue"><Code2 size={20} /></div>
            <span className="badge-role teacher">ACTIVE</span>
          </div>
          <div className="card-overline">{classroom.batch} · {classroom.subject}</div>
          <h3>{classroom.name}</h3>
          <p>{classroom.description}</p>
          <div className="card-metrics">
            <span><Users size={14} /> {participantsCount + 45} students</span>
            <span><Command size={14} /> Code: <b>{classroom.join_code}</b></span>
          </div>
          <div className="class-card-bottom">
            <div className="avatar-stack">
              <span className="avatar avatar-blue">AM</span>
              <span className="avatar avatar-green">JL</span>
              <span className="avatar avatar-orange">MC</span>
              <span className="avatar-more">+45</span>
            </div>
            <button className="arrow-circle" onClick={() => setPage('Classroom')} aria-label="Open classroom">
              <ArrowRight size={17} />
            </button>
          </div>
        </article>

        {role === 'Teacher' && (
          <button className="create-card" onClick={() => setModal('create-class')}>
            <span><Plus size={20} /></span>
            <b>Create a new classroom</b>
            <small>Set up an interactive space for your course.</small>
          </button>
        )}
      </div>
    </div>
  );
}

function ClassroomView({
  classroom,
  role,
  live,
  setLive,
  screenSharing,
  onStartScreenShare,
  onStopScreenShare,
  remoteScreenFrame,
  teacherVideoRef,
  chat,
  chatDraft,
  setChatDraft,
  onSendMessage,
  participants,
  setPage,
}: any) {
  return (
    <div className="page-content classroom-page">
      <div className="classroom-title-row">
        <div>
          <div className="date-label">CLASSROOM <ChevronRight size={13} /> {classroom.batch} · CODE: {classroom.join_code}</div>
          <h1>{classroom.name}<span className="heading-period">.</span></h1>
          <p>{classroom.description}</p>
        </div>
        <div className="welcome-actions">
          {live ? (
            <span className="live-badge"><i /> SESSION LIVE</span>
          ) : (
            <span className="quiet-badge"><Clock3 size={14} /> Standby</span>
          )}
          {role === 'Teacher' && !live && (
            <button className="primary-btn" onClick={() => setLive(true)}>
              <Play size={15} fill="currentColor" /> Start live class
            </button>
          )}
          {role === 'Teacher' && live && (
            <button className="danger-btn" onClick={() => setLive(false)}>
              <Square size={13} fill="currentColor" /> End class
            </button>
          )}
        </div>
      </div>

      <div className="classroom-tabs">
        {['Live Class', 'Workspaces', 'Workspace', 'Resources', 'Assignments', 'Assessments'].map((tab) => (
          <button
            key={tab}
            className={tab === 'Live Class' ? 'current' : ''}
            onClick={() => setPage(tab === 'Live Class' ? 'Classroom' : tab)}
          >
            {tab}
            {tab === 'Live Class' && live && <i />}
          </button>
        ))}
      </div>

      <div className="live-class-layout">
        {/* Main Presentation / Video Stream Area */}
        <section className="presentation-card">
          <div className="presentation-head">
            <div>
              <span className="live-badge small-live"><i /> {live ? 'BROADCASTING' : 'OFFLINE'}</span>
              <b>{classroom.name} · Binary Search & Complexity</b>
            </div>
            <div className="pres-head-right">
              <span><Users size={14} /> {participants.length} present</span>
              <button className="icon-btn" onClick={() => setPage('Workspace')} title="Go to workspace">
                <Code2 size={16} />
              </button>
            </div>
          </div>

          <div className="presentation-screen">
            {screenSharing ? (
              <div className="webrtc-video-container">
                <video ref={teacherVideoRef} autoPlay playsInline muted className="webrtc-video" />
                <div className="pres-overlay">
                  <span><Video size={14} /> You are sharing your screen</span>
                </div>
              </div>
            ) : remoteScreenFrame ? (
              <div className="webrtc-video-container">
                <img src={remoteScreenFrame} alt="Teacher Screen" className="webrtc-video" />
                <div className="pres-overlay">
                  <span><Video size={14} /> Instructor Live Stream</span>
                </div>
              </div>
            ) : (
              <div className="presentation-content">
                <div className="presentation-kicker">WEEK 04 · SEARCHING ALGORITHMS</div>
                <h2>Binary Search</h2>
                <p>Divide and conquer sorted data spaces in O(log n) time.</p>
                <div className="concept-pills">
                  <span><b>01</b> Sorted sequence</span>
                  <span><b>02</b> Inspect middle element</span>
                  <span><b>03</b> Halve search range</span>
                </div>
                <div className="array-visual">
                  <span>2</span>
                  <span>5</span>
                  <span className="array-active">8</span>
                  <span>12</span>
                  <span>16</span>
                  <span>23</span>
                  <span>38</span>
                </div>
                <div className="array-caption">Sorted sequence · searching for <b>16</b></div>
              </div>
            )}
          </div>

          <div className="class-controls">
            {role === 'Teacher' ? (
              screenSharing ? (
                <button className="control-share sharing" onClick={onStopScreenShare}>
                  <Square size={15} fill="currentColor" />
                  <span>Stop screen share</span>
                </button>
              ) : (
                <button className="control-share" onClick={onStartScreenShare}>
                  <PanelRightClose size={16} />
                  <span>Share screen (WebRTC)</span>
                </button>
              )
            ) : (
              <button className="control-btn" onClick={() => setPage('Workspace')}>
                <Code2 size={15} /> <span>Open My Workspace (Split Mode)</span>
              </button>
            )}

            <div className="controls-spacer" />
            <button className="control-btn" onClick={() => setPage('Workspace')}>
              <Code2 size={15} /> Workspace
            </button>
            <button className="control-btn activity-ctl" onClick={() => setPage('Assessments')}>
              <GraduationCap size={15} /> Assessments
            </button>
          </div>
        </section>

        {/* Live Sidebar: Participants & Chat */}
        <aside className="live-sidebar">
          <div className="live-aside-tabs">
            <button className="selected">Participants <span>{participants.length}</span></button>
          </div>

          <div className="participants-label">ONLINE ROSTER</div>
          {participants.map((p: any) => (
            <PersonRow
              key={p.socketId || p.userId}
              name={p.name}
              detail={p.role === 'teacher' ? 'Teacher / Host' : 'Student'}
              initials={p.name.split(' ').map((s: string) => s[0]).join('')}
              color={p.role === 'teacher' ? 'blue' : 'green'}
              status="Online"
            />
          ))}

          {/* Real-time Classroom Chat */}
          <div className="chat-mini" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', height: '260px' }}>
            <div className="chat-mini-head">
              <b><MessageCircle size={15} /> Classroom Chat</b>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
              {chat.length === 0 ? (
                <div style={{ fontSize: '8px', color: '#9ba3b0', textAlign: 'center', marginTop: '20px' }}>No messages yet. Send a question!</div>
              ) : (
                chat.map((m: any, i: number) => (
                  <div key={m.id || i} className="chat-bubble">
                    <div className="chat-bubble-head">
                      <b>{m.name} ({m.role})</b>
                      <span>{new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="chat-bubble-text">{m.text}</div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={onSendMessage} style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
              <input
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                placeholder="Ask class a question…"
                style={{ flex: 1, height: '30px', border: '1px solid #e2e6ed', borderRadius: '6px', padding: '0 8px', fontSize: '9px' }}
              />
              <button className="primary-btn" style={{ height: '30px', padding: '0 8px' }} type="submit">
                <Send size={13} />
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}

function WorkspacesListView({ workspaces, currentWorkspaceId, onSelectWorkspace, setPage }: any) {
  return (
    <div className="page-content generic-page">
      <div className="generic-head">
        <div>
          <div className="date-label">COLLABORATIVE WORKSPACES</div>
          <h1>Student Sandboxes<span className="heading-period">.</span></h1>
          <p>Inspect code in real time, grant permissions, and demonstrate solutions.</p>
        </div>
        <button className="primary-btn" onClick={() => setPage('Workspace')}>
          <Code2 size={15} /> Open My Workspace
        </button>
      </div>

      <div className="workspaces-grid">
        {workspaces.map((ws: any) => (
          <div
            key={ws.id}
            className={`workspace-card ${ws.id === currentWorkspaceId ? 'selected' : ''}`}
            onClick={() => onSelectWorkspace(ws)}
          >
            <div className="workspace-card-head">
              <b>{ws.title}</b>
              <span className="badge-permission editor">LIVE</span>
            </div>
            <div className="workspace-card-meta">
              <span>Owner: <b>{ws.owner_name || ws.owner_id}</b></span>
              <span>•</span>
              <span>Files: <b>{ws.files?.length || 2}</b></span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: '8px', color: '#68758d' }}>Click to inspect & edit</span>
              <ArrowRight size={14} color="#5268dc" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkspaceView({
  role,
  title,
  files,
  activeFileName,
  setActiveFileName,
  code,
  onCodeChange,
  onSaveFile,
  onAddFile,
  runCode,
  running,
  output,
  isReadOnly,
  activeController,
  collaborators,
  permissions,
  onTakeControl,
  setModal,
}: any) {
  const currentFile = files.find((f: any) => f.name === activeFileName) || files[0];

  return (
    <div className="workspace-page page-content">
      {/* Instructor Take Control Banner */}
      {activeController && (
        <div className="take-control-banner">
          <span>👨‍🏫 <b>Instructor Mode:</b> {activeController} has taken active control of this workspace.</span>
          {role === 'Teacher' && (
            <button className="take-control-btn active" onClick={onTakeControl}>
              Release Control
            </button>
          )}
        </div>
      )}

      <div className="workspace-top">
        <div>
          <div className="date-label">
            {title} <ChevronRight size={13} /> {activeFileName}
          </div>
          <h1>{title}<span className="heading-period">.</span></h1>
          <p>Isolated Python execution sandbox with collaborative sync.</p>
        </div>

        <div className="workspace-actions">
          {role === 'Teacher' && (
            <button
              className={activeController ? 'take-control-btn active' : 'take-control-btn'}
              onClick={onTakeControl}
              style={{ height: '34px', padding: '0 12px' }}
            >
              {activeController ? 'Release Control' : 'Take Control'}
            </button>
          )}

          <button className="secondary-btn" onClick={onSaveFile}>
            <Check size={15} /> Save
          </button>
          <button className="primary-btn" onClick={runCode} disabled={running}>
            <Play size={14} fill="currentColor" /> {running ? 'Running…' : 'Run Python'}
          </button>
        </div>
      </div>

      {/* Collaboration Bar */}
      <div className="collab-bar">
        <span className="connection"><i /> Live Sandbox</span>
        <span className="collab-divider" />
        <span className="collab-title"><Users size={14} /> In Workspace:</span>
        <div className="avatar-stack small-stack">
          {collaborators.map((c: any, i: number) => (
            <span key={i} className="avatar avatar-blue">{c.name ? c.name.slice(0, 2) : 'US'}</span>
          ))}
        </div>
        <span className="editing-copy">
          {isReadOnly ? <b style={{ color: '#d9480f' }}>Viewer (Read-Only)</b> : <b>Editor Access</b>}
        </span>
        <button className="permission-btn" onClick={() => setModal('permissions')}>
          <ShieldCheck size={14} /> Permissions
        </button>
      </div>

      {/* IDE Shell */}
      <div className="ide-shell">
        {/* Explorer Sidebar */}
        <aside className="file-sidebar">
          <div className="file-sidebar-title">
            <span>EXPLORER</span>
            <button className="icon-btn" onClick={onAddFile} aria-label="Add file">
              <FilePlus2 size={15} />
            </button>
          </div>

          <div className="folder-title">
            <ChevronDown size={13} />
            <Folder size={14} />
            <b>FILES</b>
          </div>

          {files.map((file: any) => (
            <button
              key={file.name}
              className={`file-item ${activeFileName === file.name ? 'selected' : ''}`}
              onClick={() => setActiveFileName(file.name)}
            >
              <FileCode2 size={14} className={file.name.endsWith('.md') ? 'md-file' : ''} />
              {file.name}
            </button>
          ))}

          <button className="new-file-link" onClick={onAddFile}>
            <Plus size={14} /> New file
          </button>

          <div className="files-spacer" />
          <div className="sync-note">
            <span className="sync-icon"><Link2 size={14} /></span>
            <span>
              <b>Sandbox Sync</b>
              <small>Real-time collaborative</small>
            </span>
          </div>
        </aside>

        {/* Editor & Terminal Column */}
        <section className="editor-column">
          <div className="editor-tab">
            <span className="python-icon">Py</span>
            {activeFileName}
            <span className="unsaved-dot" />
          </div>

          <div className="editor-wrap">
            <Editor
              height="100%"
              language={currentFile?.language || 'python'}
              theme="vs-dark"
              value={code}
              onChange={onCodeChange}
              options={{
                fontSize: 13,
                fontFamily: '"Cascadia Code", "Fira Code", monospace',
                minimap: { enabled: false },
                readOnly: isReadOnly,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>

          {/* Terminal output */}
          <div className="terminal">
            <div className="terminal-head">
              <span>OUTPUT CONSOLE</span>
              <button onClick={() => runCode()} disabled={running} style={{ color: '#687bd6', cursor: 'pointer' }}>
                {running ? 'Executing…' : '▶ Execute'}
              </button>
            </div>
            <div className="terminal-body" style={{ overflowY: 'auto' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#c9cdd6' }}>{output}</pre>
            </div>
          </div>
        </section>

        {/* Right Info Panel */}
        <aside className="workspace-right">
          <div className="right-panel-header">
            <b>WORKSPACE ASSISTANT</b>
          </div>

          <div className="workspace-side-section">
            <div className="hint-title">
              <span><Sparkles size={14} /></span>
              <b>Learning Tip</b>
            </div>
            <p style={{ fontSize: '8px', color: '#778496', margin: '8px 0', lineHeight: 1.5 }}>
              Try running <code>binary_search(values, 16)</code> and tracing the middle pointer values in each step.
            </p>
          </div>

          <div className="workspace-side-section">
            <div className="side-section-head">
              <b>COLLABORATORS</b>
            </div>
            {Object.entries(permissions).map(([uid, perm]) => (
              <PersonRow
                key={uid}
                name={uid}
                detail={`Role: ${perm}`}
                initials={uid.slice(0, 2).toUpperCase()}
                color={perm === 'owner' ? 'blue' : 'green'}
                status={perm as string}
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ResourcesView({ resources, role, setModal }: any) {
  return (
    <div className="page-content generic-page">
      <div className="generic-head">
        <div>
          <div className="date-label">CLASSROOM MATERIALS</div>
          <h1>Learning Resources<span className="heading-period">.</span></h1>
          <p>Lecture slides, algorithms cheat sheets, and problem sets.</p>
        </div>
        {role === 'Teacher' && (
          <button className="primary-btn" onClick={() => setModal('new-resource')}>
            <Plus size={16} /> Add Resource
          </button>
        )}
      </div>

      <div className="resource-list">
        {resources.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#8893a4' }}>No resources posted yet.</div>
        ) : (
          resources.map((r: any) => (
            <div className="resource-row" key={r.id}>
              <div className="resource-file-icon link"><Link2 size={16} /></div>
              <div className="resource-copy">
                <b>{r.title}</b>
                <small>{r.description || r.url}</small>
              </div>
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="secondary-btn resource-download"
                style={{ textDecoration: 'none' }}
              >
                Open Link <ArrowRight size={12} />
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AssignmentsView({ assignments, role, setModal, setToast }: any) {
  return (
    <div className="page-content generic-page">
      <div className="generic-head">
        <div>
          <div className="date-label">TASKS & LABS</div>
          <h1>Assignments<span className="heading-period">.</span></h1>
          <p>Practical coding problems and algorithms challenges.</p>
        </div>
        {role === 'Teacher' && (
          <button className="primary-btn" onClick={() => setModal('new-assignment')}>
            <Plus size={16} /> Create Assignment
          </button>
        )}
      </div>

      <div className="assignment-grid">
        {assignments.map((a: any) => (
          <article className="assignment-card" key={a.id}>
            <div className="assignment-topline">
              <span className="card-overline">PROGRAMMING LAB</span>
              <span className="assignment-status complete">Assigned</span>
            </div>
            <h3>{a.title}</h3>
            <p>{a.description}</p>
            <div className="assignment-bottom">
              <span className="assignment-due"><Clock3 size={13} /> Due in 3 days</span>
              <button className="primary-btn" style={{ height: '28px', fontSize: '8px' }} onClick={() => setToast('Open your personal workspace to complete this lab.')}>
                Start in Workspace <ArrowRight size={12} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AssessmentsView({ assessments, submissions, role, onStartQuiz, onToggleStatus, setModal }: any) {
  return (
    <div className="page-content generic-page">
      <div className="generic-head">
        <div>
          <div className="date-label">EVALUATION & QUIZZES</div>
          <h1>Classroom Assessments<span className="heading-period">.</span></h1>
          <p>Instant grading, concept checks, and performance tracking.</p>
        </div>
        {role === 'Teacher' && (
          <button className="primary-btn" onClick={() => setModal('new-assessment')}>
            <Plus size={16} /> New Assessment
          </button>
        )}
      </div>

      {assessments.map((as: any) => (
        <div className="assessment-highlight" key={as.id}>
          <div className="assessment-feature">
            <div>
              <span className="highlight-badge"><GraduationCap size={13} /> {as.status.toUpperCase()}</span>
              <h2>{as.title}</h2>
              <p>{as.description || 'Test algorithmic understanding and time complexity.'}</p>
              <div className="assessment-facts">
                <span><Clock3 size={14} /> {as.duration_minutes} minutes</span>
                <span><Check size={14} /> 6 questions</span>
                <span><ShieldCheck size={14} /> Automated evaluation</span>
              </div>
              <div>
                <button className="primary-btn" onClick={() => onStartQuiz(as)}>
                  Take Assessment Now <ArrowRight size={15} />
                </button>
                {role === 'Teacher' && (
                  <button
                    className="secondary-btn"
                    style={{ marginLeft: 8 }}
                    onClick={() => onToggleStatus(as.id, as.status === 'active' ? 'ended' : 'active')}
                  >
                    {as.status === 'active' ? 'End Assessment' : 'Activate Quiz'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Real-time Submissions Table for Teachers */}
      {role === 'Teacher' && (
        <div className="results-panel">
          <div className="panel-heading" style={{ padding: '16px 16px 0' }}>
            <div>
              <h3>Student Submissions & Real-Time Scores</h3>
              <p>{submissions.length} completed submissions</p>
            </div>
          </div>

          <div className="result-head">
            <span>STUDENT</span>
            <span>SUBMITTED AT</span>
            <span>STATUS</span>
            <span>SCORE</span>
            <span></span>
          </div>

          {submissions.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#8892a0', fontSize: '9px' }}>
              No submissions recorded yet. Students can submit using the "Take Assessment Now" button.
            </div>
          ) : (
            submissions.map((sub: any) => (
              <div className="result-row" key={sub.id}>
                <div className="result-student">
                  <span className="avatar avatar-green">{sub.student_name.slice(0, 2).toUpperCase()}</span>
                  <span>
                    <b>{sub.student_name}</b>
                    <small>{sub.student_id}</small>
                  </span>
                </div>
                <span>{new Date(sub.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="badge-permission editor">Graded</span>
                <b className="result-score">{sub.score} / {sub.total_points || 6} ({Math.round((sub.score / (sub.total_points || 6)) * 100)}%)</b>
                <Check size={14} color="#40c057" />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AnalyticsView({ activeCount, submissions }: any) {
  const avgScore = submissions.length > 0
    ? Math.round((submissions.reduce((a: number, s: any) => a + Number(s.score || 0), 0) / (submissions.length * 6)) * 100)
    : 85;

  return (
    <div className="page-content generic-page">
      <div className="generic-head">
        <div>
          <div className="date-label">PERFORMANCE METRICS</div>
          <h1>Classroom Analytics<span className="heading-period">.</span></h1>
          <p>Real-time student progress, submission metrics, and concept breakdowns.</p>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="ACTIVE LEARNERS" value={String(activeCount)} icon={<Users size={17} />} meta="In live room" color="green" trend="Online" />
        <StatCard label="ASSESSMENT AVG" value={`${avgScore}%`} icon={<GraduationCap size={17} />} meta="Across quizzes" color="purple" trend="↑ +4%" />
        <StatCard label="SUBMISSION COUNT" value={String(submissions.length)} icon={<Check size={17} />} meta="Evaluated submissions" color="blue" trend="Live" />
        <StatCard label="LAB COMPLETION" value="91%" icon={<Activity size={17} />} meta="Weekly code exercises" color="amber" trend="On Track" />
      </div>

      <div className="analytics-grid">
        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h3>Daily Activity & Participation</h3>
              <p>Active code executions and submissions</p>
            </div>
          </div>
          <div className="bar-chart">
            <div className="chart-plot">
              <div className="chart-bars">
                {[
                  ['M', 40, 27],
                  ['T', 60, 42],
                  ['W', 48, 50],
                  ['T', 76, 43],
                  ['F', 64, 36],
                  ['M', 82, 60],
                  ['T', 70, 54],
                  ['W', 93, 68],
                  ['T', 100, 80],
                ].map(([d, a, b], i) => (
                  <div className="chart-day" key={i}>
                    <div className="bar-pair">
                      <i style={{ height: `${a}%` }} />
                      <i style={{ height: `${b}%` }} />
                    </div>
                    <small>{d}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="panel difficulty-panel">
          <div className="panel-heading">
            <div>
              <h3>Key Concepts Breakdown</h3>
              <p>Understanding rate by topic</p>
            </div>
          </div>
          <div className="concept-row">
            <span className="concept-number">01</span>
            <span><b>Binary Search Bounds</b><small>Loop invariant middle calculation</small></span>
            <span className="difficulty-bar"><i style={{ width: '85%' }} /></span>
            <b className="difficulty-percent">85%</b>
          </div>
          <div className="concept-row">
            <span className="concept-number">02</span>
            <span><b>Time & Space Complexity</b><small>Big-O intuition</small></span>
            <span className="difficulty-bar"><i style={{ width: '92%' }} /></span>
            <b className="difficulty-percent">92%</b>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SHARED COMPONENTS
// ==========================================

function StatCard({ label, value, icon, meta, color, trend }: any) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div className="stat-trend">{trend}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-meta">{meta}</div>
    </div>
  );
}

function PersonRow({ name, detail, initials, color, status }: any) {
  return (
    <div className="person-row">
      <span className={`avatar avatar-${color}`}>{initials}</span>
      <span className="person-info">
        <b>{name}</b>
        <small>{detail}</small>
      </span>
      {status && <span className="person-status">{status}</span>}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }: any) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AuthScreen({ mode, setMode, role, setRole, name, setName, onLoginSuccess, setToast }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (supabase) {
      if (mode === 'signup') {
        const res = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name, role: role.toLowerCase() } },
        });
        if (res.error) {
          setToast(res.error.message);
          return;
        }
        if (!res.data.session) {
          setToast('Verification email sent! Check your inbox.');
          return;
        }
      } else {
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (res.error) {
          setToast(res.error.message);
          return;
        }
      }
    } else {
      if (!email.includes('@') || password.length < 6) {
        setToast('Please enter a valid email and 6+ character password.');
        return;
      }
    }
    onLoginSuccess();
  };

  return (
    <div className="auth-layout">
      <div className="auth-visual">
        <div className="auth-brand">
          <span className="brand-icon"><Command size={18} /></span>
          devchamber<span className="brand-period">.</span>
        </div>
        <div className="auth-visual-content">
          <div className="eyebrow"><span className="eyebrow-dot" /> THE DIGITAL CLASSROOM</div>
          <h1>Teach, build,<br />and <em>demonstrate.</em></h1>
          <p>Interactive IDE + digital classroom with live WebRTC screen sharing, isolated Python sandboxes, and collaborative editing.</p>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-kicker">{mode === 'login' ? 'WELCOME BACK' : 'CREATE ACCOUNT'}</div>
          <h2>{mode === 'login' ? 'Sign in to DevChamber' : 'Get Started with DevChamber'}</h2>
          <p className="auth-subtitle">Live coding classrooms, workspaces, and real-time assessments.</p>

          <div className="role-picker">
            <button
              type="button"
              className={role === 'Teacher' ? 'picked' : ''}
              onClick={() => {
                setRole('Teacher');
                setName('Alex Morgan');
              }}
            >
              <GraduationCap size={16} /> Teacher (Alex)
            </button>
            <button
              type="button"
              className={role === 'Student' ? 'picked' : ''}
              onClick={() => {
                setRole('Student');
                setName('Jordan Lee');
              }}
            >
              <BookOpen size={16} /> Student (Jordan)
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {mode === 'signup' && (
              <label>
                Full Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={role === 'Teacher' ? 'teacher@school.edu' : 'student@school.edu'}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </label>

            <button className="primary-btn auth-submit" type="submit">
              {mode === 'login' ? 'Sign In to DevChamber' : 'Create DevChamber Account'} <ArrowRight size={17} />
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
