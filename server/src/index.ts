import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createApiRouter } from './routes/api.js';
import { store, type ChatMessage } from './services/store.js';

const app = express();
const httpServer = createServer(app);

const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow any local dev origin or match clientOrigin
      if (!origin || origin === clientOrigin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive for hackathon demo convenience
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  maxHttpBufferSize: 5e6, // 5MB for screen frames/buffers
});

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '500kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

app.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    mode: supabase ? 'supabase' : 'local_demo',
    timestamp: new Date().toISOString(),
  })
);

app.use('/api', createApiRouter(supabase));

// Socket.IO Authentication Middleware (supports Supabase & Local Demo Mode)
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  const demoRole = socket.handshake.auth?.role || 'student';
  const demoName = socket.handshake.auth?.name || (demoRole === 'teacher' ? 'Alex Morgan' : 'Jordan Lee');
  const demoUserId = socket.handshake.auth?.userId || `${demoRole}-${demoName.toLowerCase().replace(/\s+/g, '')}`;

  // 1. Check Supabase token if available
  if (supabase && typeof token === 'string' && !token.startsWith('demo')) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data.user) {
        socket.data.userId = data.user.id;
        socket.data.name = data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'User';
        socket.data.role = data.user.user_metadata?.role || 'student';
        return next();
      }
    } catch {
      // Fall through to demo
    }
  }

  // 2. Demo mode / fallback authentication
  socket.data.userId = String(demoUserId);
  socket.data.name = String(demoName).slice(0, 60);
  socket.data.role = demoRole === 'teacher' ? 'teacher' : 'student';

  // Record user in store
  if (!store.profiles.has(socket.data.userId)) {
    store.profiles.set(socket.data.userId, {
      id: socket.data.userId,
      full_name: socket.data.name,
      role: socket.data.role,
      email: `${socket.data.userId}@school.edu`,
    });
  }

  next();
});

// Map of active users per classroom: classroomId -> Map<socketId, { socketId, userId, name, role }>
const classroomPresence = new Map<string, Map<string, { socketId: string; userId: string; name: string; role: string }>>();
// Map of active users per workspace: workspaceId -> Map<socketId, { socketId, userId, name, role }>
const workspacePresence = new Map<string, Map<string, { socketId: string; userId: string; name: string; role: string }>>();

