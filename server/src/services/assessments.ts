import { v4 as uuidv4 } from 'uuid';
import {
  Assessment,
  Question,
  Submission,
  Classroom,
  ClassroomMember,
  Profile,
  User,
} from '../models/index.js';

export interface QuestionRecord {
  id: string;
  assessment_id?: string;
  kind: 'mcq' | 'short_answer' | 'coding';
  prompt: string;
  options: string[];
  answer_key?: any;
  points: number;
  position: number;
  explanation?: string;
}

export interface AssessmentRecord {
  id: string;
  classroom_id: string;
  created_by: string;
  author_name: string;
  title: string;
  description: string;
  type: 'quiz' | 'mcq' | 'coding' | 'timed';
  duration_minutes: number;
  total_questions: number;
  total_marks: number;
  passing_score: number;
  attempts_allowed: number;
  status: 'draft' | 'published' | 'active' | 'ended';
  is_published: boolean;
  is_results_released: boolean;
  participants_count: number;
  questions: QuestionRecord[];
  my_submission?: any;
  created_at?: string;
  updated_at?: string;
}

async function verifyClassroomAccess(classroomId: string, userId: string, userRole: string) {
  if (userRole === 'admin') return { isTeacher: true, isMember: true };

  const classroom = await Classroom.findById(classroomId).lean();
  if (!classroom) {
    const err: any = new Error('Classroom not found');
    err.statusCode = 404;
    throw err;
  }

  if (classroom.teacherId === userId) return { isTeacher: true, isMember: true, classroom };

  const member = await ClassroomMember.findOne({ classroomId, userId }).lean();
  if (!member) {
    const err: any = new Error('Access denied: You are not enrolled in this classroom');
    err.statusCode = 403;
    throw err;
  }

  return { isTeacher: member.role === 'teacher', isMember: true, classroom };
}

export async function listAssessments(
  classroomId: string,
  userId: string,
  userRole: string
): Promise<AssessmentRecord[]> {
  const access = await verifyClassroomAccess(classroomId, userId, userRole);

  const query: any = { classroomId };
  if (!access.isTeacher) {
    query.isPublished = true;
  }

  const assessments = await Assessment.find(query).sort({ createdAt: -1 }).lean();
  const results: AssessmentRecord[] = [];

  for (const as of assessments) {
    const questions = await Question.find({ assessmentId: as._id }).sort({ position: 1 }).lean();

    let mySubmission = null;
    let hasSubmitted = false;
    if (!access.isTeacher) {
      const sub = await Submission.findOne({ assessmentId: as._id, studentId: userId }).lean();
      if (sub) {
        hasSubmitted = true;
        mySubmission = {
          id: sub._id,
          score: sub.score,
          total_points: sub.totalPoints,
          percentage: sub.percentage,
          is_passed: sub.isPassed,
          answers: sub.answers,
          submitted_at: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : null,
        };
      }
    }

    // Hide answer key and explanations from students unless they have submitted AND results are released
    const hideKey = !access.isTeacher && (!hasSubmitted || !as.isResultsReleased);

    const safeQuestions: QuestionRecord[] = questions.map((q: any) => ({
      id: q._id,
      assessment_id: q.assessmentId,
      kind: q.kind || 'mcq',
      prompt: q.prompt,
      options: Array.isArray(q.options) ? q.options : [],
      answer_key: hideKey ? undefined : q.answerKey,
      points: q.points || 1,
      position: q.position || 0,
      explanation: hideKey ? undefined : q.explanation,
    }));

    const participantsCount = await Submission.countDocuments({ assessmentId: as._id });

    results.push({
      id: as._id,
      classroom_id: as.classroomId,
      created_by: as.createdBy,
      author_name: as.authorName || 'Instructor',
      title: as.title,
      description: as.description || '',
      type: as.type || 'quiz',
      duration_minutes: Number(as.durationMinutes || 20),
      total_questions: questions.length,
      total_marks: questions.reduce((sum, q) => sum + (q.points || 1), 0) || as.totalMarks || 20,
      passing_score: as.passingScore || 10,
      attempts_allowed: as.attemptsAllowed || 1,
      status: as.status,
      is_published: as.isPublished ?? true,
      is_results_released: as.isResultsReleased ?? true,
      participants_count: participantsCount,
      questions: safeQuestions,
      my_submission: mySubmission,
      created_at: as.createdAt ? new Date(as.createdAt).toISOString() : new Date().toISOString(),
      updated_at: as.updatedAt ? new Date(as.updatedAt).toISOString() : new Date().toISOString(),
    });
  }

  return results;
}

