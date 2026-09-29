// In-memory data store types & local mock utilities
import { randomBytes } from 'node:crypto';

export interface Profile {
  id: string;
  full_name: string;
  role: 'teacher' | 'student' | 'admin';
  email?: string;
  avatar_color?: string;
}

export interface Classroom {
  id: string;
  name: string;
  subject: string;
  description: string;
  batch: string;
  join_code: string;
  teacher_id: string;
  created_at: string;
  updated_at: string;
  is_live?: boolean;
}

export interface ClassroomMember {
  classroom_id: string;
  user_id: string;
  role: 'teacher' | 'student';
  joined_at: string;
  full_name?: string;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  language: string;
  content: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  classroom_id: string;
  owner_id: string;
  owner_name: string;
  title: string;
  files: WorkspaceFile[];
  permissions: Record<string, 'owner' | 'editor' | 'viewer'>;
  active_controller_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  classroom_id: string;
  user_id: string;
  name: string;
  role: string;
  text: string;
  created_at: string;
}

export interface Resource {
  id: string;
  classroom_id: string;
  created_by: string;
  title: string;
  kind: 'link' | 'file';
  url: string;
  description?: string;
  created_at: string;
}

export interface Assignment {
  id: string;
  classroom_id: string;
  created_by: string;
  title: string;
  description: string;
  due_at?: string;
  created_at: string;
}

export interface Question {
  id: string;
  kind: 'mcq' | 'short_answer' | 'coding';
  prompt: string;
  options: string[];
  answer_key?: string | number;
  points: number;
  position: number;
}

export interface Assessment {
  id: string;
  classroom_id: string;
  created_by: string;
  title: string;
  description: string;
  duration_minutes: number;
  status: 'draft' | 'published' | 'active' | 'ended';
  questions: Question[];
  created_at: string;
}

export interface Submission {
  id: string;
  assessment_id: string;
  student_id: string;
  student_name: string;
  answers: Record<string, string | number>;
  score: number;
  total_points: number;
  submitted_at: string;
}

class DemoStore {
  profiles: Map<string, Profile> = new Map();
  classrooms: Map<string, Classroom> = new Map();
  members: ClassroomMember[] = [];
  workspaces: Map<string, Workspace> = new Map();
  messages: ChatMessage[] = [];
  resources: Resource[] = [];
  assignments: Assignment[] = [];
  assessments: Map<string, Assessment> = new Map();
  submissions: Submission[] = [];

  constructor() {
    this.seedDefaultData();
  }

