const UI = {
  state: null,
  ticker: null,
  tickCount: 0,
  clientsThisHour: 0,
  revenueThisHour: 0,
  notification: null,

  init(state) {
    this.state = state;
    if (state.phase === 'playing') {
      this.renderGame();
      this.startTicker();
    } else {
      this.renderMenu();
    }
  },

  fmt(n) { return Math.round(n).toLocaleString('fr-FR') + ' €'; },
  fmtSigned(n) { const r = Math.round(n); return (r >= 0 ? '+' : '') + r.toLocaleString('fr-FR') + ' €'; },

  // ── TICKER ──────────────────────────────────────────────

  startTicker() {
    if (this.ticker) clearInterval(this.ticker);
    const ticksPerHour = GAME_CONFIG.dayDuration / 24 / GAME_CONFIG.tickInterval;
    let ticksThisHour = 0;

    this.ticker = setInterval(() => {
      if (!this.state.salon) return;
      ticksThisHour++;

      const hourFraction = 1 / ticksPerHour;
      const result = this.tickFraction(hourFraction);

      this.clientsThisHour += result.clients;
      this.revenueThisHour += result.revenue;

      if (ticksThisHour >= ticksPerHour) {
        ticksThisHour = 0;
        this.clientsThisHour = 0;
        this.revenueThisHour = 0;
        const hourResult = Engine.tickHour(this.state);
        Engine.advanceHour(this.state);
        hourResult.events.forEach(ev => {
          Engine.addLog(this.state, ev.type, ev.msg);
          this.showNotification(ev.type, ev.msg);
        });
        DB.save(this.state);
      }

      this.updateLiveDisplay();
    }, GAME_CONFIG.tickInterval);
  },

  tickFraction(fraction) {
    const s = this.state;
    if (!s.salon || !Engine.isOpen(s)) return { clients: 0, revenue: 0 };
    const perHour = Engine.calcCustomersPerHour(s);
    const clients = perHour * fraction * (0.7 + Math.random() * 0.6);
    const revenue = clients * Engine.calcRevenuePerClient(s.salon);
    return { clients, revenue };
  },

  stopTicker() {
    if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
  },

  // ── NOTIFICATIONS ────────────────────────────────────────

  showNotification(type, msg) {
    const el = document.getElementById('notif');
    if (!el) return;
    el.textContent = msg;
    el.className = 'notif notif-' + type + ' show';
    if (this.notification) clearTimeout(this.notification);
    this.notification = setTimeout(() => { el.classList.remove('show'); }, 4000);
  },

  // ── MENU ────────────────────────────────────────────────

  renderMenu() {
    document.getElementById('root').innerHTML = `
      <div class="menu-page">
        <div class="menu-card">
          <h1>Empire</h1>
          <p>Bâtissez votre empire. Commencez par un salon de coiffure.</p>
          <button class="btn-primary full" onclick="UI.showOpenSalonScreen()">Ouvrir mon premier salon</button>
        </div>
      </div>`;
  },

  showOpenSalonScreen() {
    const distOpts = DISTRICTS.map(d =>
      `<option value="${d.id}">${d.name} — ${d.desc} (loyer ×${d.rentMult})</option>`
    ).join('');
    const supOpts = SUPPLIERS.map(s =>
      `<option value="${s.id}">${s.name} — qualité ×${s.quality} | prix ×${s.priceMult} | fiabilité ${Math.round(s.reliability * 100)}%</option>`
    ).join('');

    document.getElementById('root').innerHTML = `
      <div class="menu-page">
        <div class="menu-card wide">
          <h1>Ouvrir un salon</h1>
          <p class="muted">Coût d'ouverture : <strong>${this.fmt(SALON.openCost)}</strong> | Trésorerie : <strong>${this.fmt(this.state.cash)}</strong></p>

          <div class="form-group">
            <label>Nom du salon</label>
            <input type="text" id="inp-name" placeholder="Mon salon" value="Salon Elite">
          </div>
          <div class="form-group">
            <label>Quartier</label>
            <select id="inp-dist">${distOpts}</select>
          </div>
          <div class="form-group">
            <label>Fournisseur</label>
            <select id="inp-sup">${supOpts}</select>
          </div>

          <div class="info-box">
            <div class="info-row"><span>Revenus estimés</span><span class="positive">~${this.fmt(SALON.revenuePerCustomer * SALON.baseCustomersPerDay)}/jour</span></div>
            <div class="info-row"><span>Loyer hebdo</span><span class="negative">${this.fmt(SALON.weeklyRent)}/sem.</span></div>
            <div class="info-row"><span>Ouverture</span><span>${GAME_CONFIG.openHour}h – ${GAME_CONFIG.closeHour}h</span></div>
          </div>

          <button class="btn-primary full" onclick="UI.confirmOpenSalon()">Ouvrir le salon</button>
          <button class="btn-secondary full" onclick="UI.renderMenu()">Retour</button>
        </div>
      </div>`;
  },

  confirmOpenSalon() {
    const name = document.getElementById('inp-name')?.value?.trim() || 'Mon salon';
    const districtId = document.getElementById('inp-dist')?.value;
    const supplierId = document.getElementById('inp-sup')?.value;
    const result = Engine.openSalon(this.state, districtId, supplierId, name);
    if (result.success) {
      Engine.addLog(this.state, 'good', `${name} ouvert dans ${DISTRICTS.find(d => d.id === districtId)?.name}.`);
      DB.save(this.state);
      this.renderGame();
      this.startTicker();
    } else {
      alert(result.msg);
    }
  },

  // ── GAME ────────────────────────────────────────────────

  renderGame() {
    document.getElementById('root').innerHTML = `
      <div class="app-shell">
        <div id="notif" class="notif"></div>

        <header class="header">
          <div class="header-left">
            <div class="salon-name" id="hdr-name">—</div>
            <div class="header-meta" id="hdr-meta">—</div>
          </div>
          <div class="header-center" id="hdr-clock">—</div>
          <div class="header-right">
            <div class="cash-display">
              <div class="cash-label">Trésorerie</div>
              <div class="cash-val" id="hdr-cash">—</div>
            </div>
          </div>
        </header>

        <div class="live-bar" id="live-bar">
          <div class="live-item">
            <span class="live-label">Clients aujourd'hui</span>
            <span class="live-val" id="live-clients">0</span>
          </div>
          <div class="live-item">
            <span class="live-label">Revenus aujourd'hui</span>
            <span class="live-val positive" id="live-revenue">0 €</span>
          </div>
          <div class="live-item">
            <span class="live-label">Clients/heure</span>
            <span class="live-val" id="live-rate">0</span>
          </div>
          <div class="live-item">
            <span class="live-label">Réputation</span>
            <span class="live-val" id="live-rep">—</span>
          </div>
        </div>

        <nav class="tabs">
          <button class="tab active" data-tab="overview" onclick="UI.switchTab('overview')">Vue globale</button>
          <button class="tab" data-tab="stocks" onclick="UI.switchTab('stocks')">Stocks</button>
          <button class="tab" data-tab="staff" onclick="UI.switchTab('staff')">Personnel</button>
          <button class="tab" data-tab="upgrades" onclick="UI.switchTab('upgrades')">Améliorations</button>
          <button class="tab" data-tab="dashboard" onclick="UI.switchTab('dashboard')">Dashboard</button>
          <button class="tab" data-tab="log" onclick="UI.switchTab('log')">Journal</button>
        </nav>

        <main class="main" id="tab-content"></main>
      </div>

      <div id="modal-overlay" onclick="UI.closeModal()">
        <div class="modal" id="modal-box" onclick="event.stopPropagation()"></div>
      </div>`;

    this.switchTab('overview');
  },

  updateLiveDisplay() {
    const s = this.state;
    const salon = s.salon;
    if (!salon) return;

    const isOpen = Engine.isOpen(s);
    const dayName = Engine.getDayName(s.dayOfWeek);
    const hourStr = String(s.hour).padStart(2, '0') + 'h00';

    const nameEl = document.getElementById('hdr-name');
    const metaEl = document.getElementById('hdr-meta');
    const clockEl = document.getElementById('hdr-clock');
    const cashEl = document.getElementById('hdr-cash');
    const clientsEl = document.getElementById('live-clients');
    const revenueEl = document.getElementById('live-revenue');
    const rateEl = document.getElementById('live-rate');
    const repEl = document.getElementById('live-rep');

    if (nameEl) nameEl.textContent = salon.name;
    if (metaEl) metaEl.textContent = `Jour ${s.day} · ${dayName}`;
    if (clockEl) {
      clockEl.innerHTML = `<span class="clock-time">${hourStr}</span> <span class="status-pill ${isOpen ? 'open' : 'closed'}">${isOpen ? 'Ouvert' : 'Fermé'}</span>`;
    }
    if (cashEl) {
      cashEl.textContent = this.fmt(s.cash);
      cashEl.className = 'cash-val ' + (s.cash < 0 ? 'negative' : '');
    }

    const todayClients = salon.weeklyStats?.clients || 0;
    const todayRevenue = salon.weeklyStats?.revenue || 0;
    const ratePerHour = Math.round(Engine.calcCustomersPerHour(s));

    if (clientsEl) clientsEl.textContent = todayClients;
    if (revenueEl) revenueEl.textContent = this.fmt(todayRevenue);
    if (rateEl) rateEl.textContent = isOpen ? ratePerHour + '/h' : '—';
    if (repEl) repEl.textContent = salon.reputation + '/100';

    const stockAlerts = Engine.getStockAlerts(salon);
    if (stockAlerts.length > 0) {
      const tab = document.querySelector('[data-tab="stocks"]');
      if (tab && !tab.querySelector('.tab-alert')) {
        const dot = document.createElement('span');
        dot.className = 'tab-alert';
        tab.appendChild(dot);
      }
    } else {
      document.querySelector('[data-tab="stocks"] .tab-alert')?.remove();
    }
  },

  switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    const content = document.getElementById('tab-content');
    if (!content) return;
    switch (name) {
      case 'overview': content.innerHTML = this.tplOverview(); break;
      case 'stocks': content.innerHTML = this.tplStocks(); break;
      case 'staff': content.innerHTML = this.tplStaff(); break;
      case 'upgrades': content.innerHTML = this.tplUpgrades(); break;
      case 'dashboard': content.innerHTML = this.tplDashboard(); this.renderCharts(); break;
      case 'log': content.innerHTML = this.tplLog(); break;
    }
    this.bindTabEvents(name);
  },

  // ── TABS ────────────────────────────────────────────────

  tplOverview() {
    const s = this.state;
    const salon = s.salon;
    const district = Engine.getDistrict(salon);
    const supplier = Engine.getSupplier(salon);
    const weeklyExp = Engine.calcWeeklyExpenses(salon);
    const projectedProfit = Engine.calcProjectedWeeklyProfit(s);
    const stockPenalty = Engine.calcStockPenalty(salon);
    const alerts = Engine.getStockAlerts(salon);

    return `
      <div class="overview">
        <div class="overview-grid">
          <div class="ov-card">
            <div class="ov-label">Emplacement</div>
            <div class="ov-val">${district.name}</div>
            <div class="ov-sub muted">Trafic ×${district.traffic} · Loyer ×${district.rentMult}</div>
          </div>
          <div class="ov-card">
            <div class="ov-label">Fournisseur</div>
            <div class="ov-val">${supplier.name}</div>
            <div class="ov-sub muted">Qualité ×${supplier.quality} · Fiabilité ${Math.round(supplier.reliability * 100)}%</div>
          </div>
          <div class="ov-card">
            <div class="ov-label">Charges hebdo</div>
            <div class="ov-val negative">${this.fmt(weeklyExp)}</div>
            <div class="ov-sub muted">Loyer + salaires</div>
          </div>
          <div class="ov-card">
            <div class="ov-label">Profit projeté</div>
            <div class="ov-val ${projectedProfit >= 0 ? 'positive' : 'negative'}">${this.fmtSigned(projectedProfit)}</div>
            <div class="ov-sub muted">par semaine</div>
          </div>
        </div>

        ${stockPenalty > 0 ? `
          <div class="alert-banner">
            ⚠️ Stocks bas — vous perdez ${Math.round(stockPenalty * 100)}% de vos clients potentiels
            <button class="btn-sm" onclick="UI.switchTab('stocks')">Gérer les stocks →</button>
          </div>` : ''}

        ${alerts.length > 0 ? alerts.map(a => `
          <div class="alert-item ${a.level}">
            ${a.level === 'critical' ? '🔴' : '🟡'} ${a.name} — ${a.level === 'critical' ? 'Rupture totale' : 'Stock faible'}
          </div>`).join('') : ''}

        <div class="week-progress">
          <div class="week-label">
            <span>Semaine en cours</span>
            <span class="muted">Jour ${s.dayOfWeek}/7</span>
          </div>
          <div class="week-days">
            ${['L','M','M','J','V','S','D'].map((d, i) =>
              `<div class="week-day ${i + 1 === s.dayOfWeek ? 'today' : i + 1 < s.dayOfWeek ? 'done' : ''}">${d}</div>`
            ).join('')}
          </div>
          <div class="week-events">
            <span class="week-event">📅 Paie vendredi</span>
            <span class="week-event">🏠 Loyer lundi</span>
          </div>
        </div>

        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-label">Clients réguliers</div>
            <div class="stat-val">${salon.regularClients}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Total clients servis</div>
            <div class="stat-val">${salon.totalClientsServed}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Revenus totaux</div>
            <div class="stat-val positive">${this.fmt(salon.allTimeRevenue)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Ouvert depuis</div>
            <div class="stat-val">Jour ${salon.openedDay}</div>
          </div>
        </div>
      </div>`;
  },

  tplStocks() {
    const salon = this.state.salon;
    const supplier = Engine.getSupplier(salon);

    const stocksHtml = SALON.stocks.map(stockDef => {
      const qty = salon.stocks[stockDef.id] || 0;
      const ratio = Math.min(1, qty / stockDef.capacity);
      const col = ratio <= 0 ? 'var(--danger)' : ratio < 0.2 ? 'var(--warning)' : 'var(--success)';
      const status = ratio <= 0 ? 'Rupture' : ratio < 0.2 ? 'Faible' : ratio < 0.5 ? 'Correct' : 'Bon';
      const orderCost = Math.round(stockDef.baseCost * supplier.priceMult);

      return `<div class="stock-card ${ratio <= 0 ? 'critical' : ratio < 0.2 ? 'low' : ''}">
        <div class="stock-header">
          <div>
            <div class="stock-name">${stockDef.name}</div>
            <div class="stock-meta muted">${Math.round(qty)} / ${stockDef.capacity} ${stockDef.unit} · Usage : ${stockDef.dailyUse}/jour</div>
          </div>
          <div class="stock-status" style="color:${col};">${status}</div>
        </div>
        <div class="stock-bar-wrap">
          <div class="stock-bar" style="width:${Math.round(ratio * 100)}%;background:${col};"></div>
        </div>
        <div class="stock-footer">
          <span class="muted">Commande : +${stockDef.orderSize} ${stockDef.unit} pour ${this.fmt(orderCost)}</span>
          <button class="btn-primary btn-sm" onclick="UI.doRestock('${stockDef.id}')">Commander</button>
        </div>
      </div>`;
    }).join('');

    return `
      <div class="stocks-page">
        <div class="stocks-header">
          <div>
            <div class="muted" style="font-size:12px;">Fournisseur actuel</div>
            <strong>${supplier.name}</strong>
            <span class="muted" style="font-size:12px;"> · fiabilité ${Math.round(supplier.reliability * 100)}%</span>
          </div>
          <button class="btn-secondary btn-sm" onclick="UI.showSupplierModal()">Changer</button>
        </div>

        <label class="autorestock-toggle">
          <input type="checkbox" id="auto-restock" ${salon.autoRestock ? 'checked' : ''} onchange="UI.toggleAutoRestock(this.checked)">
          <span>Réapprovisionnement automatique</span>
          <span class="muted" style="font-size:11px;">(commande dès que le stock passe sous 25%)</span>
        </label>

        <div class="stocks-list">${stocksHtml}</div>
      </div>`;
  },

  tplStaff() {
    const s = this.state;
    const salon = s.salon;
    const weeklyExp = Engine.calcWeeklyExpenses(salon);

    const currentStaff = salon.staff.map(st => {
      const role = STAFF_ROLES.find(r => r.id === st.roleId);
      return `<div class="staff-card">
        <div class="staff-info">
          <div class="staff-role">${role?.name || st.roleId}</div>
          <div class="staff-detail muted">${role?.desc || ''} · Embauché jour ${st.hiredDay}</div>
        </div>
        <div class="staff-right">
          <span class="staff-salary negative">${role?.salary} €/sem.</span>
          <button class="btn-danger-sm" onclick="UI.doFire('${st.id}')">Licencier</button>
        </div>
      </div>`;
    }).join('');

    const availableRoles = STAFF_ROLES.map(role => {
      const alreadyHired = salon.staff.filter(s => s.roleId === role.id).length;
      const isFull = salon.staff.length >= SALON.staffSlots;
      return `<div class="role-card">
        <div class="role-info">
          <div class="role-name">${role.name}</div>
          <div class="role-desc muted">${role.desc}</div>
        </div>
        <div class="role-right">
          <span class="role-salary">${role.salary} €/sem.</span>
          <button class="btn-primary btn-sm" ${isFull ? 'disabled' : ''} onclick="UI.doHire('${role.id}')">
            ${isFull ? 'Complet' : 'Embaucher'}
          </button>
        </div>
      </div>`;
    }).join('');

    return `
      <div class="staff-page">
        <div class="staff-summary">
          <span>${salon.staff.length}/${SALON.staffSlots} employés</span>
          <span class="negative">${this.fmt(salon.staff.reduce((a, st) => {
            const r = STAFF_ROLES.find(r => r.id === st.roleId); return a + (r?.salary || 0);
          }, 0))}/sem. en salaires</span>
        </div>

        ${salon.staff.length
          ? `<div class="section-label">Équipe actuelle</div><div class="staff-list">${currentStaff}</div>`
          : '<p class="muted" style="margin-bottom:16px;">Aucun employé. Vous gérez tout seul.</p>'}

        <div class="section-label">Recruter</div>
        <div class="roles-list">${availableRoles}</div>
      </div>`;
  },

  tplUpgrades() {
    const s = this.state;
    const salon = s.salon;

    const available = SALON.upgrades.filter(u => !salon.upgrades.includes(u.id));
    const done = SALON.upgrades.filter(u => salon.upgrades.includes(u.id));

    const availHtml = available.length
      ? available.map(u => `
          <div class="upgrade-card">
            <div class="upgrade-info">
              <div class="upgrade-name">${u.name}</div>
              <div class="upgrade-desc muted">${u.desc}</div>
            </div>
            <div class="upgrade-right">
              <span class="upgrade-cost">${this.fmt(u.cost)}</span>
              <button class="btn-primary btn-sm" ${s.cash < u.cost ? 'disabled' : ''} onclick="UI.doUpgrade('${u.id}')">
                ${s.cash < u.cost ? 'Fonds insuffisants' : 'Acheter'}
              </button>
            </div>
          </div>`).join('')
      : '<p class="muted">Toutes les améliorations sont actives.</p>';

    const doneHtml = done.map(u => `
      <div class="upgrade-card done">
        <div class="upgrade-name">${u.name}</div>
        <span class="badge-done">✓ Actif</span>
      </div>`).join('');

    return `
      <div class="upgrades-page">
        <div class="section-label">Disponibles</div>
        <div class="upgrades-list">${availHtml}</div>
        ${done.length ? `<div class="section-label" style="margin-top:16px;">Actifs</div><div class="upgrades-list">${doneHtml}</div>` : ''}
      </div>`;
  },

  tplDashboard() {
    const s = this.state;
    const salon = s.salon;
    const totalRevenue = salon.allTimeRevenue;
    const totalClients = salon.totalClientsServed;
    const avgPerClient = totalClients > 0 ? Math.round(totalRevenue / totalClients) : 0;

    return `
      <div class="dashboard-page">
        <div class="dash-kpis">
          <div class="dash-kpi">
            <div class="dash-kpi-lbl">Revenus totaux</div>
            <div class="dash-kpi-val positive">${this.fmt(totalRevenue)}</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-lbl">Clients totaux</div>
            <div class="dash-kpi-val">${totalClients}</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-lbl">Panier moyen</div>
            <div class="dash-kpi-val">${this.fmt(avgPerClient)}</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-lbl">Réputation</div>
            <div class="dash-kpi-val">${salon.reputation}/100</div>
          </div>
        </div>

        <div class="chart-section">
          <div class="section-label">Revenus & charges — historique hebdo</div>
          <canvas id="chart-main" height="180"></canvas>
        </div>

        <div class="chart-section" style="margin-top:16px;">
          <div class="section-label">Trésorerie</div>
          <canvas id="chart-cash" height="140"></canvas>
        </div>
      </div>`;
  },

  renderCharts() {
    const history = this.state.history;
    if (!history?.length) return;

    setTimeout(() => {
      const labels = history.map(h => 'J' + h.day);
      const c1 = document.getElementById('chart-main');
      const c2 = document.getElementById('chart-cash');
      if (!c1 || !c2) return;

      new Chart(c1, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Revenus', data: history.map(h => h.revenue), backgroundColor: '#1D9E75', borderRadius: 3 },
            { label: 'Charges', data: history.map(h => h.expenses), backgroundColor: '#E24B4A', borderRadius: 3 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { font: { size: 11 } } } },
          scales: {
            y: { ticks: { callback: v => Math.round(v / 1000) + 'k€', font: { size: 10 } }, grid: { color: 'rgba(128,128,128,0.1)' } },
            x: { ticks: { font: { size: 9 } }, grid: { display: false } },
          },
        },
      });

      new Chart(c2, {
        type: 'line',
        data: {
          labels,
          datasets: [{ label: 'Trésorerie', data: history.map(h => h.cash), borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.08)', borderWidth: 1.5, tension: 0.3, pointRadius: 2 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { ticks: { callback: v => Math.round(v / 1000) + 'k€', font: { size: 10 } }, grid: { color: 'rgba(128,128,128,0.1)' } },
            x: { ticks: { font: { size: 9 } }, grid: { display: false } },
          },
        },
      });
    }, 100);
  },

  tplLog() {
    const logs = this.state.log || [];
    if (!logs.length) return '<p class="muted" style="padding:1rem 0;">Aucun événement.</p>';
    return `<div class="log-list">
      ${logs.map(l => `<div class="log-item log-${l.type}">
        <span class="log-meta">J${l.day} ${String(l.hour).padStart(2,'0')}h</span>
        <span class="log-msg">${l.msg}</span>
      </div>`).join('')}
    </div>`;
  },

  // ── ACTIONS ─────────────────────────────────────────────

  doRestock(stockId) {
    const result = Engine.manualRestock(this.state, stockId);
    Engine.addLog(this.state, result.success ? 'neutral' : 'bad', result.msg);
    this.showNotification(result.success ? 'neutral' : 'bad', result.msg);
    DB.save(this.state);
    this.switchTab('stocks');
  },

  toggleAutoRestock(checked) {
    this.state.salon.autoRestock = checked;
    DB.save(this.state);
  },

  doHire(roleId) {
    const result = Engine.hireStaff(this.state, roleId);
    if (result.success) {
      const role = STAFF_ROLES.find(r => r.id === roleId);
      Engine.addLog(this.state, 'neutral', `${role.name} embauché.`);
      DB.save(this.state);
      this.switchTab('staff');
    } else {
      this.showNotification('bad', result.msg);
    }
  },

  doFire(staffId) {
    const st = this.state.salon.staff.find(s => s.id === staffId);
    const role = STAFF_ROLES.find(r => r.id === st?.roleId);
    if (!confirm(`Licencier ${role?.name} ?`)) return;
    Engine.fireStaff(this.state, staffId);
    Engine.addLog(this.state, 'neutral', `${role?.name} licencié.`);
    DB.save(this.state);
    this.switchTab('staff');
  },

  doUpgrade(upgradeId) {
    const result = Engine.applyUpgrade(this.state, upgradeId);
    if (result.success) {
      const upg = SALON.upgrades.find(u => u.id === upgradeId);
      Engine.addLog(this.state, 'good', `Amélioration "${upg.name}" installée.`);
      this.showNotification('good', `"${upg.name}" activé !`);
      DB.save(this.state);
      this.switchTab('upgrades');
    } else {
      this.showNotification('bad', result.msg);
    }
  },

  showSupplierModal() {
    const salon = this.state.salon;
    const html = `
      <h2>Changer de fournisseur</h2>
      <div class="supplier-list">
        ${SUPPLIERS.map(s => `
          <div class="supplier-item ${s.id === salon.supplierId ? 'active' : ''}">
            <div class="supplier-info">
              <div class="supplier-name">${s.name} ${s.id === salon.supplierId ? '<span class="badge-done">Actuel</span>' : ''}</div>
              <div class="muted" style="font-size:12px;">${s.desc}</div>
              <div class="supplier-stats">
                <span>Qualité ×${s.quality}</span>
                <span>Prix ×${s.priceMult}</span>
                <span>Fiabilité ${Math.round(s.reliability * 100)}%</span>
              </div>
            </div>
            ${s.id !== salon.supplierId
              ? `<button class="btn-secondary btn-sm" onclick="UI.changeSupplier('${s.id}')">Choisir</button>`
              : ''}
          </div>`).join('')}
      </div>`;
    this.showModal(html);
  },

  changeSupplier(supplierId) {
    this.state.salon.supplierId = supplierId;
    const sup = Engine.getSupplier(this.state.salon);
    Engine.addLog(this.state, 'neutral', `Fournisseur changé : ${sup.name}.`);
    DB.save(this.state);
    this.closeModal();
    this.switchTab('stocks');
  },

  showModal(html) {
    document.getElementById('modal-box').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('open');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  },

  bindTabEvents(name) {},
};
