import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Clock3,
  CheckCircle2,
  Play,
  Award,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { runPythonCode } from '../../services/api';

// -------------------------------------------------------------
// 1. CREATE SESSION MODAL
// -------------------------------------------------------------
export function CreateSessionModal({
  onClose,
  onCreate,
  resources = [],
  assignments = [],
}: {
  onClose: () => void;
  onCreate: (data: any) => Promise<void>;
  resources?: any[];
  assignments?: any[];
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [startTime, setStartTime] = useState('10:30 AM');
  const [endTime, setEndTime] = useState('12:00 PM');
  const [agendaText, setAgendaText] = useState(
    '• Introduction & Overview\n• Core Concepts & Architecture\n• Practical Implementation & Demo\n• Q&A and Problem Solving'
  );
  const [attachedResourceIds, setAttachedResourceIds] = useState<string[]>([]);
  const [attachedAssignmentIds, setAttachedAssignmentIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'draft' | 'scheduled'>('scheduled');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      const agenda = agendaText
        .split('\n')
        .map((line) => line.replace(/^[•\-\*]\s*/, '').trim())
        .filter(Boolean);

      await onCreate({
        title: title.trim(),
        description: description.trim(),
        scheduledDate,
        startTime,
        endTime,
        agenda,
        attachedResourceIds,
        attachedAssignmentIds,
        status,
        isLive: false,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: '640px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>Schedule New Session</h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
              Create a live teaching class with agenda, resources, and tasks.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            Session Title *
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. STM32 GPIO Programming & Interfacing"
              required
            />
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief explanation of what will be taught in this session..."
              rows={2}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <label>
              Date
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
              />
            </label>
            <label>
              Start Time
              <input
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="10:30 AM"
                required
              />
            </label>
            <label>
              End Time
              <input
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="12:00 PM"
                required
              />
            </label>
          </div>

          <label>
            Session Agenda (one bullet per line)
            <textarea
              value={agendaText}
              onChange={(e) => setAgendaText(e.target.value)}
              rows={4}
              placeholder="• Topic 1&#10;• Topic 2&#10;• Demonstration"
            />
          </label>

          {resources.length > 0 && (
            <label>
              Attach Resources
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                {resources.map((r) => {
                  const selected = attachedResourceIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`filter-pill ${selected ? 'active' : ''}`}
                      onClick={() =>
                        setAttachedResourceIds((prev) =>
                          selected ? prev.filter((id) => id !== r.id) : [...prev, r.id]
                        )
                      }
                    >
                      {r.title}
                    </button>
                  );
                })}
              </div>
            </label>
          )}

          {assignments.length > 0 && (
            <label>
              Attach Assignments
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                {assignments.map((a) => {
                  const selected = attachedAssignmentIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`filter-pill ${selected ? 'active' : ''}`}
                      onClick={() =>
                        setAttachedAssignmentIds((prev) =>
                          selected ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                        )
                      }
                    >
                      {a.title}
                    </button>
                  );
                })}
              </div>
            </label>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="button"
              className="secondary-btn"
              style={{ flex: 1 }}
              onClick={(e) => {
                setStatus('draft');
                handleSubmit(e);
              }}
              disabled={loading}
            >
              Save Draft (🟡 Hidden)
            </button>
            <button
              type="submit"
              className="primary-btn"
              style={{ flex: 1.5 }}
              onClick={() => setStatus('scheduled')}
              disabled={loading}
            >
              {loading ? 'Publishing...' : 'Publish Session (🔵 Visible)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 2. CREATE RESOURCE MODAL
// -------------------------------------------------------------
export function CreateResourceModal({
  onClose,
  onCreate,
  sessions = [],
}: {
  onClose: () => void;
  onCreate: (data: any) => Promise<void>;
  sessions?: any[];
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'pdf' | 'ppt' | 'doc' | 'image' | 'video' | 'link' | 'code' | 'text'>('pdf');
  const [url, setUrl] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        kind,
        url: url.trim() || `https://devchamber.cloud/resources/${Date.now()}-${kind}`,
        sessionId: sessionId || undefined,
        status,
        isPublished: status === 'published',
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Upload Learning Resource</h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
              Add lecture notes, reference PDFs, slides, documentation, or code snippets.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            Resource Title *
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. STM32 GPIO Reference Manual & Register Map"
              required
            />
          </label>

          <label>
            Resource Type
            <select value={kind} onChange={(e: any) => setKind(e.target.value)}>
              <option value="pdf">📄 PDF Document</option>
              <option value="ppt">📊 PPT Presentation Slides</option>
              <option value="doc">📝 DOC Document</option>
              <option value="code">💻 Code Template / File</option>
              <option value="link">🔗 External Web Link</option>
              <option value="video">🎥 Video Recording</option>
              <option value="image">🖼️ Diagram / Image</option>
              <option value="text">📑 Text Notes</option>
            </select>
          </label>

          <label>
            Resource URL or Attachment Link
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={kind === 'link' ? 'https://docs.stm32.org/gpio' : 'https://cdn.devchamber.cloud/docs/notes.pdf'}
            />
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summary of contents or instructions for students..."
              rows={2}
            />
          </label>

          {sessions.length > 0 && (
            <label>
              Attach to Session (Optional)
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                <option value="">-- No specific session --</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.scheduledDate || 'Upcoming'})
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="button"
              className="secondary-btn"
              style={{ flex: 1 }}
              onClick={(e) => {
                setStatus('draft');
                handleSubmit(e);
              }}
              disabled={loading}
            >
              Save Draft
            </button>
            <button
              type="submit"
              className="primary-btn"
              style={{ flex: 1.5 }}
              onClick={() => setStatus('published')}
              disabled={loading}
            >
              {loading ? 'Publishing...' : 'Publish Resource'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 3. CREATE ASSIGNMENT MODAL
// -------------------------------------------------------------
export function CreateAssignmentModal({
  onClose,
  onCreate,
  resources = [],
}: {
  onClose: () => void;
  onCreate: (data: any) => Promise<void>;
  resources?: any[];
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueAt, setDueAt] = useState('Tomorrow · 11:59 PM');
  const [maxMarks, setMaxMarks] = useState(20);
  const [starterCode, setStarterCode] = useState(
    `# DevChamber Programming Assignment\n# Write your solution below\n\ndef solution(input_data):\n    # TODO: Implement algorithm\n    pass\n\nif __name__ == '__main__':\n    print("Testing solution...")\n`
  );
  const [attachedResourceIds, setAttachedResourceIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim() || description.trim(),
        dueAt,
        maxMarks: Number(maxMarks) || 20,
        starterCode,
        starterFiles: [
          { name: 'main.py', language: 'python', content: starterCode },
          { name: 'README.md', language: 'markdown', content: `# ${title}\n\n${description}\n\n## Instructions\n${instructions || 'Implement the required algorithm and run test cases.'}` },
        ],
        attachedResourceIds,
        status,
        isPublished: status === 'published',
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Create Assignment / Coding Lab</h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
              Assign practical programming tasks with sandbox workspace templates and automated grading.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            Assignment Title *
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement Binary Search & Lower Bound Algorithm"
              required
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label>
              Deadline / Due Date *
              <input
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                placeholder="e.g. 30 September · 11:59 PM"
                required
              />
            </label>
            <label>
              Maximum Marks
              <input
                type="number"
                value={maxMarks}
                onChange={(e) => setMaxMarks(Number(e.target.value))}
                min={1}
                max={100}
                required
              />
            </label>
          </div>

          <label>
            Short Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Write an optimal O(log n) binary search in Python."
            />
          </label>

          <label>
            Detailed Instructions & Specifications
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="1. Handle empty and single-element lists&#10;2. Return -1 if element is absent&#10;3. Must not use Python's built-in bisect."
            />
          </label>

          <label>
            Starter Code Template (loads directly into student workspace)
            <textarea
              value={starterCode}
              onChange={(e) => setStarterCode(e.target.value)}
              rows={5}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}
            />
          </label>

          {resources.length > 0 && (
            <label>
              Attach Reference Resources
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                {resources.map((r) => {
                  const selected = attachedResourceIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`filter-pill ${selected ? 'active' : ''}`}
                      onClick={() =>
                        setAttachedResourceIds((prev) =>
                          selected ? prev.filter((id) => id !== r.id) : [...prev, r.id]
                        )
                      }
                    >
                      {r.title}
                    </button>
                  );
                })}
              </div>
            </label>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="button"
              className="secondary-btn"
              style={{ flex: 1 }}
              onClick={(e) => {
                setStatus('draft');
                handleSubmit(e);
              }}
              disabled={loading}
            >
              Save Draft
            </button>
            <button
              type="submit"
              className="primary-btn"
              style={{ flex: 1.5 }}
              onClick={() => setStatus('published')}
              disabled={loading}
            >
              {loading ? 'Publishing...' : 'Publish Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 4. CREATE ASSESSMENT MODAL
// -------------------------------------------------------------
export function CreateAssessmentModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: any) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'quiz' | 'mcq' | 'coding' | 'timed' | 'practice'>('mcq');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [totalMarks, setTotalMarks] = useState(20);
  const [passingScore, setPassingScore] = useState(10);
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        type,
        durationMinutes: Number(durationMinutes) || 30,
        totalMarks: Number(totalMarks) || 20,
        passingScore: Number(passingScore) || 10,
        attemptsAllowed: Number(attemptsAllowed) || 1,
        status,
        isPublished: status === 'published',
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Create Assessment / Quiz</h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
              Create timed tests, MCQ evaluations, and concept checks with authoritative backend timers.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            Assessment Title *
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. STM32 Fundamentals & Register Quiz"
              required
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            <label>
              Assessment Type
              <select value={type} onChange={(e: any) => setType(e.target.value)}>
                <option value="mcq">MCQ Quiz</option>
                <option value="timed">Timed Test</option>
                <option value="coding">Coding Assessment</option>
                <option value="practice">Practice Quiz</option>
              </select>
            </label>
            <label>
              Duration (Minutes) *
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                min={5}
                max={180}
                required
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <label>
              Total Marks
              <input
                type="number"
                value={totalMarks}
                onChange={(e) => setTotalMarks(Number(e.target.value))}
                min={1}
                required
              />
            </label>
            <label>
              Passing Score
              <input
                type="number"
                value={passingScore}
                onChange={(e) => setPassingScore(Number(e.target.value))}
                min={1}
                required
              />
            </label>
            <label>
              Attempts Allowed
              <input
                type="number"
                value={attemptsAllowed}
                onChange={(e) => setAttemptsAllowed(Number(e.target.value))}
                min={1}
                max={10}
                required
              />
            </label>
          </div>

          <label>
            Instructions / Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain quiz coverage, rules, and guidelines for students..."
              rows={3}
            />
          </label>

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button
              type="button"
              className="secondary-btn"
              style={{ flex: 1 }}
              onClick={(e) => {
                setStatus('draft');
                handleSubmit(e);
              }}
              disabled={loading}
            >
              Save Draft
            </button>
            <button
              type="submit"
              className="primary-btn"
              style={{ flex: 1.5 }}
              onClick={() => setStatus('published')}
              disabled={loading}
            >
              {loading ? 'Publishing...' : 'Publish Assessment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 5. QUESTION BUILDER MODAL (Teacher)
// -------------------------------------------------------------
export function QuestionBuilderModal({
  assessment,
  onClose,
  onAddQuestion,
  onDeleteQuestion,
}: {
  assessment: any;
  onClose: () => void;
  onAddQuestion: (assessmentId: string, questionData: any) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<string[]>([
    'General Purpose Input Output',
    'General Program Input Output',
    'General Peripheral Input Output',
    'None of these',
  ]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [points, setPoints] = useState(1);
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    try {
      await onAddQuestion(assessment.id, {
        prompt: prompt.trim(),
        options: options.filter((o) => o.trim().length > 0),
        answerKey: options[correctIndex] || options[0],
        points: Number(points) || 1,
        explanation: explanation.trim(),
      });
      setPrompt('');
      setExplanation('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionChange = (idx: number, text: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[idx] = text;
      return next;
    });
  };

  const addOption = () => {
    if (options.length < 6) {
      setOptions((prev) => [...prev, `Option ${prev.length + 1}`]);
    }
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) {
      setOptions((prev) => prev.filter((_, i) => i !== idx));
      if (correctIndex >= idx && correctIndex > 0) {
        setCorrectIndex(correctIndex - 1);
      }
    }
  };

  const existingQuestions = assessment.questions || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '800px', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Question Builder — {assessment.title}</h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
              {existingQuestions.length} Questions · Total {assessment.total_marks || assessment.totalMarks || 20} Marks
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', overflowY: 'auto', padding: '4px' }}>
          {/* Left: Add new question form */}
          <form onSubmit={handleAdd} className="modal-form" style={{ padding: 0 }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>+ Add New Question</h3>
            <label>
              Question Prompt *
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. What does GPIO stand for?"
                rows={3}
                required
              />
            </label>

            <label>
              Answer Options (Select the correct radio button)
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                {options.map((opt, idx) => (
                  <div key={idx} className={`option-row ${correctIndex === idx ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="correct-answer"
                      checked={correctIndex === idx}
                      onChange={() => setCorrectIndex(idx)}
                    />
                    <input
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      style={{ border: 'none', background: 'transparent', flex: 1, padding: '4px 0' }}
                      required
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ width: '24px', height: '24px' }}
                        onClick={() => removeOption(idx)}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {options.length < 6 && (
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ marginTop: '8px', fontSize: '12.5px', height: '32px' }}
                  onClick={addOption}
                >
                  <Plus size={14} /> Add Option
                </button>
              )}
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label>
                Points / Marks
                <input
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value))}
                  min={1}
                  required
                />
              </label>
              <label>
                Explanation (Optional)
                <input
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Shown after release"
                />
              </label>
            </div>

            <button className="primary-btn full-btn" type="submit" disabled={loading}>
              <Plus size={16} /> {loading ? 'Adding...' : 'Save Question'}
            </button>
          </form>

          {/* Right: Existing Questions List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>
              Current Questions ({existingQuestions.length})
            </h3>

            {existingQuestions.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '13.5px', textAlign: 'center', margin: 'auto 0' }}>
                No questions created yet. Use the form on the left to add your first question!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
                {existingQuestions.map((q: any, i: number) => (
                  <div key={q.id || i} className="question-block" style={{ margin: 0, padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <b style={{ fontSize: '13.5px', color: '#1e293b' }}>
                        Q{i + 1}. {q.prompt}
                      </b>
                      <button
                        className="icon-btn"
                        style={{ color: '#ef4444' }}
                        onClick={() => onDeleteQuestion(q.id)}
                        title="Delete Question"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      {(q.options || []).map((opt: string, optIdx: number) => {
                        const isCorrect = q.answer_key === opt || q.answerKey === opt;
                        return (
                          <div
                            key={optIdx}
                            style={{
                              fontSize: '12.5px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: isCorrect ? '#ecfdf5' : '#ffffff',
                              border: isCorrect ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                              color: isCorrect ? '#047857' : '#475569',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>{opt}</span>
                            {isCorrect && <CheckCircle2 size={13} color="#10b981" />}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                      {q.points || 1} mark(s)
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 6. STUDENT TIMED QUIZ RUNNER (Authoritative Backend Timer)
// -------------------------------------------------------------
export function QuizRunnerModal({
  assessment,
  onClose,
  onSubmit,
}: {
  assessment: any;
  onClose: () => void;
  onSubmit: (assessmentId: string, answers: Record<string, any>, timeTakenSeconds: number) => Promise<any>;
}) {
  const durationSeconds = (assessment.duration_minutes || assessment.durationMinutes || 30) * 60;
  const [secondsRemaining, setSecondsRemaining] = useState(durationSeconds);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  const questions = assessment.questions || [];
  const currentQ = questions[currentIndex];

  // authoritative countdown timer
  useEffect(() => {
    if (result) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // auto submit on timer expiration
          handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [result]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  };

  const handleSelectOption = (questionId: string, option: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: option,
    }));
  };

  const handleFinalSubmit = async () => {
    if (submitting || result) return;
    setSubmitting(true);
    setShowConfirmSubmit(false);

    try {
      const timeTaken = durationSeconds - secondsRemaining;
      const res = await onSubmit(assessment.id, answers, timeTaken);
      setResult(res);
    } catch (err) {
      console.error('Submit quiz failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = Object.keys(answers).length;

  if (result) {
    return (
      <div className="quiz-runner-modal">
        <div className="quiz-runner-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Award size={24} color="#38bdf8" />
            <span style={{ fontSize: '18px', fontWeight: 700 }}>Assessment Completed</span>
          </div>
          <button className="primary-btn" onClick={onClose}>
            Back to Classroom
          </button>
        </div>

        <div className="quiz-runner-body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '40px', maxWidth: '520px', width: '100%' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 size={40} />
            </div>

            <h2 style={{ margin: '0 0 8px', fontSize: '24px' }}>Submission Recorded!</h2>
            <p style={{ margin: '0 0 24px', color: '#94a3b8', fontSize: '14px' }}>
              Your responses for <b>{assessment.title}</b> have been securely processed on the server.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', background: '#0f172a', padding: '18px', borderRadius: '12px', marginBottom: '24px' }}>
              <div>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Score</span>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#38bdf8' }}>
                  {result.submission?.marks ?? result.marks ?? result.score ?? '—'}/{assessment.total_marks || assessment.totalMarks || 20}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Percentage</span>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>
                  {result.submission?.percentage ?? result.percentage ?? 90}%
                </div>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Status</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
                  {result.submission?.isPassed !== false ? 'Passed ✓' : 'Completed'}
                </div>
              </div>
            </div>

            <button className="primary-btn full-btn" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-runner-modal">
      {/* Quiz Topbar */}
      <div className="quiz-runner-header">
        <div>
          <span style={{ fontSize: '13px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Assessment Session
          </span>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>{assessment.title}</h2>
        </div>

        {/* Autoritative Timer */}
        <div className="quiz-timer-pill">
          <Clock3 size={16} />
          <span>Time Remaining: {formatTime(secondsRemaining)}</span>
        </div>

        <button className="primary-btn" onClick={() => setShowConfirmSubmit(true)} disabled={submitting}>
          Submit Assessment ({answeredCount}/{questions.length})
        </button>
      </div>

      {/* Main Question Body */}
      <div className="quiz-runner-body">
        {/* Navigation Dot Strip */}
        <div className="quiz-nav-strip">
          {questions.map((q: any, i: number) => {
            const isAnswered = Boolean(answers[q.id]);
            const isCurrent = currentIndex === i;
            return (
              <button
                key={q.id || i}
                className={`quiz-nav-dot ${isAnswered ? 'answered' : ''} ${isCurrent ? 'current' : ''}`}
                onClick={() => setCurrentIndex(i)}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {currentQ ? (
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>
                Question {currentIndex + 1} of {questions.length}
              </span>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                {currentQ.points || 1} Mark(s)
              </span>
            </div>

            <h3 style={{ margin: 0, fontSize: '20px', lineHeight: 1.5, color: '#f8fafc' }}>
              {currentQ.prompt}
            </h3>

            {/* Options List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
              {(currentQ.options || []).map((opt: string, optIdx: number) => {
                const selected = answers[currentQ.id] === opt;
                return (
                  <button
                    key={optIdx}
                    type="button"
                    className={`quiz-option-btn ${selected ? 'active' : ''}`}
                    onClick={() => handleSelectOption(currentQ.id, opt)}
                  >
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: selected ? '2px solid #6366f1' : '2px solid #64748b',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: selected ? '#6366f1' : 'transparent',
                        color: selected ? '#ffffff' : '#94a3b8',
                      }}
                    >
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>

            {/* Navigation buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                >
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => setShowConfirmSubmit(true)}
                >
                  Review & Submit <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ color: '#94a3b8', textAlign: 'center', margin: 'auto' }}>
            No questions available for this assessment.
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmSubmit && (
        <div className="modal-backdrop" onClick={() => setShowConfirmSubmit(false)}>
          <div className="modal-card" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Submit Assessment?</h2>
              <button className="icon-btn" onClick={() => setShowConfirmSubmit(false)}>
                <X size={20} />
              </button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>
              You have answered <b>{answeredCount} of {questions.length}</b> questions. Once submitted, your answers will be automatically graded.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="secondary-btn" style={{ flex: 1 }} onClick={() => setShowConfirmSubmit(false)}>
                Keep Working
              </button>
              <button className="primary-btn" style={{ flex: 1 }} onClick={handleFinalSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 7. ASSIGNMENT SUBMISSION REVIEW DRAWER (Teacher)
// -------------------------------------------------------------
export function AssignmentReviewDrawer({
  assignment,
  submissions = [],
  onClose,
  onGrade,
  onOpenWorkspace,
}: {
  assignment: any;
  submissions?: any[];
  onClose: () => void;
  onGrade: (assignmentId: string, studentId: string, marks: number, feedback: string) => Promise<void>;
  onOpenWorkspace?: (workspaceId: string) => void;
}) {
  const [selectedSub, setSelectedSub] = useState<any | null>(submissions[0] || null);
  const [marksInput, setMarksInput] = useState<number>(18);
  const [feedbackInput, setFeedbackInput] = useState('Good implementation! Consider handling edge cases and empty inputs.');
  const [runningCode, setRunningCode] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);

  useEffect(() => {
    if (selectedSub) {
      setMarksInput(selectedSub.marks ?? 18);
      setFeedbackInput(selectedSub.feedback ?? 'Good implementation. Improve edge-case handling.');
      setRunOutput('');
    }
  }, [selectedSub]);

  const handleRunStudentCode = async () => {
    if (!selectedSub?.files || selectedSub.files.length === 0) return;
    const pythonFile = selectedSub.files.find((f: any) => f.name.endsWith('.py')) || selectedSub.files[0];
    if (!pythonFile) return;

    setRunningCode(true);
    try {
      const res = await runPythonCode(pythonFile.content);
      setRunOutput(res.stdout || res.stderr || 'Executed cleanly with no stdout.');
    } catch (err: any) {
      setRunOutput(`Error: ${err.message}`);
    } finally {
      setRunningCode(false);
    }
  };

  const handleSaveGrade = async () => {
    if (!selectedSub) return;
    setSavingGrade(true);
    try {
      await onGrade(assignment.id, selectedSub.student_id || selectedSub.studentId, marksInput, feedbackInput);
      setSelectedSub((prev: any) => ({
        ...prev,
        marks: marksInput,
        feedback: feedbackInput,
        status: 'graded',
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setSavingGrade(false);
    }
  };

  return (
    <div className="submissions-drawer">
      {/* Header */}
      <div className="submissions-drawer-head">
        <div>
          <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            SUBMISSION REVIEW
          </span>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#1e293b' }}>{assignment.title}</h2>
        </div>
        <button className="icon-btn" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', flex: 1, overflow: 'hidden' }}>
        {/* Left: Students Submissions list */}
        <div style={{ borderRight: '1px solid #e2e8f0', background: '#f8fafc', overflowY: 'auto', padding: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '8px' }}>
            STUDENTS ({submissions.length})
          </span>

          {submissions.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#94a3b8', padding: '20px 0', textAlign: 'center' }}>
              No submissions yet.
            </div>
          ) : (
            submissions.map((sub: any) => {
              const isSelected = selectedSub?.id === sub.id || selectedSub?.student_id === sub.student_id;
              const isGraded = sub.status === 'graded' || sub.marks !== undefined;
              return (
                <div
                  key={sub.id || sub.student_id}
                  onClick={() => setSelectedSub(sub)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: isSelected ? '#eef2ff' : '#ffffff',
                    border: isSelected ? '1px solid #818cf8' : '1px solid #e2e8f0',
                    cursor: 'pointer',
                    marginBottom: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ fontSize: '13.5px', color: '#1e293b' }}>{sub.student_name || sub.studentName || 'Student'}</b>
                    <span className={`learning-badge ${isGraded ? 'badge-graded' : 'badge-submitted'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                      {isGraded ? `${sub.marks}/${assignment.max_marks || assignment.maxMarks || 20}` : 'Submitted'}
                    </span>
                  </div>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                    {new Date(sub.submitted_at || sub.submittedAt || Date.now()).toLocaleDateString()}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Code Inspector, Python Runner & Grading panel */}
        {selectedSub ? (
          <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '20px', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>
                  {selectedSub.student_name || selectedSub.studentName || 'Student'}'s Solution
                </h3>
                <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                  Workspace: {selectedSub.workspace_id || 'Personal Sandbox'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {onOpenWorkspace && selectedSub.workspace_id && (
                  <button
                    className="secondary-btn"
                    style={{ fontSize: '12.5px', height: '32px' }}
                    onClick={() => onOpenWorkspace(selectedSub.workspace_id)}
                  >
                    Open Live Workspace
                  </button>
                )}
                <button
                  className="primary-btn"
                  style={{ fontSize: '12.5px', height: '32px' }}
                  onClick={handleRunStudentCode}
                  disabled={runningCode}
                >
                  <Play size={13} /> {runningCode ? 'Running...' : 'Run Code'}
                </button>
              </div>
            </div>

            {/* Code Snapshot Display */}
            <div style={{ background: '#0f172a', borderRadius: '10px', padding: '14px', color: '#f8fafc', maxHeight: '240px', overflowY: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', lineHeight: 1.5 }}>
              <pre style={{ margin: 0 }}>
                {selectedSub.files?.[0]?.content || selectedSub.content || '# No code files submitted yet.'}
              </pre>
            </div>

            {/* Run output if executed */}
            {runOutput && (
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#38bdf8', fontFamily: 'monospace' }}>
                <b>Execution Output:</b>
                <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{runOutput}</pre>
              </div>
            )}

            {/* Grading Form */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#1e293b' }}>Enter Grade & Instructor Feedback</h4>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  Marks:
                </label>
                <input
                  type="number"
                  value={marksInput}
                  onChange={(e) => setMarksInput(Number(e.target.value))}
                  min={0}
                  max={assignment.max_marks || assignment.maxMarks || 20}
                  style={{ width: '80px', height: '36px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 10px', fontWeight: 700 }}
                />
                <span style={{ fontSize: '14px', color: '#64748b' }}>
                  / {assignment.max_marks || assignment.maxMarks || 20}
                </span>
              </div>

              <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                Feedback for Student:
                <textarea
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  rows={3}
                  placeholder="Provide constructive guidance and hints..."
                  style={{ width: '100%', marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '8px', fontSize: '13px' }}
                />
              </label>

              <button
                className="primary-btn full-btn"
                onClick={handleSaveGrade}
                disabled={savingGrade}
              >
                {savingGrade ? 'Saving...' : 'Save Grade & Return to Student'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: '14px', display: 'grid', placeItems: 'center', height: '100%' }}>
            Select a student submission to review.
          </div>
        )}
      </div>
    </div>
  );
}
