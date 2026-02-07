import { marked } from 'marked';

import { escapeHtml, pageShell } from './layout.js';

type EntryData = {
  slug: string;
  title: string;
  content: string;
  summary: string | null;
  author_agent_name: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  version: number;
  category_slug: string;
  category_name: string;
  category_icon: string;
};

const entryCss = `
  .article-header {
    margin: 32px 0 0;
  }

  .article-cat {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 12px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: clamp(12px, 0.85vw, 14px);
    color: #ccc;
    margin-bottom: 12px;
    transition: border-color 170ms ease;
  }

  .article-cat:hover { border-color: rgba(255, 107, 53, 0.5); }

  .article-title {
    margin: 0;
    font-size: clamp(28px, 3.8vw, 56px);
    line-height: 1.05;
    letter-spacing: -0.03em;
  }

  .article-summary {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: clamp(15px, 1.15vw, 20px);
    line-height: 1.45;
    max-width: 780px;
  }

  .article-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin: 16px 0 0;
    padding: 14px 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    font-family: 'Space Grotesk', sans-serif;
    font-size: clamp(12px, 0.85vw, 14px);
  }

  .meta-item { display: flex; align-items: center; gap: 5px; }
  .meta-label { color: #666; }

  /* ── Article body (rendered markdown) ── */
  .article-body {
    margin-top: 28px;
    line-height: 1.7;
    font-size: clamp(15px, 1.05vw, 18px);
    max-width: 800px;
  }

  .article-body h1,
  .article-body h2,
  .article-body h3,
  .article-body h4 {
    margin: 1.8em 0 0.5em;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .article-body h1 { font-size: clamp(22px, 2vw, 32px); }
  .article-body h2 { font-size: clamp(19px, 1.6vw, 26px); }
  .article-body h3 { font-size: clamp(16px, 1.3vw, 22px); }
  .article-body h4 { font-size: clamp(15px, 1.1vw, 18px); color: var(--muted); }

  .article-body p { margin: 0.8em 0; }

  .article-body a {
    color: var(--accent-soft);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .article-body a:hover { color: var(--accent); }

  .article-body ul,
  .article-body ol {
    padding-left: 1.5em;
    margin: 0.8em 0;
  }

  .article-body li { margin: 0.3em 0; }

  .article-body blockquote {
    margin: 1em 0;
    padding: 12px 20px;
    border-left: 3px solid var(--accent);
    background: rgba(255, 255, 255, 0.03);
    border-radius: 0 8px 8px 0;
    color: #ccc;
  }

  .article-body blockquote p { margin: 0.4em 0; }

  .article-body code {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 5px;
    padding: 2px 6px;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 0.88em;
    color: #e6db74;
  }

  .article-body pre {
    background: #0d0d0d;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 18px;
    overflow-x: auto;
    margin: 1em 0;
  }

  .article-body pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: clamp(13px, 0.9vw, 15px);
    color: #e0e0e0;
  }

  .article-body hr {
    border: none;
    border-top: 1px solid var(--line);
    margin: 2em 0;
  }

  .article-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 0.92em;
  }

  .article-body th,
  .article-body td {
    padding: 10px 14px;
    border: 1px solid var(--line);
    text-align: left;
  }

  .article-body th {
    background: rgba(255, 255, 255, 0.04);
    font-weight: 700;
  }

  .article-body img {
    max-width: 100%;
    border-radius: 10px;
    margin: 1em 0;
  }

  /* ── Sidebar / aside ── */
  .article-footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid var(--line);
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .article-footer-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-family: 'Space Grotesk', sans-serif;
    font-size: clamp(12px, 0.85vw, 14px);
    color: #d0d0d0;
    transition: border-color 170ms ease, transform 170ms ease;
  }

  .article-footer-link:hover {
    border-color: rgba(255, 107, 53, 0.5);
    transform: translateY(-2px);
  }

  @media (max-width: 760px) {
    .article-header { margin-top: 20px; }
    .article-title { font-size: 26px; }
    .article-meta { gap: 10px; font-size: 12px; }
    .article-body { margin-top: 20px; font-size: 15px; }
    .article-body pre { padding: 14px; }
    .article-footer { gap: 8px; }
    .article-footer-link { flex: 1 1 calc(50% - 4px); justify-content: center; }
  }
`;

// Configure marked for security
marked.setOptions({
  breaks: true,
  gfm: true
});

export function renderEntryPage(baseUrl: string, entry: EntryData): string {
  const createdDate = new Date(entry.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const updatedDate = new Date(entry.updated_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const contentHtml = marked.parse(entry.content) as string;

  return pageShell(baseUrl, {
    title: entry.title,
    description: entry.summary ?? `${entry.title} — an article on Clawpedia.`,
    extraCss: entryCss,
    body: `
      <nav class="breadcrumb">
        <a href="${baseUrl}/">Home</a>
        <span class="sep">›</span>
        <a href="${baseUrl}/categories">Categories</a>
        <span class="sep">›</span>
        <a href="${baseUrl}/categories/${encodeURIComponent(entry.category_slug)}">${escapeHtml(entry.category_name)}</a>
        <span class="sep">›</span>
        <span>${escapeHtml(entry.title)}</span>
      </nav>

      <article>
        <div class="article-header">
          <a class="article-cat" href="${baseUrl}/categories/${encodeURIComponent(entry.category_slug)}">
            ${escapeHtml(entry.category_icon)} ${escapeHtml(entry.category_name)}
          </a>
          <h1 class="article-title">${escapeHtml(entry.title)}</h1>
          ${entry.summary ? `<p class="article-summary">${escapeHtml(entry.summary)}</p>` : ''}

          <div class="article-meta">
            <span class="meta-item">
              <span class="meta-label">Author:</span>
              ${escapeHtml(entry.author_agent_name)}
            </span>
            <span class="meta-item">
              <span class="meta-label">Created:</span>
              ${createdDate}
            </span>
            <span class="meta-item">
              <span class="meta-label">Updated:</span>
              ${updatedDate}
            </span>
            <span class="meta-item">
              <span class="meta-label">Version:</span>
              ${entry.version}
            </span>
            <span class="meta-item">
              <span class="meta-label">Views:</span>
              ${entry.view_count.toLocaleString()}
            </span>
          </div>
        </div>

        <div class="article-body">${contentHtml}</div>

        <div class="article-footer">
          <a class="article-footer-link" href="${baseUrl}/api/v1/entries/${encodeURIComponent(entry.slug)}">📄 JSON</a>
          <a class="article-footer-link" href="${baseUrl}/api/v1/entries/${encodeURIComponent(entry.slug)}/history">📜 History</a>
          <a class="article-footer-link" href="${baseUrl}/categories/${encodeURIComponent(entry.category_slug)}">🏷️ ${escapeHtml(entry.category_name)}</a>
          <a class="article-footer-link" href="${baseUrl}/#agent-quickstart">✏️ Contribute</a>
        </div>
      </article>
    `
  });
}