export async function createAssessment(
  classroomId: string,
  teacherId: string,
  userRole: string,
  input: {
    title: string;
    description?: string;
    type?: 'quiz' | 'mcq' | 'coding' | 'timed';
    duration_minutes?: number;
    passing_score?: number;
    attempts_allowed?: number;
    status?: 'draft' | 'published' | 'active' | 'ended';
    questions?: Array<{
      prompt: string;
      options?: string[];
      answer_key?: any;
      points?: number;
      kind?: 'mcq' | 'short_answer' | 'coding';
      explanation?: string;
    }>;
  }
): Promise<AssessmentRecord> {
  const access = await verifyClassroomAccess(classroomId, teacherId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can create assessments');
    err.statusCode = 403;
    throw err;
  }

  const profile = await Profile.findById(teacherId).lean();
  const user = await User.findById(teacherId).lean();
  const authorName = profile?.fullName || user?.name || 'Instructor';

  const assessmentId = uuidv4();
  const status = input.status || 'published';
  const isPublished = status === 'published' || status === 'active';

  const questionsList = input.questions || [];
  const totalMarks = questionsList.reduce((sum, q) => sum + (q.points || 1), 0) || 20;

  const asDoc = await Assessment.create({
    _id: assessmentId,
    classroomId,
    createdBy: teacherId,
    authorName,
    title: input.title.trim(),
    description: (input.description || '').trim(),
    type: input.type || 'quiz',
    durationMinutes: input.duration_minutes || 20,
    totalQuestions: questionsList.length,
    totalMarks,
    passingScore: input.passing_score || Math.ceil(totalMarks / 2),
    attemptsAllowed: input.attempts_allowed || 1,
    status,
    isPublished,
    isResultsReleased: false,
    participantsCount: 0,
  });

  const createdQuestions: QuestionRecord[] = [];
  for (let idx = 0; idx < questionsList.length; idx++) {
    const q = questionsList[idx];
    const qId = uuidv4();

    const qDoc = await Question.create({
      _id: qId,
      assessmentId,
      kind: q.kind || 'mcq',
      prompt: q.prompt.trim(),
      options: q.options || [],
      answerKey: q.answer_key,
      points: q.points || 1,
      position: idx,
      explanation: q.explanation || '',
    });

    createdQuestions.push({
      id: qDoc._id,
      assessment_id: assessmentId,
      kind: qDoc.kind,
      prompt: qDoc.prompt,
      options: qDoc.options,
      answer_key: qDoc.answerKey,
      points: qDoc.points,
      position: qDoc.position,
      explanation: qDoc.explanation,
    });
  }

  return {
    id: asDoc._id,
    classroom_id: classroomId,
    created_by: teacherId,
    author_name: asDoc.authorName,
    title: asDoc.title,
    description: asDoc.description,
    type: asDoc.type,
    duration_minutes: asDoc.durationMinutes,
    total_questions: createdQuestions.length,
    total_marks: asDoc.totalMarks,
    passing_score: asDoc.passingScore,
    attempts_allowed: asDoc.attemptsAllowed,
    status: asDoc.status,
    is_published: asDoc.isPublished,
    is_results_released: asDoc.isResultsReleased,
    participants_count: 0,
    questions: createdQuestions,
    created_at: asDoc.createdAt?.toISOString(),
    updated_at: asDoc.updatedAt?.toISOString(),
  };
}

export async function addQuestionToAssessment(
  assessmentId: string,
  userId: string,
  userRole: string,
  input: {
    prompt: string;
    options?: string[];
    answer_key?: any;
    points?: number;
    kind?: 'mcq' | 'short_answer' | 'coding';
    explanation?: string;
  }
) {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) {
    const err: any = new Error('Assessment not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(assessment.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can add questions');
    err.statusCode = 403;
    throw err;
  }

  const existingCount = await Question.countDocuments({ assessmentId });
  const qDoc = await Question.create({
    _id: uuidv4(),
    assessmentId,
    kind: input.kind || 'mcq',
    prompt: input.prompt.trim(),
    options: input.options || [],
    answerKey: input.answer_key,
    points: input.points || 1,
    position: existingCount,
    explanation: input.explanation || '',
  });

  // Update total questions & marks on assessment
  const allQuestions = await Question.find({ assessmentId }).lean();
  assessment.totalQuestions = allQuestions.length;
  assessment.totalMarks = allQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
  await assessment.save();

  return qDoc.toJSON();
}

export async function deleteQuestionFromAssessment(
  questionId: string,
  userId: string,
  userRole: string
) {
  const qDoc = await Question.findById(questionId);
  if (!qDoc) {
    const err: any = new Error('Question not found');
    err.statusCode = 404;
    throw err;
  }

  const assessment = await Assessment.findById(qDoc.assessmentId);
  if (!assessment) {
    const err: any = new Error('Assessment not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(assessment.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can delete questions');
    err.statusCode = 403;
    throw err;
  }

  await Question.findByIdAndDelete(questionId);

  const remaining = await Question.find({ assessmentId: assessment._id }).lean();
  assessment.totalQuestions = remaining.length;
  assessment.totalMarks = remaining.reduce((sum, q) => sum + (q.points || 1), 0);
  await assessment.save();

  return { success: true, questionId };
}

