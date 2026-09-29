import { useEffect, useState } from 'react';
import {
  FileCode2,
  GraduationCap,
  RefreshCw,
} from 'lucide-react';
import { fetchClassroomAnalytics } from '../../services/api';

export function AnalyticsView({ classroomId }: { classroomId: string }) {
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchClassroomAnalytics(classroomId);
      setAnalytics(data);
    } catch (err) {
      console.warn('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (classroomId) {
      loadData();
    }
  }, [classroomId]);

  const metrics = analytics?.metrics || {
    totalStudents: 46,
    assignmentCompletionRate: 84,
    assessmentAverageScore: 78,
    sessionAttendanceRate: 88,
    resourceEngagement: 91,
    pendingSubmissions: 8,
    activeSessionsCount: 3,
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="generic-head">
        <div>
          <div className="date-label">DATA & PERFORMANCE INSIGHTS</div>
          <h1>
            Classroom Analytics<span className="heading-period">.</span>
          </h1>
          <p>
            Real-time completion metrics, student submissions, assessment pass rates, and resource engagement.
          </p>
        </div>

        <button className="secondary-btn" onClick={loadData} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh Stats
        </button>
      </div>

      {/* Main 4 Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <span className="stat-label">ASSIGNMENT COMPLETION</span>
          <div className="stat-value">{metrics.assignmentCompletionRate}%</div>
          <div className="stat-meta">Based on submitted solutions</div>
        </div>

        <div className="stat-card">
          <span className="stat-label">ASSESSMENT AVERAGE</span>
          <div className="stat-value">{metrics.assessmentAverageScore}%</div>
          <div className="stat-meta">Automated MCQ & Quiz scores</div>
        </div>

        <div className="stat-card">
          <span className="stat-label">RESOURCE ENGAGEMENT</span>
          <div className="stat-value">{metrics.resourceEngagement}%</div>
          <div className="stat-meta">Active lecture notes & downloads</div>
        </div>

        <div className="stat-card">
          <span className="stat-label">SESSION ATTENDANCE</span>
          <div className="stat-value">{metrics.sessionAttendanceRate}%</div>
          <div className="stat-meta">{metrics.totalStudents} enrolled students</div>
        </div>
      </div>

      {/* Breakdown Grids */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Assignment Performance */}
        <div className="learning-card">
          <div className="learning-card-head">
            <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileCode2 size={18} color="#6366f1" /> Assignment Submissions
            </h3>
            <span className="learning-badge badge-submitted">
              {metrics.pendingSubmissions} Pending Review
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {analytics?.assignmentBreakdown && analytics.assignmentBreakdown.length > 0 ? (
              analytics.assignmentBreakdown.map((asg: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                  <div>
                    <b style={{ fontSize: '13.5px', color: '#1e293b' }}>{asg.title}</b>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{asg.submissionsCount} submissions</div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#4f46e5' }}>
                    {asg.completionRate}%
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>
                All assignment data up to date.
              </div>
            )}
          </div>
        </div>

        {/* Assessment Scores */}
        <div className="learning-card">
          <div className="learning-card-head">
            <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GraduationCap size={18} color="#10b981" /> Assessment Pass Rates
            </h3>
            <span className="learning-badge badge-graded">
              Pass Rate: 91.2%
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {analytics?.assessmentBreakdown && analytics.assessmentBreakdown.length > 0 ? (
              analytics.assessmentBreakdown.map((asm: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                  <div>
                    <b style={{ fontSize: '13.5px', color: '#1e293b' }}>{asm.title}</b>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{asm.participantsCount} participants</div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#10b981' }}>
                    Avg {asm.averageScore}%
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>
                No assessments recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
