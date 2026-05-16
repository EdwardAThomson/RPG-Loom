import { useEffect, useState } from 'react';
import { fetchJournal, type JournalEntry } from '../services/journal';
import { getAuthState, onAuthChange, type AuthState } from '../services/auth';

const CLOUD_SLOT = 0;

export function JournalView() {
    const [auth, setAuth] = useState<AuthState>(getAuthState);
    const [entries, setEntries] = useState<JournalEntry[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => onAuthChange(setAuth), []);

    const load = async () => {
        if (auth.status !== 'signed-in') {
            setEntries(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const list = await fetchJournal(CLOUD_SLOT, { limit: 100 });
            setEntries(list ?? []);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };

    // Initial load and reload on auth changes.
    useEffect(() => {
        void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.status]);

    if (auth.status !== 'signed-in') {
        return (
            <div className="card">
                <h2 style={{ marginTop: 0 }}>Journal</h2>
                <p style={{ color: '#aaa' }}>
                    Sign in (Settings → Cloud Save) to keep a journal of completed quests,
                    rumors, and other narrative moments. Entries persist across devices.
                </p>
            </div>
        );
    }

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ margin: 0 }}>Journal</h2>
                <button
                    onClick={load}
                    disabled={loading}
                    style={{
                        padding: '0.4rem 0.75rem',
                        background: '#2a2a2a',
                        border: '1px solid #555',
                        borderRadius: 4,
                        color: '#fff',
                        cursor: loading ? 'wait' : 'pointer',
                        fontSize: '0.85rem'
                    }}
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {error && (
                <div style={{
                    padding: '0.6rem 0.75rem',
                    background: 'rgba(212, 68, 68, 0.1)',
                    border: '1px solid #d44',
                    borderRadius: 4,
                    color: '#d44',
                    fontSize: '0.85rem',
                    marginBottom: '0.75rem'
                }}>
                    {error}
                </div>
            )}

            {entries === null && !loading && (
                <p style={{ color: '#888' }}>No journal data yet.</p>
            )}

            {entries !== null && entries.length === 0 && (
                <p style={{ color: '#888', fontStyle: 'italic' }}>
                    Your journal is empty. Complete a quest and a new entry will be
                    recorded.
                </p>
            )}

            {entries !== null && entries.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {entries.map(entry => (
                        <EntryRow key={entry.id} entry={entry} />
                    ))}
                </div>
            )}
        </div>
    );
}

function EntryRow({ entry }: { entry: JournalEntry }) {
    const when = new Date(entry.createdAt).toLocaleString();
    const title = entry.block.title ?? prettifyType(entry.type);
    const lines = entry.block.lines ?? [];

    return (
        <div style={{
            background: '#181818',
            border: '1px solid #2a2a2a',
            borderRadius: 4,
            padding: '0.6rem 0.75rem'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <span style={{ color: '#ddd', fontWeight: 500 }}>{title}</span>
                    <TypeBadge type={entry.type} />
                </div>
                <span style={{ color: '#666', fontSize: '0.75rem' }}>{when}</span>
            </div>
            {lines.map((line, i) => (
                <div key={i} style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.4 }}>{line}</div>
            ))}
        </div>
    );
}

function TypeBadge({ type }: { type: string }) {
    return (
        <span style={{
            fontSize: '0.7rem',
            padding: '1px 6px',
            background: '#2a2a2a',
            borderRadius: 3,
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
        }}>
            {type.replace(/_/g, ' ')}
        </span>
    );
}

function prettifyType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