export async function updateAssessmentStatus(
  assessmentId: string,
  userId: string,
  userRole: string,
  status: 'draft' | 'published' | 'active' | 'ended'
) {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) {
    const err: any = new Error('Assessment not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(assessment.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can update assessment status');
    err.statusCode = 403;
    throw err;
  }

  assessment.status = status;
  assessment.isPublished = status === 'published' || status === 'active';
  await assessment.save();

  return { success: true, status, isPublished: assessment.isPublished };
}

export async function submitAssessmentAnswers(
  assessmentId: string,
  studentId: string,
  studentRole: string,
  answers: Record<string, string | number>,
  timeTakenSeconds: number = 0
) {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) {
    const err: any = new Error('Assessment not found');
    err.statusCode = 404;
    throw err;
  }

  await verifyClassroomAccess(assessment.classroomId, studentId, studentRole);

  const questions = await Question.find({ assessmentId }).sort({ position: 1 }).lean();
  if (!questions || questions.length === 0) {
    throw new Error('Assessment has no questions');
  }

  const profile = await Profile.findById(studentId).lean();
  const user = await User.findById(studentId).lean();
  const studentName = profile?.fullName || user?.name || 'Student';

  let score = 0;
  let totalPoints = 0;

  for (const q of questions) {
    const points = q.points || 1;
    totalPoints += points;

    const answerKey = q.answerKey;
    const options = Array.isArray(q.options) ? q.options : [];
    const studentAnswer = answers[q._id];

    if (studentAnswer !== undefined && studentAnswer !== null) {
      if (typeof answerKey === 'number') {
        const studentIndex =
          typeof studentAnswer === 'number' ? studentAnswer : options.indexOf(String(studentAnswer));
        if (studentIndex === answerKey) {
          score += points;
        }
      } else if (String(studentAnswer).trim().toLowerCase() === String(answerKey).trim().toLowerCase()) {
        score += points;
      }
    }
  }

  const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
  const isPassed = score >= (assessment.passingScore || Math.ceil(totalPoints / 2));

  const sub = await Submission.findOneAndUpdate(
    { assessmentId, studentId },
    {
      classroomId: assessment.classroomId,
      studentName,
      answers,
      score,
      totalPoints,
      percentage,
      isPassed,
      timeTakenSeconds,
      submittedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Assessment.findByIdAndUpdate(assessmentId, { $inc: { participantsCount: 1 } });

  return {
    id: sub._id,
    assessment_id: assessmentId,
    student_id: studentId,
    student_name: studentName,
    answers,
    score,
    marks: score,
    total_points: totalPoints,
    totalMarks: totalPoints,
    percentage,
    is_passed: isPassed,
    isPassed,
    time_taken_seconds: timeTakenSeconds,
    submitted_at: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : new Date().toISOString(),
  };
}

export async function getAssessmentSubmissions(
  assessmentId: string,
  userId: string,
  userRole: string
) {
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) {
    const err: any = new Error('Assessment not found');
    err.statusCode = 404;
    throw err;
  }

  const access = await verifyClassroomAccess(assessment.classroomId, userId, userRole);
  if (!access.isTeacher) {
    const err: any = new Error('Only instructors can view all assessment submissions');
    err.statusCode = 403;
    throw err;
  }

  const [submissions, questions, members] = await Promise.all([
    Submission.find({ assessmentId }).sort({ submittedAt: -1 }).lean(),
    Question.find({ assessmentId }).lean(),
    ClassroomMember.find({ classroomId: assessment.classroomId, role: 'student' }).lean(),
  ]);

  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0) || assessment.totalMarks || 20;

  const totalEnrolled = members.length || 1;
  const completedCount = submissions.length;
  const scores = submissions.map((s) => s.score);
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
  const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;

  const submissionRows = submissions.map((s: any) => ({
    id: s._id,
    assessment_id: s.assessmentId,
    student_id: s.studentId,
    student_name: s.studentName || 'Student',
    answers: s.answers || {},
    score: Number(s.score || 0),
    total_points: s.totalPoints || totalPoints,
    percentage: s.percentage || Math.round(((s.score || 0) / totalPoints) * 100),
    is_passed: s.isPassed,
    time_taken_seconds: s.timeTakenSeconds || 0,
    submitted_at: s.submittedAt ? new Date(s.submittedAt).toISOString() : new Date().toISOString(),
  }));

  return {
    assessment_id: assessmentId,
    total_enrolled: totalEnrolled,
    completed_count: completedCount,
    participants_count: completedCount,
    participantsCount: completedCount,
    average_score: Number(avgScore),
    averageScore: Number(avgScore),
    highest_score: highestScore,
    lowest_score: lowestScore,
    total_points: totalPoints,
    submissions: submissionRows,
  };
}
