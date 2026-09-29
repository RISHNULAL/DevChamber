import { useState } from 'react';
import {
  FileCode2,
  Plus,
  Clock3,
  CheckCircle2,
  Code2,
  BookOpen,
  Send,
  Trash2,
  ArrowRight,
  Award,
  AlertCircle,
  X,
} from 'lucide-react';

interface AssignmentItem {
  id: string;
  classroom_id?: string;
  classroomId?: string;
  title: string;
  description: string;
  instructions?: string;
  due_at?: string;
  dueAt?: string;
  max_marks?: number;
  maxMarks?: number;
  starter_code?: string;
  starterCode?: string;
  starter_files?: any[];
  starterFiles?: any[];
  attached_resource_ids?: string[];
  attachedResourceIds?: string[];
  status: 'draft' | 'published' | 'closed';
  is_published?: boolean;
  isPublished?: boolean;
  submissions_count?: number;
  submissionsCount?: number;
  my_submission?: {
    status: 'not_started' | 'in_progress' | 'submitted' | 'late' | 'graded' | 'returned';
    marks?: number;
    feedback?: string;
    submitted_at?: string;
  };
  mySubmission?: {
    status: 'not_started' | 'in_progress' | 'submitted' | 'late' | 'graded' | 'returned';
    marks?: number;
    feedback?: string;
    submittedAt?: string;
  };
}

