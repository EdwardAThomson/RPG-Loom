import { useEffect, useState } from 'react';
import { getAuthState, onAuthChange, signInDev, signOut, type AuthState } from '../services/auth';
import { isGatewayAvailable, onGatewayStatusChange } from '../services/gateway';
import type { CloudSyncStatus } from '../hooks/useGameEngine';

interface Props {
    cloudStatus: CloudSyncStatus;
    onSyncNow: () => Promise<void>;
}

const STATUS_LABEL: Record<CloudSyncStatus, string> = {
    idle: 'Idle',
    syncing: 'Syncing…',
    synced: 'Synced',
    offline: 'Offline',
    error: 'Error'
};

const STATUS_CLASS: Record<CloudSyncStatus, string> = {
    idle: 'muted',
    syncing: 'gold',
    synced: 'ok',
    offline: 'muted',
    error: 'warn'
};

export function CloudSaveSection({ cloudStatus, onSyncNow }: Props) {
    const [auth, setAuth] = useState<AuthState>(getAuthState);
    const [gatewayUp, setGatewayUp] = useState<boolean | null>(isGatewayAvailable());
    const [token, setToken] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unsubAuth = onAuthChange(setAuth);
        const unsubGw = onGatewayStatusChange(setGatewayUp);
        return () => { unsubAuth(); unsubGw(); };
    }, []);

    const handleSignIn = async () => {
        setError(null);
        setBusy(true);
        try {
            await signInDev(token);
            setToken('');
        } catch (e: any) {
            setError(e.message ?? String(e));
        } finally {
            setBusy(false);
        }
    };

    const handleSync = async () => {
        setError(null);
        setBusy(true);
        try {
            await onSyncNow();
        } catch (e: any) {
            setError(e.message ?? String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-section">
            <h3>Cloud save</h3>
            <p className="prose">
                Sync your save across devices. Local saves continue to work either way.
            </p>

            <div className="stack">
                {gatewayUp === false && (
                    <div className="callout callout-warn">
                        Gateway is not reachable — cloud saves are disabled, but the game keeps running.
                    </div>
                )}

                {auth.status === 'signed-out' && gatewayUp !== false && (
                    <div className="field">
                        <label htmlFor="cloud-save-name">Sign in (dev mode — any name works)</label>
                        <div className="stack">
                            <input
                                id="cloud-save-name"
                                className="input"
                                type="text"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="e.g. alice"
                                disabled={busy}
                                onKeyDown={(e) => { if (e.key === 'Enter') void handleSignIn(); }}
                            />
                            <button type="button" className="primary" onClick={handleSignIn} disabled={busy || !token.trim()}>
                                {busy ? '…' : 'Sign in'}
                            </button>
                        </div>
                    </div>
                )}

                {auth.status === 'signed-in' && auth.user && (
                    <div>
                        <Row label="Signed in as" value={auth.user.displayName ?? auth.user.externalId} />
                        <Row label="User ID" value={auth.user.id.slice(0, 8) + '…'} />
                        <Row
                            label="Sync status"
                            value={STATUS_LABEL[cloudStatus]}
                            valueClass={STATUS_CLASS[cloudStatus]}
                        />
                        <div className="btn-row section">
                            <button type="button" className="primary" onClick={handleSync} disabled={busy}>
                                Sync now
                            </button>
                            <button type="button" onClick={() => signOut()}>
                                Sign out
                            </button>
                        </div>
                    </div>
                )}

                {error && <div className="callout callout-danger">{error}</div>}
            </div>
        </div>
    );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
    return (
        <div className="kv">
            <span className="k">{label}</span>
            <span className={valueClass ? `v ${valueClass}` : 'v'}>{value}</span>
        </div>
    );
}
