import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
    title: React.ReactNode;
    /** Rendered under the title, e.g. a role badge or location. */
    subtitle?: React.ReactNode;
    onClose?: () => void;
    wide?: boolean;
    /** Stacking order; nested confirmations pass a higher value. */
    zIndex?: number;
    children: React.ReactNode;
}

/**
 * Shared dialog shell: frosted overlay, solid panel, title row with a
 * close button. Clicking the overlay or pressing Escape closes it when
 * `onClose` is given; modals that must be answered omit it.
 */
export function Modal({ title, subtitle, onClose, wide, zIndex, children }: Props) {
    useEffect(() => {
        if (!onClose) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="modal-overlay" style={zIndex ? { zIndex } : undefined} onClick={onClose}>
            <div
                className={`modal${wide ? ' modal-wide' : ''}`}
                role="dialog"
                aria-modal="true"
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-head">
                    <div>
                        <h2>{title}</h2>
                        {subtitle && <div className="small muted" style={{ marginTop: 2 }}>{subtitle}</div>}
                    </div>
                    {onClose && (
                        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                            <X size={18} />
                        </button>
                    )}
                </div>
                {children}
            </div>
        </div>
    );
}
