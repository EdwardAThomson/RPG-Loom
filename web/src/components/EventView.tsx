import type { FeedEntry } from '../ui/eventFeed';

interface Props {
    feed: FeedEntry[];
}

function clock(ms: number) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function EventView({ feed }: Props) {
    return (
        <section className="hud-panel feed" aria-label="Event log">
            <div className="hud-label">Log</div>
            {feed.length === 0 ? (
                <p className="feed-empty">Nothing yet. Pick an activity to get started.</p>
            ) : (
                <ol className="feed-list">
                    {feed.map(e => (
                        <li key={e.id} className={`feed-entry tone-${e.tone}`}>
                            <time>{clock(e.atMs)}</time>
                            <div className="feed-body">
                                <span className="feed-text">{e.text}</span>
                                {e.detail && <span className="feed-detail">{e.detail}</span>}
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