io.on('connection', (socket) => {
  // --- Classroom Join & Presence ---
  socket.on('classroom:join', async ({ classroomId, name }: { classroomId: string; name?: string }) => {
    if (typeof classroomId !== 'string' || classroomId.length > 80) return;

    const displayName = name || socket.data.name || 'User';
    const roomKey = `classroom:${classroomId}`;
    socket.join(roomKey);

    if (!classroomPresence.has(classroomId)) {
      classroomPresence.set(classroomId, new Map());
    }

    const presenceMap = classroomPresence.get(classroomId)!;
    const userInfo = {
      socketId: socket.id,
      userId: socket.data.userId,
      name: displayName,
      role: socket.data.role,
    };
    presenceMap.set(socket.id, userInfo);

    // Send current classroom presence list to the newly joined socket
    socket.emit('classroom:roster', Array.from(presenceMap.values()));

    // Broadcast new user presence to everyone else in the room
    socket.to(roomKey).emit('classroom:user-online', userInfo);

    // Send previous messages
    const roomMessages = store.messages.filter((m) => m.classroom_id === classroomId);
    socket.emit('chat:history', roomMessages);
  });

  socket.on('classroom:leave', ({ classroomId }: { classroomId: string }) => {
    const roomKey = `classroom:${classroomId}`;
    socket.leave(roomKey);
    const presenceMap = classroomPresence.get(classroomId);
    if (presenceMap) {
      presenceMap.delete(socket.id);
      socket.to(roomKey).emit('classroom:user-offline', { socketId: socket.id, userId: socket.data.userId });
    }
  });

  // --- Live Class Session Controls ---
  socket.on('classroom:session-state', ({ classroomId, isLive }: { classroomId: string; isLive: boolean }) => {
    const room = store.classrooms.get(classroomId);
    if (room) room.is_live = isLive;
    io.to(`classroom:${classroomId}`).emit('classroom:session-state', { isLive });
  });

  // --- Screen Sharing Signaling (WebRTC + Stream Broadcast) ---
  socket.on('screen:start', ({ classroomId }: { classroomId: string }) => {
    socket.to(`classroom:${classroomId}`).emit('screen:start', { teacherSocketId: socket.id });
  });

  socket.on('screen:stop', ({ classroomId }: { classroomId: string }) => {
    socket.to(`classroom:${classroomId}`).emit('screen:stop', {});
  });

  socket.on('screen:frame', ({ classroomId, frame }: { classroomId: string; frame: string }) => {
    // Ultra-reliable fallback screen video transmission via frame streaming
    socket.to(`classroom:${classroomId}`).emit('screen:frame', { frame });
  });

  socket.on('webrtc:signal', ({ classroomId, targetSocketId, signal }: { classroomId: string; targetSocketId?: string; signal: any }) => {
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc:signal', { fromSocketId: socket.id, signal });
    } else {
      socket.to(`classroom:${classroomId}`).emit('webrtc:signal', { fromSocketId: socket.id, signal });
    }
  });

  // --- Classroom Chat ---
  socket.on('chat:message', (message: unknown) => {
    const parsed = z
      .object({
        classroomId: z.string().min(1).max(80),
        text: z.string().trim().min(1).max(2000),
        name: z.string().trim().min(1).max(60).optional(),
      })
      .safeParse(message);

    if (!parsed.success) return;

    const chatMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      classroom_id: parsed.data.classroomId,
      user_id: socket.data.userId,
      name: parsed.data.name || socket.data.name || 'Anonymous',
      role: socket.data.role || 'student',
      text: parsed.data.text,
      created_at: new Date().toISOString(),
    };

    // Store in memory
    store.messages.push(chatMsg);

    // Save in Supabase if configured
    if (supabase) {
      supabase.from('messages').insert({
        classroom_id: chatMsg.classroom_id,
        user_id: chatMsg.user_id,
        body: chatMsg.text,
      }).then();
    }

    io.to(`classroom:${parsed.data.classroomId}`).emit('chat:message', chatMsg);
  });

  // --- Workspace Realtime Collaboration ---
  socket.on('workspace:join', ({ workspaceId, classroomId }: { workspaceId: string; classroomId: string }) => {
    if (!workspaceId) return;
    const roomKey = `workspace:${workspaceId}`;
    socket.join(roomKey);

    if (!workspacePresence.has(workspaceId)) {
      workspacePresence.set(workspaceId, new Map());
    }

    const presenceMap = workspacePresence.get(workspaceId)!;
    const userInfo = {
      socketId: socket.id,
      userId: socket.data.userId,
      name: socket.data.name,
      role: socket.data.role,
    };
    presenceMap.set(socket.id, userInfo);

    // Broadcast updated collaborators
    io.to(roomKey).emit('workspace:presence', Array.from(presenceMap.values()));
  });

  socket.on('workspace:leave', ({ workspaceId }: { workspaceId: string }) => {
    if (!workspaceId) return;
    const roomKey = `workspace:${workspaceId}`;
    socket.leave(roomKey);
    const presenceMap = workspacePresence.get(workspaceId);
    if (presenceMap) {
      presenceMap.delete(socket.id);
      io.to(roomKey).emit('workspace:presence', Array.from(presenceMap.values()));
    }
  });

  socket.on('workspace:edit', ({ workspaceId, fileName, content, cursor }: { workspaceId: string; fileName: string; content: string; cursor?: any }) => {
    if (!workspaceId) return;
    // Broadcast live code edits to all other peers viewing this workspace
    socket.to(`workspace:${workspaceId}`).emit('workspace:edit', {
      userId: socket.data.userId,
      userName: socket.data.name,
      fileName,
      content,
      cursor,
    });
  });

  socket.on('workspace:cursor', ({ workspaceId, cursor }: { workspaceId: string; cursor: any }) => {
    if (!workspaceId) return;
    socket.to(`workspace:${workspaceId}`).emit('workspace:cursor', {
      userId: socket.data.userId,
      userName: socket.data.name,
      role: socket.data.role,
      cursor,
    });
  });

  socket.on('workspace:take-control', ({ workspaceId, classroomId, isControlled, teacherName }: { workspaceId: string; classroomId: string; isControlled: boolean; teacherName: string }) => {
    io.to(`workspace:${workspaceId}`).emit('workspace:take-control', {
      isControlled,
      teacherId: socket.data.userId,
      teacherName: teacherName || socket.data.name,
    });
  });

  socket.on('workspace:permission-update', ({ workspaceId, permissions }: { workspaceId: string; permissions: Record<string, string> }) => {
    io.to(`workspace:${workspaceId}`).emit('workspace:permission-update', { permissions });
  });

  // --- Assessments Broadcast ---
  socket.on('assessment:start', ({ classroomId, assessment }: { classroomId: string; assessment: any }) => {
    io.to(`classroom:${classroomId}`).emit('assessment:started', { assessment });
  });

  socket.on('assessment:submitted', ({ classroomId, submission }: { classroomId: string; submission: any }) => {
    io.to(`classroom:${classroomId}`).emit('assessment:submitted', { submission });
  });

  // --- Disconnect Handler ---
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room.startsWith('classroom:')) {
        const classroomId = room.replace('classroom:', '');
        const presenceMap = classroomPresence.get(classroomId);
        if (presenceMap) {
          presenceMap.delete(socket.id);
          socket.to(room).emit('classroom:user-offline', { socketId: socket.id, userId: socket.data.userId });
        }
      }
      if (room.startsWith('workspace:')) {
        const workspaceId = room.replace('workspace:', '');
        const presenceMap = workspacePresence.get(workspaceId);
        if (presenceMap) {
          presenceMap.delete(socket.id);
          socket.to(room).emit('workspace:presence', Array.from(presenceMap.values()));
        }
      }
    }
  });
});

const port = Number(process.env.SERVER_PORT || 3001);
httpServer.listen(port, () => {
  console.log(`DevChamber API & Socket.IO server listening on http://localhost:${port}`);
});
