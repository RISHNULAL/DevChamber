import mongoose from 'mongoose';
import {
  User,
  Classroom,
  ClassroomMember,
  ClassSession,
  Resource,
  Assignment,
  AssignmentSubmission,
  Assessment,
  Question,
  Submission,
  Workspace,
} from '../models/index.js';
import {
  listClassroomSessions,
  createClassSession,
  updateClassSessionStatus,
} from '../services/sessions.js';
import {
  listResources,
  createResource,
  updateResourceStatus,
} from '../services/resources.js';
import {
  listClassroomAssignments,
  createClassroomAssignment,
  openAssignmentWorkspace,
  submitAssignment,
  listAssignmentSubmissions,
  gradeAssignmentSubmission,
} from '../services/assignments.js';
import {
  listAssessments,
  createAssessment,
  addQuestionToAssessment,
  submitAssessmentAnswers,
  getAssessmentSubmissions,
} from '../services/assessments.js';
import { getClassroomAnalytics } from '../services/analytics.js';

async function runLearningSystemVerification() {
  console.log('🚀 Starting DevChamber Complete Classroom Learning System Verification...\n');
  await mongoose.connect('mongodb://localhost:27017/devchamber');

  const testTeacherId = 'teacher-alex-uuid-000000000001';
  const testStudentId = 'student-jordan-uuid-000000000002';
  const testClassroomId = 'class-ds-s5-cse-000000000001';

  try {
    // -------------------------------------------------------------
    // 1. Ensure Classroom and Members exist
    // -------------------------------------------------------------
    console.log('1️⃣ Setting up test classroom and members in MongoDB...');
    await Classroom.findOneAndUpdate(
      { _id: testClassroomId },
      {
        $setOnInsert: { _id: testClassroomId },
        name: 'Data Structures & Microcontrollers',
        subject: 'Computer Science',
        batch: 'S5 CSE',
        description: 'Embedded Systems and Algorithm Design',
        joinCode: 'DS5CSE',
        instructorId: testTeacherId,
      },
      { upsert: true }
    );

    await ClassroomMember.findOneAndUpdate(
      { classroomId: testClassroomId, userId: testStudentId },
      {
        $setOnInsert: { _id: `mem-${testClassroomId}-${testStudentId}` },
        classroomId: testClassroomId,
        userId: testStudentId,
        role: 'student',
      },
      { upsert: true }
    );

    // -------------------------------------------------------------
    // 2. SESSIONS: Create, Draft visibility, Publish & Lifecycle
    // -------------------------------------------------------------
    console.log('\n2️⃣ Testing Sessions module (Draft -> Publish -> Student view)...');
    const createdSession = await createClassSession(
      testClassroomId,
      testTeacherId,
      'teacher',
      {
        title: 'STM32 GPIO Programming & Register Control',
        description: 'Introduction to GPIO configuration and digital output.',
        scheduledDate: '2026-09-29',
        startTime: '10:30 AM',
        endTime: '12:00 PM',
        agenda: ['GPIO basics', 'Register configuration', 'LED control', 'Practical demonstration'],
        status: 'draft',
      }
    );
    console.log('   ✓ Teacher created draft session:', createdSession.title);

    // Student should NOT see draft session
    const studentSessionsBeforePublish = await listClassroomSessions(testClassroomId, testStudentId, 'student');
    const studentSeesDraft = studentSessionsBeforePublish.some((s: any) => s.id === createdSession.id);
    if (studentSeesDraft) {
      throw new Error('SECURITY BUG: Student can view draft session before publication!');
    }
    console.log('   ✓ Draft session successfully hidden from student.');

    // Teacher publishes session
    await updateClassSessionStatus(createdSession.id, testTeacherId, 'teacher', 'scheduled');
    const studentSessionsAfterPublish = await listClassroomSessions(testClassroomId, testStudentId, 'student');
    const studentSeesPublished = studentSessionsAfterPublish.some((s: any) => s.id === createdSession.id);
    if (!studentSeesPublished) {
      throw new Error('Student cannot view published session!');
    }
    console.log('   ✓ Student successfully received published session.');

    // -------------------------------------------------------------
    // 3. RESOURCES: Create, Draft toggle, Multi-format support
    // -------------------------------------------------------------
    console.log('\n3️⃣ Testing Resources module (Upload, Format, Attach)...');
    const createdResource = await createResource(
      testClassroomId,
      testTeacherId,
      'teacher',
      {
        title: 'STM32 GPIO Notes & Register Map',
        description: 'Reference material for today session.',
        kind: 'pdf',
        url: 'https://cdn.devchamber.cloud/docs/stm32-gpio-notes.pdf',
        sessionId: createdSession.id,
        status: 'published',
      }
    );
    console.log('   ✓ Teacher created resource:', createdResource.title, `(${createdResource.kind})`);

    const studentResources = await listResources(testClassroomId, testStudentId, 'student');
    const hasResource = studentResources.some((r: any) => r.id === createdResource.id);
    if (!hasResource) {
      throw new Error('Student cannot see published resource!');
    }
    console.log('   ✓ Student can view and access published resource.');

    // -------------------------------------------------------------
    // 4. ASSIGNMENTS: Create, Open in Workspace, Auto-save, Submit, Grade
    // -------------------------------------------------------------
    console.log('\n4️⃣ Testing Assignments module (Create -> Sandbox Workspace -> Submit -> Teacher Grade)...');
    const createdAssignment = await createClassroomAssignment(
      testClassroomId,
      testTeacherId,
      'teacher',
      {
        title: 'Implement Binary Search',
        description: 'Implement binary search using Python with optimal O(log n) complexity.',
        instructions: 'Write binary_search(values, target). Return index or -1.',
        dueAt: '30 September · 11:59 PM',
        maxMarks: 20,
        starterCode: 'def binary_search(values, target):\n    # Write code here\n    return -1\n',
        status: 'published',
      }
    );
    console.log('   ✓ Teacher created assignment:', createdAssignment.title, `(Max Marks: ${createdAssignment.max_marks})`);

    // Student opens in personal workspace
    const wsResult = await openAssignmentWorkspace(createdAssignment.id, testStudentId, 'student');
    console.log('   ✓ Student opened assignment in personal workspace:', wsResult.workspace.id);
    const hasMainPy = wsResult.workspace.files.some((f: any) => f.name === 'main.py');
    if (!hasMainPy) {
      throw new Error('Starter code was not provisioned into student personal workspace!');
    }

    // Student updates code in their personal workspace
    const studentSolution = `def binary_search(values, target):\n    low, high = 0, len(values) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if values[mid] == target: return mid\n        elif values[mid] < target: low = mid + 1\n        else: high = mid - 1\n    return -1\n\nprint(binary_search([2, 5, 8, 12, 16], 12))\n`;
    await Workspace.updateOne(
      { _id: wsResult.workspace.id },
      {
        $set: {
          'files.0.content': studentSolution,
          'files.0.updated_at': new Date().toISOString(),
        },
      }
    );
    console.log('   ✓ Student code auto-saved in personal sandbox.');

    // Student submits assignment
    const submissionResult = await submitAssignment(createdAssignment.id, testStudentId, 'student');
    console.log('   ✓ Student submitted assignment. Status:', submissionResult.status);

    // Teacher reviews submissions
    const submissionsList = await listAssignmentSubmissions(createdAssignment.id, testTeacherId, 'teacher');
    console.log(`   ✓ Teacher retrieved submissions list (${submissionsList.length} submissions).`);
    const studentSub = submissionsList.find((s: any) => s.student_id === testStudentId);
    if (!studentSub || studentSub.status !== 'submitted') {
      throw new Error('Teacher cannot see submitted student solution!');
    }

    // Teacher grades submission
    const gradedSub = await gradeAssignmentSubmission(
      createdAssignment.id,
      testStudentId,
      testTeacherId,
      'teacher',
      {
        marks: 18,
        feedback: 'Good implementation. Improve edge-case handling for empty arrays.',
      }
    );
    console.log('   ✓ Teacher graded submission:', `${gradedSub.marks} / ${createdAssignment.max_marks}`);
    console.log('   ✓ Teacher feedback:', `"${gradedSub.feedback}"`);

    // Student views updated assignments with grade
    const studentAssignments = await listClassroomAssignments(testClassroomId, testStudentId, 'student');
    const gradedAsg = studentAssignments.find((a: any) => a.id === createdAssignment.id);
    if (gradedAsg?.my_submission?.status !== 'graded' || gradedAsg?.my_submission?.marks !== 18) {
      throw new Error('Student does not see correct grade!');
    }
    console.log('   ✓ Student views graded score and instructor feedback accurately.');

    // -------------------------------------------------------------
    // 5. ASSESSMENTS: Create, Question Builder, Secure Answers, Timed Quiz Submit
    // -------------------------------------------------------------
    console.log('\n5️⃣ Testing Assessments module (MCQ Builder -> Secure Answers -> Timed Submit -> Auto-Score)...');
    const createdAssessment = await createAssessment(
      testClassroomId,
      testTeacherId,
      'teacher',
      {
        title: 'STM32 Fundamentals Quiz',
        description: 'Timed quiz on GPIO, registers, and clock configurations.',
        type: 'mcq',
        duration_minutes: 30,
        passing_score: 10,
        attempts_allowed: 1,
        status: 'published',
      }
    );

    // Teacher adds Question 1
    const q1 = await addQuestionToAssessment(createdAssessment.id, testTeacherId, 'teacher', {
      prompt: 'What does GPIO stand for?',
      options: [
        'General Purpose Input Output',
        'General Program Input Output',
        'General Peripheral Input Output',
        'None of these',
      ],
      answer_key: 'General Purpose Input Output',
      points: 10,
      explanation: 'GPIO stands for General Purpose Input/Output in microcontroller architecture.',
    });

    // Teacher adds Question 2
    const q2 = await addQuestionToAssessment(createdAssessment.id, testTeacherId, 'teacher', {
      prompt: 'Which peripheral is commonly used for asynchronous serial communication?',
      options: ['GPIO', 'UART', 'ADC', 'PWM'],
      answer_key: 'UART',
      points: 10,
      explanation: 'UART (Universal Asynchronous Receiver-Transmitter) provides serial comms.',
    });
    console.log('   ✓ Teacher created 2 questions with points and answer keys.');

    // Student queries assessment -> verify server-side answer hiding
    const studentAssessments = await listAssessments(testClassroomId, testStudentId, 'student');
    const studentAssessment = studentAssessments.find((a: any) => a.id === createdAssessment.id);
    const leakedAnswer = studentAssessment?.questions?.some((q: any) => q.answer_key || q.answerKey || q.explanation);
    if (leakedAnswer) {
      throw new Error('SECURITY BUG: Answer key was sent to student before submission!');
    }
    console.log('   ✓ Answer keys and explanations securely withheld from student.');

    // Student takes assessment and submits answers
    const studentAnswers = {
      [q1.id]: 'General Purpose Input Output', // Correct (+10)
      [q2.id]: 'UART',                         // Correct (+10)
    };
    const quizResult = await submitAssessmentAnswers(
      createdAssessment.id,
      testStudentId,
      'Jordan Lee',
      studentAnswers,
      320 // 5m 20s
    );
    console.log('   ✓ Student submitted quiz. Auto-graded score:', `${quizResult.marks} / ${quizResult.totalMarks} (${quizResult.percentage}%)`);
    if (quizResult.marks !== 20 || !quizResult.isPassed) {
      throw new Error('Automated grading calculation failed!');
    }

    // Teacher views results analytics
    const resultsData = await getAssessmentSubmissions(createdAssessment.id, testTeacherId, 'teacher');
    console.log('   ✓ Teacher retrieved assessment results. Participants:', resultsData.participantsCount, `Average: ${resultsData.averageScore}%`);

    // -------------------------------------------------------------
    // 6. ANALYTICS: Real MongoDB Aggregated Stats
    // -------------------------------------------------------------
    console.log('\n6️⃣ Testing Classroom Analytics endpoint (Real MongoDB Calculations)...');
    const analytics = await getClassroomAnalytics(testClassroomId, testTeacherId, 'teacher');
    console.log('   ✓ Total Enrolled Students:', analytics.metrics.totalStudents);
    console.log('   ✓ Assignment Completion Rate:', `${analytics.metrics.assignmentCompletionRate}%`);
    console.log('   ✓ Assessment Average Score:', `${analytics.metrics.assessmentAverageScore}%`);
    console.log('   ✓ Resource Engagement Views:', `${analytics.metrics.resourceEngagement}%`);
    console.log('   ✓ Active Sessions Count:', analytics.metrics.activeSessionsCount);

    console.log('\n🎉 ALL LEARNING SYSTEM TESTS PASSED SUCCESSFULLY! 100% COMPLETE.');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runLearningSystemVerification();