export function AssignmentsView({
  assignments = [],
  role,
  onOpenCreateModal,
  onOpenInWorkspace,
  onSubmitAssignment,
  onReviewSubmissions,
  onToggleStatus,
  onDeleteAssignment,
  resources = [],
}: {
  assignments: AssignmentItem[];
  role: 'Teacher' | 'Student';
  onOpenCreateModal: () => void;
  onOpenInWorkspace: (assignment: AssignmentItem) => void;
  onSubmitAssignment: (assignmentId: string) => Promise<void>;
  onReviewSubmissions: (assignment: AssignmentItem) => void;
  onToggleStatus: (assignmentId: string, status: 'draft' | 'published' | 'closed') => void;
  onDeleteAssignment: (assignmentId: string) => void;
  resources?: any[];
}) {
  const [filter, setFilter] = useState<string>('all');
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState<string | null>(null);
  const [confirmSubmitAsg, setConfirmSubmitAsg] = useState<AssignmentItem | null>(null);

  const filteredAssignments = assignments.filter((a) => {
    if (role === 'Student' && a.status === 'draft') return false;
    if (filter === 'all') return true;
    if (filter === 'draft') return a.status === 'draft';
    const sub = a.my_submission || a.mySubmission;
    if (filter === 'pending') return !sub || sub.status === 'not_started' || sub.status === 'in_progress';
    if (filter === 'submitted') return sub?.status === 'submitted' || sub?.status === 'late';
    if (filter === 'graded') return sub?.status === 'graded';
    return true;
  });

  const getStudentStatusBadge = (asg: AssignmentItem) => {
    const sub = asg.my_submission || asg.mySubmission;
    const status = sub?.status || 'not_started';

    switch (status) {
      case 'submitted':
        return <span className="learning-badge badge-submitted">✓ Submitted</span>;
      case 'graded':
        return (
          <span className="learning-badge badge-graded">
            ★ Graded: {sub?.marks}/{asg.max_marks || asg.maxMarks || 20}
          </span>
        );
      case 'in_progress':
        return <span className="learning-badge badge-in-progress">In Progress</span>;
      case 'late':
        return <span className="learning-badge badge-late">Late Submission</span>;
      case 'returned':
        return <span className="learning-badge badge-scheduled">Returned</span>;
      default:
        return <span className="learning-badge badge-not-started">Not Started</span>;
    }
  };

  const handleConfirmSubmit = async () => {
    if (!confirmSubmitAsg) return;
    setSubmittingAssignmentId(confirmSubmitAsg.id);
    try {
      await onSubmitAssignment(confirmSubmitAsg.id);
      setConfirmSubmitAsg(null);
    } catch (err) {
      console.error('Submit assignment failed:', err);
    } finally {
      setSubmittingAssignmentId(null);
    }
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="generic-head">
        <div>
          <div className="date-label">PRACTICAL CODING LABS & ASSIGNMENTS</div>
          <h1>
            Programming Assignments<span className="heading-period">.</span>
          </h1>
          <p>
            Algorithmic challenges and software projects directly integrated with your personal workspace IDE.
          </p>
        </div>

        {role === 'Teacher' && (
          <button className="primary-btn" onClick={onOpenCreateModal}>
            <Plus size={16} /> Create Assignment
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Assignments ({assignments.length})
        </button>
        {role === 'Student' && (
          <>
            <button
              className={`filter-pill ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              ⏳ Pending
            </button>
            <button
              className={`filter-pill ${filter === 'submitted' ? 'active' : ''}`}
              onClick={() => setFilter('submitted')}
            >
              ✓ Submitted
            </button>
            <button
              className={`filter-pill ${filter === 'graded' ? 'active' : ''}`}
              onClick={() => setFilter('graded')}
            >
              ★ Graded
            </button>
          </>
        )}
        {role === 'Teacher' && (
          <button
            className={`filter-pill ${filter === 'draft' ? 'active' : ''}`}
            onClick={() => setFilter('draft')}
          >
            🟡 Drafts
          </button>
        )}
      </div>

      {/* Assignments Grid */}
      {filteredAssignments.length === 0 ? (
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
            <FileCode2 size={28} />
          </div>
          <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '18px' }}>
            No assignments found
          </h3>
          <p style={{ margin: '0 auto 18px', maxWidth: '380px', fontSize: '14px' }}>
            {role === 'Teacher'
              ? 'Create a practical programming task with starter code and automated evaluation.'
              : 'You have no assignments scheduled in this category right now.'}
          </p>
          {role === 'Teacher' && (
            <button className="primary-btn" onClick={onOpenCreateModal}>
              <Plus size={16} /> Create Assignment
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
          {filteredAssignments.map((a) => {
            const mySub = a.my_submission || a.mySubmission;
            const isGraded = mySub?.status === 'graded';
            const isSubmitted = mySub?.status === 'submitted' || mySub?.status === 'late' || isGraded;
            const resIds = a.attached_resource_ids || a.attachedResourceIds || [];
            const attachedRes = resources.filter((r) => resIds.includes(r.id));
            const isDraft = a.status === 'draft';

            return (
              <div key={a.id} className="learning-card">
                <div className="learning-card-head">
                  <div>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>
                      PRACTICE LAB · {a.max_marks || a.maxMarks || 20} MARKS
                    </span>
                    <h3 style={{ margin: '4px 0', fontSize: '18px', color: '#1e293b' }}>
                      {a.title}
                    </h3>
                  </div>

                  {role === 'Student' ? (
                    getStudentStatusBadge(a)
                  ) : (
                    <span className={`learning-badge ${isDraft ? 'badge-draft' : 'badge-completed'}`}>
                      {isDraft ? 'Draft' : 'Published'}
                    </span>
                  )}
                </div>

                <div className="learning-card-body">
                  <div
                    style={{
                      display: 'flex',
                      gap: '14px',
                      fontSize: '13px',
                      color: '#475569',
                      marginBottom: '10px',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Clock3 size={14} color="#6366f1" />
                      Due: <b>{a.due_at || a.dueAt || 'Tomorrow · 11:59 PM'}</b>
                    </span>
                  </div>

                  <p style={{ margin: '0 0 12px', fontSize: '13.5px', color: '#64748b', lineHeight: 1.5 }}>
                    {a.description || a.instructions || 'Implement the required algorithm and verify with test cases.'}
                  </p>

                  {/* Attached Resources */}
                  {attachedRes.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                      {attachedRes.map((r) => (
                        <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', background: '#eef2ff', color: '#4338ca', padding: '2px 8px', borderRadius: '12px' }}>
                          <BookOpen size={12} /> {r.title}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Graded Feedback Box for Student */}
                  {role === 'Student' && isGraded && (
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px', marginTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#047857' }}>
                        <span style={{ fontWeight: 700, fontSize: '13.5px' }}>
                          Score: {mySub?.marks} / {a.max_marks || a.maxMarks || 20}
                        </span>
                        <Award size={16} />
                      </div>
                      {mySub?.feedback && (
                        <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: '#065f46', lineHeight: 1.4 }}>
                          <b>Instructor Feedback:</b> {mySub.feedback}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Submitted Awaiting Review Alert */}
                  {role === 'Student' && isSubmitted && !isGraded && (
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '8px 12px', marginTop: '10px', fontSize: '12.5px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={15} color="#0284c7" />
                      <span>Submitted! Waiting for instructor review & grading.</span>
                    </div>
                  )}
                </div>

                <div className="learning-card-footer">
                  {role === 'Teacher' ? (
                    <>
                      <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                        <b>{a.submissions_count ?? a.submissionsCount ?? 0}</b> submissions
                      </span>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="primary-btn"
                          style={{ height: '34px', fontSize: '12.5px', padding: '0 12px' }}
                          onClick={() => onReviewSubmissions(a)}
                        >
                          Review Submissions <ArrowRight size={13} />
                        </button>

                        <button
                          className="secondary-btn"
                          style={{ height: '34px', fontSize: '12.5px', padding: '0 10px' }}
                          onClick={() => onToggleStatus(a.id, isDraft ? 'published' : 'draft')}
                        >
                          {isDraft ? 'Publish' : 'Draft'}
                        </button>

                        <button
                          className="icon-btn"
                          style={{ color: '#ef4444' }}
                          onClick={() => onDeleteAssignment(a.id)}
                          title="Delete Assignment"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        className="secondary-btn"
                        style={{ height: '36px', fontSize: '13px' }}
                        onClick={() => onOpenInWorkspace(a)}
                      >
                        <Code2 size={14} /> Open in Workspace
                      </button>

                      {!isSubmitted ? (
                        <button
                          className="primary-btn"
                          style={{ height: '36px', fontSize: '13px' }}
                          onClick={() => setConfirmSubmitAsg(a)}
                          disabled={submittingAssignmentId === a.id}
                        >
                          <Send size={14} /> Submit Assignment
                        </button>
                      ) : (
                        <button
                          className="secondary-btn"
                          style={{ height: '36px', fontSize: '13px' }}
                          onClick={() => setConfirmSubmitAsg(a)}
                        >
                          Resubmit
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Assignment Confirmation Modal */}
      {confirmSubmitAsg && (
        <div className="modal-backdrop" onClick={() => setConfirmSubmitAsg(null)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Submit Assignment?</h2>
              <button className="icon-btn" onClick={() => setConfirmSubmitAsg(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '14px', color: '#334155' }}>
              <p style={{ margin: 0, lineHeight: 1.6 }}>
                You are about to submit your workspace files for:
                <br />
                <b style={{ fontSize: '16px', color: '#1e293b' }}>{confirmSubmitAsg.title}</b>
              </p>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '12px', borderRadius: '8px', fontSize: '13px', color: '#92400e', display: 'flex', gap: '10px' }}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>
                  Your instructor will review your submitted code, test outputs, and give grade feedback.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button
                  className="secondary-btn"
                  style={{ flex: 1 }}
                  onClick={() => setConfirmSubmitAsg(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary-btn"
                  style={{ flex: 1.5 }}
                  onClick={handleConfirmSubmit}
                  disabled={Boolean(submittingAssignmentId)}
                >
                  {submittingAssignmentId ? 'Submitting...' : 'Confirm & Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
