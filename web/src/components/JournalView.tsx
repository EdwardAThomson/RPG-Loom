import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchJournal, type JournalEntry } from '../services/journal';
import { getAuthState, onAuthChange, type AuthState } from '../services/auth';
import { humanize } from '../ui/labels';

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
            <section className="card">
                <h2>Journal</h2>
                <p className="prose">
                    Sign in under Settings → Cloud save to keep a journal of completed quests,
                    rumours and other moments. Entries follow you across devices.
                </p>
            </section>
        );
    }

    return (
        <section className="card">
            <div className="panel-head">
                <h2>Journal</h2>
                <button type="button" className="btn-ghost" onClick={load} disabled={loading}>
                    <RefreshCw size={12} aria-hidden /> {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {error && <div className="callout callout-warn">{error}</div>}

            {entries === null && !loading && <p className="empty">No journal data yet.</p>}

            {entries !== null && entries.length === 0 && (
                <p className="empty">Your journal is empty. Complete a quest and a new entry will be recorded.</p>
            )}

            {entries !== null && entries.length > 0 && (
                <div className="list journal">
                    {entries.map(entry => <EntryRow key={entry.id} entry={entry} />)}
                </div>
            )}
        </section>
    );
}

function EntryRow({ entry }: { entry: JournalEntry }) {
    const when = new Date(entry.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const title = entry.block.title ?? humanize(entry.type);
    const lines = entry.block.lines ?? [];

    return (
        <article className="journal-entry">
            <header>
                <h3>{title}</h3>
                <span className="chip chip-muted">{humanize(entry.type)}</span>
                <time className="small faint">{when}</time>
            </header>
            {lines.map((line, i) => <p key={i} className="quote">{line}</p>)}
        </article>
    );
}
