import { useState } from 'react';
import {
  BookOpen,
  Plus,
  FileText,
  FileCode2,
  Link2,
  Video,
  Image as ImageIcon,
  Download,
  ExternalLink,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
} from 'lucide-react';

interface ResourceItem {
  id: string;
  classroom_id?: string;
  classroomId?: string;
  title: string;
  description?: string;
  kind: 'pdf' | 'ppt' | 'doc' | 'image' | 'video' | 'link' | 'code' | 'text' | 'file';
  url: string;
  session_id?: string;
  sessionId?: string;
  status: 'draft' | 'published';
  is_published?: boolean;
  isPublished?: boolean;
  author_name?: string;
  authorName?: string;
  downloads_count?: number;
  downloadsCount?: number;
  created_at?: string;
  createdAt?: string;
}

export function ResourcesView({
  resources = [],
  role,
  onOpenCreateModal,
  onToggleStatus,
  onDeleteResource,
  sessions = [],
}: {
  resources: ResourceItem[];
  role: 'Teacher' | 'Student';
  onOpenCreateModal: () => void;
  onToggleStatus: (resourceId: string, newStatus: 'draft' | 'published') => void;
  onDeleteResource: (resourceId: string) => void;
  sessions?: any[];
}) {
  const [kindFilter, setKindFilter] = useState<string>('all');

  const filteredResources = resources.filter((r) => {
    // Hide drafts from students
    if (role === 'Student' && r.status === 'draft') return false;
    if (kindFilter === 'all') return true;
    return r.kind === kindFilter;
  });

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case 'pdf':
      case 'doc':
      case 'text':
        return <FileText size={20} />;
      case 'code':
        return <FileCode2 size={20} />;
      case 'link':
        return <Link2 size={20} />;
      case 'video':
        return <Video size={20} />;
      case 'image':
        return <ImageIcon size={20} />;
      default:
        return <BookOpen size={20} />;
    }
  };

  const getKindColor = (kind: string) => {
    switch (kind) {
      case 'pdf':
        return { bg: '#fee2e2', color: '#b91c1c' };
      case 'ppt':
        return { bg: '#ffedd5', color: '#c2410c' };
      case 'code':
        return { bg: '#e0e7ff', color: '#4338ca' };
      case 'video':
        return { bg: '#fae8ff', color: '#86198f' };
      case 'link':
        return { bg: '#e0f2fe', color: '#0369a1' };
      default:
        return { bg: '#f1f5f9', color: '#475569' };
    }
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div className="generic-head">
        <div>
          <div className="date-label">CLASSROOM MATERIALS & REFERENCES</div>
          <h1>
            Learning Resources<span className="heading-period">.</span>
          </h1>
          <p>
            Curated lecture slides, reference PDFs, algorithm notes, and official documentation.
          </p>
        </div>

        {role === 'Teacher' && (
          <button className="primary-btn" onClick={onOpenCreateModal}>
            <Plus size={16} /> Add Resource
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`filter-pill ${kindFilter === 'all' ? 'active' : ''}`}
          onClick={() => setKindFilter('all')}
        >
          All Resources ({resources.length})
        </button>
        <button
          className={`filter-pill ${kindFilter === 'pdf' ? 'active' : ''}`}
          onClick={() => setKindFilter('pdf')}
        >
          📄 PDF
        </button>
        <button
          className={`filter-pill ${kindFilter === 'ppt' ? 'active' : ''}`}
          onClick={() => setKindFilter('ppt')}
        >
          📊 PPT Slides
        </button>
        <button
          className={`filter-pill ${kindFilter === 'code' ? 'active' : ''}`}
          onClick={() => setKindFilter('code')}
        >
          💻 Code
        </button>
        <button
          className={`filter-pill ${kindFilter === 'link' ? 'active' : ''}`}
          onClick={() => setKindFilter('link')}
        >
          🔗 Web Links
        </button>
        <button
          className={`filter-pill ${kindFilter === 'video' ? 'active' : ''}`}
          onClick={() => setKindFilter('video')}
        >
          🎥 Videos
        </button>
      </div>

      {/* Resource Cards Grid */}
      {filteredResources.length === 0 ? (
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
            <BookOpen size={28} />
          </div>
          <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '18px' }}>
            No resources yet
          </h3>
          <p style={{ margin: '0 auto 18px', maxWidth: '380px', fontSize: '14px' }}>
            {role === 'Teacher'
              ? 'Upload your first lecture notes, PDF guides, or documentation links for students.'
              : 'Your instructor hasn’t published any learning materials yet.'}
          </p>
          {role === 'Teacher' && (
            <button className="primary-btn" onClick={onOpenCreateModal}>
              <Plus size={16} /> Add Resource
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {filteredResources.map((r) => {
            const style = getKindColor(r.kind);
            const attachedSession = sessions.find((s) => s.id === (r.session_id || r.sessionId));
            const isDraft = r.status === 'draft';

            return (
              <div key={r.id} className="learning-card">
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: style.bg,
                      color: style.color,
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {getKindIcon(r.kind)}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: style.color, textTransform: 'uppercase' }}>
                        {r.kind.toUpperCase()} DOCUMENT
                      </span>
                      {role === 'Teacher' && (
                        <span className={`learning-badge ${isDraft ? 'badge-draft' : 'badge-completed'}`} style={{ fontSize: '10px', padding: '2px 8px' }}>
                          {isDraft ? 'Draft' : 'Published'}
                        </span>
                      )}
                    </div>

                    <h3 style={{ margin: '4px 0', fontSize: '16px', color: '#1e293b' }}>
                      {r.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.4 }}>
                      {r.description || 'Reference material for classroom practice.'}
                    </p>

                    {attachedSession && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        <span>Attached to: <b>{attachedSession.title}</b></span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="learning-card-footer" style={{ marginTop: '14px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    By {r.author_name || r.authorName || 'Instructor'}
                  </span>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {role === 'Teacher' && (
                      <>
                        <button
                          className="secondary-btn"
                          style={{ height: '32px', padding: '0 10px', fontSize: '12px' }}
                          onClick={() => onToggleStatus(r.id, isDraft ? 'published' : 'draft')}
                          title={isDraft ? 'Publish to students' : 'Hide as draft'}
                        >
                          {isDraft ? <><Eye size={13} /> Publish</> : <><EyeOff size={13} /> Unpublish</>}
                        </button>
                        <button
                          className="icon-btn"
                          style={{ color: '#ef4444' }}
                          onClick={() => onDeleteResource(r.id)}
                          title="Delete Resource"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}

                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="primary-btn"
                      style={{ height: '32px', padding: '0 12px', fontSize: '12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      {r.kind === 'link' ? <ExternalLink size={13} /> : <Download size={13} />}
                      {r.kind === 'link' ? 'Open Link' : 'Download'}
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
