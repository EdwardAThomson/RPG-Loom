import React, { useState, useEffect } from 'react';
import { getAISettings, saveAISettings } from '../services/aiSettings';

interface Props {
    exportSave: () => string;
    importSave: (str: string) => void;
    hardReset: () => void;
    onClose: () => void;
}

export function SettingsModal({ exportSave, importSave, hardReset, onClose }: Props) {
    const [importString, setImportString] = useState('');
    const [copyStatus, setCopyStatus] = useState<string | null>(null);
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetConfirmText, setResetConfirmText] = useState('');

    // AI Settings
    const [aiProvider, setAiProvider] = useState('gemini-cli');
    const [aiModel, setAiModel] = useState('gemini-3-flash-preview');
    const [availableProviders, setAvailableProviders] = useState<any>(null);

    // Load AI settings from localStorage
    useEffect(() => {
        const settings = getAISettings();
        setAiProvider(settings.provider);
        setAiModel(settings.model);

        // Fetch available providers
        fetch('http://localhost:8787/api/llm/providers')
            .then(res => res.json())
            .then(data => setAvailableProviders(data.providers))
            .catch(err => console.error('Failed to fetch providers:', err));
    }, []);

    const handleProviderChange = (provider: string) => {
        setAiProvider(provider);
        // Set default model for provider
        if (availableProviders?.[provider]?.models?.[0]) {
            const defaultModel = availableProviders[provider].models[0];
            setAiModel(defaultModel);
            saveAISettings({ provider, model: defaultModel });
        }
    };

    const handleModelChange = (model: string) => {
        setAiModel(model);
        saveAISettings({ provider: aiProvider, model });
    };

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

    const handleResetClick = () => {
        setShowResetModal(true);
        setResetConfirmText('');
    };

    const handleConfirmReset = () => {
        if (resetConfirmText === 'DELETE MY SAVE') {
            hardReset();
            setShowResetModal(false);
        }
    };

    // Parse current save to show what will be lost
    const getCurrentSaveInfo = () => {
        try {
            const saveData = exportSave();
            const parsed = JSON.parse(saveData);
            return {
                level: parsed.player?.level || 0,
                xp: parsed.player?.xp || 0,
                gold: parsed.player?.gold || 0,
                activeQuests: parsed.quests?.filter((q: any) => q.status === 'active').length || 0,
                completedQuests: parsed.quests?.filter((q: any) => q.status === 'completed').length || 0,
                inventoryItems: parsed.inventory?.length || 0
            };
        } catch {
            return null;
        }
    };

    const saveInfo = getCurrentSaveInfo();

    return (
        <>
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

                    {/* AI Settings */}
                    <div style={{ marginBottom: '2rem' }}>
                        <h3>AI Settings</h3>
                        <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>
                            Configure the AI provider and model for quest enhancement and adventure generation.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Provider Selection */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#888', marginBottom: '0.5rem' }}>
                                    AI Provider:
                                </label>
                                <select
                                    value={aiProvider}
                                    onChange={(e) => handleProviderChange(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        background: '#111',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        color: '#fff',
                                        fontSize: '0.9rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {availableProviders ? (
                                        Object.entries(availableProviders).map(([key, provider]: [string, any]) => (
                                            <option key={key} value={key}>
                                                {provider.name} {provider.type === 'cloud' ? '(Cloud API)' : provider.type === 'cli' ? '(CLI)' : ''}
                                            </option>
                                        ))
                                    ) : (
                                        <option>Loading providers...</option>
                                    )}
                                </select>
                            </div>

                            {/* Model Selection */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#888', marginBottom: '0.5rem' }}>
                                    Model:
                                </label>
                                <select
                                    value={aiModel}
                                    onChange={(e) => handleModelChange(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        background: '#111',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        color: '#fff',
                                        fontSize: '0.9rem',
                                        cursor: 'pointer'
                                    }}
                                    disabled={!availableProviders}
                                >
                                    {availableProviders?.[aiProvider]?.models?.map((model: string) => (
                                        <option key={model} value={model}>
                                            {model}
                                        </option>
                                    )) || <option>No models available</option>}
                                </select>
                            </div>

                            {/* Info */}
                            <div style={{
                                padding: '0.75rem',
                                background: 'rgba(147, 51, 234, 0.1)',
                                border: '1px solid #9333ea',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                color: '#ccc'
                            }}>
                                <strong style={{ color: '#9333ea' }}>ℹ️ Note:</strong> These settings apply to quest enhancement and AI-generated adventures. Cloud API providers require API keys to be configured in the gateway.
                            </div>

                            {/* AI Debug Console Button */}
                            <button
                                onClick={() => {
                                    onClose();
                                    // Open AI Debug Modal
                                    const event = new CustomEvent('openAIDebug');
                                    window.dispatchEvent(event);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: 'transparent',
                                    border: '1px solid #9333ea',
                                    borderRadius: '4px',
                                    color: '#9333ea',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    marginTop: '0.75rem'
                                }}
                            >
                                🔧 Open AI Debug Console
                            </button>
                        </div>
                    </div>

                    <div style={{ marginBottom: '2rem', borderTop: '1px solid #333', paddingTop: '1.5rem' }}>
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
                            Permanently delete all progress and start fresh. This action cannot be undone.
                        </p>
                        <button onClick={handleResetClick} style={{ width: '100%', borderColor: '#ff4444', color: '#ff4444' }}>
                            HARD RESET
                        </button>
                    </div>
                </div>
            </div>

            {/* Hard Reset Confirmation Modal */}
            {showResetModal && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.95)', zIndex: 2001,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowResetModal(false)}>
                    <div className="card" style={{
                        maxWidth: '500px',
                        width: '90%',
                        border: '2px solid #ff4444',
                        boxShadow: '0 0 20px rgba(255,68,68,0.3)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚠️</div>
                            <h2 style={{ color: '#ff4444', margin: 0 }}>Permanent Data Loss Warning</h2>
                        </div>

                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444', borderRadius: '4px' }}>
                            <p style={{ margin: '0 0 1rem 0', fontWeight: 'bold', color: '#ff6666' }}>
                                You are about to permanently delete:
                            </p>
                            {saveInfo && (
                                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#aaa' }}>
                                    <li>Level {saveInfo.level} character</li>
                                    <li>{saveInfo.xp.toLocaleString()} Total XP</li>
                                    <li>{saveInfo.gold.toLocaleString()} Gold</li>
                                    <li>{saveInfo.activeQuests} active quest{saveInfo.activeQuests !== 1 ? 's' : ''}</li>
                                    <li>{saveInfo.completedQuests} completed quest{saveInfo.completedQuests !== 1 ? 's' : ''}</li>
                                    <li>{saveInfo.inventoryItems} unique item type{saveInfo.inventoryItems !== 1 ? 's' : ''}</li>
                                    <li>All equipment and skills</li>
                                </ul>
                            )}
                        </div>

                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                            <p style={{ fontSize: '0.9rem', color: '#ccc', margin: '0 0 0.5rem 0' }}>
                                <strong>⚠️ This action cannot be undone.</strong>
                            </p>
                            <p style={{ fontSize: '0.85rem', color: '#888', margin: 0 }}>
                                Before proceeding, consider exporting your save file as a backup using the "Export Save to Clipboard" button above.
                            </p>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', color: '#aaa', marginBottom: '0.5rem' }}>
                                Type <strong style={{ color: '#ff4444' }}>DELETE MY SAVE</strong> to confirm:
                            </label>
                            <input
                                type="text"
                                value={resetConfirmText}
                                onChange={(e) => setResetConfirmText(e.target.value)}
                                placeholder="DELETE MY SAVE"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: '#111',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: '#fff',
                                    fontSize: '1rem',
                                    fontFamily: 'monospace'
                                }}
                                autoFocus
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => setShowResetModal(false)}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    background: '#333',
                                    border: '1px solid #555',
                                    borderRadius: '4px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '1rem'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmReset}
                                disabled={resetConfirmText !== 'DELETE MY SAVE'}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    background: resetConfirmText === 'DELETE MY SAVE' ? '#ff4444' : '#333',
                                    border: '1px solid #ff4444',
                                    borderRadius: '4px',
                                    color: '#fff',
                                    cursor: resetConfirmText === 'DELETE MY SAVE' ? 'pointer' : 'not-allowed',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    opacity: resetConfirmText === 'DELETE MY SAVE' ? 1 : 0.5
                                }}
                            >
                                Delete Everything
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
