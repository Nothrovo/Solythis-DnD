/**
 * Solythis Chronicles — Character Detail Page Script
 * ==================================================
 * Handles dynamic data fetching, query param parsing,
 * Markdown backstory rendering, and populating D&D stats/lore grid.
 */

'use strict';

// ── DOM References ─────────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
  stateLoading:     $('state-loading'),
  stateError:       $('state-error'),
  errorMessage:     $('error-message'),
  detailGrid:       $('detail-grid'),

  // Sidebar elements
  sprite:           $('detail-sprite'),
  partyBadge:       $('detail-party-badge'),
  charName:         $('detail-char-name'),
  charAlias:        $('detail-char-alias'),
  statsList:        $('detail-stats-list'),

  // Main content elements
  summaryText:      $('backstory-summary-text'),
  deepBackstory:    $('detail-deep-backstory'),

  // Lore grid values
  originVal:        $('lore-origin-val'),
  peopleList:       $('lore-people-list'),
  placesList:       $('lore-places-list'),
  orgsList:         $('lore-orgs-list'),
};

const PARTY_STYLES = {
  'Party Solmarch': { label: 'Solmarch', cssClass: 'card-party-badge--solmarch' },
  'Party Vaelthar': { label: 'Vaelthar',  cssClass: 'card-party-badge--vaelthar' },
};

function getPartyStyle(party) {
  return PARTY_STYLES[party] || { label: party, cssClass: 'card-party-badge--default' };
}

// ══════════════════════════════════════════════════════════
//   STAR CANVAS BACKGROUND
// ══════════════════════════════════════════════════════════
(function initStars() {
  const canvas = $('star-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const stars = [];
  const STAR_COUNT = 150;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createStars() {
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x:       Math.random() * canvas.width,
        y:       Math.random() * canvas.height,
        r:       Math.random() * 1.5 + 0.2,
        alpha:   Math.random() * 0.7 + 0.1,
        dAlpha:  (Math.random() * 0.008 + 0.002) * (Math.random() < 0.5 ? 1 : -1),
        speed:   Math.random() * 0.03 + 0.01,
      });
    }
  }

  function drawStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, s.alpha));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      s.alpha += s.dAlpha;
      if (s.alpha > 0.85 || s.alpha < 0.05) s.dAlpha *= -1;
      s.y += s.speed;
      if (s.y > canvas.height + 2) { s.y = -2; s.x = Math.random() * canvas.width; }
    }
    requestAnimationFrame(drawStars);
  }

  resize();
  createStars();
  drawStars();
  window.addEventListener('resize', () => { resize(); createStars(); });
})();

// ══════════════════════════════════════════════════════════
//   MARKDOWN → HTML PARSER
// ══════════════════════════════════════════════════════════
function markdownToHtml(md) {
  const lines = md.split('\n');
  const output = [];
  let i = 0;
  let inList = false;

  function closeList() {
    if (inList) { output.push('</ul>'); inList = false; }
  }

  while (i < lines.length) {
    let line = lines[i];

    // Mermaid code block
    if (line.trim().startsWith('```mermaid')) {
      closeList();
      const mermaidLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        mermaidLines.push(lines[i]);
        i++;
      }
      output.push(`<pre class="mermaid-block"><code>[Diagram Hubungan / Alur]\n${escHtml(mermaidLines.join('\n'))}</code></pre>`);
      i++; continue;
    }

    // Generic code block
    if (line.trim().startsWith('```')) {
      closeList();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      output.push(`<pre><code>${escHtml(codeLines.join('\n'))}</code></pre>`);
      i++; continue;
    }

    // Headings
    if (line.startsWith('#### ')) { closeList(); output.push(`<h4>${inlineMd(line.slice(5))}</h4>`); i++; continue; }
    if (line.startsWith('### '))  { closeList(); output.push(`<h3>${inlineMd(line.slice(4))}</h3>`); i++; continue; }
    if (line.startsWith('## '))   { closeList(); output.push(`<h2>${inlineMd(line.slice(3))}</h2>`); i++; continue; }
    if (line.startsWith('# '))    { closeList(); output.push(`<h1>${inlineMd(line.slice(2))}</h1>`); i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { closeList(); output.push('<hr />'); i++; continue; }

    // Blockquote
    if (line.startsWith('> ')) {
      closeList();
      output.push(`<blockquote>${inlineMd(line.slice(2))}</blockquote>`);
      i++; continue;
    }

    // Unordered list
    if (/^\s*[-*+] /.test(line)) {
      if (!inList) { output.push('<ul class="backstory-list">'); inList = true; }
      output.push(`<li>${inlineMd(line.replace(/^\s*[-*+] /, ''))}</li>`);
      i++; continue;
    }

    // Empty line
    if (line.trim() === '') {
      closeList();
      output.push('');
      i++; continue;
    }

    // Paragraph
    closeList();
    output.push(`<p>${inlineMd(line)}</p>`);
    i++;
  }
  closeList();

  return output.join('\n');
}

