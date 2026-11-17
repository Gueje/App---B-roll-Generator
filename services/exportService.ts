import { ScriptSegment, BrollSuggestion, MediaType } from "../types";

export const downloadLocalFile = (
  filename: string,
  segments: ScriptSegment[],
  suggestions: BrollSuggestion[]
) => {
  let content = `# B-ROLL PLAN: ${filename}\n`;
  content += `Date: ${new Date().toLocaleDateString()}\n\n`;
  content += `--------------------------------------------------\n\n`;

  let coveredCount = 0;

  segments.forEach((seg) => {
    const sug = suggestions.find((s) => s.segmentId === seg.id);
    if (sug) coveredCount++;

    content += `## BLOCK ${seg.order + 1}\n\n`;
    content += `**Script:**\n"${seg.originalText}"\n\n`;

    if (seg.notes.length > 0) {
      content += `**Notes:** ${seg.notes.join(', ')}\n\n`;
    }

    if (seg.extractedLinks && seg.extractedLinks.length > 0) {
        content += `**Linked Resources:**\n`;
        seg.extractedLinks.forEach(link => {
            content += `- [${link.type}] ${link.url}\n`;
        });
        content += `\n`;
    }

    if (sug) {
      content += `**[${sug.mediaType}]** ${sug.visualIntent}\n`;
      content += `*Style:* ${sug.styleParams.style} | *Mood:* ${sug.styleParams.mood}\n\n`;
      content += `**Search Query:** \`${sug.searchQuery.mainQuery}\`\n`;
      if (sug.searchQuery.youtubeQuery) {
        content += `**YouTube Query:** \`${sug.searchQuery.youtubeQuery}\`\n`;
      }
      if (sug.searchQuery.stockQuery) {
        content += `**Stock Keywords:** \`${sug.searchQuery.stockQuery}\`\n`;
      }
      content += `**Keywords:** ${sug.searchQuery.keywords.join(', ')}\n\n`;
      content += `**Direct Links:**\n`;
      content += `- [Google Images](${sug.sources.googleImages})\n`;
      content += `- [YouTube](${sug.sources.youtube})\n`;
      content += `- [Pexels](${sug.sources.pexels})\n`;
      content += `- [Unsplash](${sug.sources.unsplash})\n`;
      content += `- [Pinterest](${sug.sources.pinterest})\n`;

      if (sug.aiPrompt) {
          content += `\n**AI Prompt:**\n> ${sug.aiPrompt}\n`;
      }
    } else {
      content += `*(No B-Roll Suggested)*\n`;
    }

    content += `\n---\n\n`;
  });

  // Summary
  content += `\n## SUMMARY\n`;
  content += `Total Segments: ${segments.length}\n`;
  content += `Coverage: ${Math.round((coveredCount / segments.length) * 100)}%\n`;

  // Create Blob and Download
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_B-Roll_Plan.md`;
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const escapeHtml = (unsafe: string): string => {
  return String(unsafe || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export interface HtmlExportOptions {
  globalContext?: string;
  isContextApproved?: boolean;
  darkMode?: boolean;
}

export const downloadHtmlFile = (
  filename: string,
  segments: ScriptSegment[],
  suggestions: BrollSuggestion[],
  options: HtmlExportOptions = {}
) => {
  const { globalContext = '', isContextApproved = false, darkMode = true } = options;
  const coveredCount = segments.filter(seg => suggestions.some(s => s.segmentId === seg.id)).length;
  const coveragePct = segments.length > 0 ? Math.round((coveredCount / segments.length) * 100) : 0;
  const formattedDate = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const blocksHtml = segments.map((segment) => {
    const sug = suggestions.find((s) => s.segmentId === segment.id);
    const blockNum = segment.order + 1;
    const mediaFilter = sug ? sug.mediaType : 'PENDING';
    const statusFilter = sug ? 'GENERATED' : 'PENDING';

    const notesHtml = segment.notes.length > 0 ? `
      <div class="notes-box">
        <div class="notes-header">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>
          <span>Notas Detectadas</span>
        </div>
        <ul>
          ${segment.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    let rightColumnHtml = '';

    if (sug) {
      const isVideo = sug.mediaType === MediaType.VIDEO;
      const mediaBadge = isVideo
        ? `<span class="badge badge-video"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg> VIDEO</span>`
        : `<span class="badge badge-image"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg> IMAGEN</span>`;

      const moodBadge = sug.styleParams.mood && sug.styleParams.mood !== 'Auto-Detect'
        ? `<span class="badge badge-mood">Tono: ${escapeHtml(sug.styleParams.mood)}</span>`
        : '';

      const extractedLinksHtml = (segment.extractedLinks && segment.extractedLinks.length > 0) ? `
        <div class="extracted-box">
          <div class="section-label text-blue">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
            Recursos en el guion
          </div>
          <div class="btn-row">
            ${segment.extractedLinks.map(link => `
              <a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer" class="btn ${link.type === 'YOUTUBE' ? 'btn-yt' : 'btn-blue'}">
                ${link.type === 'YOUTUBE' ? '▶ Ver Video' : '↗ Abrir Recurso'}
              </a>
            `).join('')}
          </div>
        </div>
      ` : '';

      const promptId = `prompt-${escapeHtml(segment.id)}`;
      const mainQId = `mainq-${escapeHtml(segment.id)}`;
      const ytQId = `ytq-${escapeHtml(segment.id)}`;
      const stockQId = `stockq-${escapeHtml(segment.id)}`;

      rightColumnHtml = `
        <div class="badges-row">
          ${mediaBadge}
          <span class="badge badge-style">🎨 ${escapeHtml(sug.styleParams.style)}</span>
          ${moodBadge}
        </div>

        <h3 class="visual-intent">${escapeHtml(sug.visualIntent)}</h3>

        <div class="query-panel">
          <div class="query-group">
            <div class="query-label-row">
              <span class="query-label">🔍 Búsqueda Visual Específica (Google / Pinterest)</span>
              <button type="button" class="copy-mini-btn" onclick="copyById('${mainQId}', this)">Copiar</button>
            </div>
            <div id="${mainQId}" class="query-code">${escapeHtml(sug.searchQuery.mainQuery)}</div>
          </div>

          ${sug.searchQuery.youtubeQuery ? `
          <div class="query-group">
            <div class="query-label-row">
              <span class="query-label text-red">▶ Búsqueda en YouTube (Metraje / Archivo / B-Roll)</span>
              <button type="button" class="copy-mini-btn" onclick="copyById('${ytQId}', this)">Copiar</button>
            </div>
            <div id="${ytQId}" class="query-code">${escapeHtml(sug.searchQuery.youtubeQuery)}</div>
          </div>
          ` : ''}

          ${sug.searchQuery.stockQuery ? `
          <div class="query-group">
            <div class="query-label-row">
              <span class="query-label text-teal">🎞 Stock Keywords (Pexels / Unsplash)</span>
              <button type="button" class="copy-mini-btn" onclick="copyById('${stockQId}', this)">Copiar</button>
            </div>
            <div id="${stockQId}" class="query-code">${escapeHtml(sug.searchQuery.stockQuery)}</div>
          </div>
          ` : ''}

          ${sug.searchQuery.keywords.length > 0 ? `
          <div class="keywords-row">
            ${sug.searchQuery.keywords.slice(0, 5).map(k => `<span class="keyword-tag">#${escapeHtml(k)}</span>`).join('')}
          </div>
          ` : ''}
        </div>

        ${extractedLinksHtml}

        <div class="links-section">
          <div class="section-label">Enlaces Directos a Recursos</div>
          <div class="btn-row">
            <a href="${escapeHtml(sug.sources.googleImages)}" target="_blank" rel="noreferrer" class="btn btn-google">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"/></svg>
              Google Images
            </a>
            <a href="${escapeHtml(sug.sources.youtube)}" target="_blank" rel="noreferrer" class="btn btn-yt">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"/></svg>
              YouTube
            </a>
            <a href="${escapeHtml(sug.sources.pexels)}" target="_blank" rel="noreferrer" class="btn btn-pexels">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/></svg>
              Pexels
            </a>
            <a href="${escapeHtml(sug.sources.unsplash)}" target="_blank" rel="noreferrer" class="btn btn-unsplash">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 6.75V0h9v6.75h-9zm9 3.75H24V24H0V10.5h7.5v6.75h9V10.5z"/></svg>
              Unsplash
            </a>
            <a href="${escapeHtml(sug.sources.pinterest)}" target="_blank" rel="noreferrer" class="btn btn-pinterest">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.65 7.86 6.39 9.29-.09-.78-.17-1.98.04-2.83.18-.77 1.18-5.01 1.18-5.01s-.3-.6-.3-1.49c0-1.4.81-2.44 1.82-2.44.86 0 1.27.64 1.27 1.41 0 .86-.55 2.15-.83 3.34-.24 1 .5 1.81 1.48 1.81 1.78 0 3.14-1.88 3.14-4.59 0-2.4-1.72-4.08-4.18-4.08-2.85 0-4.52 2.14-4.52 4.35 0 .86.33 1.78.74 2.28.08.1.09.19.07.29-.08.31-.24 1-.28 1.14-.04.18-.15.22-.34.13-1.25-.58-2.03-2.41-2.03-3.88 0-3.16 2.3-6.06 6.62-6.06 3.48 0 6.18 2.48 6.18 5.79 0 3.45-2.18 6.23-5.2 6.23-1.01 0-1.97-.53-2.3-1.15l-.62 2.38c-.23.87-.84 1.96-1.25 2.62.94.29 1.94.45 2.98.45 5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>
              Pinterest
            </a>
          </div>
        </div>

        ${sug.aiPrompt ? `
        <div class="prompt-section">
          <div class="prompt-header">
            <span class="prompt-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>
              Prompt para IA Generativa (Estilo Aplicado)
            </span>
            <button type="button" class="copy-prompt-btn" onclick="copyById('${promptId}', this)">
              Copiar Prompt
            </button>
          </div>
          <div id="${promptId}" class="prompt-box">${escapeHtml(sug.aiPrompt)}</div>
        </div>
        ` : ''}
      `;
    } else {
      rightColumnHtml = `
        <div class="pending-box">
          <div class="pending-icon">✨</div>
          <p class="pending-title">Bloque pendiente de generación visual.</p>
          <p class="pending-sub">Este bloque aún no fue procesado al momento de exportar.</p>
        </div>
      `;
    }

    return `
      <article class="block-card" data-status="${statusFilter}" data-media="${mediaFilter}">
        <div class="block-left">
          <div class="block-num">BLOQUE ${blockNum}</div>
          <p class="script-text">"${escapeHtml(segment.originalText)}"</p>
          ${notesHtml}
        </div>
        <div class="block-right">
          ${rightColumnHtml}
        </div>
      </article>
    `;
  }).join('\n');

  const contextCardHtml = globalContext ? `
    <section class="context-card ${isContextApproved ? 'context-approved' : ''}">
      <div class="context-icon">${isContextApproved ? '🔒' : '🎬'}</div>
      <div class="context-body">
        <div class="context-title-row">
          <span class="context-title">Tema Maestro del Guion (Contexto Transversal)</span>
          ${isContextApproved
            ? '<span class="context-pill pill-approved">FIJADO &amp; PROTEGIDO</span>'
            : '<span class="context-pill pill-pending">BORRADOR</span>'}
        </div>
        <p class="context-text">"${escapeHtml(globalContext)}"</p>
      </div>
    </section>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="es" class="${darkMode ? 'dark' : ''}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(filename)} — Plan Visual B-Roll</title>
  <style>
    :root {
      --bg: #f8fafc;
      --surface: #ffffff;
      --surface-alt: #f1f5f9;
      --surface-code: #ffffff;
      --border: #e2e8f0;
      --border-strong: #cbd5e1;
      --text: #0f172a;
      --text-muted: #475569;
      --text-soft: #64748b;
      --indigo: #4f46e5;
      --indigo-soft: #eef2ff;
      --indigo-border: #c7d2fe;
      --indigo-text: #4338ca;
      --emerald-soft: #ecfdf5;
      --emerald-border: #a7f3d0;
      --emerald-text: #047857;
      --purple-soft: #f3e8ff;
      --purple-text: #7e22ce;
      --yellow-soft: #fefce8;
      --yellow-border: #fef08a;
      --yellow-text: #854d0e;
      --shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }

    html.dark {
      --bg: #0f172a;
      --surface: #1e293b;
      --surface-alt: #0f172a;
      --surface-code: #0f172a;
      --border: #334155;
      --border-strong: #475569;
      --text: #f8fafc;
      --text-muted: #cbd5e1;
      --text-soft: #94a3b8;
      --indigo: #6366f1;
      --indigo-soft: rgba(49, 46, 129, 0.45);
      --indigo-border: rgba(99, 102, 241, 0.4);
      --indigo-text: #a5b4fc;
      --emerald-soft: rgba(6, 78, 59, 0.35);
      --emerald-border: rgba(16, 185, 129, 0.4);
      --emerald-text: #6ee7b7;
      --purple-soft: rgba(88, 28, 135, 0.45);
      --purple-text: #d8b4fe;
      --yellow-soft: rgba(113, 63, 18, 0.25);
      --yellow-border: rgba(161, 98, 7, 0.45);
      --yellow-text: #facc15;
      --shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding-bottom: 64px;
      transition: background 0.2s, color 0.2s;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 30;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 14px 24px;
      box-shadow: var(--shadow);
    }

    .topbar-inner {
      max-width: 1120px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--indigo);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      flex-shrink: 0;
    }

    .brand h1 {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.25;
    }

    .brand-meta {
      font-size: 12px;
      color: var(--text-soft);
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 2px;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .theme-btn {
      border: 1px solid var(--border-strong);
      background: var(--surface-alt);
      color: var(--text);
      padding: 7px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .container {
      max-width: 1120px;
      margin: 24px auto 0;
      padding: 0 20px;
    }

    .summary-bar {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      box-shadow: var(--shadow);
    }

    .summary-top {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }

    .summary-stats {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
    }

    .progress-track {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: var(--border);
      overflow: hidden;
      margin-bottom: 14px;
    }

    .progress-fill {
      height: 100%;
      background: var(--indigo);
      border-radius: 999px;
    }

    .controls-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
    }

    .filter-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .filter-btn {
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface-alt);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .filter-btn.active {
      background: var(--indigo);
      color: #fff;
      border-color: var(--indigo);
    }

    .search-input {
      padding: 7px 12px;
      border-radius: 8px;
      border: 1px solid var(--border-strong);
      background: var(--surface-alt);
      color: var(--text);
      font-size: 13px;
      min-width: 240px;
      outline: none;
    }

    .context-card {
      display: flex;
      gap: 14px;
      padding: 16px 18px;
      border-radius: 12px;
      border: 1px solid var(--indigo-border);
      background: var(--indigo-soft);
      margin-bottom: 24px;
    }

    .context-card.context-approved {
      border-color: var(--emerald-border);
      background: var(--emerald-soft);
    }

    .context-icon {
      font-size: 20px;
      line-height: 1;
      margin-top: 2px;
    }

    .context-title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .context-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--indigo-text);
    }

    .context-approved .context-title {
      color: var(--emerald-text);
    }

    .context-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
    }

    .pill-approved {
      background: var(--emerald-soft);
      color: var(--emerald-text);
      border: 1px solid var(--emerald-border);
    }

    .pill-pending {
      background: var(--surface);
      color: var(--text-soft);
      border: 1px solid var(--border);
    }

    .context-text {
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
    }

    .blocks-list {
      display: flex;
      flex-direction: column;
      gap: 22px;
    }

    .block-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: var(--shadow);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    @media (min-width: 768px) {
      .block-card {
        flex-direction: row;
      }
      .block-left {
        width: 34%;
        border-right: 1px solid var(--border);
      }
      .block-right {
        width: 66%;
      }
    }

    .block-left {
      padding: 22px;
      background: var(--surface-alt);
    }

    .block-right {
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .block-num {
      font-size: 11px;
      font-weight: 800;
      color: var(--text-soft);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
    }

    .script-text {
      font-family: Georgia, Cambria, "Times New Roman", serif;
      font-size: 14.5px;
      line-height: 1.65;
      color: var(--text);
      white-space: pre-wrap;
    }

    .notes-box {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--yellow-soft);
      border: 1px solid var(--yellow-border);
      color: var(--yellow-text);
      font-size: 12px;
    }

    .notes-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .notes-box ul {
      padding-left: 18px;
    }

    .badges-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 6px;
    }

    .badge-video {
      background: var(--purple-soft);
      color: var(--purple-text);
    }

    .badge-image {
      background: var(--emerald-soft);
      color: var(--emerald-text);
    }

    .badge-style {
      background: var(--indigo-soft);
      color: var(--indigo-text);
      border: 1px solid var(--indigo-border);
    }

    .badge-mood {
      border: 1px solid var(--border-strong);
      color: var(--text-soft);
      font-weight: 500;
    }

    .visual-intent {
      font-size: 17px;
      font-weight: 600;
      line-height: 1.4;
      color: var(--text);
    }

    .query-panel {
      background: var(--surface-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .query-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .query-label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .query-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-soft);
    }

    .text-red { color: #f87171; }
    .text-teal { color: #2dd4bf; }
    .text-blue { color: #60a5fa; }

    .query-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12.5px;
      background: var(--surface-code);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
      color: var(--text);
      word-break: break-word;
      user-select: all;
    }

    .copy-mini-btn {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 5px;
      border: 1px solid var(--border-strong);
      background: var(--surface);
      color: var(--text-muted);
      cursor: pointer;
    }

    .copy-mini-btn:hover {
      border-color: var(--indigo);
      color: var(--indigo-text);
    }

    .keywords-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--border);
    }

    .keyword-tag {
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 5px;
      background: var(--surface);
      border: 1px solid var(--border-strong);
      color: var(--text-muted);
    }

    .extracted-box {
      padding: 12px;
      border-radius: 10px;
      background: rgba(37, 99, 235, 0.08);
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .section-label {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-soft);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 13px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: transform 0.12s, opacity 0.12s;
    }

    .btn:hover {
      opacity: 0.92;
      transform: translateY(-1px);
    }

    .btn-google {
      background: #ffffff;
      color: #1e293b;
      border: 1px solid #cbd5e1;
    }
    .btn-yt { background: #ff0000; color: #ffffff; }
    .btn-pexels { background: #05a081; color: #ffffff; }
    .btn-unsplash { background: #0f172a; color: #ffffff; border: 1px solid #334155; }
    .btn-pinterest { background: #e60023; color: #ffffff; }
    .btn-blue { background: #2563eb; color: #ffffff; }

    .prompt-section {
      border-top: 1px solid var(--border);
      padding-top: 14px;
    }

    .prompt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .prompt-title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--indigo-text);
    }

    .copy-prompt-btn {
      border: none;
      background: var(--indigo-soft);
      color: var(--indigo-text);
      border: 1px solid var(--indigo-border);
      padding: 5px 11px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }

    .copy-prompt-btn.copied {
      background: var(--emerald-soft);
      color: var(--emerald-text);
      border-color: var(--emerald-border);
    }

    .prompt-box {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
      padding: 12px;
      border-radius: 8px;
      background: var(--surface-alt);
      border: 1px solid var(--border);
      color: var(--text-muted);
      user-select: all;
      white-space: pre-wrap;
    }

    .pending-box {
      height: 100%;
      min-height: 150px;
      border: 2px dashed var(--border);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
      color: var(--text-soft);
    }

    .pending-icon { font-size: 20px; margin-bottom: 6px; }
    .pending-title { font-style: italic; font-size: 14px; }
    .pending-sub { font-size: 11px; margin-top: 4px; opacity: 0.8; }

    .hidden { display: none !important; }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <div class="brand-icon">▶</div>
        <div>
          <h1>${escapeHtml(filename)}</h1>
          <div class="brand-meta">
            <span>Exportado el ${escapeHtml(formattedDate)}</span>
            <span>•</span>
            <span>${segments.length} bloques</span>
            <span>•</span>
            <span>${coveredCount} visuales generados (${coveragePct}%)</span>
          </div>
        </div>
      </div>
      <div class="topbar-actions">
        <button type="button" class="theme-btn" onclick="toggleTheme()">🌓 Cambiar Tema</button>
      </div>
    </div>
  </header>

  <main class="container">
    <section class="summary-bar">
      <div class="summary-top">
        <span class="summary-stats">Cobertura del Plan Visual: ${coveredCount} de ${segments.length} bloques (${coveragePct}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${coveragePct}%"></div>
      </div>
      <div class="controls-row">
        <div class="filter-pills">
          <button type="button" class="filter-btn active" onclick="setFilter('ALL', this)">Todos (${segments.length})</button>
          <button type="button" class="filter-btn" onclick="setFilter('GENERATED', this)">Generados (${coveredCount})</button>
          <button type="button" class="filter-btn" onclick="setFilter('VIDEO', this)">Video</button>
          <button type="button" class="filter-btn" onclick="setFilter('IMAGE', this)">Imagen</button>
          ${segments.length - coveredCount > 0 ? `<button type="button" class="filter-btn" onclick="setFilter('PENDING', this)">Pendientes (${segments.length - coveredCount})</button>` : ''}
        </div>
        <input type="text" class="search-input" placeholder="Buscar en guion, queries o prompts..." oninput="setSearch(this.value)" />
      </div>
    </section>

    ${contextCardHtml}

    <section class="blocks-list">
      ${blocksHtml}
    </section>
  </main>

  <script>
    let currentFilter = 'ALL';
    let currentSearch = '';

    function toggleTheme() {
      document.documentElement.classList.toggle('dark');
    }

    function applyFilters() {
      const cards = document.querySelectorAll('.block-card');
      const term = currentSearch.trim().toLowerCase();

      cards.forEach(card => {
        const status = card.getAttribute('data-status');
        const media = card.getAttribute('data-media');
        const text = card.innerText.toLowerCase();

        let matchesFilter = true;
        if (currentFilter === 'GENERATED') matchesFilter = status === 'GENERATED';
        else if (currentFilter === 'PENDING') matchesFilter = status === 'PENDING';
        else if (currentFilter === 'VIDEO') matchesFilter = media === 'VIDEO';
        else if (currentFilter === 'IMAGE') matchesFilter = media === 'IMAGE';

        const matchesSearch = !term || text.includes(term);

        if (matchesFilter && matchesSearch) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    }

    function setFilter(filter, btn) {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      applyFilters();
    }

    function setSearch(val) {
      currentSearch = val || '';
      applyFilters();
    }

    function copyById(elementId, btn) {
      const el = document.getElementById(elementId);
      if (!el) return;
      const text = el.innerText;

      const showCopied = () => {
        const original = btn.innerText;
        btn.innerText = '¡Copiado!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerText = original;
          btn.classList.remove('copied');
        }, 1800);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(showCopied).catch(() => fallbackCopy(text, showCopied));
      } else {
        fallbackCopy(text, showCopied);
      }
    }

    function fallbackCopy(text, cb) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        cb();
      } catch (e) {}
      document.body.removeChild(ta);
    }
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_B-Roll_Plan.html`;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};