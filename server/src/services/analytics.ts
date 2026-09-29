import {
  Classroom,
  ClassroomMember,
  ClassSession,
  Resource,
  Assignment,
  AssignmentSubmission,
  Assessment,
  Submission,
} from '../models/index.js';

export async function getClassroomAnalytics(
  classroomId: string,
  userId: string,
  userRole: string
) {
  const classroom = await Classroom.findById(classroomId).lean();
  if (!classroom) {
    const err: any = new Error('Classroom not found');
    err.statusCode = 404;
    throw err;
  }

  // Basic counts
  const [
    studentMembers,
    sessions,
    resources,
    assignments,
    assignmentSubmissions,
    assessments,
    assessmentSubmissions,
  ] = await Promise.all([
    ClassroomMember.find({ classroomId, role: 'student' }).lean(),
    ClassSession.find({ classroomId }).lean(),
    Resource.find({ classroomId }).lean(),
    Assignment.find({ classroomId }).lean(),
    AssignmentSubmission.find({ classroomId }).lean(),
    Assessment.find({ classroomId }).lean(),
    Submission.find({ classroomId }).lean(),
  ]);

  const totalStudents = studentMembers.length || 1;
  const totalAssignments = assignments.length;
  const totalPossibleSubmissions = totalStudents * Math.max(1, totalAssignments);
  const submittedCount = assignmentSubmissions.filter(
    (s) => s.status === 'submitted' || s.status === 'graded' || s.status === 'late'
  ).length;

  const assignmentCompletionRate =
    totalPossibleSubmissions > 0 ? Math.round((submittedCount / totalPossibleSubmissions) * 100) : 0;

  // Assessment performance
  const assessmentScores = assessmentSubmissions.map((s) => s.percentage || 0);
  const assessmentAverageScore =
    assessmentScores.length > 0
      ? Math.round(assessmentScores.reduce((a, b) => a + b, 0) / assessmentScores.length)
      : 0;

  // Live and completed sessions
  const liveSessionsCount = sessions.filter((s) => s.isLive || s.status === 'live').length;
  const completedSessionsCount = sessions.filter((s) => s.status === 'completed').length;
  const scheduledSessionsCount = sessions.filter((s) => s.status === 'scheduled').length;

  // Resource engagement
  const publishedResourcesCount = resources.filter((r) => r.isPublished).length;
  const totalResourceDownloads = resources.reduce((sum, r) => sum + (r.downloadsCount || 0), 0);

  // Student specific stats if requested by student
  let studentStats = null;
  if (userRole === 'student') {
    const mySubmissions = assignmentSubmissions.filter((s) => s.studentId === userId);
    const myCompletedAssignments = mySubmissions.filter(
      (s) => s.status === 'submitted' || s.status === 'graded'
    ).length;

    const myAssessmentSubs = assessmentSubmissions.filter((s) => s.studentId === userId);
    const myAssessmentAvg =
      myAssessmentSubs.length > 0
        ? Math.round(
            myAssessmentSubs.reduce((a, b) => a + (b.percentage || 0), 0) / myAssessmentSubs.length
          )
        : 0;

    studentStats = {
      assignments_completed: myCompletedAssignments,
      assignments_total: totalAssignments,
      assignment_completion_rate:
        totalAssignments > 0 ? Math.round((myCompletedAssignments / totalAssignments) * 100) : 0,
      assessments_completed: myAssessmentSubs.length,
      assessments_total: assessments.length,
      assessments_average_score: myAssessmentAvg,
    };
  }

  return {
    classroom_id: classroomId,
    classroom_name: classroom.name,
    total_students: studentMembers.length,
    metrics: {
      totalStudents: studentMembers.length,
      assignmentCompletionRate,
      assessmentAverageScore,
      resourceEngagement: publishedResourcesCount,
      activeSessionsCount: liveSessionsCount + scheduledSessionsCount,
    },
    sessions_stats: {
      total: sessions.length,
      scheduled: scheduledSessionsCount,
      live: liveSessionsCount,
      completed: completedSessionsCount,
    },
    resources_stats: {
      total: resources.length,
      published: publishedResourcesCount,
      downloads: totalResourceDownloads,
    },
    assignments_stats: {
      total: totalAssignments,
      submitted: submittedCount,
      completion_rate: assignmentCompletionRate,
    },
    assessments_stats: {
      total: assessments.length,
      submissions: assessmentSubmissions.length,
      average_score: assessmentAverageScore,
    },
    student_stats: studentStats,
  };
}
