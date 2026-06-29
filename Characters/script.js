/**
 * Solythis Chronicles — Main Script
 * ===================================
 * Handles: database fetch, gallery render, party filter,
 * character detail modal, tab navigation, markdown rendering.
 */

'use strict';

// ── State ──────────────────────────────────────────────────
let ALL_CHARACTERS = [];
let CURRENT_PARTY  = 'all';
let ACTIVE_CHAR    = null;
let BACKSTORY_EXPANDED = false;

// ── DOM References ─────────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
  gallery:          $('character-grid'),
  stateLoading:     $('state-loading'),
  stateError:       $('state-error'),
  stateEmpty:       $('state-empty'),
  errorMessage:     $('error-message'),
  filterBtns:       document.querySelectorAll('.filter-btn'),

  // Modal
  overlay:          $('modal-overlay'),
  backdrop:         $('modal-backdrop'),
  container:        $('modal-container'),
  closeBtn:         $('modal-close'),
  sprite:           $('modal-sprite'),
  partyBadge:       $('modal-party-badge'),
  charName:         $('modal-char-name'),
  charAlias:        $('modal-char-alias'),
  statsEl:          $('modal-stats'),
  backstoryContent: $('backstory-content'),
  btnReadMore:      $('btn-read-more'),
  fullBackstory:    $('full-backstory'),

  // Tabs
  tabBtns:          document.querySelectorAll('.lore-tab'),
  tabPanes:         document.querySelectorAll('.lore-pane'),

  // Lore sections
  originCard:       $('lore-origin-card'),
  peopleList:       $('lore-people-list'),
  placesList:       $('lore-places-list'),
  orgsList:         $('lore-orgs-list'),
};

// ── Party Badge Config ─────────────────────────────────────
const PARTY_STYLES = {
  'Party Solmarch': { label: 'Solmarch', cssClass: 'card-party-badge--solmarch', modalStyle: 'background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);color:#7dd3fc' },
  'Party Vaelthar': { label: 'Vaelthar',  cssClass: 'card-party-badge--vaelthar', modalStyle: 'background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.35);color:#a78bfa' },
};

function getPartyStyle(party) {
  return PARTY_STYLES[party] || { label: party, cssClass: 'card-party-badge--default', modalStyle: '' };
}

// ══════════════════════════════════════════════════════════
//   STAR CANVAS BACKGROUND
// ══════════════════════════════════════════════════════════
(function initStars() {
  const canvas = $('star-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const stars = [];
  const STAR_COUNT = 180;

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
        r:       Math.random() * 1.4 + 0.2,
        alpha:   Math.random() * 0.7 + 0.1,
        dAlpha:  (Math.random() * 0.008 + 0.002) * (Math.random() < 0.5 ? 1 : -1),
        speed:   Math.random() * 0.04 + 0.01,
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

      // Twinkle
      s.alpha += s.dAlpha;
      if (s.alpha > 0.85 || s.alpha < 0.05) s.dAlpha *= -1;
      // Slow drift
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
//   DATA FETCHING
// ══════════════════════════════════════════════════════════
async function fetchDatabase() {
  const res = await fetch('database.json?t=' + Date.now());
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
  return res.json();
}

// ══════════════════════════════════════════════════════════
//   GALLERY RENDER
// ══════════════════════════════════════════════════════════
function renderGallery(characters) {
  DOM.gallery.innerHTML = '';
  const filtered = CURRENT_PARTY === 'all'
    ? characters
    : characters.filter(c => c.party === CURRENT_PARTY);

  if (filtered.length === 0) {
    showState('empty');
    return;
  }
  showState('gallery');

  filtered.forEach((char, idx) => {
    const card = createCard(char, idx);
    DOM.gallery.appendChild(card);
  });
}

function createCard(char, idx) {
  const partyStyle = getPartyStyle(char.party);

  const card = document.createElement('article');
  card.className = 'character-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Lihat detail ${char.name}`);
  card.style.animationDelay = `${idx * 0.07}s`;

  // Image or placeholder
  const imageHtml = char.sprite_path
    ? `<img class="card-image" src="${encodeImagePath(char.sprite_path)}" alt="Sprite ${char.name}" loading="lazy" onerror="this.outerHTML='<div class=\\'card-image-placeholder\\'>⚔</div>'" />`
    : `<div class="card-image-placeholder">⚔</div>`;

  card.innerHTML = `
    <div class="card-image-wrap">
      ${imageHtml}
      <div class="card-overlay" aria-hidden="true">
        <span class="card-overlay-text">Lihat Detail →</span>
      </div>
    </div>
    <div class="card-body">
      <span class="card-party-badge ${partyStyle.cssClass}">${partyStyle.label}</span>
      <h2 class="card-name">${escHtml(char.name)}</h2>
      ${char.alias ? `<p class="card-alias">"${escHtml(char.alias)}"</p>` : ''}
      <div class="card-meta">
        ${char.race && !char.race.startsWith('TODO') ? `<span class="card-meta-tag">${escHtml(char.race)}</span>` : ''}
        ${char.class && !char.class.startsWith('TODO') ? `<span class="card-meta-tag">${escHtml(char.class)}</span>` : ''}
      </div>
    </div>
  `;

  card.addEventListener('click', () => { window.location.href = `detail.html?id=${char.id}`; });
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.href = `detail.html?id=${char.id}`; } });

  return card;
}

