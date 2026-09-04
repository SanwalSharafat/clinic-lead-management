import { useState } from 'react';
import { Search, Loader2, AlertCircle, ChevronRight, Trophy, XCircle } from 'lucide-react';
import { usePatients, usePatient, usePatientActions } from '../hooks/usePatients';
import type { PatientStatus, ScoreTier } from '../types';

const statusOrder: PatientStatus[] = [
  'NEW_LEAD', 'INCOMPLETE', 'HUMAN_REVIEW', 'NURTURING',
  'QUALIFIED', 'BOOKED_VISIT', 'WON', 'LOST', 'OPTED_OUT',
];

const statusLabel: Record<PatientStatus, string> = {
  NEW_LEAD: 'New Lead',
  INCOMPLETE: 'Incomplete',
  HUMAN_REVIEW: 'Human Review',
  NURTURING: 'Nurturing',
  QUALIFIED: 'Qualified',
  BOOKED_VISIT: 'Booked',
  WON: 'Won',
  LOST: 'Lost',
  OPTED_OUT: 'Opted Out',
};

const tierColor: Record<ScoreTier, string> = {
  HIGH: 'border-l-danger text-danger',
  MEDIUM: 'border-l-warning text-warning',
  LOW: 'border-l-accent text-accent',
};

function PatientDetail({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { data: patient, isLoading } = usePatient(patientId);
  const { markWon, markLost } = usePatientActions();
  const [lostReason, setLostReason] = useState('');
  const [showLostForm, setShowLostForm] = useState(false);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/20" onClick={onClose} />
        <div className="relative w-[480px] bg-surface border-l border-border h-full flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
        </div>
      </div>
    );
  }

  if (!patient) return null;

  const canWin = patient.status === 'BOOKED_VISIT' || patient.status === 'QUALIFIED';
  const canLose = patient.status !== 'WON' && patient.status !== 'LOST' && patient.status !== 'OPTED_OUT';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-[480px] bg-surface border-l border-border h-full flex flex-col shadow-xl">
        <div className="h-14 px-5 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-sm font-medium text-text-primary">{patient.name}</h2>
          <button onClick={onClose} className="p-1.5 rounded-btn hover:bg-bg-page text-text-muted hover:text-text-primary">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-card bg-bg-page border border-border">
                <p className="text-[11px] text-text-muted uppercase">Phone</p>
                <p className="text-sm text-text-primary mt-0.5">{patient.phone}</p>
              </div>
              <div className="p-3 rounded-card bg-bg-page border border-border">
                <p className="text-[11px] text-text-muted uppercase">Status</p>
                <p className="text-sm text-text-primary mt-0.5">{statusLabel[patient.status]}</p>
              </div>
              <div className="p-3 rounded-card bg-bg-page border border-border">
                <p className="text-[11px] text-text-muted uppercase">Score</p>
                <p className="text-sm text-text-primary mt-0.5">{patient.score_tier} — {patient.score}</p>
              </div>
              <div className="p-3 rounded-card bg-bg-page border border-border">
                <p className="text-[11px] text-text-muted uppercase">Last updated</p>
                <p className="text-sm text-text-primary mt-0.5">
                  {new Date(patient.last_updated).toLocaleDateString()}
                </p>
              </div>
            </div>

            {patient.reason_for_visit && (
              <div className="p-3 rounded-card bg-bg-page border border-border">
                <p className="text-[11px] text-text-muted uppercase">Reason for visit</p>
                <p className="text-sm text-text-primary mt-0.5">{patient.reason_for_visit}</p>
              </div>
            )}

            {patient.conversation && (
              <div>
                <p className="text-[11px] text-text-muted uppercase mb-2">Conversation</p>
                <div className="space-y-2">
                  {patient.conversation.map(msg => (
                    <div key={msg.id} className={`text-sm p-2.5 rounded-card ${msg.role === 'user' ? 'bg-bg-page border border-border' : 'bg-accent-muted'}`}>
                      <span className="text-[10px] text-text-muted uppercase font-medium">{msg.role}</span>
                      <p className="text-text-primary mt-0.5">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border shrink-0 bg-bg-page/50">
          {showLostForm && (
            <div className="mb-3">
              <label className="text-[11px] text-danger uppercase tracking-wide">Reason for marking lost *</label>
              <input
                type="text"
                value={lostReason}
                onChange={e => setLostReason(e.target.value)}
                placeholder="e.g. Chose another clinic, not interested, etc."
                className="mt-1 w-full text-sm bg-surface border border-danger/30 rounded-btn px-2 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-danger"
              />
            </div>
          )}
          <div className="flex gap-2">
            {canWin && (
              <button
                onClick={() => markWon.mutate(patient.id, { onSuccess: onClose })}
                disabled={markWon.isPending}
                className="flex-1 px-3 py-2 text-xs font-medium rounded-btn bg-accent text-white hover:bg-accent-hover disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {markWon.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trophy className="w-3 h-3" />}
                Mark Won
              </button>
            )}
            {canLose && (
              <button
                onClick={() => {
                  if (showLostForm && lostReason.trim()) {
                    markLost.mutate({ id: patient.id, reason: lostReason }, { onSuccess: onClose });
                  } else {
                    setShowLostForm(true);
                  }
                }}
                disabled={markLost.isPending || (showLostForm && !lostReason.trim())}
                className="flex-1 px-3 py-2 text-xs font-medium rounded-btn bg-danger-bg text-danger hover:bg-danger/10 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {markLost.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                {showLostForm ? 'Confirm Lost' : 'Mark Lost'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientsSection() {
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = usePatients({ status: filter || undefined, limit: 100 });

  const patients = data?.patients || [];

  return (
    <div className="px-6 pt-5 pb-6">
      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="w-3.5 h-3.5 text-text-muted" />
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="text-xs bg-bg-page border border-border rounded-btn px-3 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">All statuses</option>
              {statusOrder.map(s => (
                <option key={s} value={s}>{statusLabel[s]}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-text-muted">{patients.length} patients</span>
        </div>

        {isLoading && (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="w-28 h-3 bg-bg-page rounded animate-pulse" />
                <div className="w-24 h-3 bg-bg-page rounded animate-pulse" />
                <div className="w-20 h-3 bg-bg-page rounded animate-pulse" />
                <div className="flex-1" />
                <div className="w-16 h-3 bg-bg-page rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="p-6 text-center">
            <AlertCircle className="w-5 h-5 text-danger mx-auto mb-2" />
            <p className="text-sm text-text-secondary">Failed to load patients</p>
            <button onClick={() => refetch()} className="mt-3 px-3 py-1.5 text-xs font-medium rounded-btn bg-accent text-white hover:bg-accent-hover">
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="divide-y divide-border">
            {patients.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="px-4 py-3 flex items-center cursor-pointer hover:bg-bg-page transition-colors border-l-4 border-transparent hover:border-l-accent"
              >
                <div className="w-32 truncate">
                  <p className="text-sm font-medium text-text-primary">{p.name}</p>
                </div>
                <div className="w-32 text-xs text-text-secondary truncate">{p.phone}</div>
                <div className="w-24">
                  <span className={`
                    text-[11px] font-medium px-1.5 py-0.5 rounded border-l-2
                    ${p.status === 'WON' ? 'border-l-accent bg-accent-muted text-accent' :
                      p.status === 'LOST' || p.status === 'OPTED_OUT' ? 'border-l-danger bg-danger-bg text-danger' :
                      p.status === 'BOOKED_VISIT' ? 'border-l-accent bg-accent-muted text-accent' :
                      'border-l-warning bg-warning-bg text-warning'}
                  `}>
                    {statusLabel[p.status]}
                  </span>
                </div>
                <div className={`w-20 text-xs font-medium border-l-2 pl-2 ${tierColor[p.score_tier]}`}>
                  {p.score_tier} — {p.score}
                </div>
                <div className="flex-1 text-xs text-text-muted text-right">
                  {new Date(p.last_updated).toLocaleDateString()}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-text-muted ml-2" />
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedId && <PatientDetail patientId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
