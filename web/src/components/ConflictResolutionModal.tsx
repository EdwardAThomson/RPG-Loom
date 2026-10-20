import type { PendingConflict } from '../hooks/useGameEngine';
import { Modal } from './Modal';

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
        <Modal title="Save conflict" zIndex={2200}>
            <p className="prose">
                The server has a save that's newer than yours, or another device wrote
                while this one was offline. Pick which one to keep — the other will be
                overwritten.
            </p>

            <div className="stat-grid">
                <Column title="This device" data={local} />
                <Column title={`Server (gen ${conflict.server.generation})`} data={server} />
            </div>

            <div className="btn-row section">
                <button type="button" className="primary" onClick={onKeepLocal}>
                    Keep this device
                </button>
                <button type="button" onClick={onUseServer}>
                    Use server's version
                </button>
            </div>

            <p className="hint">
                "Keep this device" overwrites the server. "Use server's version" replaces
                your current local progress with the server's. There is no undo.
            </p>
        </Modal>
    );
}

function Column({ title, data }: { title: string; data: ReturnType<typeof snapshot> }) {
    return (
        <div className="callout">
            <div className="hud-label">{title}</div>
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
        <div className="kv">
            <span className="k">{label}</span>
            <span className="v">{value}</span>
        </div>
    );
}