// ══════════════════════════════════════════════════════════
//   PARTY FILTER
// ══════════════════════════════════════════════════════════
function initFilter() {
  DOM.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const party = btn.dataset.party;
      if (party === CURRENT_PARTY) return;
      CURRENT_PARTY = party;

      // Update active states
      DOM.filterBtns.forEach(b => {
        b.classList.toggle('active', b.dataset.party === party);
        b.setAttribute('aria-pressed', b.dataset.party === party ? 'true' : 'false');
      });

      // Animate out → re-render → animate in
      DOM.gallery.style.opacity = '0';
      DOM.gallery.style.transform = 'translateY(8px)';
      setTimeout(() => {
        renderGallery(ALL_CHARACTERS);
        DOM.gallery.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        DOM.gallery.style.opacity = '1';
        DOM.gallery.style.transform = 'translateY(0)';
      }, 220);
    });
  });
}

// ══════════════════════════════════════════════════════════
//   CHARACTER DETAIL MODAL
// ══════════════════════════════════════════════════════════
function openModal(char) {
  ACTIVE_CHAR = char;
  BACKSTORY_EXPANDED = false;

  // Sprite
  if (char.sprite_path) {
    DOM.sprite.src = encodeImagePath(char.sprite_path);
    DOM.sprite.alt = `Sprite ${char.name}`;
    DOM.sprite.style.display = '';
  } else {
    DOM.sprite.src = '';
    DOM.sprite.style.display = 'none';
  }

  // Party badge
  const ps = getPartyStyle(char.party);
  DOM.partyBadge.textContent = ps.label;
  DOM.partyBadge.style.cssText = ps.modalStyle;
  DOM.partyBadge.className = `modal-party-badge ${ps.cssClass}`;

  // Name & Alias
  DOM.charName.textContent  = char.name || '—';
  DOM.charAlias.textContent = char.alias ? `"${char.alias}"` : '';
  DOM.charAlias.style.display = char.alias ? '' : 'none';

  // Stats DL
  const statsData = [
    { label: 'Ras',         value: char.race },
    { label: 'Kelas',       value: char.class },
    { label: 'Subkelas',    value: char.subclass },
    { label: 'Alignment',   value: char.alignment },
    { label: 'Usia',        value: char.age },
    { label: 'Gender',      value: char.gender },
    { label: 'Tinggi',      value: char.height },
    { label: 'Penampilan',  value: char.appearance },
    { label: 'Party',       value: char.party },
  ];
  DOM.statsEl.innerHTML = statsData
    .filter(s => s.value && !String(s.value).startsWith('TODO'))
    .map(s => `
      <div class="stat-row">
        <dt class="stat-label">${escHtml(s.label)}</dt>
        <dd class="stat-value">${escHtml(String(s.value))}</dd>
      </div>
    `).join('');

  // Backstory summary
  const summary = char.backstory_summary && !char.backstory_summary.startsWith('TODO')
    ? char.backstory_summary
    : '<em>Backstory belum tersedia. Isi <code>backstory_summary</code> di file JSON karakter ini.</em>';
  DOM.backstoryContent.innerHTML = `<p>${escHtml(char.backstory_summary && !char.backstory_summary.startsWith('TODO') ? char.backstory_summary : '')}</p>`;
  if (char.backstory_summary && !char.backstory_summary.startsWith('TODO')) {
    DOM.backstoryContent.innerHTML = `<p>${escHtml(char.backstory_summary)}</p>`;
  } else {
    DOM.backstoryContent.innerHTML = `<p style="color:var(--clr-text-faint);font-style:italic">Backstory belum tersedia. Isi <code style="color:var(--clr-gold)">backstory_summary</code> di file JSON karakter ini.</p>`;
  }

  // "Baca Backstory Lengkap" button
  DOM.fullBackstory.innerHTML = '';
  DOM.fullBackstory.classList.add('hidden');
  if (char.has_deep_backstory && char.backstory_path) {
    DOM.btnReadMore.classList.remove('hidden');
    DOM.btnReadMore.classList.remove('active');
    DOM.btnReadMore.innerHTML = '<span class="btn-read-more__icon">📜</span> Baca Backstory Lengkap';
    DOM.btnReadMore.onclick = () => toggleFullBackstory(char.backstory_path);
  } else {
    DOM.btnReadMore.classList.add('hidden');
  }

  // Lore Pointer sections
  populateLore(char.lore_pointer || {});

  // Reset to first tab
  switchTab('profile');

  // Show modal
  DOM.overlay.classList.remove('hidden');
  DOM.overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';

  // Focus trap
  setTimeout(() => DOM.closeBtn.focus(), 100);
}

function closeModal() {
  DOM.overlay.classList.add('hidden');
  DOM.overlay.classList.remove('visible');
  document.body.style.overflow = '';
  ACTIVE_CHAR = null;
}

