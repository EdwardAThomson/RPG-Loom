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

const STATUS_COLOR: Record<CloudSyncStatus, string> = {
    idle: '#888',
    syncing: '#ffa000',
    synced: '#4a8',
    offline: '#888',
    error: '#d44'
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
        <div style={{ marginBottom: '2rem' }}>
            <h3>Cloud Save</h3>
            <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
                Sync your save across devices. Local saves continue to work either way.
            </p>

            {gatewayUp === false && (
                <Banner color="#ffa000">
                    Gateway is not reachable — cloud saves are disabled, but the game keeps running.
                </Banner>
            )}

            {auth.status === 'signed-out' && gatewayUp !== false && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', color: '#888' }}>
                        Sign in (dev mode — any name works)
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            type="text"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="e.g. alice"
                            disabled={busy}
                            style={inputStyle}
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleSignIn(); }}
                        />
                        <button onClick={handleSignIn} disabled={busy || !token.trim()} style={primaryBtn}>
                            {busy ? '…' : 'Sign in'}
                        </button>
                    </div>
                </div>
            )}

            {auth.status === 'signed-in' && auth.user && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Row label="Signed in as" value={auth.user.displayName ?? auth.user.externalId} />
                    <Row label="User ID" value={auth.user.id.slice(0, 8) + '…'} />
                    <Row
                        label="Sync status"
                        value={STATUS_LABEL[cloudStatus]}
                        valueColor={STATUS_COLOR[cloudStatus]}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button onClick={handleSync} disabled={busy} style={primaryBtn}>
                            Sync now
                        </button>
                        <button onClick={() => signOut()} style={secondaryBtn}>
                            Sign out
                        </button>
                    </div>
                </div>
            )}

            {error && <Banner color="#d44">{error}</Banner>}
        </div>
    );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.9rem' }}>
            <span style={{ color: '#888' }}>{label}</span>
            <span style={{ color: valueColor ?? '#ddd' }}>{value}</span>
        </div>
    );
}

function Banner({ children, color }: { children: React.ReactNode; color: string }) {
    return (
        <div style={{
            padding: '0.6rem 0.75rem',
            background: `${color}1a`,
            border: `1px solid ${color}`,
            borderRadius: 4,
            fontSize: '0.85rem',
            color,
            marginTop: '0.5rem'
        }}>
            {children}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '0.5rem 0.75rem',
    background: '#111',
    border: '1px solid #333',
    borderRadius: 4,
    color: '#fff',
    fontSize: '0.9rem'
};

const primaryBtn: React.CSSProperties = {
    padding: '0.5rem 1rem',
    background: '#2a2a2a',
    border: '1px solid #555',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem'
};

const secondaryBtn: React.CSSProperties = {
    ...primaryBtn,
    background: 'transparent'
};
