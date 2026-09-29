# DevChamber — Interactive Digital Classroom & Code Sandbox

DevChamber is a collaborative digital classroom platform combining modern IDE capabilities, live interactive lectures, real-time collaboration, and automated assessments.

Built with **React, TypeScript, Vite, Express, Socket.IO, WebRTC, MongoDB (Mongoose), and Monaco Editor**.

---

## Target Architecture

```
React + Vite (Frontend: http://localhost:5173)
       ↓
Express + Node.js (Backend API & Socket.IO: http://localhost:3001)
       ↓
MongoDB (Database: mongodb://localhost:27017/devchamber)
```

- **Database**: Local MongoDB (`mongodb://localhost:27017/devchamber`) with Mongoose models and indexed collections.
- **Backend**: Express + Socket.IO + JWT Authentication + Gemini AI + Python Sandbox Runner.
- **Frontend**: React + Vite + Monaco Editor + WebRTC Screen Share + 3-Panel Collaborative Workspace.

---

## Collections & Data Model

1. `users` — Authentication accounts (email unique, passwordHash, role, timestamps).
2. `profiles` — User profile details, roles (`teacher`, `student`, `admin`), avatar colors.
3. `classrooms` — Classrooms with unique join codes (`joinCode`), teachers, and live session states.
4. `classroomMembers` — Classroom enrollments with compound unique index on `{ classroomId, userId }`.
5. `classSessions` — Live lecture session history.
6. `workspaces` — Personal student workspaces (private by default).
7. `workspaceFiles` — Files belonging to workspaces (`main.py`, `notes.md`, etc.).
8. `workspacePermissions` — Explicit peer access (`viewer` / `editor`) granted by instructors.
9. `messages` — Classroom chat messages with timestamps and role tags.
10. `resources` — Classroom study materials, slide decks, and reference links.
11. `assignments` — Course assignments with due dates and descriptions.
12. `assessments` — Interactive quizzes and exams with duration limits and status management.
13. `questions` — Assessment questions with options, points, and protected answer keys.
14. `submissions` — Student quiz submissions and automated scoring.

---

## Getting Started

### 1. Prerequisites
- **Node.js 20+**
- **MongoDB** running locally on port `27017`
- **Python 3.10+** (or Docker for containerized code execution)

### 2. Installation
```bash
npm install
```

### 3. Environment Setup
Configure `.env` in the project root:
```env
MONGODB_URI=mongodb://localhost:27017/devchamber
SERVER_PORT=3001
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=devchamber-local-jwt-secret-key-2026-secure
JWT_EXPIRES_IN=7d

VITE_SERVER_URL=http://localhost:3001
VITE_CODE_RUNNER_URL=http://localhost:3001/api/code/run

AI_PROVIDER=gemini
AI_API_KEY=your_gemini_api_key_here
AI_MODEL=gpt-4o-mini
CONTAINER_RUNTIME=docker
```

### 4. Database Initialization & Testing
Initialize collections, indexes, and seed demo accounts:
```bash
npm run db:init
```

Verify all 14 collections and MongoDB connectivity:
```bash
npm run db:test
```

### 5. Running the Application
Start both client and server concurrently:
```bash
npm run dev
```

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend API & Socket.IO:** [http://localhost:3001](http://localhost:3001)
- **Database:** `mongodb://localhost:27017/devchamber`

---

## Seed Accounts

| Role | Email | Password | Name |
|---|---|---|---|
| **Teacher** | `teacher@school.edu` | `password123` | Alex Morgan |
| **Student 1** | `student@school.edu` | `password123` | Jordan Lee |
| **Student 2** | `maya@school.edu` | `password123` | Maya Chen |

---

## Workspace Permission Model

- **Private by Default**: Every student receives an isolated workspace. Other students cannot view, list, or edit files without explicit permission.
- **Teacher Full Access**: The classroom instructor can inspect, edit, and assist on any student's workspace at any time.
- **Explicit Peer Delegation**: Teachers can grant `Viewer` (read-only) or `Editor` (collaborative editing) access to peer students.
- **Teacher Takeover / Assistance**: Instructors can activate **"Take Control"** to assist in live debugging while notifying the student.
- **Real-Time Permission Sync**: Permission changes instantly broadcast over Socket.IO and update active workspace sessions.
