import { useState } from 'react';
import {
  GraduationCap,
  Plus,
  Clock3,
  CheckCircle2,
  ListOrdered,
  BarChart2,
  Trash2,
  Play,
  Square,
} from 'lucide-react';

interface AssessmentItem {
  id: string;
  classroom_id?: string;
  classroomId?: string;
  title: string;
  description?: string;
  type: 'quiz' | 'mcq' | 'coding' | 'timed' | 'practice';
  duration_minutes?: number;
  durationMinutes?: number;
  total_questions?: number;
  totalQuestions?: number;
  total_marks?: number;
  totalMarks?: number;
  passing_score?: number;
  passingScore?: number;
  attempts_allowed?: number;
  attemptsAllowed?: number;
  status: 'draft' | 'published' | 'active' | 'ended';
  is_published?: boolean;
  isPublished?: boolean;
  participants_count?: number;
  participantsCount?: number;
  questions?: Array<{
    id: string;
    prompt: string;
    options: string[];
    answer_key?: any;
    answerKey?: any;
    points: number;
    explanation?: string;
  }>;
}

export function AssessmentsView({
  assessments = [],
  role,
  onOpenCreateModal,
  onOpenQuestionBuilder,
  onStartQuiz,
  onToggleStatus,
  onDeleteAssessment,
  onViewResults,
}: {
  assessments: AssessmentItem[];
  role: 'Teacher' | 'Student';
  onOpenCreateModal: () => void;
  onOpenQuestionBuilder: (assessment: AssessmentItem) => void;
  onStartQuiz: (assessment: AssessmentItem) => void;
  onToggleStatus: (assessmentId: string, status: 'draft' | 'published' | 'active' | 'ended') => void;
  onDeleteAssessment: (assessmentId: string) => void;
  onViewResults: (assessment: AssessmentItem) => void;
}) {
  const [filter, setFilter] = useState<string>('all');

  const filteredAssessments = assessments.filter((a) => {
    if (role === 'Student' && a.status === 'draft') return false;
    if (filter === 'all') return true;
    if (filter === 'active') return a.status === 'active';
    if (filter === 'ended') return a.status === 'ended';
    if (filter === 'draft') return a.status === 'draft';
    return true;
  });

  const getStatusBadge = (a: AssessmentItem) => {
    switch (a.status) {
      case 'active':
        return <span className="learning-badge badge-live"><span className="pulse-dot" /> ACTIVE NOW</span>;
      case 'published':
        return <span className="learning-badge badge-scheduled">Published</span>;
      case 'ended':
        return <span className="learning-badge badge-completed">Ended</span>;
      case 'draft':
        return <span className="learning-badge badge-draft">🟡 Draft</span>;
      default:
        return <span className="learning-badge badge-scheduled">Published</span>;
    }
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="generic-head">
        <div>
          <div className="date-label">CONCEPT EVALUATION & TIMED TESTS</div>
          <h1>
            Classroom Assessments<span className="heading-period">.</span>
          </h1>
          <p>
            Automated concept evaluations, MCQ tests, and timed algorithmic quizzes with authoritative server-side timing.
          </p>
        </div>

        {role === 'Teacher' && (
          <button className="primary-btn" onClick={onOpenCreateModal}>
            <Plus size={16} /> New Assessment
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Assessments ({assessments.length})
        </button>
        <button
          className={`filter-pill ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
        >
          🟢 Active
        </button>
        <button
          className={`filter-pill ${filter === 'ended' ? 'active' : ''}`}
          onClick={() => setFilter('ended')}
        >
          Ended
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

      {/* Assessments Grid */}
      {filteredAssessments.length === 0 ? (
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
            <GraduationCap size={28} />
          </div>
          <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '18px' }}>
            No assessments found
          </h3>
          <p style={{ margin: '0 auto 18px', maxWidth: '380px', fontSize: '14px' }}>
            {role === 'Teacher'
              ? 'Create your first timed quiz or MCQ assessment to test student understanding.'
              : 'There are no active or scheduled quizzes in this category right now.'}
          </p>
          {role === 'Teacher' && (
            <button className="primary-btn" onClick={onOpenCreateModal}>
              <Plus size={16} /> New Assessment
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
          {filteredAssessments.map((a) => {
            const isActive = a.status === 'active';
            const qCount = a.questions ? a.questions.length : (a.total_questions || a.totalQuestions || 20);

            return (
              <div key={a.id} className="learning-card">
                <div className="learning-card-head">
                  <div>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>
                      {a.type ? a.type.toUpperCase() : 'MCQ QUIZ'} · {a.total_marks || a.totalMarks || 20} MARKS
                    </span>
                    <h3 style={{ margin: '4px 0', fontSize: '18px', color: '#1e293b' }}>
                      {a.title}
                    </h3>
                  </div>
                  {getStatusBadge(a)}
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
                      <Clock3 size={14} color="#6366f1" />
                      {a.duration_minutes || a.durationMinutes || 30} mins
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <ListOrdered size={14} color="#6366f1" />
                      {qCount} Questions
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <CheckCircle2 size={14} color="#10b981" />
                      Auto-Graded
                    </span>
                  </div>

                  <p style={{ margin: '0 0 12px', fontSize: '13.5px', color: '#64748b', lineHeight: 1.5 }}>
                    {a.description || 'Test conceptual understanding with auto-evaluated questions.'}
                  </p>

                  <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '12px' }}>
                    <span>Pass Score: <b>{a.passing_score || a.passingScore || 10} pts</b></span>
                    <span>Attempts: <b>{a.attempts_allowed || a.attemptsAllowed || 1}</b></span>
                  </div>
                </div>

                <div className="learning-card-footer">
                  {role === 'Teacher' ? (
                    <>
                      <button
                        className="secondary-btn"
                        style={{ height: '34px', fontSize: '12.5px', padding: '0 10px' }}
                        onClick={() => onOpenQuestionBuilder(a)}
                      >
                        <ListOrdered size={14} /> Questions ({qCount})
                      </button>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="secondary-btn"
                          style={{ height: '34px', fontSize: '12.5px', padding: '0 10px' }}
                          onClick={() => onViewResults(a)}
                          title="View Results & Statistics"
                        >
                          <BarChart2 size={14} /> Results
                        </button>

                        <button
                          className="primary-btn"
                          style={{ height: '34px', fontSize: '12.5px', padding: '0 10px' }}
                          onClick={() => onToggleStatus(a.id, isActive ? 'ended' : 'active')}
                        >
                          {isActive ? <><Square size={13} /> End</> : <><Play size={13} /> Activate</>}
                        </button>

                        <button
                          className="icon-btn"
                          style={{ color: '#ef4444' }}
                          onClick={() => onDeleteAssessment(a.id)}
                          title="Delete Assessment"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                        {isActive ? 'Available Now' : 'Scheduled Quiz'}
                      </span>

                      <button
                        className="primary-btn"
                        style={{ height: '36px', fontSize: '13px' }}
                        onClick={() => onStartQuiz(a)}
                      >
                        <Play size={14} /> Start Assessment
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
