import { useState } from 'react';
import {
  Calendar,
  Clock3,
  Video,
  Plus,
  Radio,
  CheckCircle2,
  BookOpen,
  FileCode2,
  Trash2,
  Eye,
  X,
  Play,
  Square,
} from 'lucide-react';

interface SessionItem {
  id: string;
  classroom_id?: string;
  classroomId?: string;
  title: string;
  description: string;
  scheduled_date?: string;
  scheduledDate?: string;
  start_time?: string;
  startTime?: string;
  end_time?: string;
  endTime?: string;
  agenda?: string[];
  status: 'draft' | 'scheduled' | 'live' | 'completed' | 'cancelled';
  is_live?: boolean;
  isLive?: boolean;
  instructor_name?: string;
  instructorName?: string;
  attached_resource_ids?: string[];
  attachedResourceIds?: string[];
  attached_assignment_ids?: string[];
  attachedAssignmentIds?: string[];
}

export function SessionsView({
  sessions = [],
  role,
  onStartLiveClass,
  onEndLiveClass,
  onJoinLiveClass,
  onPublishSession,
  onDeleteSession,
  onOpenCreateModal,
  resources = [],
  assignments = [],
}: {
  sessions: SessionItem[];
  role: 'Teacher' | 'Student';
  onStartLiveClass: (session: SessionItem) => void;
  onEndLiveClass: (sessionId: string) => void;
  onJoinLiveClass: (session: SessionItem) => void;
  onPublishSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenCreateModal: () => void;
  resources?: any[];
  assignments?: any[];
}) {
  const [filter, setFilter] = useState<'all' | 'live' | 'scheduled' | 'completed' | 'draft'>('all');
  const [selectedDetailsSession, setSelectedDetailsSession] = useState<SessionItem | null>(null);

  const filteredSessions = sessions.filter((s) => {
    if (filter === 'all') return role === 'Teacher' ? true : s.status !== 'draft';
    if (filter === 'draft') return s.status === 'draft';
    if (filter === 'live') return s.status === 'live' || s.is_live || s.isLive;
    if (filter === 'scheduled') return s.status === 'scheduled';
    if (filter === 'completed') return s.status === 'completed';
    return true;
  });

  const getStatusBadge = (s: SessionItem) => {
    const isLive = s.status === 'live' || s.is_live || s.isLive;
    if (isLive) {
      return (
        <span className="learning-badge badge-live">
          <span className="pulse-dot" /> LIVE NOW
        </span>
      );
    }
    switch (s.status) {
      case 'draft':
        return <span className="learning-badge badge-draft">🟡 Draft</span>;
      case 'scheduled':
        return <span className="learning-badge badge-scheduled">🔵 Scheduled</span>;
      case 'completed':
        return <span className="learning-badge badge-completed">🟢 Completed</span>;
      case 'cancelled':
        return <span className="learning-badge badge-cancelled">⚪ Cancelled</span>;
      default:
        return <span className="learning-badge badge-scheduled">🔵 Scheduled</span>;
    }
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="generic-head">
        <div>
          <div className="date-label">CLASS SCHEDULE & LIVE TEACHING</div>
          <h1>
            Sessions & Classes<span className="heading-period">.</span>
          </h1>
          <p>
            Interactive online lectures, code walkthroughs, and practical demonstrations.
          </p>
        </div>

        {role === 'Teacher' && (
          <button className="primary-btn" onClick={onOpenCreateModal}>
            <Plus size={16} /> Schedule Session
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Sessions ({sessions.length})
        </button>
        <button
          className={`filter-pill ${filter === 'live' ? 'active' : ''}`}
          onClick={() => setFilter('live')}
        >
          🔴 Live
        </button>
        <button
          className={`filter-pill ${filter === 'scheduled' ? 'active' : ''}`}
          onClick={() => setFilter('scheduled')}
        >
          🔵 Scheduled
        </button>
        <button
          className={`filter-pill ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
        >
          🟢 Completed
        </button>
        {role === 'Teacher' && (
          <button
            className={`filter-pill ${filter === 'draft' ? 'active' : ''}`}
            onClick={() => setFilter('draft')}
          >
            🟡 Drafts
          </button>
        )}
      </div>

      {/* Sessions Grid */}
      {filteredSessions.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            border: '1px dashed #cbd5e1',
            borderRadius: '14px',
            padding: '48px 24px',
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#e0e7ff',
              color: '#4f46e5',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Video size={28} />
          </div>
          <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '18px' }}>
            No sessions found
          </h3>
          <p style={{ margin: '0 auto 18px', maxWidth: '380px', fontSize: '14px' }}>
            {role === 'Teacher'
              ? 'Schedule your first live session to share video, screen, and code with your students.'
              : 'Your instructor has not scheduled any sessions for this view yet.'}
          </p>
          {role === 'Teacher' && (
            <button className="primary-btn" onClick={onOpenCreateModal}>
              <Plus size={16} /> Schedule Session
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {filteredSessions.map((s) => {
            const isLive = s.status === 'live' || s.is_live || s.isLive;
            const resIds = s.attached_resource_ids || s.attachedResourceIds || [];
            const asgIds = s.attached_assignment_ids || s.attachedAssignmentIds || [];
            const attachedRes = resources.filter((r) => resIds.includes(r.id));
            const attachedAsg = assignments.filter((a) => asgIds.includes(a.id));

            return (
              <div
                key={s.id}
                className="learning-card"
                style={{
                  borderLeft: isLive ? '4px solid #ef4444' : s.status === 'scheduled' ? '4px solid #3b82f6' : '1px solid #e2e8f0',
                }}
              >
                <div className="learning-card-head">
                  <div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                      INSTRUCTOR: {s.instructor_name || s.instructorName || 'Jithin Sir'}
                    </span>
                    <h3 style={{ margin: '4px 0', fontSize: '18px', color: '#1e293b' }}>
                      {s.title}
                    </h3>
                  </div>
                  {getStatusBadge(s)}
                </div>

                <div className="learning-card-body">
                  <div
                    style={{
                      display: 'flex',
                      gap: '16px',
                      fontSize: '13px',
                      color: '#475569',
                      marginBottom: '10px',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Calendar size={14} color="#6366f1" />
                      {s.scheduled_date || s.scheduledDate || 'Today'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Clock3 size={14} color="#6366f1" />
                      {s.start_time || s.startTime || '10:30 AM'} – {s.end_time || s.endTime || '12:00 PM'}
                    </span>
                  </div>

                  <p style={{ margin: '0 0 12px', fontSize: '13.5px', color: '#64748b', lineHeight: 1.5 }}>
                    {s.description || 'Interactive programming class and demonstration.'}
                  </p>

                  {/* Agenda summary */}
                  {s.agenda && s.agenda.length > 0 && (
                    <div className="agenda-checklist">
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        AGENDA
                      </span>
                      {s.agenda.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="agenda-item" style={{ padding: '4px 8px', fontSize: '12.5px' }}>
                          <CheckCircle2 size={13} color="#10b981" />
                          <span>{item}</span>
                        </div>
                      ))}
                      {s.agenda.length > 3 && (
                        <span style={{ fontSize: '11.5px', color: '#6366f1', cursor: 'pointer' }} onClick={() => setSelectedDetailsSession(s)}>
                          +{s.agenda.length - 3} more topics...
                        </span>
                      )}
                    </div>
                  )}

                  {/* Attached resources badges */}
                  {(attachedRes.length > 0 || attachedAsg.length > 0) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                      {attachedRes.map((r) => (
                        <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', background: '#eef2ff', color: '#4338ca', padding: '2px 8px', borderRadius: '12px' }}>
                          <BookOpen size={12} /> {r.title}
                        </span>
                      ))}
                      {attachedAsg.map((a) => (
                        <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: '12px' }}>
                          <FileCode2 size={12} /> {a.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="learning-card-footer">
                  <button
                    className="secondary-btn"
                    style={{ fontSize: '13px', height: '36px', padding: '0 12px' }}
                    onClick={() => setSelectedDetailsSession(s)}
                  >
                    <Eye size={14} /> View Details
                  </button>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {role === 'Teacher' ? (
                      <>
                        {s.status === 'draft' && (
                          <button
                            className="primary-btn"
                            style={{ fontSize: '13px', height: '36px', padding: '0 12px' }}
                            onClick={() => onPublishSession(s.id)}
                          >
                            Publish
                          </button>
                        )}
                        {isLive ? (
                          <button
                            className="primary-btn"
                            style={{ background: '#dc2626', borderColor: '#ef4444', fontSize: '13px', height: '36px', padding: '0 12px' }}
                            onClick={() => onEndLiveClass(s.id)}
                          >
                            <Square size={14} /> End Class
                          </button>
                        ) : s.status === 'scheduled' ? (
                          <button
                            className="primary-btn"
                            style={{ fontSize: '13px', height: '36px', padding: '0 12px' }}
                            onClick={() => onStartLiveClass(s)}
                          >
                            <Play size={14} /> Start Live Class
                          </button>
                        ) : null}
                        <button
                          className="icon-btn"
                          style={{ color: '#ef4444' }}
                          onClick={() => onDeleteSession(s.id)}
                          title="Delete Session"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        {isLive ? (
                          <button
                            className="primary-btn"
                            style={{ background: '#dc2626', borderColor: '#ef4444', fontSize: '13px', height: '36px' }}
                            onClick={() => onJoinLiveClass(s)}
                          >
                            <Radio size={14} /> Join Live Class
                          </button>
                        ) : s.status === 'scheduled' ? (
                          <button
                            className="secondary-btn"
                            style={{ fontSize: '13px', height: '36px' }}
                            onClick={() => onJoinLiveClass(s)}
                          >
                            Enter Room
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Session Details Modal */}
      {selectedDetailsSession && (
        <div className="modal-backdrop" onClick={() => setSelectedDetailsSession(null)}>
          <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                  SESSION DETAILS
                </span>
                <h2 style={{ margin: '2px 0 0', fontSize: '20px' }}>{selectedDetailsSession.title}</h2>
              </div>
              <button className="icon-btn" onClick={() => setSelectedDetailsSession(null)}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '14px', color: '#334155' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>Instructor</span>
                  <div style={{ fontWeight: 700 }}>{selectedDetailsSession.instructor_name || selectedDetailsSession.instructorName || 'Jithin Sir'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>Date</span>
                  <div style={{ fontWeight: 700 }}>{selectedDetailsSession.scheduled_date || selectedDetailsSession.scheduledDate || 'Today'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>Time</span>
                  <div style={{ fontWeight: 700 }}>{selectedDetailsSession.start_time || selectedDetailsSession.startTime || '10:30 AM'}</div>
                </div>
              </div>

              <div>
                <b style={{ color: '#1e293b' }}>Description</b>
                <p style={{ margin: '4px 0 0', color: '#64748b', lineHeight: 1.6 }}>
                  {selectedDetailsSession.description || 'No description provided.'}
                </p>
              </div>

              {selectedDetailsSession.agenda && selectedDetailsSession.agenda.length > 0 && (
                <div>
                  <b style={{ color: '#1e293b' }}>Session Agenda</b>
                  <div className="agenda-checklist" style={{ marginTop: '8px' }}>
                    {selectedDetailsSession.agenda.map((item, idx) => (
                      <div key={idx} className="agenda-item">
                        <CheckCircle2 size={16} color="#10b981" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button
                  className="primary-btn full-btn"
                  onClick={() => {
                    setSelectedDetailsSession(null);
                    if (role === 'Teacher') {
                      onStartLiveClass(selectedDetailsSession);
                    } else {
                      onJoinLiveClass(selectedDetailsSession);
                    }
                  }}
                >
                  <Video size={16} /> {role === 'Teacher' ? 'Start Live Classroom' : 'Join Live Classroom'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
