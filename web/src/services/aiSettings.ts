/**
 * AI Settings Helper
 * 
 * Manages AI provider and model settings stored in localStorage.
 */

const AI_SETTINGS_KEY = 'rpg-loom-ai-settings';

export interface AISettings {
    provider: string;
    model: string;
}

const DEFAULT_SETTINGS: AISettings = {
    provider: 'gemini-cli',
    model: 'gemini-3-flash-preview'
};

/**
 * Get current AI settings from localStorage
 */
export function getAISettings(): AISettings {
    try {
        const saved = localStorage.getItem(AI_SETTINGS_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load AI settings:', e);
    }
    return DEFAULT_SETTINGS;
}

/**
 * Save AI settings to localStorage
 */
export function saveAISettings(settings: AISettings): void {
    try {
        localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save AI settings:', e);
    }
}
