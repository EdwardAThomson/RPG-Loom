import React, { useState } from 'react';

interface Props {
    exportSave: () => string;
    importSave: (str: string) => void;
    hardReset: () => void;
    onClose: () => void;
}

export function SettingsModal({ exportSave, importSave, hardReset, onClose }: Props) {
    const [importString, setImportString] = useState('');
    const [copyStatus, setCopyStatus] = useState<string | null>(null);

    const handleCopy = () => {
        const data = exportSave();
        navigator.clipboard.writeText(data).then(() => {
            setCopyStatus('Copied!');
            setTimeout(() => setCopyStatus(null), 2000);
        });
    };

    const handleImport = () => {
        if (!importString) return;
        if (window.confirm("This will overwrite your current save. Are you sure?")) {
            importSave(importString);
        }
    };

    const handleReset = () => {
        if (window.confirm("ARE YOU SURE? This will wipe your save file and restart the game. This cannot be undone.")) {
            hardReset();
        }
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={onClose}>
            <div className="card" style={{ maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #666' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                    <h2 style={{ margin: 0 }}>System Settings</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                    <h3>Save Management</h3>
                    <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
                        Backup your save or transfer it to another device.
                    </p>

                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <button onClick={handleCopy} style={{ flex: 1, borderColor: 'var(--color-gold)' }}>
                            {copyStatus || 'Export Save to Clipboard'}
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.8rem', color: '#888' }}>Import Save String:</label>
                        <textarea
                            value={importString}
                            onChange={(e) => setImportString(e.target.value)}
                            placeholder="Paste save string here..."
                            style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '0.5rem', minHeight: '60px', fontFamily: 'monospace', fontSize: '0.8rem' }}
                        />
                        <button onClick={handleImport} disabled={!importString} style={{ alignSelf: 'flex-end', opacity: importString ? 1 : 0.5 }}>
                            Import Save
                        </button>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #333', paddingTop: '1.5rem' }}>
                    <h3 style={{ color: '#ff4444' }}>Danger Zone</h3>
                    <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
                        Wipe your progress and start a fresh game.
                    </p>
                    <button onClick={handleReset} style={{ width: '100%', borderColor: '#ff4444', color: '#ff4444' }}>
                        HARD RESET
                    </button>
                </div>
            </div>
        </div>
    );
}