function inlineMd(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function encodeImagePath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

// ══════════════════════════════════════════════════════════
//   POPULATE CHARACTER DATA
// ══════════════════════════════════════════════════════════
async function loadCharacterDetail() {
  // 1. Get character ID from URL
  const params = new URLSearchParams(window.location.search);
  const charId = params.get('id');

  if (!charId) {
    showError('Karakter tidak ditentukan. Gunakan link dari galeri utama.');
    return;
  }

  try {
    // 2. Fetch database.json
    const res = await fetch('database.json?t=' + Date.now());
    if (!res.ok) throw new Error('Gagal memuat database.json');
    const characters = await res.json();

    // 3. Find character
    const char = characters.find(c => c.id === charId);
    if (!char) {
      showError(`Karakter dengan ID "${charId}" tidak ditemukan.`);
      return;
    }

    // 4. Update Document Title
    document.title = `${char.name} — Codex Solythis`;

    // 5. Populate Basic Info
    DOM.charName.textContent = char.name;
    DOM.charAlias.textContent = char.alias ? `"${char.alias}"` : '';
    DOM.charAlias.style.display = char.alias ? '' : 'none';

    // Party Badge
    const ps = getPartyStyle(char.party);
    DOM.partyBadge.textContent = ps.label;
    DOM.partyBadge.className = `detail-party-badge ${ps.cssClass}`;

    // Sprite
    if (char.sprite_path) {
      DOM.sprite.src = encodeImagePath(char.sprite_path);
      DOM.sprite.alt = `Sprite ${char.name}`;
      DOM.sprite.style.display = '';
    } else {
      DOM.sprite.src = '';
      DOM.sprite.style.display = 'none';
    }

    // Populate stats
    const statsData = [
      { label: 'Spesies / Ras', value: char.race },
      { label: 'Kelas Utama',   value: char.class },
      { label: 'Subkelas',      value: char.subclass },
      { label: 'Alignment',     value: char.alignment },
      { label: 'Usia',          value: char.age },
      { label: 'Gender',        value: char.gender },
      { label: 'Tinggi Badan',  value: char.height },
      { label: 'Penampilan',    value: char.appearance },
      { label: 'Keyakinan / Faith', value: char.faith },
      { label: 'Sifat / Karakter',  value: char.personality },
      { label: 'Ideal / Prinsip',   value: char.ideals },
      { label: 'Afiliasi / Bond',   value: char.bonds },
    ];

    DOM.statsList.innerHTML = statsData
      .filter(s => s.value && !String(s.value).startsWith('TODO'))
      .map(s => `
        <div class="detail-stat-row">
          <dt class="detail-stat-label">${escHtml(s.label)}</dt>
          <dd class="detail-stat-value">${escHtml(String(s.value))}</dd>
        </div>
      `).join('');

    // Summary content
    const summary = char.backstory_summary && !char.backstory_summary.startsWith('TODO')
      ? char.backstory_summary
      : '<em>Ringkasan biografi belum ditambahkan.</em>';
    DOM.summaryText.innerHTML = summary;

    // 6. Fetch Deep Backstory
    if (char.has_deep_backstory && char.backstory_path) {
      try {
        const backstoryRes = await fetch(encodeImagePath(char.backstory_path) + '?t=' + Date.now());
        if (backstoryRes.ok) {
          const md = await backstoryRes.text();
          DOM.deepBackstory.innerHTML = `
            <div class="backstory-divider"></div>
            <h3 class="deep-story-title">Riwayat Hidup Lengkap (Chronicle)</h3>
            <div class="markdown-body">${markdownToHtml(md)}</div>
          `;
        } else {
          DOM.deepBackstory.innerHTML = `<p class="backstory-error">Gagal memuat chronicle mendalam: file tidak ditemukan.</p>`;
        }
      } catch (err) {
        console.error('Failed to load backstory file:', err);
        DOM.deepBackstory.innerHTML = `<p class="backstory-error">Gagal membaca file backstory.</p>`;
      }
    } else {
      DOM.deepBackstory.innerHTML = `<p class="backstory-empty">Karakter ini belum memiliki file biografi mendalam (.md). Gunakan ringkasan di atas sebagai referensi utama.</p>`;
    }

    // 7. Populate Lore Pointer Grid
    const lore = char.lore_pointer || {};

    // Origin
    DOM.originVal.innerHTML = lore.origin && !lore.origin.startsWith('TODO')
      ? `<p class="lore-text">${escHtml(lore.origin)}</p>`
      : `<p class="lore-empty-text">Belum ada catatan origin.</p>`;

    // List populations
    populateLoreList(DOM.peopleList, lore.important_people, '👥', 'Belum ada relasi tokoh penting.');
    populateLoreList(DOM.placesList, lore.important_places, '📍', 'Belum ada relasi lokasi penting.');
    populateLoreList(DOM.orgsList, lore.important_organizations, '⚜', 'Belum ada relasi organisasi.');

    // Reveal Grid
    DOM.stateLoading.classList.add('hidden');
    DOM.detailGrid.classList.remove('hidden');

  } catch (err) {
    console.error(err);
    showError('Koneksi database terputus. Pastikan database.json valid.');
  }
}

function populateLoreList(element, data, icon, emptyMessage) {
  const validItems = (data || []).filter(item => item && !item.startsWith('TODO'));
  if (validItems.length === 0) {
    element.innerHTML = `<li class="lore-list-empty-item">${emptyMessage}</li>`;
  } else {
    element.innerHTML = validItems.map(item => `
      <li class="lore-card-list-item">
        <span class="lore-list-icon">${icon}</span>
        <span class="lore-list-text">${escHtml(item)}</span>
      </li>
    `).join('');
  }
}

function showError(msg) {
  DOM.errorMessage.textContent = msg;
  DOM.stateLoading.classList.add('hidden');
  DOM.stateError.classList.remove('hidden');
}

// Start
document.addEventListener('DOMContentLoaded', loadCharacterDetail);
