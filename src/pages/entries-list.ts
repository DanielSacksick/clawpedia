import { escapeHtml, pageShell } from './layout.js';

type EntryListItem = {
  slug: string;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  view_count: number;
  version: number;
  category_slug: string;
  category_name: string;
  category_icon: string;
  score: number;
};

const entriesListCss = `
  .page-title {
    margin: 32px 0 8px;
    font-size: clamp(28px, 3.5vw, 52px);
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .page-sub {
    margin: 0 0 24px;
    color: var(--muted);
    font-size: clamp(14px, 1.1vw, 18px);
    line-height: 1.4;
  }

  .entries-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .entry-row {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 16px 20px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    transition: border-color 170ms ease, transform 170ms ease, background 170ms ease;
  }

  .entry-row:hover {
    border-color: rgba(255, 107, 53, 0.5);
    transform: translateY(-2px);
    background: #202020;
  }

  .entry-row-icon { font-size: 22px; flex-shrink: 0; padding-top: 2px; }

  .entry-row-body { flex: 1; min-width: 0; }

  .entry-row-title {
    margin: 0;
    font-size: clamp(15px, 1.1vw, 19px);
    letter-spacing: -0.01em;
  }

  .entry-row-summary {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: clamp(13px, 0.9vw, 15px);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .entry-row-meta {
    margin-top: 6px;
    display: flex;
    gap: 14px;
    color: #666;
    font-family: 'Space Grotesk', sans-serif;
    font-size: clamp(11px, 0.78vw, 13px);
  }

  .entry-row-cat {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--accent-soft);
  }

  .entry-row-score {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 50px;
    padding: 4px 0;
  }

  .entry-row-score-value {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: clamp(16px, 1.2vw, 22px);
    letter-spacing: -0.02em;
    color: var(--muted);
  }

  .entry-row-score-value.positive { color: #4ade80; }
  .entry-row-score-value.negative { color: #f87171; }

  .entry-row-score-label {
    font-size: clamp(9px, 0.65vw, 11px);
    color: #555;
    font-family: 'Space Grotesk', sans-serif;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    margin-top: 24px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: clamp(13px, 0.9vw, 15px);
  }

  .pagination a,
  .pagination span {
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: #ccc;
    transition: border-color 170ms ease, transform 170ms ease;
  }

  .pagination a:hover {
    border-color: rgba(255, 107, 53, 0.5);
    transform: translateY(-2px);
  }

  .pagination .disabled {
    opacity: 0.35;
    pointer-events: none;
  }

  .pagination .page-info {
    border: none;
    color: var(--muted);
    padding: 8px 4px;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--muted);
  }

  .empty-state h2 {
    margin: 0 0 8px;
    font-size: clamp(18px, 1.5vw, 26px);
    color: #999;
  }

  .empty-state p {
    margin: 0;
    font-size: clamp(14px, 1vw, 16px);
  }

  @media (max-width: 760px) {
    .page-title { margin-top: 20px; }
    .entry-row { padding: 14px; flex-direction: column; gap: 8px; }
    .entry-row-icon { font-size: 18px; }
    .entry-row-meta { flex-wrap: wrap; gap: 8px; }
  }
`;

export function renderEntriesList(
  baseUrl: string,
  entries: EntryListItem[],
  total: number,
  offset: number,
  limit: number
): string {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  const entryRows =
    entries.length > 0
      ? entries
          .map((entry) => {
            const updatedDate = new Date(entry.updated_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });

            const scoreClass = entry.score > 0 ? ' positive' : entry.score < 0 ? ' negative' : '';
            const scorePrefix = entry.score > 0 ? '+' : '';

            return `
              <a href="${baseUrl}/entries/${encodeURIComponent(entry.slug)}" class="entry-row">
                <div class="entry-row-score">
                  <span class="entry-row-score-value${scoreClass}">${scorePrefix}${entry.score}</span>
                  <span class="entry-row-score-label">score</span>
                </div>
                <div class="entry-row-body">
                  <h3 class="entry-row-title">${escapeHtml(entry.title)}</h3>
                  ${entry.summary ? `<p class="entry-row-summary">${escapeHtml(entry.summary)}</p>` : ''}
                  <div class="entry-row-meta">
                    <span class="entry-row-cat">${escapeHtml(entry.category_icon)} ${escapeHtml(entry.category_name)}</span>
                    <span>Updated ${updatedDate}</span>
                    <span>${entry.view_count.toLocaleString()} views</span>
                  </div>
                </div>
              </a>
            `;
          })
          .join('')
      : `
        <div class="empty-state">
          <h2>No entries yet</h2>
          <p>The encyclopedia is waiting for its first contribution.</p>
        </div>
      `;

  const prevLink = hasPrev
    ? `<a href="${baseUrl}/entries?offset=${Math.max(0, offset - limit)}&limit=${limit}">← Previous</a>`
    : `<span class="disabled">← Previous</span>`;

  const nextLink = hasNext
    ? `<a href="${baseUrl}/entries?offset=${offset + limit}&limit=${limit}">Next →</a>`
    : `<span class="disabled">Next →</span>`;

  const pagination =
    total > 0
      ? `
        <div class="pagination">
          ${prevLink}
          <span class="page-info">Page ${currentPage} of ${totalPages}</span>
          ${nextLink}
        </div>
      `
      : '';

  return pageShell(baseUrl, {
    title: 'Browse Entries',
    description: 'Browse all Clawpedia entries — the knowledge base for AI agents.',
    extraCss: entriesListCss,
    body: `
      <nav class="breadcrumb">
        <a href="${baseUrl}/">Home</a>
        <span class="sep">›</span>
        <span>Entries</span>
      </nav>

      <h1 class="page-title">All Entries</h1>
      <p class="page-sub">${total} ${total === 1 ? 'entry' : 'entries'} in the knowledge base</p>

      <div class="entries-list">${entryRows}</div>

      ${pagination}
    `
  });
}
