import React, { useState, useEffect, useRef } from 'react';
import { Send, CornerUpLeft, X, MessageSquare, Users } from 'lucide-react';
import { getSocket } from '../../services/socket.js';

export interface ChatMessageItem {
  id: string;
  classroom_id?: string;
  workspace_id?: string;
  workspaceId?: string;
  user_id: string;
  sender_id?: string;
  senderId?: string;
  name: string;
  sender_name?: string;
  senderName?: string;
  role: string;
  sender_role?: string;
  senderRole?: string;
  text?: string;
  content?: string;
  reply_to?: {
    id: string;
    name: string;
    text: string;
  };
  created_at?: string;
  createdAt?: string;
}

interface ChatPanelProps {
  context: 'classroom' | 'workspace';
  contextId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: 'Teacher' | 'Student';
  onlineCount?: number;
  initialMessages?: ChatMessageItem[];
  onSendMessage?: (text: string, replyTo?: any) => Promise<void>;
  placeholder?: string;
  height?: string;
  canSend?: boolean;
}

// User avatar color helper
function getSenderColor(idStr: string) {
  const colors = ['#4f46e5', '#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2'];
  let hash = 0;
  for (let i = 0; i < (idStr || '').length; i++) {
    hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  context,
  contextId,
  currentUserId,
  currentUserName,
  currentUserRole: _currentUserRole,
  onlineCount: initialOnlineCount = 1,
  initialMessages = [],
  onSendMessage,
  placeholder,
  height = '100%',
  canSend = true,
}) => {
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<{ id: string; name: string; text: string } | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; timeout: any }>>({});
  const [liveOnlineCount, setLiveOnlineCount] = useState<number>(initialOnlineCount);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<any>(null);

  // Sync initial online count
  useEffect(() => {
    setLiveOnlineCount(initialOnlineCount);
  }, [initialOnlineCount]);

  // Sync initial messages if changed
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Scroll to bottom on new message or typing update
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUsers]);

  // Socket event listeners for real-time messages, typing & presence
  useEffect(() => {
    if (!contextId) return;
    const socket = getSocket();

    // Auto join workspace room for chat & presence if in workspace context
    if (context === 'workspace') {
      socket.emit('workspace:chat:join', { workspaceId: contextId });
    }

    const handleNewMessage = (msg: any) => {
      if (context === 'classroom' && (msg.classroomId === contextId || msg.classroom_id === contextId)) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      } else if (
        context === 'workspace' &&
        (msg.workspaceId === contextId || msg.workspace_id === contextId)
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };

    const handleHistory = (data: any) => {
      if (data.workspaceId === contextId && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    };

    const handleWorkspacePresence = (users: any[]) => {
      if (Array.isArray(users)) {
        setLiveOnlineCount(users.length || 1);
      }
    };

    const handleTyping = (data: any) => {
      if (data.userId === currentUserId) return;
      if (
        (context === 'classroom' && data.classroomId === contextId) ||
        (context === 'workspace' && data.workspaceId === contextId)
      ) {
        setTypingUsers((prev) => {
          if (prev[data.userId]?.timeout) {
            clearTimeout(prev[data.userId].timeout);
          }
          const timeout = setTimeout(() => {
            setTypingUsers((curr) => {
              const next = { ...curr };
              delete next[data.userId];
              return next;
            });
          }, 3000);

          return {
            ...prev,
            [data.userId]: { name: data.name || 'Someone', timeout },
          };
        });
      }
    };

    const handleTypingStop = (data: any) => {
      if (
        (context === 'classroom' && data.classroomId === contextId) ||
        (context === 'workspace' && data.workspaceId === contextId)
      ) {
        setTypingUsers((prev) => {
          const next = { ...prev };
          if (next[data.userId]?.timeout) {
            clearTimeout(next[data.userId].timeout);
          }
          delete next[data.userId];
          return next;
        });
      }
    };

    const eventName = context === 'classroom' ? 'chat:message' : 'workspace:chat:message';
    const typingEvent = context === 'classroom' ? 'chat:typing' : 'workspace:chat:typing';
    const typingStopEvent = context === 'classroom' ? 'chat:typing:stop' : 'workspace:chat:typing:stop';

    socket.on(eventName, handleNewMessage);
    socket.on(`${eventName}:new`, handleNewMessage);
    socket.on(typingEvent, handleTyping);
    socket.on(typingStopEvent, handleTypingStop);

    if (context === 'workspace') {
      socket.on('workspace:chat:history', handleHistory);
      socket.on('workspace:presence', handleWorkspacePresence);
    }

    return () => {
      socket.off(eventName, handleNewMessage);
      socket.off(`${eventName}:new`, handleNewMessage);
      socket.off(typingEvent, handleTyping);
      socket.off(typingStopEvent, handleTypingStop);
      if (context === 'workspace') {
        socket.off('workspace:chat:history', handleHistory);
        socket.off('workspace:presence', handleWorkspacePresence);
      }
    };
  }, [context, contextId, currentUserId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    const socket = getSocket();

    const typingEvent = context === 'classroom' ? 'chat:typing' : 'workspace:chat:typing';
    const typingStopEvent = context === 'classroom' ? 'chat:typing:stop' : 'workspace:chat:typing:stop';
    const payload = context === 'classroom' ? { classroomId: contextId } : { workspaceId: contextId };

    socket.emit(typingEvent, payload);

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket.emit(typingStopEvent, payload);
    }, 1500);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;

    const socket = getSocket();
    const typingStopEvent = context === 'classroom' ? 'chat:typing:stop' : 'workspace:chat:typing:stop';
    const payload = context === 'classroom' ? { classroomId: contextId } : { workspaceId: contextId };
    socket.emit(typingStopEvent, payload);

    const replyData = replyTarget
      ? { id: replyTarget.id, name: replyTarget.name, text: replyTarget.text }
      : undefined;

    setDraft('');
    setReplyTarget(null);

    if (onSendMessage) {
      await onSendMessage(text, replyData);
    } else {
      const eventName = context === 'classroom' ? 'chat:message' : 'workspace:chat:message';
      const sendPayload =
        context === 'classroom'
          ? {
              classroomId: contextId,
              text,
              name: currentUserName,
              replyTo: replyData,
            }
          : {
              workspaceId: contextId,
              text,
              name: currentUserName,
              replyTo: replyData,
            };
      socket.emit(eventName, sendPayload);
    }
  };

  // Format typing indicator text for single or multiple users
  const typingNames = Object.values(typingUsers).map((u) => u.name);
  let typingLabel = '';
  if (typingNames.length === 1) {
    typingLabel = `${typingNames[0]} is typing...`;
  } else if (typingNames.length === 2) {
    typingLabel = `${typingNames[0]} and ${typingNames[1]} are typing...`;
  } else if (typingNames.length > 2) {
    typingLabel = `${typingNames[0]}, ${typingNames[1]} and ${typingNames.length - 2} other are typing...`;
  }

  // Format presence badge text
  let presenceText = '';
  if (context === 'workspace') {
    if (liveOnlineCount > 1) {
      presenceText = `${liveOnlineCount} collaborators online`;
    } else if (liveOnlineCount === 1) {
      presenceText = `You're the only one online`;
    } else {
      presenceText = `Offline`;
    }
  } else {
    presenceText = `${liveOnlineCount} ${liveOnlineCount === 1 ? 'online' : 'online'}`;
  }

  const defaultPlaceholder =
    context === 'workspace'
      ? 'Message collaborators in this workspace...'
      : 'Ask a question or discuss with class...';

  return (
    <div
      className="unified-chat-panel group-chat-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height,
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}
    >
      {/* Group Chat Header */}
      <div
        className="chat-header-bar group-chat-header"
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fafbff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {context === 'workspace' ? (
            <Users size={17} color="#4f46e5" />
          ) : (
            <MessageSquare size={17} color="#4f46e5" />
          )}
          <b style={{ fontSize: '13.5px', color: '#1e293b' }}>
            {context === 'classroom' ? 'Class Chat' : 'Workspace Chat'}
          </b>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11.5px',
            fontWeight: 600,
            color: liveOnlineCount > 1 ? '#059669' : '#64748b',
            background: liveOnlineCount > 1 ? '#ecfdf5' : '#f1f5f9',
            padding: '3px 9px',
            borderRadius: '12px',
          }}
        >
          {liveOnlineCount > 1 && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10b981',
                display: 'inline-block',
              }}
            />
          )}
          {presenceText}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        className="chat-messages-container"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              padding: '24px',
              color: '#94a3b8',
              maxWidth: '280px',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#f1f5f9',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 10px',
                color: '#64748b',
              }}
            >
              {context === 'workspace' ? <Users size={22} /> : <MessageSquare size={22} />}
            </div>
            <b style={{ display: 'block', fontSize: '13.5px', color: '#475569', marginBottom: '4px' }}>
              {context === 'workspace' ? 'No workspace messages yet' : 'No messages yet'}
            </b>
            <span style={{ fontSize: '12px', lineHeight: 1.4, display: 'block' }}>
              {context === 'classroom'
                ? 'Start the live discussion with your teacher and classmates.'
                : 'Start collaborating with everyone in this workspace.'}
            </span>
          </div>
        ) : (
          messages.map((m, idx) => {
            const senderId = m.user_id || m.sender_id || m.senderId;
            const isSelf = senderId === currentUserId;
            const senderRoleRaw = (m.role || m.sender_role || m.senderRole || 'student').toLowerCase();
            const isOwner = senderRoleRaw === 'owner';
            const isTeacher = senderRoleRaw === 'teacher' || senderRoleRaw === 'instructor';
            const isEditor = senderRoleRaw === 'editor';
            const isViewer = senderRoleRaw === 'viewer';

            const displayRole = isOwner
              ? 'Owner'
              : isTeacher
              ? 'Teacher'
              : isEditor
              ? 'Editor'
              : isViewer
              ? 'Viewer'
              : 'Student';

            const senderName = m.name || m.sender_name || m.senderName || (isTeacher ? 'Instructor' : 'Student');
            const messageText = m.text || m.content || '';
            const timestamp = m.created_at || m.createdAt || Date.now();
            const reply = m.reply_to;
            const avatarColor = getSenderColor(senderId || senderName);

            return (
              <div
                key={m.id || idx}
                className={`chat-msg-row ${isSelf ? 'self' : 'other'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isSelf ? 'flex-end' : 'flex-start',
                  position: 'relative',
                  width: '100%',
                }}
              >
                {/* Sender Identity Header (Visible for all participants) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11.5px',
                    marginBottom: '4px',
                    padding: isSelf ? '0 4px 0 0' : '0 0 0 4px',
                    flexDirection: isSelf ? 'row-reverse' : 'row',
                  }}
                >
                  {/* Sender Avatar */}
                  <span
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: isSelf ? '#4f46e5' : avatarColor,
                      color: '#ffffff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9.5px',
                      fontWeight: 700,
                    }}
                  >
                    {isSelf ? 'Y' : senderName.slice(0, 1).toUpperCase()}
                  </span>

                  <b style={{ color: isSelf ? '#4338ca' : '#1e293b' }}>
                    {isSelf ? 'You' : senderName}
                  </b>

                  {/* Role Badge */}
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '6px',
                      textTransform: 'uppercase',
                      background: isOwner
                        ? '#fef3c7'
                        : isTeacher
                        ? '#e0e7ff'
                        : isEditor
                        ? '#e0f2fe'
                        : isViewer
                        ? '#f1f5f9'
                        : '#f1f5f9',
                      color: isOwner
                        ? '#b45309'
                        : isTeacher
                        ? '#4338ca'
                        : isEditor
                        ? '#0369a1'
                        : isViewer
                        ? '#64748b'
                        : '#64748b',
                    }}
                  >
                    {displayRole}
                  </span>
                </div>

                {/* Reply Quote Block */}
                {reply && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: isSelf ? '#c7d2fe' : '#64748b',
                      background: isSelf ? '#3730a3' : '#f1f5f9',
                      borderLeft: `3px solid ${isSelf ? '#818cf8' : '#4f46e5'}`,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      marginBottom: '4px',
                      maxWidth: '85%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <CornerUpLeft size={10} style={{ display: 'inline', marginRight: '4px' }} />
                    <b>{reply.name}:</b> {reply.text}
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    maxWidth: '85%',
                    padding: '8px 14px',
                    borderRadius: isSelf ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    background: isSelf
                      ? 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)'
                      : isOwner
                      ? '#fffbeb'
                      : isTeacher
                      ? '#f5f3ff'
                      : isEditor
                      ? '#f0f9ff'
                      : '#f8fafc',
                    color: isSelf ? '#ffffff' : '#1e293b',
                    border: isSelf
                      ? 'none'
                      : isOwner
                      ? '1px solid #fde68a'
                      : isTeacher
                      ? '1px solid #ddd6fe'
                      : isEditor
                      ? '1px solid #bae6fd'
                      : '1px solid #e2e8f0',
                    boxShadow: isSelf
                      ? '0 2px 8px rgba(79, 70, 229, 0.2)'
                      : '0 1px 2px rgba(0,0,0,0.03)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      fontSize: '13.5px',
                      lineHeight: '1.45',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {messageText}
                  </span>

                  {/* Bubble Footer: Timestamp & Reply Trigger */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '8px',
                      marginTop: '4px',
                      fontSize: '10.5px',
                      color: isSelf ? '#c7d2fe' : '#94a3b8',
                    }}
                  >
                    <span>
                      {new Date(timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {!isSelf && (
                      <button
                        onClick={() =>
                          setReplyTarget({
                            id: m.id,
                            name: senderName,
                            text: messageText.slice(0, 50),
                          })
                        }
                        title="Reply to message"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: '#6366f1',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '10.5px',
                          fontWeight: 600,
                        }}
                      >
                        <CornerUpLeft size={11} /> Reply
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Group Real-Time Typing Indicator */}
      {typingNames.length > 0 && (
        <div
          style={{
            padding: '4px 16px',
            fontSize: '11.5px',
            color: '#6366f1',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#fafbff',
          }}
        >
          <span className="typing-dots">
            <span />
            <span />
            <span />
          </span>
          <span>{typingLabel}</span>
        </div>
      )}

      {/* Reply Banner */}
      {replyTarget && (
        <div
          style={{
            padding: '6px 14px',
            background: '#eef2ff',
            borderTop: '1px solid #c7d2fe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#3730a3',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
            <CornerUpLeft size={13} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Replying to <b>{replyTarget.name}</b>: "{replyTarget.text}"
            </span>
          </div>
          <button
            onClick={() => setReplyTarget(null)}
            style={{ color: '#6366f1', padding: '2px', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Chat Input Form */}
      <form
        onSubmit={handleSend}
        style={{
          padding: '10px 14px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          gap: '8px',
          background: '#ffffff',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={handleInputChange}
          placeholder={canSend ? (placeholder || defaultPlaceholder) : 'Read-only mode in this workspace'}
          disabled={!canSend}
          style={{
            flex: 1,
            height: '38px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '0 12px',
            fontSize: '13px',
            outline: 'none',
            background: canSend ? '#ffffff' : '#f8fafc',
            color: '#1e293b',
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || !canSend}
          style={{
            height: '38px',
            padding: '0 14px',
            background: draft.trim() && canSend ? '#4f46e5' : '#e2e8f0',
            color: draft.trim() && canSend ? '#ffffff' : '#94a3b8',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: draft.trim() && canSend ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease',
          }}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
};
