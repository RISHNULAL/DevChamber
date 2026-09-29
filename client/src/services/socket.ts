import { io, Socket } from 'socket.io-client';
import { getStoredToken } from './api';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (socketInstance) {
    return socketInstance;
  }

  const token = getStoredToken();
  const demoRole = (localStorage.getItem('dc-role') || 'Teacher').toLowerCase();
  const demoName = localStorage.getItem('dc-name') || (demoRole === 'teacher' ? 'Alex Morgan' : 'Jordan Lee');
  const demoUserId = localStorage.getItem('dc-user-id') || (demoRole === 'teacher' ? 'teacher-alex-uuid-000000000001' : 'student-jordan-uuid-000000000002');

  socketInstance = io(SERVER_URL, {
    auth: {
      token: token || `demo:${demoUserId}:${demoRole}:${encodeURIComponent(demoName)}`,
      role: demoRole,
      name: demoName,
      userId: demoUserId,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
