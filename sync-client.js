/**
 * Solythis D&D — Sync Client Module
 * ===================================
 * Drop-in script yang menghubungkan halaman ke server Socket.io.
 * Jika dibuka via file:// (offline), semua fitur tetap berfungsi.
 *
 * Menyediakan:
 *  - SolSync API (emit, on, isConnected, etc.)
 *  - Player Name management (localStorage)
 *  - Toast notification system
 *  - Dice roll animation overlay
 *  - Connection status indicator
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════
  //  AUTO-DETECTION
  // ══════════════════════════════════════════
  const isOnline = window.location.protocol !== 'file:' && typeof io !== 'undefined';
  let socket = null;

  if (isOnline) {
    try {
      socket = io({ transports: ['websocket', 'polling'] });
    } catch (e) {
      console.warn('[SolSync] Socket.io tidak tersedia, mode offline.');
    }
  }

  // ══════════════════════════════════════════
  //  PLAYER IDENTITY
  // ══════════════════════════════════════════
  const LS_KEY_NAME = 'sol_player_name';
  const LS_KEY_ROLE = 'sol_player_role';
  const LS_KEY_MODIFIERS = 'sol_modifiers';

  function getPlayerName() {
    return localStorage.getItem(LS_KEY_NAME) || '';
  }
  function setPlayerName(name) {
    localStorage.setItem(LS_KEY_NAME, name);
  }
  function getPlayerRole() {
    return localStorage.getItem(LS_KEY_ROLE) || 'player';
  }
  function setPlayerRole(role) {
    localStorage.setItem(LS_KEY_ROLE, role);
  }

  // ══════════════════════════════════════════
  //  ATTRIBUTE MODIFIERS (per player, localStorage)
  // ══════════════════════════════════════════
  function getModifiers() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY_MODIFIERS)) || {
        STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0
      };
    } catch { return { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 }; }
  }
  function setModifiers(mods) {
    localStorage.setItem(LS_KEY_MODIFIERS, JSON.stringify(mods));
  }

  // ══════════════════════════════════════════
  //  SolSync API
  // ══════════════════════════════════════════
  const SolSync = {
    socket,
    isOnline,

    emit(event, data) {
      if (socket && socket.connected) socket.emit(event, data);
    },

    on(event, callback) {
      if (socket) socket.on(event, callback);
    },

    off(event, callback) {
      if (socket) socket.off(event, callback);
    },

    isConnected() {
      return socket ? socket.connected : false;
    },

    getPlayerName,
    setPlayerName,
    getPlayerRole,
    setPlayerRole,
    getModifiers,
    setModifiers,
  };

  window.SolSync = SolSync;

  // ══════════════════════════════════════════
  //  INJECT GLOBAL STYLES
  // ══════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('sol-sync-styles')) return;
    const style = document.createElement('style');
    style.id = 'sol-sync-styles';
    style.textContent = `
      /* ── Player Name Modal ── */
      .sol-name-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(5,7,14,0.92);
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(12px);
        animation: solFadeIn 0.3s ease;
      }
      .sol-name-card {
        background: linear-gradient(145deg, rgba(17,22,38,0.98), rgba(7,9,14,0.98));
        border: 1px solid rgba(212,175,55,0.35);
        border-radius: 18px;
        padding: 2.5rem 2rem;
        width: min(420px, 90vw);
        text-align: center;
        box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(212,175,55,0.08);
      }
      .sol-name-card h2 {
        font-family: 'Cinzel', serif;
        color: #d4af37;
        font-size: 1.3rem;
        margin-bottom: 0.3rem;
      }
      .sol-name-card p {
        color: #94a3b8;
        font-size: 0.85rem;
        margin-bottom: 1.5rem;
      }
      .sol-name-input {
        width: 100%;
        padding: 12px 16px;
        font-size: 1.05rem;
        font-family: 'Plus Jakarta Sans', sans-serif;
        background: rgba(0,0,0,0.4);
        border: 1px solid rgba(212,175,55,0.3);
        border-radius: 10px;
        color: #e2e8f0;
        outline: none;
        transition: border-color 0.2s;
        margin-bottom: 1rem;
      }
      .sol-name-input:focus {
        border-color: #d4af37;
        box-shadow: 0 0 12px rgba(212,175,55,0.2);
      }
      .sol-name-role-row {
        display: flex; gap: 8px; margin-bottom: 1.2rem;
      }
      .sol-role-btn {
        flex: 1;
        padding: 10px;
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 0.85rem;
        font-weight: 600;
        border: 1px solid rgba(212,175,55,0.25);
        border-radius: 10px;
        background: rgba(0,0,0,0.3);
        color: #94a3b8;
        cursor: pointer;
        transition: all 0.2s;
      }
      .sol-role-btn:hover { border-color: rgba(212,175,55,0.5); color: #e2e8f0; }
      .sol-role-btn.active {
        background: rgba(212,175,55,0.15);
        border-color: #d4af37;
        color: #d4af37;
      }
      .sol-name-submit {
        width: 100%;
        padding: 12px;
        font-family: 'Cinzel', serif;
        font-size: 1rem;
        font-weight: 700;
        background: linear-gradient(135deg, #d4af37, #b8912e);
        border: none;
        border-radius: 10px;
        color: #07090e;
        cursor: pointer;
        transition: all 0.2s;
        letter-spacing: 0.05em;
      }
      .sol-name-submit:hover {
        filter: brightness(1.15);
        box-shadow: 0 0 24px rgba(212,175,55,0.3);
        transform: translateY(-1px);
      }

      /* ── Connection Status Indicator ── */
      .sol-conn-indicator {
        position: fixed;
        top: 10px; right: 10px;
        z-index: 99990;
        display: flex; align-items: center; gap: 6px;
        padding: 5px 12px;
        border-radius: 20px;
        font-size: 0.72rem;
        font-weight: 600;
        font-family: 'Plus Jakarta Sans', sans-serif;
        letter-spacing: 0.03em;
        pointer-events: none;
        opacity: 0.85;
        transition: all 0.3s;
      }
      .sol-conn-indicator.connected {
        background: rgba(16,185,129,0.15);
        border: 1px solid rgba(16,185,129,0.4);
        color: #10b981;
      }
      .sol-conn-indicator.disconnected {
        background: rgba(239,68,68,0.15);
        border: 1px solid rgba(239,68,68,0.4);
        color: #ef4444;
      }
      .sol-conn-dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: currentColor;
        animation: solPulse 2s infinite;
      }
      .sol-conn-indicator.disconnected .sol-conn-dot { animation: none; }

      /* ── Toast Notification Stack ── */
      .sol-toast-container {
        position: fixed;
        bottom: 20px; right: 20px;
        z-index: 99980;
        display: flex;
        flex-direction: column-reverse;
        gap: 8px;
        pointer-events: none;
        max-height: 60vh;
        overflow: hidden;
      }
      .sol-toast {
        pointer-events: auto;
        min-width: 280px;
        max-width: 360px;
        padding: 14px 18px;
        border-radius: 14px;
        background: linear-gradient(145deg, rgba(13,15,26,0.97), rgba(7,9,14,0.97));
        border: 1px solid rgba(212,175,55,0.3);
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 20px rgba(212,175,55,0.06);
        backdrop-filter: blur(16px);
        animation: solToastIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        transition: all 0.3s;
      }
      .sol-toast.removing {
        animation: solToastOut 0.3s ease forwards;
      }
      .sol-toast-header {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 6px;
      }
      .sol-toast-icon {
        font-size: 1.2rem;
      }
      .sol-toast-player {
        font-family: 'Cinzel', serif;
        font-size: 0.85rem;
        font-weight: 700;
        color: #d4af37;
      }
      .sol-toast-formula {
        font-size: 0.78rem;
        color: #94a3b8;
        margin-bottom: 4px;
      }
      .sol-toast-total {
        font-family: 'Cinzel', serif;
        font-size: 1.6rem;
        font-weight: 900;
        color: #e2e8f0;
        line-height: 1;
      }
      .sol-toast-total.nat20 { color: #10b981; text-shadow: 0 0 20px rgba(16,185,129,0.5); }
      .sol-toast-total.nat1  { color: #ef4444; text-shadow: 0 0 20px rgba(239,68,68,0.5); }
      .sol-toast-breakdown {
        font-size: 0.72rem;
        color: #64748b;
        margin-top: 2px;
      }
      .sol-toast-event {
        border-left: 3px solid #7c3aed;
      }
      .sol-toast-event .sol-toast-player { color: #a78bfa; }

      /* ── Dice Animation Overlay ── */
      .dice-anim-overlay {
        position: fixed; inset: 0; z-index: 99995;
        background: rgba(5,7,14,0.85);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        backdrop-filter: blur(8px);
        animation: solFadeIn 0.2s ease;
        pointer-events: none;
      }
      .dice-anim-overlay.hiding {
        animation: solFadeOut 0.4s ease forwards;
      }
      .dice-anim-die {
        font-size: 5rem;
        animation: diceRoll3D 1s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        filter: drop-shadow(0 0 30px rgba(212,175,55,0.4));
      }
      .dice-anim-die svg {
        width: 100px; height: 100px;
        fill: none; stroke: #d4af37; stroke-width: 1.5;
      }
      .dice-anim-result {
        text-align: center;
        margin-top: 1.2rem;
        animation: diceReveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.8s both;
      }
      .dice-anim-player {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 0.9rem;
        font-weight: 600;
        color: #d4af37;
        letter-spacing: 0.05em;
        margin-bottom: 0.3rem;
      }
      .dice-anim-formula {
        font-size: 0.85rem;
        color: #94a3b8;
        margin-bottom: 0.6rem;
      }
      .dice-anim-number {
        font-family: 'Cinzel', serif;
        font-size: 4.5rem;
        font-weight: 900;
        color: #fff;
        line-height: 1;
        text-shadow: 0 0 40px rgba(255,255,255,0.2);
      }
      .dice-anim-number.nat20 {
        color: #10b981;
        text-shadow: 0 0 60px rgba(16,185,129,0.6);
        animation: nat20Glow 0.8s ease infinite alternate;
      }
      .dice-anim-number.nat1 {
        color: #ef4444;
        text-shadow: 0 0 60px rgba(239,68,68,0.6);
      }
      .dice-anim-breakdown {
        font-size: 0.85rem;
        color: #64748b;
        margin-top: 0.4rem;
      }

      /* Nat20 particles */
      .dice-particle {
        position: fixed;
        width: 6px; height: 6px;
        border-radius: 50%;
        pointer-events: none;
        z-index: 99996;
        animation: goldParticle 1.5s ease-out forwards;
      }

      /* Nat1 screen shake */
      .dice-shake {
        animation: nat1Shake 0.5s ease;
      }

      /* ── Keyframes ── */
      @keyframes solFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes solFadeOut { from { opacity: 1; } to { opacity: 0; } }
      @keyframes solPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      @keyframes solToastIn {
        from { transform: translateX(120%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes solToastOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(120%); opacity: 0; }
      }
      @keyframes diceRoll3D {
        0%   { transform: rotateX(0) rotateY(0) scale(0.3); opacity: 0; }
        30%  { transform: rotateX(540deg) rotateY(360deg) scale(1.2); opacity: 1; }
        60%  { transform: rotateX(720deg) rotateY(540deg) scale(0.95); }
        100% { transform: rotateX(720deg) rotateY(720deg) scale(1); }
      }
      @keyframes diceReveal {
        from { transform: scale(0.5) translateY(20px); opacity: 0; }
        to   { transform: scale(1) translateY(0); opacity: 1; }
      }
      @keyframes nat20Glow {
        from { text-shadow: 0 0 40px rgba(16,185,129,0.4); }
        to   { text-shadow: 0 0 80px rgba(16,185,129,0.8), 0 0 120px rgba(212,175,55,0.3); }
      }
      @keyframes nat1Shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-10px); }
        40% { transform: translateX(10px); }
        60% { transform: translateX(-6px); }
        80% { transform: translateX(6px); }
      }
      @keyframes goldParticle {
        0%   { transform: translateY(0) scale(1); opacity: 1; }
        100% { transform: translateY(-200px) scale(0); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════
  //  TOAST NOTIFICATIONS
  // ══════════════════════════════════════════
  let toastContainer = null;
  const MAX_TOASTS = 5;

  function ensureToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return;
    toastContainer = document.createElement('div');
    toastContainer.className = 'sol-toast-container';
    toastContainer.id = 'solToastContainer';
    document.body.appendChild(toastContainer);
  }

  function showDiceToast(data) {
    ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'sol-toast';

    const isNat20 = data.sides === 20 && data.rawRoll === 20;
    const isNat1 = data.sides === 20 && data.rawRoll === 1;
    const totalClass = isNat20 ? 'nat20' : isNat1 ? 'nat1' : '';
    const natLabel = isNat20 ? ' — NATURAL 20! ✨' : isNat1 ? ' — CRITICAL FAIL 💀' : '';

    let breakdownHtml = '';
    if (data.modifier && data.modifier !== 0) {
      breakdownHtml = `<div class="sol-toast-breakdown">(${data.rawRoll}) + ${data.modifier}${data.modName ? ' (' + data.modName + ')' : ''}</div>`;
    }

    toast.innerHTML = `
      <div class="sol-toast-header">
        <span class="sol-toast-icon">🎲</span>
        <span class="sol-toast-player">${escapeHtml(data.player || 'Unknown')}</span>
      </div>
      <div class="sol-toast-formula">${escapeHtml(data.formula || '')}${natLabel}</div>
      <div class="sol-toast-total ${totalClass}">${data.total}</div>
      ${breakdownHtml}
    `;

    toastContainer.appendChild(toast);

    // Enforce max toasts
    while (toastContainer.children.length > MAX_TOASTS) {
      const oldest = toastContainer.children[0];
      oldest.classList.add('removing');
      setTimeout(() => oldest.remove(), 300);
    }

    // Auto-dismiss
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 6000);
  }

  function showEventToast(message, icon) {
    ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'sol-toast sol-toast-event';
    toast.innerHTML = `
      <div class="sol-toast-header">
        <span class="sol-toast-icon">${icon || '📢'}</span>
        <span class="sol-toast-player">${escapeHtml(message)}</span>
      </div>
    `;
    toastContainer.appendChild(toast);

    while (toastContainer.children.length > MAX_TOASTS) {
      toastContainer.children[0].remove();
    }

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ══════════════════════════════════════════
  //  DICE ANIMATION OVERLAY
  // ══════════════════════════════════════════
  const DICE_SVG = {
    4:  '<svg viewBox="0 0 24 24"><path d="M12 3L2 20h20L12 3z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    6:  '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    8:  '<svg viewBox="0 0 24 24"><path d="M12 2L2 12l10 10 10-10L12 2z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    10: '<svg viewBox="0 0 24 24"><path d="M12 2l-8 10 8 10 8-10z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    12: '<svg viewBox="0 0 24 24"><path d="M12 2l-5 4-5 6 5 6 5 4 5-4 5-6-5-6z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    20: '<svg viewBox="0 0 24 24"><path d="M12 2l-8 7 3 11h10l3-11z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    100:'<svg viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle" font-size="12" fill="currentColor" font-weight="bold">%</text></svg>',
  };

  function showDiceAnimation(data) {
    const existing = document.getElementById('solDiceAnim');
    if (existing) existing.remove();

    const isNat20 = data.sides === 20 && data.rawRoll === 20;
    const isNat1 = data.sides === 20 && data.rawRoll === 1;
    const totalClass = isNat20 ? 'nat20' : isNat1 ? 'nat1' : '';

    const overlay = document.createElement('div');
    overlay.className = 'dice-anim-overlay';
    overlay.id = 'solDiceAnim';

    let breakdownHtml = '';
    if (data.modifier && data.modifier !== 0) {
      breakdownHtml = `<div class="dice-anim-breakdown">(${data.rawRoll}) + ${data.modifier}${data.modName ? ' (' + data.modName + ')' : ''}</div>`;
    }

    overlay.innerHTML = `
      <div class="dice-anim-die">${DICE_SVG[data.sides] || '🎲'}</div>
      <div class="dice-anim-result">
        <div class="dice-anim-player">${escapeHtml(data.player || 'Unknown')}</div>
        <div class="dice-anim-formula">${escapeHtml(data.formula || `d${data.sides}`)}</div>
        <div class="dice-anim-number ${totalClass}">${data.total}</div>
        ${breakdownHtml}
      </div>
    `;

    document.body.appendChild(overlay);

    // Nat20 particles
    if (isNat20) {
      spawnParticles(30, ['#d4af37', '#f3e5ab', '#10b981', '#fff']);
    }

    // Nat1 shake
    if (isNat1) {
      document.body.classList.add('dice-shake');
      setTimeout(() => document.body.classList.remove('dice-shake'), 500);
    }

    // Auto-dismiss
    setTimeout(() => {
      overlay.classList.add('hiding');
      setTimeout(() => overlay.remove(), 400);
    }, 2800);
  }

  function spawnParticles(count, colors) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'dice-particle';
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.top = (50 + Math.random() * 40) + 'vh';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.width = (4 + Math.random() * 6) + 'px';
      p.style.height = p.style.width;
      p.style.animationDelay = (Math.random() * 0.8) + 's';
      p.style.animationDuration = (1 + Math.random() * 1) + 's';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 2500);
    }
  }

  // ══════════════════════════════════════════
  //  CONNECTION STATUS INDICATOR
  // ══════════════════════════════════════════
  function createConnectionIndicator() {
    if (!isOnline || !socket) return;
    const ind = document.createElement('div');
    ind.className = 'sol-conn-indicator disconnected';
    ind.id = 'solConnIndicator';
    ind.innerHTML = '<div class="sol-conn-dot"></div><span>Menghubungkan...</span>';
    document.body.appendChild(ind);

    socket.on('connect', () => {
      ind.className = 'sol-conn-indicator connected';
      ind.querySelector('span').textContent = 'Online';
      // Auto-fade after 3s
      setTimeout(() => { ind.style.opacity = '0'; }, 3000);
    });

    socket.on('disconnect', () => {
      ind.className = 'sol-conn-indicator disconnected';
      ind.querySelector('span').textContent = 'Terputus';
      ind.style.opacity = '0.85';
    });

    socket.on('reconnect', () => {
      ind.className = 'sol-conn-indicator connected';
      ind.querySelector('span').textContent = 'Terhubung Kembali';
      setTimeout(() => { ind.style.opacity = '0'; }, 3000);
    });
  }

  // ══════════════════════════════════════════
  //  PLAYER NAME PROMPT
  // ══════════════════════════════════════════
  function promptPlayerName() {
    if (!isOnline || !socket) return;

    const existing = getPlayerName();
    if (existing) {
      // Already has name, join directly
      joinSession(existing, getPlayerRole());
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'sol-name-overlay';
    overlay.id = 'solNamePrompt';
    overlay.innerHTML = `
      <div class="sol-name-card">
        <h2>⚔ Masuk ke Sesi</h2>
        <p>Masukkan nama karakter atau nama pemain kamu</p>
        <input type="text" class="sol-name-input" id="solNameInput" placeholder="Nama..." maxlength="30" autocomplete="off">
        <div class="sol-name-role-row">
          <button class="sol-role-btn" data-role="dm" id="solRoleDM">🗡️ Dungeon Master</button>
          <button class="sol-role-btn active" data-role="player" id="solRolePlayer">⚔ Player</button>
        </div>
        <button class="sol-name-submit" id="solNameSubmit">Masuk Sesi</button>
      </div>
    `;
    document.body.appendChild(overlay);

    let selectedRole = 'player';
    const inputEl = document.getElementById('solNameInput');
    const dmBtn = document.getElementById('solRoleDM');
    const playerBtn = document.getElementById('solRolePlayer');
    const submitBtn = document.getElementById('solNameSubmit');

    dmBtn.addEventListener('click', () => {
      selectedRole = 'dm';
      dmBtn.classList.add('active');
      playerBtn.classList.remove('active');
    });
    playerBtn.addEventListener('click', () => {
      selectedRole = 'player';
      playerBtn.classList.add('active');
      dmBtn.classList.remove('active');
    });

    function submit() {
      const name = inputEl.value.trim();
      if (!name) { inputEl.style.borderColor = '#ef4444'; return; }
      setPlayerName(name);
      setPlayerRole(selectedRole);
      overlay.style.animation = 'solFadeOut 0.3s ease forwards';
      setTimeout(() => overlay.remove(), 300);
      joinSession(name, selectedRole);
    }

    submitBtn.addEventListener('click', submit);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => inputEl.focus(), 100);
  }

  function joinSession(name, role) {
    if (!socket) return;
    socket.emit('player:join', { name, role });

    // Listen for dice results from other players
    socket.on('dice:result', (data) => {
      showDiceAnimation(data);
      // Also show toast after animation
      setTimeout(() => showDiceToast(data), 2500);
    });

    // Listen for player list updates
    socket.on('player:list', (players) => {
      if (window._onPlayerListUpdate) window._onPlayerListUpdate(players);
    });

    // Show event toasts for connect/disconnect
    socket.on('player:list', (players) => {
      // Handled per-page if needed
    });
  }

  // ══════════════════════════════════════════
  //  UTILITY
  // ══════════════════════════════════════════
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ══════════════════════════════════════════
  //  GLOBAL EXPORTS
  // ══════════════════════════════════════════
  window.SolSync = SolSync;
  window.showDiceToast = showDiceToast;
  window.showDiceAnimation = showDiceAnimation;
  window.showEventToast = showEventToast;

  // ══════════════════════════════════════════
  //  INIT ON DOM READY
  // ══════════════════════════════════════════
  function init() {
    injectStyles();
    createConnectionIndicator();
    promptPlayerName();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
