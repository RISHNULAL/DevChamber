import { io, Socket } from 'socket.io-client';
import { supabase } from './api';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

let socketInstance: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  let token: string | undefined;
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  }

  const demoRole = (localStorage.getItem('dc-role') || 'Teacher').toLowerCase();
  const demoName = localStorage.getItem('dc-name') || (demoRole === 'teacher' ? 'Alex Morgan' : 'Jordan Lee');
  const demoUserId = localStorage.getItem('dc-user-id') || `${demoRole}-${demoName.toLowerCase().replace(/\s+/g, '')}`;

  if (socketInstance) {
    socketInstance.disconnect();
  }

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
