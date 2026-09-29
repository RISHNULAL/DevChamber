import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { MonacoBinding } from 'y-monaco';
import { getSocket } from './socket';

const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48', // rose
];

export function getUserColor(userId: string): string {
  if (!userId) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export interface YjsSessionOptions {
  workspaceId: string;
  fileName: string;
  userId: string;
  userName: string;
  userRole: string;
  editor: any; // Monaco editor instance
  onStatusChange?: (status: 'live' | 'syncing' | 'offline') => void;
  onTextChange?: (text: string) => void;
  onCollaboratorsChange?: (collaborators: Array<{ userId: string; name: string; color: string }>) => void;
}

export interface YjsSession {
  doc: Y.Doc;
  ytext: Y.Text;
  awareness: awarenessProtocol.Awareness;
  binding: MonacoBinding;
  destroy: () => void;
  getText: () => string;
  flush: () => Promise<string>;
}

export function createYjsSession(opts: YjsSessionOptions): YjsSession {
  const { workspaceId, fileName, userId, userName, userRole, editor, onStatusChange, onTextChange, onCollaboratorsChange } = opts;
  const socket = getSocket();
  const doc = new Y.Doc();
  const ytext = doc.getText('monaco');
  const awareness = new awarenessProtocol.Awareness(doc);

  const userColor = getUserColor(userId);
  awareness.setLocalStateField('user', {
    name: userName,
    color: userColor,
    userId,
    role: userRole,
  });

  onStatusChange?.('syncing');

  // Update dynamic CSS tags for remote collaborator cursors
  const updateCursorStyles = () => {
    let css = '';
    const activeCollabs: Array<{ userId: string; name: string; color: string }> = [];

    awareness.getStates().forEach((state: any, clientID: number) => {
      if (state.user) {
        const color = state.user.color || '#3b82f6';
        const name = state.user.name || 'Collaborator';
        if (state.user.userId !== userId) {
          activeCollabs.push({ userId: state.user.userId, name, color });
        }
        css += `
          .yRemoteSelection-${clientID} {
            background-color: ${color}33 !important;
          }
          .yRemoteSelectionHead-${clientID} {
            position: absolute;
            border-left: 2px solid ${color} !important;
            height: 100%;
            box-sizing: border-box;
          }
          .yRemoteSelectionHead-${clientID}::after {
            position: absolute;
            content: '${name.replace(/'/g, "\\'")}';
            top: -1.35em;
            left: -2px;
            font-size: 10px;
            font-family: inherit;
            font-weight: 600;
            color: #ffffff;
            background-color: ${color};
            padding: 1px 5px;
            border-radius: 3px;
            white-space: nowrap;
            pointer-events: none;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
            z-index: 100;
          }
        `;
      }
    });

    let styleEl = document.getElementById('yjs-collaborator-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'yjs-collaborator-styles';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
    onCollaboratorsChange?.(activeCollabs);
  };

  awareness.on('change', updateCursorStyles);

  // Bind Monaco Editor to Yjs Text
  const model = editor.getModel();
  const binding = new MonacoBinding(ytext, model, new Set([editor]), awareness);

  // Monitor text changes
  ytext.observe(() => {
    onTextChange?.(ytext.toString());
  });

  // Socket: Send local document updates
  const handleLocalDocUpdate = (update: Uint8Array, origin: any) => {
    if (origin !== 'socket' && origin !== 'sync') {
      socket.emit('yjs:update', {
        workspaceId,
        fileName,
        update: Array.from(update),
      });
    }
  };
  doc.on('update', handleLocalDocUpdate);

  // Socket: Send local awareness updates
  const handleLocalAwarenessUpdate = ({ added, updated, removed }: any, origin: any) => {
    if (origin !== 'socket') {
      const changedClients = added.concat(updated).concat(removed);
      const encoded = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
      socket.emit('yjs:awareness', {
        workspaceId,
        fileName,
        update: Array.from(encoded),
      });
    }
  };
  awareness.on('update', handleLocalAwarenessUpdate);

  // Socket: Receive remote sync & updates
  const handleRemoteSync = ({ workspaceId: wsId, fileName: fn, update }: any) => {
    if (wsId === workspaceId && fn === fileName && update) {
      try {
        Y.applyUpdate(doc, new Uint8Array(update), 'sync');
        onStatusChange?.('live');
        onTextChange?.(ytext.toString());
      } catch (err) {
        console.error('[Yjs] Error applying sync update:', err);
      }
    }
  };

  const handleRemoteUpdate = ({ workspaceId: wsId, fileName: fn, update }: any) => {
    if (wsId === workspaceId && fn === fileName && update) {
      try {
        Y.applyUpdate(doc, new Uint8Array(update), 'socket');
        onStatusChange?.('live');
        onTextChange?.(ytext.toString());
      } catch (err) {
        console.error('[Yjs] Error applying remote update:', err);
      }
    }
  };

  const handleRemoteAwareness = ({ workspaceId: wsId, fileName: fn, update }: any) => {
    if (wsId === workspaceId && fn === fileName && update) {
      try {
        awarenessProtocol.applyAwarenessUpdate(awareness, new Uint8Array(update), 'socket');
      } catch (err) {
        console.error('[Yjs] Error applying remote awareness:', err);
      }
    }
  };

  const handleConnect = () => {
    socket.emit('yjs:join', { workspaceId, fileName });
    onStatusChange?.('live');
  };

  const handleDisconnect = () => {
    onStatusChange?.('offline');
  };

  socket.on('yjs:sync', handleRemoteSync);
  socket.on('yjs:update', handleRemoteUpdate);
  socket.on('yjs:awareness', handleRemoteAwareness);
  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);

  // Join the file room now
  socket.emit('yjs:join', { workspaceId, fileName });

  const destroy = () => {
    try {
      socket.emit('yjs:leave', { workspaceId, fileName });
      socket.off('yjs:sync', handleRemoteSync);
      socket.off('yjs:update', handleRemoteUpdate);
      socket.off('yjs:awareness', handleRemoteAwareness);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      awareness.off('change', updateCursorStyles);
      awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], 'local');
      binding.destroy();
      doc.destroy();
    } catch (e) {
      console.warn('[Yjs] Cleanup notice:', e);
    }
  };

  const getText = () => {
    return ytext.toString();
  };

  const flush = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      socket.emit('yjs:flush', { workspaceId, fileName }, (res: any) => {
        if (res && res.error) {
          reject(new Error(res.error));
        } else {
          resolve(res?.content ?? ytext.toString());
        }
      });
    });
  };

  return {
    doc,
    ytext,
    awareness,
    binding,
    destroy,
    getText,
    flush,
  };
}