async function toggleFullBackstory(path) {
  if (BACKSTORY_EXPANDED) {
    DOM.fullBackstory.classList.add('hidden');
    DOM.btnReadMore.classList.remove('active');
    DOM.btnReadMore.innerHTML = '<span class="btn-read-more__icon">📜</span> Baca Backstory Lengkap';
    BACKSTORY_EXPANDED = false;
    return;
  }

  // Load markdown
  DOM.btnReadMore.innerHTML = '<span class="btn-read-more__icon">⏳</span> Memuat...';
  DOM.btnReadMore.disabled = true;
  try {
    const res = await fetch(encodeImagePath(path) + '?t=' + Date.now());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    DOM.fullBackstory.innerHTML = markdownToHtml(md);
    DOM.fullBackstory.classList.remove('hidden');
    DOM.btnReadMore.classList.add('active');
    DOM.btnReadMore.innerHTML = '<span class="btn-read-more__icon">📖</span> Sembunyikan';
    BACKSTORY_EXPANDED = true;
  } catch (e) {
    DOM.btnReadMore.innerHTML = '<span class="btn-read-more__icon">⚠</span> Gagal Memuat';
    console.error('Failed to load backstory:', e);
  } finally {
    DOM.btnReadMore.disabled = false;
  }
}

// ── Lore Pointer Sections ──────────────────────────────────
function populateLore(lore) {
  // Origin
  const originText = lore.origin && !lore.origin.startsWith('TODO')
    ? lore.origin
    : null;
  DOM.originCard.innerHTML = originText
    ? escHtml(originText)
    : `<span style="color:var(--clr-text-faint);font-style:italic">Belum diisi. Tambahkan field <code style="color:var(--clr-gold)">origin</code> di JSON karakter.</span>`;

  // People, Places, Orgs
  const listConfigs = [
    { el: DOM.peopleList, data: lore.important_people,        icon: '👤', emptyMsg: 'Belum ada data orang penting.' },
    { el: DOM.placesList, data: lore.important_places,        icon: '📍', emptyMsg: 'Belum ada data tempat penting.' },
    { el: DOM.orgsList,   data: lore.important_organizations, icon: '⚜',  emptyMsg: 'Belum ada data organisasi.' },
  ];

  for (const cfg of listConfigs) {
    const validItems = (cfg.data || []).filter(item => item && !item.startsWith('TODO'));
    if (validItems.length === 0) {
      cfg.el.innerHTML = `<li class="lore-list-item empty"><span class="lore-list-item__icon">📋</span> ${cfg.emptyMsg}</li>`;
    } else {
      cfg.el.innerHTML = validItems.map(item => `
        <li class="lore-list-item">
          <span class="lore-list-item__icon">${cfg.icon}</span>
          <span>${escHtml(item)}</span>
        </li>
      `).join('');
    }
  }
}

// ── Tab Navigation ─────────────────────────────────────────
function switchTab(tabId) {
  DOM.tabBtns.forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  DOM.tabPanes.forEach(pane => {
    const isActive = pane.id === `pane-${tabId}`;
    pane.classList.toggle('active', isActive);
  });
}

function initTabs() {
  DOM.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

// ── Modal Events ───────────────────────────────────────────
function initModalEvents() {
  DOM.closeBtn.addEventListener('click', closeModal);
  DOM.backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ACTIVE_CHAR) closeModal();
  });
}

// ══════════════════════════════════════════════════════════
//   SIMPLE MARKDOWN → HTML PARSER
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

    // Mermaid code block → styled pre
    if (line.trim().startsWith('```mermaid')) {
      closeList();
      const mermaidLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        mermaidLines.push(lines[i]);
        i++;
      }
      output.push(`<pre class="mermaid-block"><code>[Diagram Mermaid]\n${escHtml(mermaidLines.join('\n'))}</code></pre>`);
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
      if (!inList) { output.push('<ul>'); inList = true; }
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
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// ══════════════════════════════════════════════════════════
//   UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Encode a file path for use in src/href, handling spaces */
function encodeImagePath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

/** Show one UI state, hide the others */
function showState(state) {
  DOM.stateLoading.classList.toggle('hidden', state !== 'loading');
  DOM.stateError.classList.toggle('hidden',   state !== 'error');
  DOM.stateEmpty.classList.toggle('hidden',   state !== 'empty');
  DOM.gallery.classList.toggle('hidden',      state !== 'gallery');
}

// ══════════════════════════════════════════════════════════
//   APP INIT
// ══════════════════════════════════════════════════════════
async function initApp() {
  showState('loading');
  try {
    ALL_CHARACTERS = await fetchDatabase();
    initFilter();
    initTabs();
    initModalEvents();
    renderGallery(ALL_CHARACTERS);
  } catch (err) {
    console.error('[Solythis] Failed to load database.json:', err);
    DOM.errorMessage.innerHTML = `
      Tidak dapat memuat <code>database.json</code>.<br>
      Pastikan kamu sudah menjalankan <code>python sync.py --once</code>
      dan membuka website via server lokal:<br>
      <code>python -m http.server 8080</code>
    `;
    showState('error');
  }
}

// Start
document.addEventListener('DOMContentLoaded', initApp);