  private seedDefaultData() {
    // Default Profiles
    const teacher: Profile = {
      id: 'teacher-alex',
      full_name: 'Alex Morgan',
      role: 'teacher',
      email: 'alex.morgan@school.edu',
      avatar_color: 'blue',
    };
    const student1: Profile = {
      id: 'student-jordan',
      full_name: 'Jordan Lee',
      role: 'student',
      email: 'jordan.lee@school.edu',
      avatar_color: 'green',
    };
    const student2: Profile = {
      id: 'student-maya',
      full_name: 'Maya Chen',
      role: 'student',
      email: 'maya.chen@school.edu',
      avatar_color: 'orange',
    };
    const student3: Profile = {
      id: 'student-sam',
      full_name: 'Sam Kim',
      role: 'student',
      email: 'sam.kim@school.edu',
      avatar_color: 'pink',
    };

    this.profiles.set(teacher.id, teacher);
    this.profiles.set(student1.id, student1);
    this.profiles.set(student2.id, student2);
    this.profiles.set(student3.id, student3);

    // Default Classroom: Data Structures - S5 CSE
    const defaultClass: Classroom = {
      id: 'ds-s5-cse',
      name: 'Data Structures',
      subject: 'Computer Science',
      description: 'Algorithms, data structures, and problem solving.',
      batch: 'S5 CSE',
      join_code: 'DS5CSE',
      teacher_id: teacher.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_live: false,
    };
    this.classrooms.set(defaultClass.id, defaultClass);

    // Add members
    this.members.push({ classroom_id: defaultClass.id, user_id: teacher.id, role: 'teacher', full_name: teacher.full_name, joined_at: new Date().toISOString() });
    this.members.push({ classroom_id: defaultClass.id, user_id: student1.id, role: 'student', full_name: student1.full_name, joined_at: new Date().toISOString() });
    this.members.push({ classroom_id: defaultClass.id, user_id: student2.id, role: 'student', full_name: student2.full_name, joined_at: new Date().toISOString() });
    this.members.push({ classroom_id: defaultClass.id, user_id: student3.id, role: 'student', full_name: student3.full_name, joined_at: new Date().toISOString() });

    // Seed Workspaces
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
print(f"Searching for 99: {binary_search(values, 99)}")`;

    const notesMd = `# Binary Search Notes
A divide-and-conquer search for sorted sequences.

- Time Complexity: O(log n)
- Space Complexity: O(1)
- Key condition: Array MUST be sorted.`;

    const ws1: Workspace = {
      id: 'ws-jordan',
      classroom_id: defaultClass.id,
      owner_id: student1.id,
      owner_name: student1.full_name,
      title: "Jordan's Workspace",
      files: [
        { id: 'f1', name: 'main.py', language: 'python', content: starterPy, updated_at: new Date().toISOString() },
        { id: 'f2', name: 'notes.md', language: 'markdown', content: notesMd, updated_at: new Date().toISOString() },
      ],
      permissions: {
        [student1.id]: 'owner',
        [teacher.id]: 'editor',
        [student2.id]: 'viewer',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.workspaces.set(ws1.id, ws1);

    const ws2: Workspace = {
      id: 'ws-maya',
      classroom_id: defaultClass.id,
      owner_id: student2.id,
      owner_name: student2.full_name,
      title: "Maya's Workspace",
      files: [
        { id: 'f3', name: 'main.py', language: 'python', content: starterPy, updated_at: new Date().toISOString() },
      ],
      permissions: {
        [student2.id]: 'owner',
        [teacher.id]: 'editor',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.workspaces.set(ws2.id, ws2);

    // Seed Messages
    this.messages.push(
      { id: 'm1', classroom_id: defaultClass.id, user_id: teacher.id, name: 'Alex Morgan', role: 'teacher', text: 'Welcome to Data Structures! Today we are working on Binary Search and recursion bounds.', created_at: new Date(Date.now() - 3600000).toISOString() },
      { id: 'm2', classroom_id: defaultClass.id, user_id: student1.id, name: 'Jordan Lee', role: 'student', text: 'Ready! Is the starter code already loaded in our personal workspaces?', created_at: new Date(Date.now() - 1800000).toISOString() },
      { id: 'm3', classroom_id: defaultClass.id, user_id: teacher.id, name: 'Alex Morgan', role: 'teacher', text: 'Yes, check main.py in your Workspace tab. You can run it right inside the browser sandbox.', created_at: new Date(Date.now() - 900000).toISOString() }
    );

    // Seed Resources
    this.resources.push(
      { id: 'r1', classroom_id: defaultClass.id, created_by: teacher.id, title: 'Binary Search Visualizer & Guide', kind: 'link', url: 'https://visualgo.net/en/bst', description: 'Interactive visual step-through of divide and conquer algorithms.', created_at: new Date().toISOString() },
      { id: 'r2', classroom_id: defaultClass.id, created_by: teacher.id, title: 'Lecture 04 Slide Deck - Searching & Sorting', kind: 'link', url: 'https://ocw.mit.edu', description: 'Complete reference slides for asymptotic analysis and search proofs.', created_at: new Date().toISOString() }
    );

    // Seed Assignments
    this.assignments.push(
      { id: 'a1', classroom_id: defaultClass.id, created_by: teacher.id, title: 'Implement Binary Search with Custom Comparators', description: 'Extend binary search to find the lower bound index and handle duplicate elements in O(log n) time.', due_at: new Date(Date.now() + 86400000 * 3).toISOString(), created_at: new Date().toISOString() }
    );

    // Seed Assessment
    const sampleAssessment: Assessment = {
      id: 'as-ds-01',
      classroom_id: defaultClass.id,
      created_by: teacher.id,
      title: 'Searching Algorithms & Complexity Check',
      description: 'Quick check of binary search invariants, edge conditions, and Big-O efficiency.',
      duration_minutes: 15,
      status: 'active',
      questions: [
        {
          id: 'q1',
          kind: 'mcq',
          prompt: 'What is the worst-case time complexity of Binary Search on a sorted array of size n?',
          options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
          answer_key: 1, // 'O(log n)'
          points: 1,
          position: 0,
        },
        {
          id: 'q2',
          kind: 'mcq',
          prompt: 'Which condition is strictly required before binary search can be applied?',
          options: ['The array must contain unique values only', 'The array must be sorted', 'The array length must be a power of 2', 'The array must only store integers'],
          answer_key: 1, // 'The array must be sorted'
          points: 1,
          position: 1,
        },
        {
          id: 'q3',
          kind: 'mcq',
          prompt: 'When target is greater than values[middle] in a standard binary search, how should the pointers be updated?',
          options: ['high = middle - 1', 'low = middle + 1', 'low = middle', 'high = middle'],
          answer_key: 1, // 'low = middle + 1'
          points: 1,
          position: 2,
        },
        {
          id: 'q4',
          kind: 'mcq',
          prompt: 'What is the maximum number of comparisons needed to find an element in a sorted list of 1024 items?',
          options: ['10', '11', '512', '1024'],
          answer_key: 1, // log2(1024) + 1 = 11 comparisons
          points: 1,
          position: 3,
        },
        {
          id: 'q5',
          kind: 'mcq',
          prompt: 'What is the space complexity of an iterative binary search algorithm?',
          options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
          answer_key: 0, // O(1)
          points: 1,
          position: 4,
        },
        {
          id: 'q6',
          kind: 'mcq',
          prompt: 'Why do we compute middle as `low + (high - low) // 2` instead of `(low + high) // 2` in fixed-width integer environments?',
          options: ['To avoid floating point division', 'To prevent integer arithmetic overflow', 'To make it run faster in cache', 'To handle negative indices'],
          answer_key: 1, // 'To prevent integer arithmetic overflow'
          points: 1,
          position: 5,
        },
      ],
      created_at: new Date().toISOString(),
    };
    this.assessments.set(sampleAssessment.id, sampleAssessment);

    // Seed an initial submission
    this.submissions.push({
      id: 'sub-maya-1',
      assessment_id: sampleAssessment.id,
      student_id: student2.id,
      student_name: student2.full_name,
      answers: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 0, q6: 1 },
      score: 6,
      total_points: 6,
      submitted_at: new Date(Date.now() - 600000).toISOString(),
    });
  }
}

export const store = new DemoStore();
