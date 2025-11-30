(() => {
  const STORAGE_KEY = 'snake_min_v1';
  const UI_VERSION = 3;
  const LAYOUT_MIN_WIDTH = 260;
  const LAYOUT_MIN_HEIGHT = 220;
  const FREEFORM_GRID = 24;
  const FREEFORM_GUTTER = 12;
  const DEFAULT_LAYOUTS = {
    'board-tab': {
      'board-panel': { left: 0, top: 0, width: 640, height: 520 },
      'log-panel': { left: 660, top: 0, width: 380, height: 520 },
    },
    'mc-tab': {
      'mc-panel': { left: 0, top: 0, width: 760, height: 520 },
    },
    'final-tab': {
      'final-panel': { left: 0, top: 0, width: 760, height: 420 },
    },
  };
  const MAX_PER_TEAM = 7;
  const STARTERS_TEMPLATE = { QB: 1, RB: 1, WRTE: 2, FLEX: 2 };
  const LEARNING_MAX_DRAFTS = 50;
  const LEARNING_DECAY = 0.9;
  const LEARNING_STEP = 0.2;
  const POSITION_MAP = {
    QB: 'QB',
    RB: 'RB',
    WR: 'WR',
    TE: 'TE',
    'WR/TE': 'WR',
    'WRTE': 'WR',
    WT: 'WR',
    'WR-TE': 'WR',
    FLEX: 'FLEX',
  };

  const elements = {};
  const state = loadState();
  ensureLearningState();
  ensureUiState();

  function ensureLearningState() {
    state.learning = state.learning || {};
    state.learning.playerRatings = state.learning.playerRatings || {};
    state.learning.drafts = state.learning.drafts || [];
  }

  function setupTabs() {
    if (!elements.tabButtons || !elements.tabPanels) return;
    elements.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
    activateTab(state.ui.activeTab || 'board-tab', { skipSave: true });
  }

  function activateTab(tabId, opts = {}) {
    if (!elements.tabButtons || !elements.tabPanels) return;
    elements.tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    elements.tabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === tabId);
    });
    state.ui.activeTab = tabId;
    if (document.body.classList.contains('freeform-mode')) {
      refreshFloatingLayout(tabId);
    }
    if (!opts.skipSave) saveState();
  }

  function setupFreeform() {
    if (!elements.freeformToggle) return;
    elements.freeformToggle.checked = state.ui.freeform;
    elements.freeformToggle.addEventListener('change', () => toggleFreeform(elements.freeformToggle.checked));
    toggleFreeform(state.ui.freeform);
  }

  function toggleFreeform(enabled) {
    state.ui.freeform = enabled;
    document.body.classList.toggle('freeform-mode', enabled);
    if (elements.workspaceShell) {
      elements.workspaceShell.dataset.mode = enabled ? 'canvas' : 'docked';
    }
    if (enabled) {
      enableFloatingLayout();
    } else {
      disableFloatingLayout();
    }
    saveState();
  }

  function ensureHandles(panel) {
    if (!panel.querySelector('.drag-handle')) {
      const drag = document.createElement('div');
      drag.className = 'drag-handle';
      panel.appendChild(drag);
    }
    if (!panel.querySelector('.resize-handle')) {
      const resize = document.createElement('div');
      resize.className = 'resize-handle';
      panel.appendChild(resize);
    }
  }

  function enableFloatingLayout() {
    window.addEventListener('resize', onFreeformResize);
    refreshFloatingLayout(state.ui.activeTab);
  }

  function disableFloatingLayout() {
    window.removeEventListener('resize', onFreeformResize);
    elements.tabPanels.forEach((tabPanel) => {
      const panels = tabPanel.querySelectorAll('[data-floating]');
      panels.forEach((panel) => {
        panel.style.position = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.width = '';
        panel.style.height = '';
        panel.classList.remove('floating-active');
      });
    });
  }

  function refreshFloatingLayout(tabId) {
    const tabPanel = document.getElementById(tabId);
    if (!tabPanel) return;
    const canvas = tabPanel.querySelector('.workspace-grid');
    if (!canvas) return;
    const panels = Array.from(canvas.querySelectorAll('[data-floating]'));
    const canvasRect = measureCanvas(canvas);
    ensureDefaultLayout(tabPanel.id, panels);
    panels.forEach((panel, idx) => {
      ensureHandles(panel);
      const key = getFloatingKey(panel, tabPanel.id, idx);
      panel.dataset.floatingKey = key;
      applySavedLayout(panel, canvas, tabPanel.id, key, canvasRect);
      attachDrag(panel, canvas, tabPanel.id, key);
      attachResize(panel, canvas, tabPanel.id, key);
    });
    resolveOverlaps(canvas, tabPanel.id, panels, canvasRect);
    growCanvas(canvas, panels);
  }

  function measureCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.clientWidth || canvas.offsetWidth || 1200;
    const height = rect.height || canvas.clientHeight || canvas.offsetHeight || 900;
    if (width && height) return { ...rect, width, height };
    const parentRect = canvas.parentElement?.getBoundingClientRect();
    if (parentRect?.width && parentRect?.height) return parentRect;
    return { left: 0, top: 0, width: 1200, height: 900 };
  }

  function ensureDefaultLayout(tabId, panels) {
    state.ui.layout[tabId] = state.ui.layout[tabId] || {};
    const defaults = DEFAULT_LAYOUTS[tabId];
    if (!defaults) return;
    panels.forEach((panel, idx) => {
      const key = getFloatingKey(panel, tabId, idx);
      if (!state.ui.layout[tabId][key] && defaults[key]) {
        state.ui.layout[tabId][key] = { ...defaults[key] };
      }
    });
  }

  function getFloatingKey(panel, tabId, idx) {
    return panel.dataset.floatingKey || panel.id || `${tabId}-panel-${idx}`;
  }

  function applySavedLayout(panel, canvas, tabId, key, canvasRect) {
    const rect = panel.getBoundingClientRect();
    const saved = (state.ui.layout?.[tabId] || {})[key];
    const maxLeft = Math.max(0, canvasRect.width - LAYOUT_MIN_WIDTH - FREEFORM_GUTTER);
    const maxTop = Math.max(0, canvasRect.height - LAYOUT_MIN_HEIGHT - FREEFORM_GUTTER);
    const left = snapToGrid(clamp(saved?.left ?? rect.left - canvasRect.left, 0, maxLeft));
    const top = snapToGrid(clamp(saved?.top ?? rect.top - canvasRect.top, 0, maxTop));
    const width = snapToGrid(clamp(saved?.width ?? rect.width, LAYOUT_MIN_WIDTH, Math.max(LAYOUT_MIN_WIDTH, canvasRect.width - left)));
    const height = snapToGrid(clamp(saved?.height ?? rect.height, LAYOUT_MIN_HEIGHT, Math.max(LAYOUT_MIN_HEIGHT, canvasRect.height - top)));
    panel.style.position = 'absolute';
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
  }

  function resolveOverlaps(canvas, tabId, panels, canvasRect) {
    const sorted = panels
      .map((panel, idx) => ({
        panel,
        key: getFloatingKey(panel, tabId, idx),
        left: parseFloat(panel.style.left) || 0,
        top: parseFloat(panel.style.top) || 0,
        width: parseFloat(panel.style.width) || panel.getBoundingClientRect().width,
        height: parseFloat(panel.style.height) || panel.getBoundingClientRect().height,
      }))
      .sort((a, b) => a.top - b.top || a.left - b.left);

    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = 0; j < i; j += 1) {
        const a = sorted[i];
        const b = sorted[j];
        if (isOverlap(a, b)) {
          a.top = snapToGrid(b.top + b.height + FREEFORM_GUTTER);
          a.left = snapToGrid(clamp(a.left, 0, Math.max(0, canvasRect.width - a.width)));
          a.panel.style.top = `${a.top}px`;
          a.panel.style.left = `${a.left}px`;
        }
      }
      persistLayout(tabId, sorted[i].key, sorted[i].panel);
    }
  }

  function isOverlap(a, b) {
    return !(a.left >= b.left + b.width || a.left + a.width <= b.left || a.top >= b.top + b.height || a.top + a.height <= b.top);
  }

  function growCanvas(canvas, panels) {
    const bottom = panels.reduce((max, panel) => {
      const top = parseFloat(panel.style.top) || 0;
      const height = parseFloat(panel.style.height) || panel.getBoundingClientRect().height;
      return Math.max(max, top + height);
    }, 0);
    canvas.style.minHeight = `${Math.max(900, bottom + FREEFORM_GUTTER * 2)}px`;
  }

  function snapToGrid(value) {
    return Math.round(value / FREEFORM_GRID) * FREEFORM_GRID;
  }

  function attachDrag(panel, canvas, tabId, key) {
    if (panel.dataset.dragBound) return;
    const handle = panel.querySelector('.drag-handle');
    if (!handle) return;
    handle.addEventListener('mousedown', (e) => {
      if (!document.body.classList.contains('freeform-mode')) return;
      e.preventDefault();
      const canvasRect = canvas.getBoundingClientRect();
      const rect = panel.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      panel.classList.add('floating-active');
      function onMove(ev) {
        const left = snapToGrid(clamp(ev.clientX - canvasRect.left - offsetX, 0, Math.max(0, canvasRect.width - LAYOUT_MIN_WIDTH)));
        const top = snapToGrid(clamp(ev.clientY - canvasRect.top - offsetY, 0, Math.max(0, canvasRect.height - LAYOUT_MIN_HEIGHT)));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
      }
      function onUp() {
        panel.classList.remove('floating-active');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        persistLayout(tabId, key, panel);
        growCanvas(canvas, Array.from(canvas.querySelectorAll('[data-floating]')));
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    panel.dataset.dragBound = '1';
  }

  function attachResize(panel, canvas, tabId, key) {
    if (panel.dataset.resizeBound) return;
    const handle = panel.querySelector('.resize-handle');
    if (!handle) return;
    handle.addEventListener('mousedown', (e) => {
      if (!document.body.classList.contains('freeform-mode')) return;
      e.preventDefault();
      const canvasRect = canvas.getBoundingClientRect();
      const startWidth = panel.getBoundingClientRect().width;
      const startHeight = panel.getBoundingClientRect().height;
      const startX = e.clientX;
      const startY = e.clientY;
      panel.classList.add('floating-active');
      function onMove(ev) {
        const deltaX = ev.clientX - startX;
        const deltaY = ev.clientY - startY;
        const left = parseFloat(panel.style.left) || 0;
        const top = parseFloat(panel.style.top) || 0;
        const width = snapToGrid(clamp(startWidth + deltaX, LAYOUT_MIN_WIDTH, canvasRect.width - left));
        const height = snapToGrid(clamp(startHeight + deltaY, LAYOUT_MIN_HEIGHT, canvasRect.height - top));
        panel.style.width = `${width}px`;
        panel.style.height = `${height}px`;
      }
      function onUp() {
        panel.classList.remove('floating-active');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        persistLayout(tabId, key, panel);
        growCanvas(canvas, Array.from(canvas.querySelectorAll('[data-floating]')));
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    panel.dataset.resizeBound = '1';
  }

  function onFreeformResize() {
    clearTimeout(onFreeformResize._t);
    onFreeformResize._t = setTimeout(() => {
      if (!document.body.classList.contains('freeform-mode')) return;
      refreshFloatingLayout(state.ui.activeTab);
    }, 120);
  }

  function persistLayout(tabId, key, panel) {
    state.ui.layout[tabId] = state.ui.layout[tabId] || {};
    state.ui.layout[tabId][key] = {
      left: parseFloat(panel.style.left) || 0,
      top: parseFloat(panel.style.top) || 0,
      width: parseFloat(panel.style.width) || panel.getBoundingClientRect().width,
      height: parseFloat(panel.style.height) || panel.getBoundingClientRect().height,
    };
    saveState();
  }

  function ensureUiState() {
    state.ui = state.ui || {};
    const migrated = !state.ui.version || state.ui.version < UI_VERSION;
    state.ui.activeTab = state.ui.activeTab || 'board-tab';
    state.ui.freeform = migrated ? false : Boolean(state.ui.freeform);
    state.ui.layout = migrated ? {} : state.ui.layout || {};
    state.ui.version = UI_VERSION;
  }

  function defaultLearning() {
    return { playerRatings: {}, drafts: [] };
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (err) {
      console.warn('Failed to load saved state', err);
    }
    return {
      settings: { teams: 3, rounds: 6, slot: 1 },
      picks: [],
      pool: [],
      mapping: null,
      learning: defaultLearning(),
      ui: { activeTab: 'board-tab', freeform: false, layout: {}, version: UI_VERSION },
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const saveStatus = document.getElementById('save-status');
    if (saveStatus) {
      saveStatus.textContent = 'Saved to localStorage.';
      setTimeout(() => (saveStatus.textContent = 'State autosaves to your browser.'), 1500);
    }
  }

  function normalizeSettings() {
    const teams = clamp(Number(elements.teams.value) || 3, 1, 12);
    const rounds = clamp(Number(elements.rounds.value) || 6, 4, 12);
    const slot = clamp(Number(elements.slot.value) || 1, 1, teams);
    elements.teams.value = teams;
    elements.rounds.value = rounds;
    elements.slot.value = slot;
    state.settings = { teams, rounds, slot };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function buildBlankPicks() {
    const { teams, rounds } = state.settings;
    const picks = [];
    for (let r = 1; r <= rounds; r += 1) {
      for (let t = 1; t <= teams; t += 1) {
        const slot = r % 2 === 0 ? teams - t + 1 : t;
        const overall = (r - 1) * teams + slot;
        picks.push({ overall, round: r, slot, player: '' });
      }
    }
    state.picks = picks;
  }

  function ensurePicks() {
    const { teams, rounds } = state.settings;
    if (state.picks.length !== teams * rounds) {
      buildBlankPicks();
    }
  }

  function remainingPlayers() {
    const taken = new Set(state.picks.filter((p) => p.player).map((p) => p.player.toLowerCase()));
    return state.pool
      .filter((p) => !taken.has(p.name.toLowerCase()))
      .sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999))
      .slice(0, 160);
  }

  function renderBoard() {
    ensurePicks();
    const { teams, rounds, slot } = state.settings;
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.appendChild(document.createElement('th'));
    for (let t = 1; t <= teams; t += 1) {
      const th = document.createElement('th');
      th.textContent = `Team ${t}`;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let r = 1; r <= rounds; r += 1) {
      const row = document.createElement('tr');
      const roundCell = document.createElement('td');
      roundCell.textContent = `Round ${r}`;
      row.appendChild(roundCell);
      for (let t = 1; t <= teams; t += 1) {
        const cell = document.createElement('td');
        const pick = state.picks.find((p) => p.round === r && p.slot === t);
        cell.textContent = pick?.player || '—';
        if (t === slot) cell.classList.add('highlight');
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);

    elements.boardTable.innerHTML = '';
    elements.boardTable.appendChild(table);

    const firstOpen = state.picks.find((p) => !p.player);
    elements.boardStatus.textContent = firstOpen
      ? `Next pick #${firstOpen.overall} · R${firstOpen.round} S${firstOpen.slot}`
      : 'Draft complete';
  }

  function renderRemaining() {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    ['#', 'Player', 'Pos', 'Team', 'Bye', 'ADP', 'PPG', 'σ', ''].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      header.appendChild(th);
    });
    thead.appendChild(header);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    remainingPlayers().forEach((p, idx) => {
      const row = document.createElement('tr');
      const btn = document.createElement('button');
      btn.textContent = 'Pick';
      btn.onclick = () => logPick(p.name);

      [idx + 1, p.name, p.position, p.team || '', p.bye ?? '', p.adp ?? '', p.ppg ?? '', p.sd ?? ''].forEach(
        (val) => {
          const td = document.createElement('td');
          td.textContent = typeof val === 'number' ? Number(val).toFixed(2).replace(/\.00$/, '') : val;
          row.appendChild(td);
        },
      );
      const tdBtn = document.createElement('td');
      tdBtn.appendChild(btn);
      row.appendChild(tdBtn);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    elements.remainingTable.innerHTML = '';
    elements.remainingTable.appendChild(table);
  }

  function renderLogAutocomplete() {
    if (!elements.logNameOptions) return;
    const options = state.pool
      .slice()
      .sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999))
      .map((p) => `<option value="${escapeHtml(p.name)}"></option>`)
      .join('');
    elements.logNameOptions.innerHTML = options;
  }

  function logPick(name) {
    if (!name) return;
    const remaining = remainingPlayers();
    const found = remaining.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!found) return alert('Player not available in remaining board.');
    const open = state.picks.find((p) => !p.player);
    if (!open) return alert('Draft is complete.');
    open.player = found.name;
    render();
  }

  function undoPick() {
    const idx = state.picks.findIndex((p) => !p.player);
    const target = idx > 0 ? state.picks[idx - 1] : state.picks[state.picks.length - 1];
    if (target && target.player) {
      target.player = '';
      render();
    }
  }

  function renderRecent() {
    const recent = state.picks.filter((p) => p.player).slice(-20).reverse();
    elements.recentLog.innerHTML = recent
      .map((p) => `<li>#${p.overall} T${p.slot}: ${p.player}</li>`)
      .join('');
  }

  function getPlayerLift(name) {
    const rating = state.learning.playerRatings[name];
    if (!rating) return 0;
    return Math.max(-0.25, Math.min(0.35, rating.value));
  }

  function updatePlayerRating(name, liftDelta) {
    const current = state.learning.playerRatings[name] || { value: 0, samples: 0 };
    const blended = current.value * LEARNING_DECAY + liftDelta * (1 - LEARNING_DECAY);
    state.learning.playerRatings[name] = { value: blended, samples: current.samples + 1 };
  }

  function recordDraftOutcome(finalScores) {
    const mine = finalScores.find((row) => row.team === state.settings.slot);
    const myPicks = getMyTeamPicks();
    if (!mine || !myPicks.length) return;
    const baseline = 1 / state.settings.teams;
    const lift = mine.winPct / 100 - baseline;
    const perPlayer = lift / Math.max(1, myPicks.length);
    myPicks.forEach((p) => updatePlayerRating(p.name, perPlayer * LEARNING_STEP));
    state.learning.drafts.push({
      ts: Date.now(),
      team: state.settings.slot,
      winPct: mine.winPct,
      players: myPicks.map((p) => p.name),
      baseline: baseline * 100,
    });
    if (state.learning.drafts.length > LEARNING_MAX_DRAFTS) {
      state.learning.drafts = state.learning.drafts.slice(-LEARNING_MAX_DRAFTS);
    }
    renderMlStatus();
    saveState();
  }

  function renderMlStatus() {
    if (!elements.mlStatus) return;
    const drafts = state.learning.drafts.length;
    if (!drafts) {
      elements.mlStatus.textContent = 'Machine learning: waiting for Final Win% to learn from drafts.';
      return;
    }
    const top = Object.entries(state.learning.playerRatings || {})
      .sort((a, b) => Math.abs(b[1].value) - Math.abs(a[1].value))[0];
    const topText = top ? `${top[0]} (${(top[1].value * 100).toFixed(1)}% lift)` : 'building signals';
    elements.mlStatus.textContent = `Machine learning active on ${drafts} draft${drafts > 1 ? 's' : ''}. Strongest signal: ${topText}.`;
  }

  function parseInput(text) {
    text = text.trim();
    if (!text) return null;
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        const json = JSON.parse(text);
        const rows = Array.isArray(json) ? json : json.players || [];
        const headers = rows.length ? Object.keys(rows[0]) : [];
        return { headers, rows };
      } catch (err) {
        alert('Invalid JSON payload');
        return null;
      }
    }
    return parseCSV(text);
  }

  function parseCSV(text) {
    const rows = [];
    let current = [];
    let value = '';
    let inQuotes = false;
    const pushValue = () => {
      current.push(value);
      value = '';
    };
    const pushRow = () => {
      rows.push(current);
      current = [];
    };
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        pushValue();
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (value || current.length) {
          pushValue();
          pushRow();
        }
      } else {
        value += ch;
      }
    }
    if (value || current.length) {
      pushValue();
      pushRow();
    }
    const [header = [], ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
    return { headers: header, rows: body.map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx]]))) };
  }

  function guessMapping(headers) {
    const normalized = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const find = (candidates) => {
      const lower = candidates.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
      const idx = normalized.findIndex((h) => lower.includes(h));
      return idx >= 0 ? headers[idx] : '';
    };
    return {
      name: find(['name', 'player', 'player_name', 'full_name']),
      position: find(['position', 'pos']),
      team: find(['team', 'tm']),
      adp: find(['adp', 'avgpick']),
      bye: find(['byeweek', 'bye', 'bye_week']),
      ppg: find(['dk_ppg', 'dk_ppg_mu', 'dk_ppg_anchor', 'ppg', 'projection', 'points', 'fpts']),
      sd: find(['dk_pts_sd', 'dk_ppg_sd', 'sigma', 'stdev', 'std', 'sd']),
    };
  }

  function renderMapping(headers) {
    if (!headers.length) {
      elements.columnMapping.innerHTML = '';
      return;
    }
    const mapping = guessMapping(headers);
    state.mapping = mapping;
    const fields = [
      ['name', 'Name'],
      ['position', 'Position'],
      ['team', 'Team'],
      ['adp', 'ADP'],
      ['bye', 'Bye'],
      ['ppg', 'PPG'],
      ['sd', 'σ / SD'],
    ];
    const html = fields
      .map(
        ([key, label]) => `
        <div style="margin-bottom: 6px;">
          <label>${label} column</label>
          <select data-field="${key}">
            <option value="">—</option>
            ${headers.map((h) => `<option value="${h}" ${mapping[key] === h ? 'selected' : ''}>${h}</option>`).join('')}
          </select>
        </div>
      `,
      )
      .join('');
    elements.columnMapping.innerHTML = html;
    elements.columnMapping.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const field = sel.dataset.field;
        state.mapping[field] = sel.value;
      });
    });
  }

  function applyRows(rows) {
    const mapping = state.mapping || {};
    const pool = [];
    const seenNames = new Set();
    let skippedBlank = 0;
    let skippedPos = 0;
    rows.forEach((row) => {
      const lowerRow = lowerKeys(row);
      const name = ((mapping.name && row[mapping.name]) || lowerRow.player || lowerRow.name || '').trim();
      const posRaw = ((mapping.position && row[mapping.position]) || lowerRow.pos || lowerRow.position || '').trim();
      if (!name) {
        skippedBlank += 1;
        return;
      }
      const posNorm = normalizePos(posRaw);
      if (!posNorm) {
        skippedPos += 1;
        return;
      }
      const key = name.toLowerCase();
      if (seenNames.has(key)) return;
      seenNames.add(key);

      const player = {
        name,
        position: posNorm,
        team: ((mapping.team && row[mapping.team]) || lowerRow.team || '').trim(),
        adp: firstNumber(lowerRow, [mapping.adp, 'adp', 'avgpick']),
        bye: firstNumber(lowerRow, [mapping.bye, 'bye', 'byeweek', 'bye_week']),
      };

      player.ppg = derivePPG(row, lowerRow, mapping);
      player.sd = deriveSD(row, lowerRow, mapping);

      pool.push(player);
    });
    state.pool = pool;
    elements.importStatus.textContent = `Applied ${pool.length} players. Skipped ${skippedBlank} blank names, ${skippedPos} bad positions.`;
    render();
  }

  function lowerKeys(obj) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  }

  function firstNumber(lowerRow, keys) {
    for (const key of keys) {
      if (!key) continue;
      const num = toNumber(lowerRow[key.toLowerCase ? key.toLowerCase() : key]);
      if (Number.isFinite(num)) return num;
    }
    return undefined;
  }

  function derivePPG(row, lowerRow, mapping) {
    const ppgDirect = roundNumber(firstNumber(lowerRow, [mapping.ppg, 'dk_ppg_mu', 'dk_ppg_anchor', 'dk_ppg', 'ppg', 'projection', 'fpts', 'points']));
    if (Number.isFinite(ppgDirect)) return ppgDirect;

    const weights = {
      receptions_mu: 1,
      recyds_mu: 0.1,
      rectd_mu: 6,
      rushyds_mu: 0.1,
      rushtd_mu: 6,
      passyds_mu: 1 / 25,
      passtd_mu: 4,
      int_mu: -1,
    };
    const score = Object.entries(weights).reduce((sum, [key, weight]) => {
      const val = toNumber(lowerRow[key]);
      return Number.isFinite(val) ? sum + val * weight : sum;
    }, 0);
    return Number.isFinite(score) && score !== 0 ? roundNumber(score) : undefined;
  }

  function deriveSD(row, lowerRow, mapping) {
    const sdDirect = roundNumber(firstNumber(lowerRow, [mapping.sd, 'dk_ppg_sd', 'dk_pts_sd', 'dk_sd', 'sigma', 'stdev', 'std', 'sd']));
    if (Number.isFinite(sdDirect)) return sdDirect;

    const weights = {
      receptions_sd: 1,
      recyds_sd: 0.1,
      rectd_sd: 6,
      rushyds_sd: 0.1,
      rushtd_sd: 6,
      passyds_sd: 1 / 25,
      passtd_sd: 4,
      int_sd: 1,
    };
    const variance = Object.entries(weights).reduce((sum, [key, weight]) => {
      const sd = toNumber(lowerRow[key]);
      return Number.isFinite(sd) ? sum + (weight * sd) ** 2 : sum;
    }, 0);
    if (variance > 0) {
      return roundNumber(Math.sqrt(variance));
    }
    return undefined;
  }

  function normalizePos(pos) {
    const tag = pos.toUpperCase().replace(/\s+/g, '');
    if (!tag) return '';
    if (POSITION_MAP[tag]) return POSITION_MAP[tag];
    if (tag === 'WRTE' || tag === 'WT') return 'WR';
    if (['QB', 'RB', 'WR', 'TE'].includes(tag)) return tag;
    return '';
  }

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  function roundNumber(value) {
    const num = toNumber(value);
    if (!Number.isFinite(num)) return undefined;
    return Math.round(num * 100) / 100;
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function handleParsed(parsed) {
    if (!parsed) return;
    renderMapping(parsed.headers);
    applyRows(parsed.rows);
    saveState();
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseInput(e.target.result);
      handleParsed(parsed);
    };
    reader.readAsText(file);
  }

  function buildSample() {
    const headers = ['Name', 'Position', 'Team', 'ADP', 'Bye', 'PPG', 'SD'];
    const rows = [
      ['Patrick Mahomes', 'QB', 'KC', 8, 10, 24.8, 6.1],
      ['Jalen Hurts', 'QB', 'PHI', 12, 10, 24.4, 6.5],
      ['Christian McCaffrey', 'RB', 'SF', 1, 9, 22.5, 5.4],
      ['Bijan Robinson', 'RB', 'ATL', 6, 11, 19.3, 4.9],
      ['Justin Jefferson', 'WR', 'MIN', 2, 13, 21.7, 6.3],
      ["Ja'Marr Chase", 'WR', 'CIN', 3, 12, 21.4, 6.2],
      ['Amon-Ra St. Brown', 'WR', 'DET', 5, 9, 19.9, 5.5],
      ['CeeDee Lamb', 'WR', 'DAL', 4, 7, 19.5, 5.1],
      ['Travis Kelce', 'TE', 'KC', 7, 10, 18.9, 5.0],
      ['Sam LaPorta', 'TE', 'DET', 15, 9, 15.5, 4.2],
    ];
    const parsed = { headers, rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))) };
    handleParsed(parsed);
  }

  function buildColumnMappingFromDom() {
    elements.columnMapping.querySelectorAll('select').forEach((sel) => {
      state.mapping[sel.dataset.field] = sel.value;
    });
  }

  function firstOpenPick() {
    return state.picks.find((p) => !p.player);
  }

  function logFromInput() {
    const name = elements.logName.value.trim();
    if (!name) return;
    logPick(name);
    elements.logName.value = '';
  }

  function render() {
    ensurePicks();
    renderBoard();
    renderRemaining();
    renderRecent();
    renderLogAutocomplete();
    renderMlStatus();
    saveState();
  }

  function hookEvents() {
    elements.teams.addEventListener('change', () => {
      normalizeSettings();
      buildBlankPicks();
      render();
    });
    elements.rounds.addEventListener('change', () => {
      normalizeSettings();
      buildBlankPicks();
      render();
    });
    elements.slot.addEventListener('change', () => {
      normalizeSettings();
      render();
    });

    elements.resetAll.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      Object.assign(state, {
        settings: { teams: 3, rounds: 6, slot: 1 },
        picks: [],
        pool: [],
        mapping: null,
        learning: defaultLearning(),
        ui: { activeTab: 'board-tab', freeform: false, layout: {}, version: UI_VERSION },
      });
      toggleFreeform(false);
      activateTab('board-tab', { skipSave: true });
      elements.pasteBox.value = '';
      normalizeSettings();
      buildBlankPicks();
      render();
      elements.importStatus.textContent = 'Reset complete — load a pool to start.';
    });

    elements.fileInput.addEventListener('change', (e) => {
      const [file] = e.target.files;
      if (file) handleFile(file);
    });

    elements.pasteApply.addEventListener('click', () => {
      const parsed = parseInput(elements.pasteBox.value);
      handleParsed(parsed);
    });

    elements.pasteClear.addEventListener('click', () => {
      elements.pasteBox.value = '';
    });

    elements.selfTest.addEventListener('click', buildSample);
    elements.logBtn.addEventListener('click', logFromInput);
    elements.undoBtn.addEventListener('click', undoPick);
    elements.logName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        logFromInput();
      }
    });

    const dropZone = document.getElementById('drop-zone');
    ['dragover', 'dragenter'].forEach((event) => {
      dropZone.addEventListener(event, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--accent)';
      });
    });
    ['dragleave', 'drop'].forEach((event) => {
      dropZone.addEventListener(event, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
      });
    });
    dropZone.addEventListener('drop', (e) => {
      const [file] = e.dataTransfer.files;
      if (file) handleFile(file);
    });

    elements.runMc.addEventListener('click', runMonteCarlo);
    elements.clearMc.addEventListener('click', () => {
      elements.mcTable.innerHTML = '';
      elements.mcStatus.textContent = 'Cleared results.';
    });
    elements.runFinal.addEventListener('click', runFinalWin);
    elements.clearFinal.addEventListener('click', () => {
      elements.finalTable.innerHTML = '';
      elements.finalStatus.textContent = 'Cleared results.';
    });

    setupTabs();
    setupFreeform();
  }

  function loadElements() {
    elements.workspaceShell = document.getElementById('workspace-shell');
    elements.teams = document.getElementById('teams');
    elements.rounds = document.getElementById('rounds');
    elements.slot = document.getElementById('slot');
    elements.resetAll = document.getElementById('reset-all');
    elements.boardTable = document.getElementById('board-table');
    elements.boardStatus = document.getElementById('board-status');
    elements.remainingTable = document.getElementById('remaining-table');
    elements.importStatus = document.getElementById('import-status');
    elements.columnMapping = document.getElementById('column-mapping');
    elements.fileInput = document.getElementById('file-input');
    elements.pasteBox = document.getElementById('paste-box');
    elements.pasteApply = document.getElementById('apply-paste');
    elements.pasteClear = document.getElementById('clear-paste');
    elements.selfTest = document.getElementById('self-test');
    elements.logName = document.getElementById('log-name');
    elements.logNameOptions = document.getElementById('log-name-options');
    elements.logBtn = document.getElementById('log-btn');
    elements.undoBtn = document.getElementById('undo-btn');
    elements.recentLog = document.getElementById('recent-log');
    elements.mlStatus = document.getElementById('ml-status');
    elements.mcSims = document.getElementById('mc-sims');
    elements.mcTop = document.getElementById('mc-top');
    elements.mcVar = document.getElementById('mc-var');
    elements.qbWeight = document.getElementById('qb-weight');
    elements.adpGate = document.getElementById('adp-gate');
    elements.qb2Round = document.getElementById('qb2-round');
    elements.mcStatus = document.getElementById('mc-status');
    elements.mcTable = document.getElementById('mc-table');
    elements.runMc = document.getElementById('run-mc');
    elements.clearMc = document.getElementById('clear-mc');
    elements.finalSims = document.getElementById('final-sims');
    elements.finalVar = document.getElementById('final-var');
    elements.finalStatus = document.getElementById('final-status');
    elements.finalTable = document.getElementById('final-table');
    elements.runFinal = document.getElementById('run-final');
    elements.clearFinal = document.getElementById('clear-final');
    elements.freeformToggle = document.getElementById('freeform-toggle');
    elements.tabButtons = Array.from(document.querySelectorAll('.tabbar .tab'));
    elements.tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));
  }

  function loadSavedInputs() {
    elements.teams.value = state.settings.teams;
    elements.rounds.value = state.settings.rounds;
    elements.slot.value = state.settings.slot;
  }

  function seededRng(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i += 1) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function gaussian(rng) {
    const u1 = Math.max(rng(), 1e-9);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function normPosTag(pos) {
    return normalizePos(pos) || '';
  }

  function remainingFromState() {
    const taken = new Set(state.picks.filter((p) => p.player).map((p) => p.player));
    return state.pool.filter((p) => !taken.has(p.name));
  }

  function runMonteCarlo() {
    if (!state.pool.length) {
      elements.mcStatus.textContent = 'No pool loaded.';
      return;
    }
    const open = firstOpenPick();
    if (!open) {
      elements.mcStatus.textContent = 'Draft complete — no open pick.';
      return;
    }
    const sims = clamp(Number(elements.mcSims.value) || 800, 50, 20000);
    const topN = clamp(Number(elements.mcTop.value) || 8, 1, 20);
    const useVar = elements.mcVar.checked;
    const qbWeight = clamp(Number(elements.qbWeight.value) || 0.85, 0.5, 1);
    const adpGate = clamp(Number(elements.adpGate.value) || 16, 0, 40);
    const minQb2Round = Number(elements.qb2Round.value) || 6;

    const pickNumber = open.overall;
    const round = open.round;
    const pool = remainingFromState();
    const shortlist = buildShortlist({ pool, pickNumber, round, qbWeight, adpGate, minQb2Round, topN });
    if (!shortlist.length) {
      elements.mcStatus.textContent = 'No candidates within ADP gate.';
      return;
    }
    const rngSeed = seededRng(`mc-${Date.now()}`);
    const results = shortlist.map((candidate) => {
      const outcome = simulateDraft({ candidate, sims, useVar, qbWeight, adpGate, minQb2Round, rngSeed });
      return { ...candidate, ...outcome };
    });
    results.sort((a, b) => b.winPct - a.winPct);
    renderMcTable(results);
    elements.mcStatus.textContent = `Best pick: ${results[0].name} — Win% ${results[0].winPct.toFixed(2)}%`;
  }

  function buildShortlist({ pool, pickNumber, round, qbWeight, adpGate, minQb2Round, topN }) {
    const remainingQBs = getMyTeamPicks().filter((p) => p.position === 'QB');
    const hasQB = remainingQBs.length > 0;
    const allowed = pool.filter((p) => {
      if (Number.isFinite(p.adp) && p.adp > pickNumber + adpGate) return false;
      if (hasQB && p.position === 'QB' && round < minQb2Round) return false;
      return true;
    });
    allowed.sort((a, b) => {
      const adjA = (a.position === 'QB' ? (a.ppg || 0) * qbWeight : a.ppg || 0) * (1 + getPlayerLift(a.name));
      const adjB = (b.position === 'QB' ? (b.ppg || 0) * qbWeight : b.ppg || 0) * (1 + getPlayerLift(b.name));
      if (adjB !== adjA) return adjB - adjA;
      return (a.adp ?? 999) - (b.adp ?? 999);
    });
    let shortlist = allowed.slice(0, topN);
    if (!hasQB) {
      const bestQB = allowed.find((p) => p.position === 'QB');
      if (bestQB && !shortlist.includes(bestQB)) {
        shortlist = [bestQB, ...shortlist].slice(0, topN);
      }
    }
    return shortlist.map((p) => ({ ...p, mlLift: getPlayerLift(p.name) }));
  }

  function simulateDraft({ candidate, sims, useVar, qbWeight, adpGate, minQb2Round, rngSeed }) {
    const basePool = state.pool.map((p, idx) => ({ ...p, idx, posTag: normPosTag(p.position) }));
    const taken = new Set(state.picks.filter((p) => p.player).map((p) => p.player));
    const candidateIdx = basePool.findIndex((p) => p.name === candidate.name);
    let wins = 0;
    let cumScore = 0;

    for (let s = 0; s < sims; s += 1) {
      const rng = () => rngSeed();
      const picksCopy = state.picks.map((p) => ({ ...p }));
      const takenIdx = new Set();
      basePool.forEach((p) => {
        if (taken.has(p.name)) takenIdx.add(p.idx);
      });
      const teamPicks = Array.from({ length: state.settings.teams }, () => []);
      const adpOrder = poolOrderByADP(basePool, 0.2, rng);
      for (let i = 0; i < picksCopy.length; i += 1) {
        const pick = picksCopy[i];
        const teamIndex = pick.slot - 1;
        if (pick.player) {
          const idx = basePool.findIndex((p) => p.name === pick.player);
          if (idx >= 0) teamPicks[teamIndex].push(idx);
          continue;
        }
        if (pick.player === '' && pick.round === firstOpenPick().round && pick.slot === firstOpenPick().slot) {
          if (!takenIdx.has(candidateIdx)) {
            teamPicks[teamIndex].push(candidateIdx);
            takenIdx.add(candidateIdx);
            pick.player = candidate.name;
            continue;
          }
        }
        const chosen = chooseBestAvailable({
          pool: basePool,
          adpOrder,
          takenIdx,
          overall: pick.overall,
          teamPicks: teamPicks[teamIndex],
          round: pick.round,
          adpGate,
          minQb2Round,
          rng,
        });
        if (chosen !== null) {
          teamPicks[teamIndex].push(chosen);
          takenIdx.add(chosen);
        }
      }

      const myTeam = teamPicks[state.settings.slot - 1].slice(0, MAX_PER_TEAM);
      const score = buildStartersAndBench(basePool, myTeam, useVar, qbWeight, rng).score;
      cumScore += score;

      // Determine winner
      const teamScores = teamPicks.map((picks) => buildStartersAndBench(basePool, picks.slice(0, MAX_PER_TEAM), useVar, qbWeight, rng).score);
      const best = Math.max(...teamScores);
      const winners = teamScores.filter((v) => v === best).length;
      if (teamScores[state.settings.slot - 1] === best) {
        wins += 1 / winners;
      }
    }

    return { winPct: (wins / sims) * 100, avgPPG: cumScore / sims };
  }

  function poolOrderByADP(pool, noise, rng) {
    return pool
      .map((p) => ({
        idx: p.idx,
        score: (p.adp ?? 999) + gaussian(rng) * noise,
      }))
      .sort((a, b) => a.score - b.score)
      .map((p) => p.idx);
  }

  function chooseBestAvailable({ pool, adpOrder, takenIdx, overall, teamPicks, round, adpGate, minQb2Round, rng }) {
    const needsQB = !teamPicks.some((idx) => pool[idx].posTag === 'QB') && MAX_PER_TEAM - teamPicks.length <= 1;
    for (let i = 0; i < adpOrder.length; i += 1) {
      const idx = adpOrder[i];
      if (takenIdx.has(idx)) continue;
      const player = pool[idx];
      if (Number.isFinite(player.adp) && player.adp > overall + adpGate) continue;
      if (teamPicks.some((p) => pool[p].posTag === 'QB') && player.posTag === 'QB' && round < minQb2Round) continue;
      if (needsQB && player.posTag !== 'QB') continue;
      return idx;
    }
    if (!teamPicks.some((p) => pool[p].posTag === 'QB')) {
      const qbIdx = pool.find((p, idx) => !takenIdx.has(idx) && p.posTag === 'QB');
      if (qbIdx) return qbIdx.idx;
    }
    const fallback = adpOrder.find((idx) => !takenIdx.has(idx));
    return fallback ?? null;
  }

  function buildStartersAndBench(pool, pickedIdx, useVar, qbWeight, rng) {
    const sampled = new Map();
    const getScore = (idx) => {
      if (sampled.has(idx)) return sampled.get(idx);
      const p = pool[idx];
      let score = p.ppg || 0;
      if (p.posTag === 'QB') score *= qbWeight;
      if (useVar && p.sd > 0) {
        const z = gaussian(rng);
        score = Math.max(0, score + p.sd * z);
      }
      sampled.set(idx, score);
      return score;
    };

    const buckets = { QB: [], RB: [], WRTE: [] };
    pickedIdx.forEach((idx) => {
      const pos = pool[idx].posTag;
      if (pos === 'QB') buckets.QB.push(idx);
      else if (pos === 'RB') buckets.RB.push(idx);
      else if (pos === 'WR' || pos === 'TE') buckets.WRTE.push(idx);
    });

    const sortByScore = (arr) => arr.sort((a, b) => getScore(b) - getScore(a) || (pool[a].adp ?? 999) - (pool[b].adp ?? 999));
    sortByScore(buckets.QB);
    sortByScore(buckets.RB);
    sortByScore(buckets.WRTE);

    const starters = [];
    if (buckets.QB.length) starters.push(buckets.QB[0]);
    if (buckets.RB.length) starters.push(buckets.RB[0]);
    starters.push(...buckets.WRTE.slice(0, 2));

    const used = new Set(starters);
    const remainingPool = pickedIdx.filter((idx) => !used.has(idx)).sort((a, b) => getScore(b) - getScore(a));
    const flexPool = [...buckets.RB.slice(1), ...buckets.WRTE.slice(2), ...remainingPool].filter((idx) => !used.has(idx));
    const flexSorted = flexPool.sort((a, b) => getScore(b) - getScore(a));
    starters.push(...flexSorted.slice(0, 2));

    while (starters.length < 6 && remainingPool.length) {
      starters.push(remainingPool.shift());
    }

    const bench = pickedIdx.filter((idx) => !starters.includes(idx));
    const diversityFixed = enforceTeamDiversity(pool, starters, bench, getScore);
    const total = diversityFixed.reduce((sum, idx) => sum + getScore(idx), 0);
    return { starters: diversityFixed, bench, score: total };
  }

  function enforceTeamDiversity(pool, starters, bench, getScore) {
    const starterTeams = new Set(starters.map((idx) => pool[idx].team));
    if (starterTeams.size > 1 || bench.length === 0) return starters;
    const startersByScore = [...starters].sort((a, b) => getScore(a) - getScore(b));
    const benchSorted = [...bench].sort((a, b) => getScore(b) - getScore(a));
    for (const low of startersByScore) {
      for (const sub of benchSorted) {
        if (pool[sub].team && pool[sub].team !== pool[low].team) {
          const newStarters = starters.map((idx) => (idx === low ? sub : idx));
          const oldScore = starters.reduce((s, idx) => s + getScore(idx), 0);
          const newScore = newStarters.reduce((s, idx) => s + getScore(idx), 0);
          const newTeams = new Set(newStarters.map((idx) => pool[idx].team));
          if (newTeams.size > 1 && newScore >= oldScore - 0.1) {
            return newStarters;
          }
        }
      }
    }
    return starters;
  }

  function getMyTeamPicks() {
    const mine = state.picks.filter((p) => p.slot === state.settings.slot && p.player);
    return mine
      .map((pick) => state.pool.find((pl) => pl.name === pick.player))
      .filter(Boolean);
  }

  function renderMcTable(rows) {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    ['Candidate', 'Pos', 'Team', 'ADP', 'ML lift', 'Avg PPG (us)', 'Win %'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      header.appendChild(th);
    });
    thead.appendChild(header);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      [
        r.name,
        r.position,
        r.team || '',
        r.adp ?? '',
        `${(r.mlLift * 100 || 0).toFixed(1)}%`,
        r.avgPPG.toFixed(2),
        r.winPct.toFixed(2),
      ].forEach((val) => {
        const td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    elements.mcTable.innerHTML = '';
    elements.mcTable.appendChild(table);
  }

  function runFinalWin() {
    if (!state.pool.length) {
      elements.finalStatus.textContent = 'No pool loaded.';
      return;
    }
    const sims = clamp(Number(elements.finalSims.value) || 2000, 100, 50000);
    const useVar = elements.finalVar.checked;
    const qbWeight = clamp(Number(elements.qbWeight.value) || 0.85, 0.5, 1);
    const rngSeed = seededRng(`final-${Date.now()}`);
    const teamPicks = teamPickIndicesFromState();
    autofillToSeven(teamPicks);
    const scores = simulateFinalStandings({ teamPicks, sims, useVar, qbWeight, rngSeed });
    recordDraftOutcome(scores);
    renderFinalTable(scores);
  }

  function teamPickIndicesFromState() {
    const pool = state.pool.map((p, idx) => ({ ...p, idx, posTag: normPosTag(p.position) }));
    const picksByTeam = Array.from({ length: state.settings.teams }, () => []);
    state.picks.forEach((pick) => {
      if (!pick.player) return;
      const idx = pool.findIndex((p) => p.name === pick.player);
      if (idx >= 0 && picksByTeam[pick.slot - 1].length < MAX_PER_TEAM) {
        picksByTeam[pick.slot - 1].push(idx);
      }
    });
    return { pool, picksByTeam };
  }

  function autofillToSeven(teamData) {
    const { pool, picksByTeam } = teamData;
    const available = new Set(pool.map((p) => p.idx));
    picksByTeam.flat().forEach((idx) => available.delete(idx));
    const remaining = [...available].sort((a, b) => (pool[a].adp ?? 999) - (pool[b].adp ?? 999));
    picksByTeam.forEach((team) => {
      while (team.length < MAX_PER_TEAM && remaining.length) {
        team.push(remaining.shift());
      }
    });
  }

  function simulateFinalStandings({ teamPicks, sims, useVar, qbWeight, rngSeed }) {
    const { pool, picksByTeam } = teamPicks;
    const totals = Array(picksByTeam.length).fill(0);
    const wins = Array(picksByTeam.length).fill(0);
    for (let s = 0; s < sims; s += 1) {
      const rng = () => rngSeed();
      const scores = picksByTeam.map((picks) => buildStartersAndBench(pool, picks, useVar, qbWeight, rng).score);
      scores.forEach((sc, i) => {
        totals[i] += sc;
      });
      const best = Math.max(...scores);
      const winners = scores.filter((x) => x === best).length;
      scores.forEach((sc, i) => {
        if (sc === best) wins[i] += 1 / winners;
      });
    }
    return totals.map((total, i) => ({ team: i + 1, avgPPG: total / sims, winPct: (wins[i] / sims) * 100 }))
      .sort((a, b) => b.winPct - a.winPct);
  }

  function renderFinalTable(rows) {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    ['Team', 'Avg PPG', 'Win %'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      header.appendChild(th);
    });
    thead.appendChild(header);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      [r.team, r.avgPPG.toFixed(2), r.winPct.toFixed(2)].forEach((val) => {
        const td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    elements.finalTable.innerHTML = '';
    elements.finalTable.appendChild(table);
    elements.finalStatus.textContent = rows.length
      ? `Current favorite: Team ${rows[0].team} — Win% ${rows[0].winPct.toFixed(2)}%`
      : 'No results.';
  }

  function init() {
    loadElements();
    loadSavedInputs();
    normalizeSettings();
    ensurePicks();
    hookEvents();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
