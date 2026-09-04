import { useState, useRef } from 'react';
import {
  X, CheckCircle, AlertTriangle, AlertCircle, Loader2,
  User, Bot, FileText, BarChart3, MessageSquare,
} from 'lucide-react';
import { useHumanReview, useReviewActions } from '../hooks/useHumanReviews';
import type { ScoreTier } from '../types';

interface ReviewDetailProps {
  reviewId: string | null;
  onClose: () => void;
}

const tierConfig: Record<ScoreTier, { icon: React.ElementType; color: string; bg: string }> = {
  HIGH: { icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger-bg' },
  MEDIUM: { icon: AlertCircle, color: 'text-warning', bg: 'bg-warning-bg' },
  LOW: { icon: CheckCircle, color: 'text-accent', bg: 'bg-accent-muted' },
};

export default function ReviewDetail({ reviewId, onClose }: ReviewDetailProps) {
  const { data: review, isLoading } = useHumanReview(reviewId || '');
  const { approve, correct, escalate, reject } = useReviewActions();
  const [activeTab, setActiveTab] = useState<'conversation' | 'fields' | 'scores'>('conversation');
  const [notes, setNotes] = useState('');
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [correctedFields, setCorrectedFields] = useState<Record<string, string>>({});
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const handleApprove = () => {
    if (!review) return;
    approve.mutate({ id: review.id, body: { reviewer_id: 'staff-1', notes: notes || undefined } }, {
      onSuccess: onClose,
    });
  };

  const handleCorrect = () => {
    if (!review) return;
    if (correcting) {
      correct.mutate({
        id: review.id,
        body: { reviewer_id: 'staff-1', notes: notes || undefined, corrected_fields: correctedFields },
      }, { onSuccess: onClose });
    } else {
      setCorrecting(true);
      const init: Record<string, string> = {};
      review.extracted_fields?.forEach(f => { init[f.key] = f.value; });
      setCorrectedFields(init);
    }
  };

  const handleEscalate = () => {
    if (!review) return;
    escalate.mutate({ id: review.id, body: { reviewer_id: 'staff-1', notes: notes || undefined } }, {
      onSuccess: onClose,
    });
  };

  const handleReject = () => {
    if (!review) return;
    if (!showRejectConfirm) {
      setShowRejectConfirm(true);
      return;
    }
    if (!rejectReason.trim()) return;
    reject.mutate({
      id: review.id,
      body: { reviewer_id: 'staff-1', notes: notes || '', reason: rejectReason },
    }, { onSuccess: onClose });
  };

  if (!reviewId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-[520px] max-w-full bg-surface border-l border-border h-full flex flex-col shadow-xl">
        {/* Header */}
        <div className="h-14 px-5 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-medium text-text-primary">
              {isLoading ? 'Loading...' : (review?.patient_name ?? 'Unknown patient')}
            </h2>
            {!isLoading && review && (
              <p className="text-xs text-text-muted">{review.patient_phone}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-btn hover:bg-bg-page text-text-muted hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
          </div>
        ) : !review ? (
          <div className="flex-1 flex items-center justify-center text-text-secondary text-sm">
            Review not found
          </div>
        ) : (
          <>
            {/* Score badge */}
            <div className="px-5 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                {(() => {
                  const cfg = tierConfig[review.score_tier] ?? tierConfig.LOW;
                  const Icon = cfg.icon;
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {review.score_tier} — {review.score}
                    </span>
                  );
                })()}
                <span className="text-xs text-text-muted">{review.reason_for_visit}</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-5 border-b border-border shrink-0">
              <div className="flex gap-4">
                {[
                  { key: 'conversation' as const, label: 'Conversation', icon: MessageSquare },
                  { key: 'fields' as const, label: 'Extracted Fields', icon: FileText },
                  { key: 'scores' as const, label: 'Score Breakdown', icon: BarChart3 },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`
                      flex items-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors
                      ${activeTab === tab.key
                        ? 'border-accent text-accent'
                        : 'border-transparent text-text-muted hover:text-text-secondary'}
                    `}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {activeTab === 'conversation' && (
                <div className="space-y-3">
                  {review.conversation?.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] flex gap-2 ${msg.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                        <div className={`
                          w-6 h-6 rounded-full shrink-0 flex items-center justify-center
                          ${msg.role === 'user' ? 'bg-bg-page text-text-muted' : 'bg-accent-muted text-accent'}
                        `}>
                          {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                        </div>
                        <div className={`
                          px-3 py-2 rounded-card text-sm leading-relaxed
                          ${msg.role === 'user'
                            ? 'bg-bg-page text-text-primary border border-border'
                            : 'bg-accent-muted text-text-primary'}
                        `}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'fields' && (
                <div className="space-y-2">
                  {review.extracted_fields?.map(field => (
                    <div key={field.key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      {correcting ? (
                        <div className="flex-1">
                          <label className="text-[11px] text-text-muted uppercase tracking-wide">{field.key}</label>
                          <input
                            type="text"
                            value={correctedFields[field.key] || ''}
                            onChange={e => setCorrectedFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="mt-1 w-full text-sm bg-bg-page border border-border rounded-btn px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className="text-[11px] text-text-muted uppercase tracking-wide">{field.key}</p>
                            <p className="text-sm text-text-primary">{field.value}</p>
                          </div>
                          <span className={`text-[11px] font-medium ${field.confidence > 0.8 ? 'text-accent' : field.confidence > 0.5 ? 'text-warning' : 'text-danger'}`}>
                            {(field.confidence * 100).toFixed(0)}%
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  {correcting && (
                    <button
                      onClick={() => setCorrecting(false)}
                      className="text-xs text-text-muted hover:text-text-primary underline"
                    >
                      Cancel editing
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'scores' && (
                <div className="space-y-3">
                  {review.score_breakdown?.map(item => (
                    <div key={item.rule} className="flex items-start justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{item.rule}</p>
                        <p className="text-xs text-text-muted">{item.description}</p>
                      </div>
                      <span className="text-sm font-medium text-accent">+{item.points}</span>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">Total score</span>
                    <span className="text-lg font-medium text-accent">{review.score}</span>
                  </div>
                  {review.confidence !== undefined && (
                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-sm text-text-secondary">AI confidence</span>
                      <span className={`text-sm font-medium ${review.confidence > 0.7 ? 'text-accent' : review.confidence > 0.4 ? 'text-warning' : 'text-danger'}`}>
                        {(review.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-border shrink-0 bg-bg-page/50">
              <div className="mb-3">
                <label className="text-[11px] text-text-muted uppercase tracking-wide">Notes (optional for Approve, required for others)</label>
                <textarea
                  ref={notesRef}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="mt-1 w-full text-sm bg-surface border border-border rounded-btn px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                />
              </div>

              {showRejectConfirm && (
                <div className="mb-3 p-3 rounded-card bg-danger-bg border border-danger/20">
                  <label className="text-[11px] text-danger uppercase tracking-wide">Rejection reason *</label>
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Why is this lead being rejected?"
                    className="mt-1 w-full text-sm bg-surface border border-danger/30 rounded-btn px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-danger"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleApprove}
                  disabled={approve.isPending}
                  className="flex-1 px-3 py-2 text-xs font-medium rounded-btn bg-accent text-white hover:bg-accent-hover disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {approve.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                  Approve
                </button>
                <button
                  onClick={handleCorrect}
                  disabled={correct.isPending}
                  className="flex-1 px-3 py-2 text-xs font-medium rounded-btn border border-border text-text-secondary hover:bg-bg-page disabled:opacity-50"
                >
                  {correct.isPending ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                  {correcting ? 'Save Correction' : 'Correct'}
                </button>
                <button
                  onClick={handleEscalate}
                  disabled={escalate.isPending}
                  className="flex-1 px-3 py-2 text-xs font-medium rounded-btn border border-border text-text-secondary hover:bg-bg-page disabled:opacity-50"
                >
                  {escalate.isPending ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                  Escalate
                </button>
                <button
                  onClick={handleReject}
                  disabled={reject.isPending || (showRejectConfirm && !rejectReason.trim())}
                  className="flex-1 px-3 py-2 text-xs font-medium rounded-btn bg-danger-bg text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  {reject.isPending ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                  {showRejectConfirm ? 'Confirm Reject' : 'Reject'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
