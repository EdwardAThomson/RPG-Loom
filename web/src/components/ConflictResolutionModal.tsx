import type { PendingConflict } from '../hooks/useGameEngine';

interface Props {
    conflict: PendingConflict;
    onKeepLocal: () => void;
    onUseServer: () => void;
}

function snapshot(state: { player?: any; updatedAtMs?: number }) {
    const p = state.player ?? {};
    return {
        name: p.name ?? 'Unknown',
        level: p.level ?? 0,
        combatLevel: p.combatLevel ?? 0,
        gold: p.gold ?? 0,
        updated: state.updatedAtMs ? new Date(state.updatedAtMs).toLocaleString() : '—'
    };
}

export function ConflictResolutionModal({ conflict, onKeepLocal, onUseServer }: Props) {
    const local = snapshot(conflict.local);
    const server = snapshot(conflict.server.state as any);

    return (
        <div
            className="modal-overlay"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.85)', zIndex: 2200,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
        >
            <div
                className="card"
                style={{ maxWidth: 560, width: '92%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #b45309' }}
            >
                <h2 style={{ marginTop: 0 }}>Save conflict</h2>
                <p style={{ color: '#ccc' }}>
                    The server has a save that's newer than yours, or another device wrote
                    while this one was offline. Pick which one to keep — the other will be
                    overwritten.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <Column title="This device" data={local} accent="#4a8" />
                    <Column title={`Server (gen ${conflict.server.generation})`} data={server} accent="#a84" />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={onKeepLocal}
                        style={btnStyle('#4a8')}
                    >
                        Keep this device
                    </button>
                    <button
                        onClick={onUseServer}
                        style={btnStyle('#a84')}
                    >
                        Use server's version
                    </button>
                </div>

                <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '1rem', marginBottom: 0 }}>
                    "Keep this device" overwrites the server. "Use server's version" replaces
                    your current local progress with the server's. There is no undo.
                </p>
            </div>
        </div>
    );
}

function Column({ title, data, accent }: {
    title: string;
    data: ReturnType<typeof snapshot>;
    accent: string;
}) {
    return (
        <div style={{ background: '#1a1a1a', padding: '0.75rem', borderRadius: 4, border: `1px solid ${accent}` }}>
            <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                {title}
            </div>
            <Row label="Name" value={data.name} />
            <Row label="Total level" value={String(data.level)} />
            <Row label="Combat level" value={String(data.combatLevel)} />
            <Row label="Gold" value={String(data.gold)} />
            <Row label="Last save" value={data.updated} />
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.85rem' }}>
            <span style={{ color: '#888' }}>{label}</span>
            <span style={{ color: '#ddd' }}>{value}</span>
        </div>
    );
}

function btnStyle(accent: string): React.CSSProperties {
    return {
        flex: 1,
        padding: '0.6rem',
        background: '#2a2a2a',
        color: '#fff',
        border: `1px solid ${accent}`,
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: '0.95rem'
    };
}
