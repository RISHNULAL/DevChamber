# DevChamber — Interactive Digital Classroom & Code Sandbox

DevChamber is a digital classroom platform combining modern IDE capabilities, live interactive lectures, real-time collaboration, and automated assessments.

Built with **React, TypeScript, Vite, Express, Socket.IO, WebRTC, Supabase, and Monaco Editor**.

---

## Key Features

- **Live Classroom & WebRTC Screen Sharing**: Teachers can broadcast live sessions with real screen sharing (`navigator.mediaDevices.getDisplayMedia`). Students can view the live stream in full or minimize it to a floating Picture-in-Picture (PiP) mini-player to write code simultaneously.
- **Personal Student Workspaces**: Each student receives a dedicated sandbox with multi-file support and Monaco Editor.
- **Safe Python Execution Sandbox**: Python code execution (`POST /api/code/run`) executed inside an isolated container sandbox or isolated subprocess with strict memory limits, timeouts, and output limits.
- **Real-Time Collaboration & Live Sync**: Workspaces synchronize across participants in real time over Socket.IO with active collaborator presence.
- **Role-Based Workspace Permissions & Teacher "Take Control"**: Workspaces support `Owner`, `Editor`, and `Viewer` permissions. Teachers can inspect any student's workspace and click **"Take Control"** to demonstrate live fixes.
- **Classroom Chat**: Real-time room chat with sender role tags and persistent session history.
- **Interactive Assessments & Instant Evaluation**: Teachers can publish quizzes with automated grading, instant score computation, and live submission tracking.
- **Resources & Assignments**: Share learning links, slide decks, and programming challenges.
- **AI Learning Assistant**: Socratic tutor that provides conceptual hints, Big-O explanations, and invariant debugging without spoiling full answers.
- **Real-Time Teacher Analytics**: Live participation metrics, submission tracking, class average scores, and topic difficulty breakdown.

---

## Getting Started

### 1. Prerequisites
- **Node.js 20+**
- **Python 3.10+** (or Docker for containerized isolation)

### 2. Installation
```bash
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(If Supabase credentials are not provided, DevChamber operates in **LOCAL DEMO MODE** with synchronized in-memory stores and full multi-tab capabilities).*

### 4. Running the Development Server
```bash
npm run dev
```
- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend API & Socket.IO:** [http://localhost:3001](http://localhost:3001)

### 5. Production Build Verification
```bash
npm run build
```

---

## Primary Hackathon Demo Flow

1. **Teacher Login**: Sign in as Teacher (*Alex Morgan*).
2. **Create Classroom**: Create `"Data Structures — S5 CSE"` and get join code (`DS5CSE`).
3. **Start Live Class**: Click **"Start Live Class"** and **"Share Screen"** (WebRTC).
4. **Student Join**: Open another browser window/tab as Student (*Jordan Lee*), enter code `DS5CSE`, and join the classroom.
5. **View & Minimize Screen**: Student views the live presentation, clicks **"Open My Workspace"**, and the teacher's stream smoothly docks into a floating PiP player.
6. **Code & Execute**: Student writes `print("Hello DevChamber")` and runs Python in the sandbox to see instant output.
7. **Teacher Inspects Workspace**: Teacher opens the **Workspaces** tab, selects *Jordan's Workspace*, and views live code.
8. **Grant Permission & Take Control**: Teacher changes permissions or clicks **"Take Control"** to demonstrate an algorithmic fix.
9. **Real-Time Chat**: Send messages in class chat.
10. **Assessment & Grading**: Teacher starts the Quiz; student answers questions and submits; teacher views real-time scores and class analytics.

---

## Database Schema & Migrations

If connecting to a Supabase project, execute:
`supabase/migrations/202609280001_initial_schema.sql` in the Supabase SQL Editor.
