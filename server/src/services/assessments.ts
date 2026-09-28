import type { SupabaseClient } from '@supabase/supabase-js';
import { store, type Assessment, type Submission, type Question } from './store.js';

export async function listAssessments(db: SupabaseClient | null, classroomId: string, role: string) {
  if (db) {
    let query = db.from('assessments').select('*, questions(*)').eq('classroom_id', classroomId);
    if (role === 'student') {
      query = query.in('status', ['published', 'active', 'ended']);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  // Demo store
  const results: Assessment[] = [];
  for (const as of store.assessments.values()) {
    if (as.classroom_id === classroomId) {
      if (role === 'teacher' || as.status !== 'draft') {
        // Hide answer keys for students if active
        if (role === 'student' && as.status === 'active') {
          const safeQuestions = as.questions.map((q) => ({
            ...q,
            answer_key: undefined,
          })) as Question[];
          results.push({ ...as, questions: safeQuestions });
        } else {
          results.push(as);
        }
      }
    }
  }
  return results;
}

export async function createAssessment(
  db: SupabaseClient | null,
  classroomId: string,
  teacherId: string,
  input: {
    title: string;
    description?: string;
    duration_minutes?: number;
    questions?: Array<{ prompt: string; options: string[]; answer_key: number; points?: number }>;
  }
): Promise<Assessment> {
  const assessmentId = `as-${Date.now()}`;
  const questions: Question[] = (input.questions || []).map((q, idx) => ({
    id: `q-${Date.now()}-${idx}`,
    kind: 'mcq',
    prompt: q.prompt,
    options: q.options,
    answer_key: q.answer_key,
    points: q.points || 1,
    position: idx,
  }));

  const assessment: Assessment = {
    id: assessmentId,
    classroom_id: classroomId,
    created_by: teacherId,
    title: input.title,
    description: input.description || '',
    duration_minutes: input.duration_minutes || 15,
    status: 'active',
    questions,
    created_at: new Date().toISOString(),
  };

  if (db) {
    const { data, error } = await db
      .from('assessments')
      .insert({
        classroom_id: classroomId,
        created_by: teacherId,
        title: input.title,
        description: input.description,
        duration_minutes: input.duration_minutes,
        status: 'active',
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (questions.length > 0) {
      await db.from('questions').insert(
        questions.map((q) => ({
          assessment_id: data.id,
          prompt: q.prompt,
          options: q.options,
          answer_key: q.answer_key,
          points: q.points,
          position: q.position,
          kind: 'mcq',
        }))
      );
    }
    return { ...data, questions };
  }

  store.assessments.set(assessmentId, assessment);
  return assessment;
}

export async function updateAssessmentStatus(
  db: SupabaseClient | null,
  assessmentId: string,
  status: 'draft' | 'published' | 'active' | 'ended'
) {
  if (db) {
    const { error } = await db.from('assessments').update({ status }).eq('id', assessmentId);
    if (error) throw new Error(error.message);
    return { success: true, status };
  }

  const as = store.assessments.get(assessmentId);
  if (!as) throw new Error('Assessment not found');
  as.status = status;
  return { success: true, status };
}

export async function submitAssessmentAnswers(
  db: SupabaseClient | null,
  assessmentId: string,
  studentId: string,
  studentName: string,
  answers: Record<string, string | number>
): Promise<Submission> {
  const assessment = store.assessments.get(assessmentId);
  if (!assessment) throw new Error('Assessment not found');

  let score = 0;
  let totalPoints = 0;

  for (const q of assessment.questions) {
    const points = q.points || 1;
    totalPoints += points;
    const studentAnswer = answers[q.id];
    // Check match
    if (studentAnswer !== undefined && studentAnswer !== null) {
      if (typeof q.answer_key === 'number') {
        const studentIndex = typeof studentAnswer === 'number' ? studentAnswer : q.options.indexOf(String(studentAnswer));
        if (studentIndex === q.answer_key) {
          score += points;
        }
      } else if (String(studentAnswer).trim().toLowerCase() === String(q.answer_key).trim().toLowerCase()) {
        score += points;
      }
    }
  }

  const submission: Submission = {
    id: `sub-${Date.now()}`,
    assessment_id: assessmentId,
    student_id: studentId,
    student_name: studentName,
    answers,
    score,
    total_points: totalPoints,
    submitted_at: new Date().toISOString(),
  };

  // Replace or add submission
  const existingIdx = store.submissions.findIndex((s) => s.assessment_id === assessmentId && s.student_id === studentId);
  if (existingIdx >= 0) {
    store.submissions[existingIdx] = submission;
  } else {
    store.submissions.push(submission);
  }

  if (db) {
    await db
      .from('submissions')
      .upsert({
        assessment_id: assessmentId,
        student_id: studentId,
        answers,
        score,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'assessment_id,student_id' });
  }

  return submission;
}

export async function getAssessmentSubmissions(
  db: SupabaseClient | null,
  assessmentId: string
): Promise<Submission[]> {
  if (db) {
    const { data } = await db
      .from('submissions')
      .select('id,assessment_id,student_id,answers,score,submitted_at,profiles(full_name)')
      .eq('assessment_id', assessmentId);
    return (data || []).map((s: any) => ({
      id: s.id,
      assessment_id: s.assessment_id,
      student_id: s.student_id,
      student_name: s.profiles?.full_name || 'Student',
      answers: s.answers || {},
      score: Number(s.score || 0),
      total_points: 6,
      submitted_at: s.submitted_at,
    }));
  }

  return store.submissions.filter((s) => s.assessment_id === assessmentId);
}
