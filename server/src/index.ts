import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env and workspace .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createApiRouter } from './routes/api.js';
import { connectDatabase, checkDbConnection, MONGODB_URI } from './config/database.js';
import { verifyToken, getUserById } from './services/auth.js';
import {
  saveMessage,
  getClassroomMessages,
  saveWorkspaceMessage,
  getWorkspaceMessages,
} from './services/messages.js';
import { Classroom, ClassroomMember, Workspace } from './models/index.js';
import { getWorkspaceUserPermission } from './services/workspaces.js';
import {
  getYDocState,
  applyYDocUpdate,
  flushYDoc,
  removeYDoc,
  renameYDoc,
} from './services/yjsManager.js';

const app = express();
const httpServer = createServer(app);

const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (
        !origin ||
        origin === clientOrigin ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        callback(null, true);
      } else {
        callback(null, true);
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

app.get('/health', async (_req, res) => {
  const dbStatus = await checkDbConnection();
  res.status(dbStatus.ok ? 200 : 503).json({
    status: dbStatus.ok ? 'ok' : 'error',
    database: dbStatus.ok ? 'connected' : 'disconnected',
    databaseName: dbStatus.database,
    mode: 'mongodb',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', createApiRouter());

// Socket.IO Authentication Middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (typeof token === 'string' && token.length > 0) {
    // 1. Check JWT token
    const decoded = verifyToken(token);
    if (decoded) {
      socket.data.userId = decoded.id;
      socket.data.name = decoded.name;
      socket.data.role = decoded.role;
      return next();
    }

    // 2. Demo token fallback
    if (token.startsWith('demo:') || token.startsWith('demo-') || token === 'demo') {
      let userId = 'teacher-alex-uuid-000000000001';
      let role = 'teacher';
      let name = 'Alex Morgan';

      if (token.includes(':')) {
        const parts = token.split(':');
        userId = parts[1] || userId;
        role = parts[2] || role;
        name = parts[3] ? decodeURIComponent(parts[3]) : name;
      } else if (token.startsWith('demo-')) {
        const parts = token.split('-');
        if (parts[1] === 'student') {
          role = 'student';
          userId = 'student-jordan-uuid-000000000002';
          name = 'Jordan Lee';
        }
      }

      const dbUser = await getUserById(userId).catch(() => null);
      if (dbUser) {
        socket.data.userId = dbUser.id;
        socket.data.name = dbUser.full_name;
        socket.data.role = dbUser.role;
      } else {
        socket.data.userId = userId;
        socket.data.name = name;
        socket.data.role = role;
      }
      return next();
    }
  }

  // Fallback defaults for guest / unauthenticated sockets
  const demoRole = socket.handshake.auth?.role || 'student';
  const demoName = socket.handshake.auth?.name || (demoRole === 'teacher' ? 'Alex Morgan' : 'Jordan Lee');
  const demoUserId =
    socket.handshake.auth?.userId ||
    (demoRole === 'teacher' ? 'teacher-alex-uuid-000000000001' : 'student-jordan-uuid-000000000002');

  socket.data.userId = String(demoUserId);
  socket.data.name = String(demoName).slice(0, 60);
  socket.data.role = demoRole === 'teacher' ? 'teacher' : 'student';

  next();
});

// Map of active users per classroom: classroomId -> Map<socketId, { socketId, userId, name, role }>
const classroomPresence = new Map<string, Map<string, { socketId: string; userId: string; name: string; role: string }>>();
// Map of active users per workspace: workspaceId -> Map<socketId, { socketId, userId, name, role }>
const workspacePresence = new Map<string, Map<string, { socketId: string; userId: string; name: string; role: string }>>();

// Map of active video call participants: classroomId -> Map<socketId, CallParticipant>
interface CallParticipant {
  socketId: string;
  userId: string;
  name: string;
  role: string;
  micEnabled: boolean;
  camEnabled: boolean;
  isSharingScreen: boolean;
  joinedAt: Date;
}
const classroomCalls = new Map<string, Map<string, CallParticipant>>();

// Map of active screen shares per classroom: classroomId -> { isSharing, teacherSocketId, teacherId, teacherName, startedAt }
interface ActiveScreenShare {
  isSharing: boolean;
  teacherSocketId: string;
  teacherId: string;
  teacherName: string;
  startedAt: Date;
}
const activeScreenShares = new Map<string, ActiveScreenShare>();

io.on('connection', (socket) => {
  // --- Classroom Join & Presence ---
  socket.on('classroom:join', async ({ classroomId, name }: { classroomId: string; name?: string }) => {
    if (typeof classroomId !== 'string' || classroomId.length > 80) return;

    // Verify classroom membership in MongoDB
    try {
      const isMember = await ClassroomMember.findOne({ classroomId, userId: socket.data.userId }).lean();
      const isTeacher = await Classroom.findOne({ _id: classroomId, teacherId: socket.data.userId }).lean();

      if (!isMember && !isTeacher && socket.data.role !== 'admin') {
        socket.emit('error', { message: 'Unauthorized: You are not a member of this classroom.' });
        return;
      }
    } catch (e) {
      console.warn('[Classroom Join Auth Check Warning]:', e);
    }

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

    // 1. Send current classroom presence roster to the newly joined socket
    const roster = Array.from(presenceMap.values());
    socket.emit('classroom:roster', roster);
    socket.emit('presence:update', { users: roster, classroomId });

    // 2. Broadcast new user presence to everyone else in the room
    socket.to(roomKey).emit('classroom:user-online', userInfo);
    io.to(roomKey).emit('presence:update', { users: Array.from(presenceMap.values()), classroomId });

    // 3. Send previous chat messages from MongoDB
    try {
      const roomMessages = await getClassroomMessages(classroomId, 50);
      const formattedHistory = roomMessages.map((m) => ({
        ...m,
        content: m.text,
        senderName: m.name,
        senderId: m.user_id,
        senderRole: m.role,
        createdAt: m.created_at,
      }));
      socket.emit('chat:history', { messages: formattedHistory, classroomId });
      socket.emit('classroom:chat-history', formattedHistory);
    } catch (err) {
      console.warn('Could not fetch chat history from MongoDB:', err);
    }

    // 4. Send active screen sharing status if instructor is already broadcasting
    const activeShare = activeScreenShares.get(classroomId);
    if (activeShare && activeShare.isSharing) {
      socket.emit('screen:status', activeShare);
      socket.emit('screen:start', {
        teacherSocketId: activeShare.teacherSocketId,
        teacherName: activeShare.teacherName,
      });
      socket.emit('screen:started', {
        teacherSocketId: activeShare.teacherSocketId,
        teacherName: activeShare.teacherName,
        classroomId,
      });
    }
  });

  const handleLeaveClassroom = ({ classroomId }: { classroomId: string }) => {
    const roomKey = `classroom:${classroomId}`;
    socket.leave(roomKey);
    const presenceMap = classroomPresence.get(classroomId);
    if (presenceMap) {
      presenceMap.delete(socket.id);
      socket.to(roomKey).emit('classroom:user-offline', { socketId: socket.id, userId: socket.data.userId });
      io.to(roomKey).emit('presence:update', { users: Array.from(presenceMap.values()), classroomId });
    }
  };

  socket.on('classroom:leave', handleLeaveClassroom);

  // --- Live Class Session Controls ---
  socket.on('classroom:session-state', async ({ classroomId, isLive }: { classroomId: string; isLive: boolean }) => {
    try {
      await Classroom.findByIdAndUpdate(classroomId, { isLive: Boolean(isLive) });
    } catch (e) {
      console.warn('Failed to update classroom session state in MongoDB:', e);
    }
    io.to(`classroom:${classroomId}`).emit('classroom:session-state', { isLive });
  });

  socket.on('class:start', async ({ classroomId }: { classroomId: string }) => {
    if (socket.data.role !== 'teacher' && socket.data.role !== 'admin') {
      socket.emit('error', { message: 'Only instructors can start a class.' });
      return;
    }
    try {
      await Classroom.findByIdAndUpdate(classroomId, { isLive: true });
    } catch (e) {
      console.warn('Class start MongoDB update failed:', e);
    }
    io.to(`classroom:${classroomId}`).emit('class:started', { classroomId, teacherName: socket.data.name });
    io.to(`classroom:${classroomId}`).emit('classroom:session-state', { isLive: true });
  });

  socket.on('class:end', async ({ classroomId }: { classroomId: string }) => {
    if (socket.data.role !== 'teacher' && socket.data.role !== 'admin') {
      socket.emit('error', { message: 'Only instructors can end a class.' });
      return;
    }
    try {
      await Classroom.findByIdAndUpdate(classroomId, { isLive: false });
    } catch (e) {
      console.warn('Class end MongoDB update failed:', e);
    }
    activeScreenShares.delete(classroomId);
    classroomCalls.delete(classroomId);
    io.to(`classroom:${classroomId}`).emit('class:ended', {
      classroomId,
      message: 'The instructor has ended the live class.',
    });
    io.to(`classroom:${classroomId}`).emit('screen:stop', { classroomId });
    io.to(`classroom:${classroomId}`).emit('classroom:session-state', { isLive: false });
  });

  // --- Multi-Peer Video Classroom Call Management ---
  socket.on('classroom:join-call', async ({ classroomId, userId, name, role, micEnabled, camEnabled, isSharingScreen }: any) => {
    if (!classroomId) return;
    const roomKey = `classroom:${classroomId}`;
    socket.join(roomKey);

    if (!classroomCalls.has(classroomId)) {
      classroomCalls.set(classroomId, new Map());
    }
    const callMap = classroomCalls.get(classroomId)!;
    const participant: CallParticipant = {
      socketId: socket.id,
      userId: userId || socket.data.userId,
      name: name || socket.data.name || 'Participant',
      role: role || socket.data.role || 'student',
      micEnabled: Boolean(micEnabled),
      camEnabled: Boolean(camEnabled),
      isSharingScreen: Boolean(isSharingScreen),
      joinedAt: new Date(),
    };
    callMap.set(socket.id, participant);

    const activeShare = activeScreenShares.get(classroomId);

    // 1. Send active call roster to joining socket
    socket.emit('call:roster', {
      participants: Array.from(callMap.values()),
      activeShare: activeShare && activeShare.isSharing ? activeShare : null,
    });

    // 2. Broadcast new participant to other sockets in call
    socket.to(roomKey).emit('participant:joined', participant);
  });

  socket.on('classroom:leave-call', ({ classroomId }: { classroomId: string }) => {
    if (!classroomId) return;
    const roomKey = `classroom:${classroomId}`;
    const callMap = classroomCalls.get(classroomId);
    if (callMap) {
      callMap.delete(socket.id);
      socket.to(roomKey).emit('participant:left', { socketId: socket.id, userId: socket.data.userId });
    }
  });

  socket.on('participant:media-state', ({ classroomId, micEnabled, camEnabled, isSharingScreen }: any) => {
    if (!classroomId) return;
    const roomKey = `classroom:${classroomId}`;
    const callMap = classroomCalls.get(classroomId);
    if (callMap && callMap.has(socket.id)) {
      const current = callMap.get(socket.id)!;
      current.micEnabled = Boolean(micEnabled);
      current.camEnabled = Boolean(camEnabled);
      current.isSharingScreen = Boolean(isSharingScreen);
      callMap.set(socket.id, current);
    }
    socket.to(roomKey).emit('participant:media-state', {
      socketId: socket.id,
      userId: socket.data.userId,
      name: socket.data.name,
      micEnabled: Boolean(micEnabled),
      camEnabled: Boolean(camEnabled),
      isSharingScreen: Boolean(isSharingScreen),
    });
  });

  // --- WebRTC Screen Sharing & Signaling ---
  const handleStartScreenShare = async ({ classroomId, teacherName }: { classroomId: string; teacherName?: string }) => {
    // Only teacher can start screen share
    if (socket.data.role !== 'teacher' && socket.data.role !== 'admin') {
      socket.emit('error', { message: 'Only instructors can share screen.' });
      return;
    }

    const shareData: ActiveScreenShare = {
      isSharing: true,
      teacherSocketId: socket.id,
      teacherId: socket.data.userId,
      teacherName: teacherName || socket.data.name || 'Instructor',
      startedAt: new Date(),
    };

    activeScreenShares.set(classroomId, shareData);

    const payload = {
      classroomId,
      teacherSocketId: socket.id,
      teacherName: shareData.teacherName,
      isSharing: true,
      startedAt: shareData.startedAt,
    };

    // Broadcast to students in that classroom room
    socket.to(`classroom:${classroomId}`).emit('screen:start', payload);
    socket.to(`classroom:${classroomId}`).emit('screen:started', payload);
    socket.to(`classroom:${classroomId}`).emit('screen-share:started', payload);
  };

  socket.on('screen:start', handleStartScreenShare);
  socket.on('screen-share:start', handleStartScreenShare);

  const handleStopScreenShare = ({ classroomId }: { classroomId: string }) => {
    activeScreenShares.delete(classroomId);
    io.to(`classroom:${classroomId}`).emit('screen:stop', { classroomId });
    io.to(`classroom:${classroomId}`).emit('screen:stopped', { classroomId });
    io.to(`classroom:${classroomId}`).emit('screen-share:stopped', { classroomId });
  };

  socket.on('screen:stop', handleStopScreenShare);
  socket.on('screen-share:stop', handleStopScreenShare);

  socket.on('screen:check-state', ({ classroomId }: { classroomId: string }) => {
    const shareData = activeScreenShares.get(classroomId);
    if (shareData) {
      socket.emit('screen:status', shareData);
    } else {
      socket.emit('screen:status', { isSharing: false });
    }
  });

  socket.on('screen:frame', ({ classroomId, frame }: { classroomId: string; frame: string }) => {
    socket.to(`classroom:${classroomId}`).emit('screen:frame', { frame });
  });

  // WebRTC Stream Request (from Student to Teacher)
  socket.on(
    'webrtc:request-stream',
    ({ classroomId, targetSocketId }: { classroomId: string; targetSocketId?: string }) => {
      const activeShare = activeScreenShares.get(classroomId);
      const teacherSocket = targetSocketId || activeShare?.teacherSocketId;
      if (teacherSocket) {
        io.to(teacherSocket).emit('webrtc:request-stream', {
          fromSocketId: socket.id,
          studentSocketId: socket.id,
          studentUserId: socket.data.userId,
          studentName: socket.data.name,
        });
      }
    }
  );

  // WebRTC Offer (from Teacher to Student)
  socket.on(
    'webrtc:offer',
    ({ classroomId, targetSocketId, toSocketId, offer, sdp }: { classroomId?: string; targetSocketId?: string; toSocketId?: string; offer?: any; sdp?: any }) => {
      const target = targetSocketId || toSocketId;
      if (target) {
        io.to(target).emit('webrtc:offer', {
          fromSocketId: socket.id,
          offer: offer || sdp,
          sdp: sdp || offer,
        });
      }
    }
  );

  // WebRTC Answer (from Student to Teacher)
  socket.on(
    'webrtc:answer',
    ({ classroomId, targetSocketId, toSocketId, answer, sdp }: { classroomId?: string; targetSocketId?: string; toSocketId?: string; answer?: any; sdp?: any }) => {
      const target = targetSocketId || toSocketId;
      if (target) {
        io.to(target).emit('webrtc:answer', {
          fromSocketId: socket.id,
          answer: answer || sdp,
          sdp: sdp || answer,
        });
      }
    }
  );

  // WebRTC ICE Candidate (Bidirectional)
  socket.on(
    'webrtc:ice-candidate',
    ({ classroomId, targetSocketId, toSocketId, candidate }: { classroomId?: string; targetSocketId?: string; toSocketId?: string; candidate: any }) => {
      const target = targetSocketId || toSocketId;
      if (target) {
        io.to(target).emit('webrtc:ice-candidate', { fromSocketId: socket.id, candidate });
      }
    }
  );

  // --- Classroom Chat (MongoDB Persisted with Realtime Delivery) ---
  const handleChatMessage = async (message: unknown) => {
    const raw = (message as any) || {};
    const textContent =
      typeof raw.text === 'string'
        ? raw.text
        : typeof raw.content === 'string'
        ? raw.content
        : '';
    const classroomId = raw.classroomId || raw.classroom_id;
    const name = raw.name || raw.senderName;
    const replyTo = raw.replyTo || raw.reply_to;

    const parsed = z
      .object({
        classroomId: z.string().min(1).max(80),
        text: z.string().trim().min(1).max(2000),
        name: z.string().trim().min(1).max(60).optional(),
      })
      .safeParse({
        classroomId,
        text: textContent,
        name,
      });

    if (!parsed.success) return;

    // Verify classroom membership in MongoDB
    try {
      const isMember = await ClassroomMember.findOne({
        classroomId: parsed.data.classroomId,
        userId: socket.data.userId,
      }).lean();
      const isTeacher = await Classroom.findOne({
        _id: parsed.data.classroomId,
        instructorId: socket.data.userId,
      }).lean();

      if (!isMember && !isTeacher && socket.data.role !== 'admin') {
        socket.emit('error', {
          message:
            'Unauthorized: You cannot post in a classroom you are not a member of.',
        });
        return;
      }
    } catch (e) {
      console.warn('[Chat Auth Check Warning]:', e);
    }

    const senderName = parsed.data.name || socket.data.name || 'Anonymous';
    const senderRole = socket.data.role || 'student';
    const senderUserId = socket.data.userId;

    try {
      const saved = await saveMessage(
        parsed.data.classroomId,
        senderUserId,
        senderName,
        senderRole,
        parsed.data.text,
        replyTo
      );
      const broadcastMsg = {
        ...saved,
        content: saved.text,
        senderName: saved.name,
        senderId: saved.user_id,
        senderRole: saved.role,
        createdAt: saved.created_at,
      };
      io.to(`classroom:${parsed.data.classroomId}`).emit(
        'chat:message',
        broadcastMsg
      );
      io.to(`classroom:${parsed.data.classroomId}`).emit(
        'chat:message:new',
        broadcastMsg
      );
    } catch (err) {
      console.error('Failed to save message to MongoDB:', err);
      // Fallback emit
      const fallbackMsg = {
        id: `msg-${Date.now()}`,
        classroom_id: parsed.data.classroomId,
        user_id: senderUserId,
        name: senderName,
        role: senderRole,
        text: parsed.data.text,
        content: parsed.data.text,
        senderName,
        senderId: senderUserId,
        senderRole,
        reply_to: replyTo,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      io.to(`classroom:${parsed.data.classroomId}`).emit(
        'chat:message',
        fallbackMsg
      );
      io.to(`classroom:${parsed.data.classroomId}`).emit(
        'chat:message:new',
        fallbackMsg
      );
    }
  };

  socket.on('chat:message', handleChatMessage);
  socket.on('chat:send', handleChatMessage);

  // Classroom Typing Indicator
  socket.on('chat:typing', ({ classroomId }: { classroomId: string }) => {
    if (!classroomId) return;
    socket.to(`classroom:${classroomId}`).emit('chat:typing', {
      userId: socket.data.userId,
      name: socket.data.name,
      role: socket.data.role,
      isTyping: true,
      classroomId,
    });
  });

  socket.on('chat:typing:stop', ({ classroomId }: { classroomId: string }) => {
    if (!classroomId) return;
    socket.to(`classroom:${classroomId}`).emit('chat:typing:stop', {
      userId: socket.data.userId,
      name: socket.data.name,
      role: socket.data.role,
      isTyping: false,
      classroomId,
    });
  });

  // --- Workspace Real-Time Group Chat (MongoDB Persisted) ---
  socket.on(
    'workspace:chat:join',
    async ({ workspaceId }: { workspaceId: string }) => {
      if (!workspaceId) return;
      const roomKey = `workspace:${workspaceId}`;
      socket.join(roomKey);

      if (!workspacePresence.has(workspaceId)) {
        workspacePresence.set(workspaceId, new Map());
      }
      const presenceMap = workspacePresence.get(workspaceId)!;
      presenceMap.set(socket.id, {
        socketId: socket.id,
        userId: socket.data.userId,
        name: socket.data.name || 'Collaborator',
        role: socket.data.role || 'student',
      });
      io.to(roomKey).emit('workspace:presence', Array.from(presenceMap.values()));

      try {
        const history = await getWorkspaceMessages(workspaceId, 50);
        socket.emit('workspace:chat:history', {
          workspaceId,
          messages: history,
        });
      } catch (e) {
        console.warn('Failed to load workspace chat history:', e);
      }
    }
  );

  socket.on('workspace:chat:message', async (data: any) => {
    const raw = data || {};
    const textContent =
      typeof raw.text === 'string'
        ? raw.text
        : typeof raw.content === 'string'
        ? raw.content
        : '';
    const workspaceId = raw.workspaceId || raw.workspace_id;
    const replyTo = raw.replyTo || raw.reply_to;

    if (!workspaceId || !textContent.trim()) return;

    let senderRole = 'Student';
    const senderUserId = socket.data.userId;
    let senderName = socket.data.name || raw.name || 'Collaborator';

    // Verify workspace access & determine accurate sender role using getWorkspaceUserPermission
    try {
      const permCheck = await getWorkspaceUserPermission(
        workspaceId,
        senderUserId,
        socket.data.role
      );

      if (!permCheck.allowed) {
        socket.emit('error', {
          message: 'Unauthorized: You do not have access to this workspace chat',
        });
        return;
      }

      if (permCheck.permission === 'viewer') {
        socket.emit('error', {
          message: 'You have read-only access to this workspace chat',
        });
        return;
      }

      if (permCheck.permission === 'owner') {
        senderRole = 'Owner';
      } else if (permCheck.isInstructor) {
        senderRole = 'Teacher';
      } else if (permCheck.permission === 'editor') {
        senderRole = 'Editor';
      } else if (socket.data.role === 'teacher') {
        senderRole = 'Teacher';
      }
    } catch (e) {
      console.warn('[Workspace Chat Auth Error]:', e);
    }

    try {
      const saved = await saveWorkspaceMessage(
        workspaceId,
        senderUserId,
        senderName,
        senderRole,
        textContent.trim(),
        replyTo
      );
      const broadcastMsg = {
        ...saved,
        content: saved.text,
        senderName: saved.name,
        senderId: saved.user_id,
        senderRole: saved.role,
        createdAt: saved.created_at,
      };
      io.to(`workspace:${workspaceId}`).emit(
        'workspace:chat:message',
        broadcastMsg
      );
    } catch (err) {
      console.error('Failed to save workspace message to MongoDB:', err);
      const fallbackMsg = {
        id: `ws-msg-${Date.now()}`,
        workspace_id: workspaceId,
        user_id: senderUserId,
        name: senderName,
        role: senderRole,
        text: textContent.trim(),
        content: textContent.trim(),
        senderName,
        senderId: senderUserId,
        senderRole,
        reply_to: replyTo,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      io.to(`workspace:${workspaceId}`).emit(
        'workspace:chat:message',
        fallbackMsg
      );
    }
  });

  socket.on(
    'workspace:chat:typing',
    ({ workspaceId }: { workspaceId: string }) => {
      if (!workspaceId) return;
      socket.to(`workspace:${workspaceId}`).emit('workspace:chat:typing', {
        userId: socket.data.userId,
        name: socket.data.name,
        role: socket.data.role,
        isTyping: true,
        workspaceId,
      });
    }
  );

  socket.on(
    'workspace:chat:typing:stop',
    ({ workspaceId }: { workspaceId: string }) => {
      if (!workspaceId) return;
      socket.to(`workspace:${workspaceId}`).emit('workspace:chat:typing:stop', {
        userId: socket.data.userId,
        name: socket.data.name,
        role: socket.data.role,
        isTyping: false,
        workspaceId,
      });
    }
  );

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

  socket.on(
    'workspace:edit',
    ({
      workspaceId,
      fileName,
      content,
      cursor,
    }: {
      workspaceId: string;
      fileName: string;
      content: string;
      cursor?: any;
    }) => {
      if (!workspaceId) return;
      socket.to(`workspace:${workspaceId}`).emit('workspace:edit', {
        userId: socket.data.userId,
        userName: socket.data.name,
        fileName,
        content,
        cursor,
      });
    }
  );

  socket.on('workspace:cursor', ({ workspaceId, cursor }: { workspaceId: string; cursor: any }) => {
    if (!workspaceId) return;
    socket.to(`workspace:${workspaceId}`).emit('workspace:cursor', {
      userId: socket.data.userId,
      userName: socket.data.name,
      role: socket.data.role,
      cursor,
    });
  });

  socket.on(
    'workspace:take-control',
    ({
      workspaceId,
      classroomId,
      isControlled,
      teacherName,
    }: {
      workspaceId: string;
      classroomId?: string;
      isControlled: boolean;
      teacherName?: string;
    }) => {
      const payload = {
        workspaceId,
        isControlled,
        teacherId: socket.data.userId,
        teacherName: teacherName || socket.data.name || 'Instructor',
      };
      io.to(`workspace:${workspaceId}`).emit('workspace:take-control', payload);
      if (classroomId) {
        io.to(`classroom:${classroomId}`).emit('workspace:take-control', payload);
      }
    }
  );

  socket.on(
    'workspace:permission-update',
    ({
      workspaceId,
      classroomId,
      targetUserId,
      permission,
      action,
      ownerName,
      permissions,
    }: {
      workspaceId: string;
      classroomId?: string;
      targetUserId?: string;
      permission?: string;
      action?: 'granted' | 'revoked';
      ownerName?: string;
      permissions?: Record<string, string>;
    }) => {
      const payload = {
        workspaceId,
        targetUserId,
        permission,
        action: action || 'granted',
        ownerName: ownerName || 'Student',
        permissions,
        updatedBy: socket.data.name,
      };
      io.to(`workspace:${workspaceId}`).emit('workspace:permission-update', payload);
      if (classroomId) {
        io.to(`classroom:${classroomId}`).emit('workspace:permission-update', payload);
      }
    }
  );

  // --- Real-Time Yjs Collaborative Code Synchronization ---
  socket.on(
    'yjs:join',
    async ({ workspaceId, fileName }: { workspaceId: string; fileName: string }) => {
      try {
        if (!workspaceId || !fileName) return;
        const perm = await getWorkspaceUserPermission(workspaceId, socket.data.userId, socket.data.role);
        if (!perm.allowed) {
          socket.emit('yjs:error', { message: 'Access denied: Workspace is private' });
          return;
        }

        const roomKey = `workspace:${workspaceId}:file:${fileName}`;
        socket.join(roomKey);

        const stateUpdate = await getYDocState(workspaceId, fileName);
        socket.emit('yjs:sync', {
          workspaceId,
          fileName,
          update: stateUpdate,
          permission: perm.permission,
        });
      } catch (err: any) {
        socket.emit('yjs:error', { message: err?.message || 'Failed to join collaborative document' });
      }
    }
  );

  socket.on(
    'yjs:leave',
    ({ workspaceId, fileName }: { workspaceId: string; fileName: string }) => {
      if (!workspaceId || !fileName) return;
      const roomKey = `workspace:${workspaceId}:file:${fileName}`;
      socket.leave(roomKey);
    }
  );

  socket.on(
    'yjs:update',
    async ({
      workspaceId,
      fileName,
      update,
    }: {
      workspaceId: string;
      fileName: string;
      update: number[] | Uint8Array;
    }) => {
      try {
        if (!workspaceId || !fileName || !update) return;
        const perm = await getWorkspaceUserPermission(workspaceId, socket.data.userId, socket.data.role);
        if (!perm.allowed || perm.permission === 'viewer') {
          // Read-only viewer cannot push write updates
          return;
        }

        await applyYDocUpdate(workspaceId, fileName, update);
        const roomKey = `workspace:${workspaceId}:file:${fileName}`;
        socket.to(roomKey).emit('yjs:update', {
          workspaceId,
          fileName,
          update,
          userId: socket.data.userId,
        });
      } catch (err: any) {
        console.error('[Yjs:update] Error:', err);
      }
    }
  );

  socket.on(
    'yjs:awareness',
    ({
      workspaceId,
      fileName,
      update,
    }: {
      workspaceId: string;
      fileName: string;
      update: number[] | Uint8Array;
    }) => {
      if (!workspaceId || !fileName || !update) return;
      const roomKey = `workspace:${workspaceId}:file:${fileName}`;
      socket.to(roomKey).emit('yjs:awareness', {
        workspaceId,
        fileName,
        update,
        userId: socket.data.userId,
      });
    }
  );

  socket.on(
    'yjs:flush',
    async (
      { workspaceId, fileName }: { workspaceId: string; fileName: string },
      callback?: any
    ) => {
      try {
        if (!workspaceId || !fileName) return;
        const perm = await getWorkspaceUserPermission(workspaceId, socket.data.userId, socket.data.role);
        if (!perm.allowed || perm.permission === 'viewer') {
          if (callback) callback({ error: 'Permission denied: Read-only access' });
          return;
        }
        const savedContent = await flushYDoc(workspaceId, fileName);
        if (callback) callback({ success: true, content: savedContent });
      } catch (err: any) {
        if (callback) callback({ error: err?.message || 'Flush failed' });
      }
    }
  );

  socket.on(
    'workspace:file-sync',
    async ({
      workspaceId,
      fileName,
      oldFileName,
      action,
    }: {
      workspaceId: string;
      fileName: string;
      oldFileName?: string;
      action: 'created' | 'deleted' | 'renamed';
    }) => {
      if (action === 'deleted') {
        removeYDoc(workspaceId, fileName);
      } else if (action === 'renamed' && oldFileName) {
        await renameYDoc(workspaceId, oldFileName, fileName);
      }

      socket
        .to(`workspace:${workspaceId}`)
        .emit('workspace:file-sync', { workspaceId, fileName, oldFileName, action, userId: socket.data.userId });
    }
  );

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

        // Clean up video call participant if in call
        const callMap = classroomCalls.get(classroomId);
        if (callMap && callMap.has(socket.id)) {
          callMap.delete(socket.id);
          socket.to(room).emit('participant:left', { socketId: socket.id, userId: socket.data.userId });
        }

        // Clean up screen share if broadcaster disconnected
        const activeShare = activeScreenShares.get(classroomId);
        if (activeShare && activeShare.teacherSocketId === socket.id) {
          activeScreenShares.delete(classroomId);
          socket.to(room).emit('screen:stop', {});
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

async function startServer() {
  try {
    await connectDatabase();
    httpServer.listen(port, () => {
      console.log(`DevChamber API & Socket.IO server running on http://localhost:${port} (MongoDB @ ${MONGODB_URI})`);
    });
  } catch (err) {
    console.error('Failed to start server due to database connection failure:', err);
    process.exit(1);
  }
}

startServer();
