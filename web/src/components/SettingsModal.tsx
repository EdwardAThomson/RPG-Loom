import { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { getAISettings, saveAISettings } from '../services/aiSettings';
import { gatewayFetch, isGatewayAvailable, onGatewayStatusChange } from '../services/gateway';
import { CloudSaveSection } from './CloudSaveSection';
import { Modal } from './Modal';
import '../styles/modals.css';
import type { CloudSyncStatus } from '../hooks/useGameEngine';

interface Props {
    exportSave: () => string;
    importSave: (str: string) => void;
    hardReset: () => void;
    onClose: () => void;
    cloudStatus: CloudSyncStatus;
    onSyncNow: () => Promise<void>;
}

export function SettingsModal({ exportSave, importSave, hardReset, onClose, cloudStatus, onSyncNow }: Props) {
    const [importString, setImportString] = useState('');
    const [copyStatus, setCopyStatus] = useState<string | null>(null);
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetConfirmText, setResetConfirmText] = useState('');

    // AI Settings
    const [aiProvider, setAiProvider] = useState('gemini-cli');
    const [aiModel, setAiModel] = useState('gemini-3-flash-preview');
    const [availableProviders, setAvailableProviders] = useState<any>(null);
    const [gatewayUp, setGatewayUp] = useState<boolean | null>(isGatewayAvailable());

    // Load AI settings from localStorage
    useEffect(() => {
        const settings = getAISettings();
        setAiProvider(settings.provider);
        setAiModel(settings.model);

        const unsub = onGatewayStatusChange(setGatewayUp);

        // Fetch available providers
        gatewayFetch('/api/llm/providers')
            .then(res => res.json())
            .then(data => setAvailableProviders(data.providers))
            .catch(() => { /* gateway unavailable — handled by gatewayFetch */ });

        return unsub;
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
            setCopyStatus('Copied');
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
    const canReset = resetConfirmText === 'DELETE MY SAVE';

    return (
        <>
            <Modal title="Settings" onClose={onClose}>
                <CloudSaveSection cloudStatus={cloudStatus} onSyncNow={onSyncNow} />

                <div className="modal-section">
                    <h3>AI</h3>
                    <p className="prose">
                        Configure the AI provider and model for quest enhancement and adventure generation.
                    </p>

                    <div className="stack">
                        {gatewayUp === false && (
                            <div className="callout callout-warn">
                                AI gateway is not reachable. AI features are disabled but the game will continue to run normally.
                            </div>
                        )}

                        <div className="field">
                            <label htmlFor="settings-ai-provider">AI provider</label>
                            <select
                                id="settings-ai-provider"
                                className="input"
                                value={aiProvider}
                                onChange={(e) => handleProviderChange(e.target.value)}
                            >
                                {availableProviders ? (
                                    Object.entries(availableProviders).map(([key, provider]: [string, any]) => (
                                        <option key={key} value={key}>
                                            {provider.name} {provider.type === 'cloud' ? '(Cloud API)' : provider.type === 'cli' ? '(CLI)' : ''}
                                        </option>
                                    ))
                                ) : (
                                    <option>Loading providers…</option>
                                )}
                            </select>
                        </div>

                        <div className="field">
                            <label htmlFor="settings-ai-model">Model</label>
                            <select
                                id="settings-ai-model"
                                className="input"
                                value={aiModel}
                                onChange={(e) => handleModelChange(e.target.value)}
                                disabled={!availableProviders}
                            >
                                {availableProviders?.[aiProvider]?.models?.map((model: string) => (
                                    <option key={model} value={model}>
                                        {model}
                                    </option>
                                )) || <option>No models available</option>}
                            </select>
                        </div>

                        <div className="callout callout-ai">
                            <strong>Note:</strong> These settings apply to quest enhancement and AI-generated adventures. Cloud API providers require API keys to be configured in the gateway.
                        </div>

                        <button
                            type="button"
                            className="btn-ai btn-block"
                            onClick={() => {
                                onClose();
                                // Open AI Debug Modal
                                const event = new CustomEvent('openAIDebug');
                                window.dispatchEvent(event);
                            }}
                        >
                            <Wrench size={14} aria-hidden /> Open AI debug console
                        </button>
                    </div>
                </div>

                <div className="modal-section">
                    <h3>Save management</h3>
                    <p className="prose">
                        Back up your save or transfer it to another device.
                    </p>

                    <div className="stack">
                        <button type="button" onClick={handleCopy}>
                            {copyStatus || 'Export save to clipboard'}
                        </button>

                        <div className="field">
                            <label htmlFor="settings-import-save">Import save string</label>
                            <textarea
                                id="settings-import-save"
                                className="input mono"
                                value={importString}
                                onChange={(e) => setImportString(e.target.value)}
                                placeholder="Paste save string here…"
                            />
                        </div>
                        <button type="button" onClick={handleImport} disabled={!importString}>
                            Import save
                        </button>
                    </div>
                </div>

                <div className="modal-section">
                    <h3>Danger zone</h3>
                    <p className="prose">
                        Permanently delete all progress and start fresh. This action cannot be undone.
                    </p>
                    <button type="button" className="btn-danger btn-block" onClick={handleResetClick}>
                        Hard reset
                    </button>
                </div>
            </Modal>

            {/* Hard Reset Confirmation Modal */}
            {showResetModal && (
                <Modal title="Delete everything?" zIndex={2100} onClose={() => setShowResetModal(false)}>
                    <div className="stack">
                        <div className="callout callout-danger">
                            <p className="small"><strong>You are about to permanently delete:</strong></p>
                            {saveInfo && (
                                <ul className="small muted">
                                    <li>Level {saveInfo.level} character</li>
                                    <li>{saveInfo.xp.toLocaleString()} total XP</li>
                                    <li>{saveInfo.gold.toLocaleString()} gold</li>
                                    <li>{saveInfo.activeQuests} active quest{saveInfo.activeQuests !== 1 ? 's' : ''}</li>
                                    <li>{saveInfo.completedQuests} completed quest{saveInfo.completedQuests !== 1 ? 's' : ''}</li>
                                    <li>{saveInfo.inventoryItems} unique item type{saveInfo.inventoryItems !== 1 ? 's' : ''}</li>
                                    <li>All equipment and skills</li>
                                </ul>
                            )}
                        </div>

                        <div className="callout">
                            <p className="small"><strong>This action cannot be undone.</strong></p>
                            <p className="small muted">
                                Before proceeding, consider exporting your save as a backup using the "Export save to clipboard" button in Settings.
                            </p>
                        </div>

                        <div className="field">
                            <label htmlFor="settings-reset-confirm">
                                Type <strong className="warn">DELETE MY SAVE</strong> to confirm
                            </label>
                            <input
                                id="settings-reset-confirm"
                                className="input mono"
                                type="text"
                                value={resetConfirmText}
                                onChange={(e) => setResetConfirmText(e.target.value)}
                                placeholder="DELETE MY SAVE"
                                autoFocus
                            />
                        </div>

                        <div className="btn-row">
                            <button type="button" onClick={() => setShowResetModal(false)}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="primary btn-danger"
                                onClick={handleConfirmReset}
                                disabled={!canReset}
                            >
                                Delete everything
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
