import React, { useState, useEffect } from 'react';
import {
  X,
  User as UserIcon,
  Mail,
  Shield,
  BookOpen,
  Code2,
  CheckCircle2,
  GraduationCap,
  Users,
  Radio,
  FileCode2,
  Save,
  Bell,
  Sparkles,
} from 'lucide-react';
import { fetchUserProfileStats, updateUserProfile } from '../../services/api.js';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: 'Teacher' | 'Student';
  };
  onProfileUpdated?: (newName: string) => void;
}

export const MyProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchUserProfileStats()
        .then((res) => {
          setStats(res.stats);
          setLoading(false);
        })
        .catch((err) => {
          console.warn('[Profile Stats Error]:', err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isTeacher = currentUser.role === 'Teacher';
  const initials = currentUser.name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content profile-modal animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '580px' }}
      >
        {/* Header Hero Banner */}
        <div className="profile-hero-banner">
          <button className="profile-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
          <div className="profile-hero-avatar-wrap">
            <div className={`profile-hero-avatar ${isTeacher ? 'teacher' : 'student'}`}>
              {initials}
              <span className="profile-hero-status-dot" />
            </div>
          </div>
        </div>

        {/* User Identity Info */}
        <div className="profile-body">
          <div className="profile-identity-header">
            <h2 className="profile-name-title">{currentUser.name}</h2>
            <div className="profile-badge-row">
              <span className={`profile-role-pill ${isTeacher ? 'teacher' : 'student'}`}>
                <Shield size={13} style={{ marginRight: '4px' }} />
                {currentUser.role}
              </span>
              <span className="profile-status-pill">
                <span className="profile-online-glow" /> Active Now
              </span>
            </div>
            <p className="profile-email-text">
              <Mail size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              {currentUser.email || (isTeacher ? 'alex.morgan@devchamber.edu' : 'jordan.lee@devchamber.edu')}
            </p>
          </div>

          <div className="profile-section-divider" />

          {/* Stats Grid */}
          <div className="profile-stats-section">
            <h4 className="profile-section-title">
              {isTeacher ? 'INSTRUCTOR IMPACT' : 'LEARNING PROGRESS & STATS'}
            </h4>

            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                Loading profile statistics...
              </div>
            ) : (
              <div className="profile-stats-grid">
                {isTeacher ? (
                  <>
                    <div className="profile-stat-box">
                      <div className="stat-box-icon blue">
                        <BookOpen size={18} />
                      </div>
                      <div className="stat-box-num">{stats?.classrooms_count ?? 1}</div>
                      <div className="stat-box-label">Classrooms Managed</div>
                    </div>
                    <div className="profile-stat-box">
                      <div className="stat-box-icon green">
                        <Users size={18} />
                      </div>
                      <div className="stat-box-num">{stats?.students_count ?? 2}</div>
                      <div className="stat-box-label">Enrolled Students</div>
                    </div>
                    <div className="profile-stat-box">
                      <div className="stat-box-icon purple">
                        <FileCode2 size={18} />
                      </div>
                      <div className="stat-box-num">{stats?.assignments_created ?? 0}</div>
                      <div className="stat-box-label">Assignments Created</div>
                    </div>
                    <div className="profile-stat-box">
                      <div className="stat-box-icon amber">
                        <GraduationCap size={18} />
                      </div>
                      <div className="stat-box-num">{stats?.assessments_created ?? 0}</div>
                      <div className="stat-box-label">Assessments Built</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="profile-stat-box">
                      <div className="stat-box-icon blue">
                        <BookOpen size={18} />
                      </div>
                      <div className="stat-box-num">{stats?.classrooms_count ?? 1}</div>
                      <div className="stat-box-label">Classrooms Enrolled</div>
                    </div>
                    <div className="profile-stat-box">
                      <div className="stat-box-icon purple">
                        <Code2 size={18} />
                      </div>
                      <div className="stat-box-num">{stats?.workspaces_count ?? 1}</div>
                      <div className="stat-box-label">Coding Projects</div>
                    </div>
                    <div className="profile-stat-box">
                      <div className="stat-box-icon green">
                        <CheckCircle2 size={18} />
                      </div>
                      <div className="stat-box-num">{stats?.assignments_completed ?? 0}</div>
                      <div className="stat-box-label">Assignments Done</div>
                    </div>
                    <div className="profile-stat-box">
                      <div className="stat-box-icon amber">
                        <GraduationCap size={18} />
                      </div>
                      <div className="stat-box-num">{stats?.assessments_completed ?? 0}</div>
                      <div className="stat-box-label">Assessments Taken</div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="profile-section-divider" />

          {/* Account Details Box */}
          <div className="profile-details-list">
            <div className="profile-detail-row">
              <span className="profile-detail-label">Account Role</span>
              <span className="profile-detail-value" style={{ textTransform: 'capitalize' }}>
                {currentUser.role} (Verified Institution Account)
              </span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">User ID</span>
              <span className="profile-detail-value code-font">{currentUser.id}</span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">Database Sync</span>
              <span className="profile-detail-value">
                <span className="profile-online-dot" /> MongoDB Atlas / Local Connected
              </span>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid #f1f5f9', padding: '14px 20px' }}>
          <button className="btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
};

export const AccountSettingsModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
}) => {
  const [fullName, setFullName] = useState(currentUser.name);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFullName(currentUser.name);
      setSuccessMsg('');
    }
  }, [isOpen, currentUser.name]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    setSaving(true);
    try {
      await updateUserProfile(fullName.trim());
      onProfileUpdated?.(fullName.trim());
      setSuccessMsg('Account settings updated successfully!');
      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 1200);
    } catch (err: any) {
      alert(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="icon-badge-round blue">
              <UserIcon size={18} />
            </div>
            <div>
              <h3>Account Settings</h3>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                Manage your profile identity and preferences
              </p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {successMsg && (
              <div className="alert-banner-success">
                <CheckCircle2 size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="form-group">
              <label>Full Display Name</label>
              <input
                type="text"
                className="input-field"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                className="input-field"
                value={currentUser.email || (currentUser.role === 'Teacher' ? 'alex.morgan@devchamber.edu' : 'jordan.lee@devchamber.edu')}
                disabled
                style={{ background: '#f8fafc', color: '#64748b', cursor: 'not-allowed' }}
              />
              <small style={{ color: '#94a3b8', fontSize: '11.5px', marginTop: '4px', display: 'block' }}>
                Managed by institution authentication.
              </small>
            </div>

            <div className="form-group">
              <label>Role & Permissions</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <Shield size={16} color="#4f46e5" />
                <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#1e293b' }}>
                  {currentUser.role}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: '11.5px',
                    color: '#64748b',
                    background: '#e2e8f0',
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}
                >
                  Verified Identity
                </span>
              </div>
              <small style={{ color: '#94a3b8', fontSize: '11.5px', marginTop: '4px', display: 'block' }}>
                Roles are strictly enforced on backend APIs.
              </small>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={15} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const NotificationsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const notifications = [
    {
      id: '1',
      title: 'Real-Time Sync Active',
      desc: 'Collaborative workspaces and Yjs CRDT room connected.',
      time: 'Just now',
      unread: true,
      icon: Sparkles,
      color: '#4f46e5',
    },
    {
      id: '2',
      title: 'Upcoming Live Session',
      desc: 'STM32 GPIO Programming & Register Control is scheduled today.',
      time: '15m ago',
      unread: true,
      icon: Radio,
      color: '#ef4444',
    },
    {
      id: '3',
      title: 'Classroom Content Updated',
      desc: 'New lecture resources and assignment templates published.',
      time: '2h ago',
      unread: false,
      icon: BookOpen,
      color: '#10b981',
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="icon-badge-round purple">
              <Bell size={18} />
            </div>
            <div>
              <h3>Notifications</h3>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                Recent updates and classroom activity
              </p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '10px',
                  background: n.unread ? '#f8faff' : '#f8fafc',
                  border: n.unread ? '1px solid #e0e7ff' : '1px solid #f1f5f9',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: `${n.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: n.color,
                    flexShrink: 0,
                  }}
                >
                  <n.icon size={16} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <b style={{ fontSize: '13.5px', color: '#1e293b' }}>{n.title}</b>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{n.time}</span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>{n.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
