const UI = {

  state: null,

  init(state) {
    this.state = state;
    this.renderAll();
  },

  fmt(n) {
    return Math.round(n).toLocaleString('fr-FR') + ' €';
  },

  fmtSigned(n) {
    const r = Math.round(n);
    return (r >= 0 ? '+' : '') + r.toLocaleString('fr-FR') + ' €';
  },

  season() {
    return Engine.getCurrentSeason(this.state.week);
  },

  renderAll() {
    this.renderHeader();
    this.renderKpis();
    const active = document.querySelector('.tab.active')?.dataset.tab || 'empire';
    this.renderTab(active);
  },

  renderHeader() {
    const s = this.state;
    const season = this.season();
    document.getElementById('hdr-week').textContent = `Semaine ${s.week}`;
    document.getElementById('hdr-season').textContent = season.name;
    document.getElementById('hdr-cash').textContent = this.fmt(s.cash);
  },

  renderKpis() {
    const s = this.state;
    let totalRev = 0, totalExp = 0;
    s.businesses.forEach(b => {
      totalRev += Engine.calcRevenue(b, s.week);
      totalExp += Engine.calcExpenses(b);
    });
    const cf = totalRev - totalExp;
    document.getElementById('kpi-rev').textContent = this.fmt(totalRev);
    document.getElementById('kpi-exp').textContent = this.fmt(totalExp);
    const cfEl = document.getElementById('kpi-cf');
    cfEl.textContent = this.fmtSigned(cf);
    cfEl.className = 'kpi-val ' + (cf >= 0 ? 'positive' : 'negative');
    document.getElementById('kpi-biz').textContent = s.businesses.length;
  },

  renderTab(name) {
    const content = document.getElementById('tab-content');
    switch (name) {
      case 'empire': content.innerHTML = this.tplEmpire(); break;
      case 'market': content.innerHTML = this.tplMarket(); break;
      case 'staff': content.innerHTML = this.tplStaff(); break;
      case 'dashboard': content.innerHTML = this.tplDashboard(); this.renderChart(); break;
      case 'log': content.innerHTML = this.tplLog(); break;
    }
    this.bindEvents(name);
  },

  // ── EMPIRE ──────────────────────────────────────────────

  tplEmpire() {
    const s = this.state;
    if (!s.businesses.length) {
      return `<div class="empty-state">
        <p>Vous ne possédez aucun établissement.</p>
        <button class="btn-primary" onclick="UI.switchTab('market')">Aller sur le marché →</button>
      </div>`;
    }

    return s.businesses.map(biz => {
      const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
      const district = DISTRICTS.find(d => d.id === biz.districtId) || DISTRICTS[0];
      const supplier = Engine.getSupplier(biz);
      const rev = Engine.calcRevenue(biz, s.week);
      const exp = Engine.calcExpenses(biz);
      const profit = rev - exp;
      const stockPenalty = Engine.calcStockPenalty(biz, type);
      const upgCost = type.upgrades.filter(u => !biz.upgrades?.includes(u.id)).map(u => u.cost)[0];
      const hasManager = biz.staff?.some(st => st.roleId === 'manager');

      const stocksHtml = type.stocks.map(stockDef => {
        const qty = biz.stocks?.[stockDef.id] || 0;
        const ratio = Math.min(1, qty / (stockDef.weeklyUse * 4));
        const col = ratio < 0.15 ? 'var(--danger)' : ratio < 0.4 ? 'var(--warning)' : 'var(--success)';
        return `<div class="stock-row">
          <span class="stock-name">${stockDef.name}</span>
          <div class="stock-bar-wrap"><div class="stock-bar" style="width:${Math.round(ratio*100)}%;background:${col};"></div></div>
          <span class="stock-qty">${Math.round(qty)} ${stockDef.unit}</span>
          <button class="btn-sm" onclick="UI.manualRestock('${biz.id}','${stockDef.id}')">Commander</button>
        </div>`;
      }).join('');

      const staffHtml = biz.staff?.length
        ? biz.staff.map(st => {
            const role = STAFF_ROLES.find(r => r.id === st.roleId);
            return `<div class="staff-pill">
              ${role?.name || st.roleId}
              <span class="salary">${role?.weeklySalary} €/sem.</span>
              <button class="btn-icon" onclick="UI.fireStaff('${biz.id}','${st.id}')">✕</button>
            </div>`;
          }).join('')
        : '<span class="muted">Aucun employé</span>';

      const effectsHtml = biz.activeEffects?.length
        ? biz.activeEffects.map(ef => `<span class="effect-pill ${ef.value >= 0 ? 'good' : 'bad'}">${ef.type} (${ef.duration} sem.)</span>`).join('')
        : '';

      return `<div class="biz-card ${profit < 0 ? 'loss' : ''}">
        <div class="biz-card-header">
          <div class="biz-title">
            <span class="biz-icon">${type.icon}</span>
            <div>
              <div class="biz-name">${biz.name}</div>
              <div class="biz-meta">${district.name} · Niv. ${biz.level} · ${biz.staff?.length || 0}/${type.staffNeeded} employés</div>
            </div>
          </div>
          <div class="biz-profit ${profit >= 0 ? 'positive' : 'negative'}">${this.fmtSigned(profit)}/sem.</div>
        </div>

        <div class="biz-financials">
          <div class="fin-item"><span class="fin-lbl">Revenus</span><span class="fin-val positive">${this.fmt(rev)}</span></div>
          <div class="fin-item"><span class="fin-lbl">Charges</span><span class="fin-val negative">${this.fmt(exp)}</span></div>
          <div class="fin-item"><span class="fin-lbl">Clients/sem.</span><span class="fin-val">${biz.lastCustomers || '—'}</span></div>
          <div class="fin-item"><span class="fin-lbl">Fournisseur</span><span class="fin-val">${supplier?.name || 'Aucun'}</span></div>
        </div>

        ${stockPenalty > 0 ? `<div class="alert-banner">⚠️ Stocks bas — perte de ${Math.round(stockPenalty*100)}% des clients</div>` : ''}
        ${effectsHtml ? `<div class="effects-row">${effectsHtml}</div>` : ''}

        ${type.stocks.length ? `<div class="stocks-section">
          <div class="section-label">Stocks
            <label class="toggle-label">
              <input type="checkbox" ${biz.autoRestock ? 'checked' : ''} onchange="UI.toggleAutoRestock('${biz.id}',this.checked)">
              Réapprovisionnement auto
            </label>
          </div>
          ${stocksHtml}
        </div>` : ''}

        <div class="staff-section">
          <div class="section-label">Personnel</div>
          <div class="staff-list">${staffHtml}</div>
          ${biz.staff?.length < type.staffNeeded
            ? `<button class="btn-secondary" onclick="UI.showHireModal('${biz.id}')">+ Recruter</button>`
            : '<span class="muted" style="font-size:12px;">Effectif complet</span>'}
        </div>

        <div class="biz-actions">
          <button class="btn-secondary" onclick="UI.showUpgradeModal('${biz.id}')">Améliorations</button>
          <button class="btn-secondary" onclick="UI.showSupplierModal('${biz.id}')">Fournisseur</button>
          <button class="btn-danger" onclick="UI.confirmSell('${biz.id}')">Vendre</button>
        </div>
      </div>`;
    }).join('');
  },

  // ── MARKET ──────────────────────────────────────────────

  tplMarket() {
    const sectors = [
      { key: 'food', label: 'Restauration & boissons' },
      { key: 'retail', label: 'Commerce & distribution' },
      { key: 'services', label: 'Services' },
      { key: 'real-estate', label: 'Immobilier' },
    ];

    return sectors.map(sec => {
      const types = BUSINESS_TYPES.filter(t => t.sector === sec.key);
      const cards = types.map(type => {
        const owned = this.state.businesses.filter(b => b.typeId === type.id);
        const canAfford = this.state.cash >= type.openCost;
        const canDuplicate = type.canDuplicate || owned.length === 0;
        return `<div class="market-card">
          <div class="market-card-header">
            <span class="biz-icon">${type.icon}</span>
            <span class="market-price">${this.fmt(type.openCost)}</span>
          </div>
          <div class="market-name">${type.name}</div>
          <div class="market-desc">${type.desc}</div>
          <div class="market-stats">
            <div><span class="muted">Revenus base</span><br><strong class="positive">${this.fmt(type.baseRevenue || type.revenuePerCustomer * type.baseCustomersPerWeek)}/sem.</strong></div>
            <div><span class="muted">Loyer base</span><br><strong class="negative">${this.fmt(type.weeklyRent)}/sem.</strong></div>
            <div><span class="muted">Personnel max</span><br><strong>${type.staffNeeded}</strong></div>
          </div>
          ${owned.length ? `<div class="owned-badge">Possédé × ${owned.length}</div>` : ''}
          <button class="btn-primary" ${(!canAfford || !canDuplicate) ? 'disabled' : ''} onclick="UI.showOpenModal('${type.id}')">
            ${!canAfford ? 'Fonds insuffisants' : !canDuplicate ? 'Non duplicable' : 'Ouvrir un établissement'}
          </button>
        </div>`;
      }).join('');
      return `<div class="market-sector"><h3>${sec.label}</h3><div class="market-grid">${cards}</div></div>`;
    }).join('');
  },

  // ── STAFF ──────────────────────────────────────────────

  tplStaff() {
    return `<div class="staff-overview">
      <h3>Tous vos employés</h3>
      ${this.state.businesses.map(biz => {
        const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
        if (!biz.staff?.length) return '';
        return `<div class="staff-biz-group">
          <div class="staff-biz-name">${type?.icon} ${biz.name}</div>
          ${biz.staff.map(st => {
            const role = STAFF_ROLES.find(r => r.id === st.roleId);
            return `<div class="staff-row">
              <span class="staff-role">${role?.name || st.roleId}</span>
              <span class="staff-salary">${role?.weeklySalary} €/sem.</span>
              <span class="staff-since">Sem. ${st.hiredWeek}</span>
              <button class="btn-sm btn-danger-sm" onclick="UI.fireStaff('${biz.id}','${st.id}')">Licencier</button>
            </div>`;
          }).join('')}
        </div>`;
      }).join('') || '<p class="muted">Aucun employé.</p>'}

      <h3 style="margin-top:1.5rem;">Postes disponibles</h3>
      <div class="roles-grid">
        ${STAFF_ROLES.map(role => `
          <div class="role-card">
            <div class="role-name">${role.name}</div>
            <div class="role-salary">${role.weeklySalary} €/sem.</div>
            <div class="role-sectors muted">${role.sectors.join(', ')}</div>
            <div class="role-effect muted">${role.effect}${role.value ? ' +' + role.value : ''}</div>
          </div>`).join('')}
      </div>
    </div>`;
  },

  // ── DASHBOARD ──────────────────────────────────────────

  tplDashboard() {
    const s = this.state;
    const alerts = [];
    s.businesses.forEach(b => {
      const type = BUSINESS_TYPES.find(t => t.id === b.typeId);
      const pen = Engine.calcStockPenalty(b, type);
      if (pen > 0.2) alerts.push(`📦 ${b.name} : stocks critiques`);
      if (Engine.calcRevenue(b, s.week) - Engine.calcExpenses(b) < 0) alerts.push(`📉 ${b.name} est déficitaire`);
      if (!b.supplierId && type.stocks.length) alerts.push(`🚚 ${b.name} : aucun fournisseur`);
    });

    const totalValue = s.businesses.reduce((a, b) => {
      const type = BUSINESS_TYPES.find(t => t.id === b.typeId);
      return a + (type?.openCost || 0) * (b.level || 1) * 0.8;
    }, 0);

    return `<div class="dashboard">
      <div class="dash-kpis">
        <div class="dash-kpi"><div class="dash-kpi-lbl">Trésorerie</div><div class="dash-kpi-val">${this.fmt(s.cash)}</div></div>
        <div class="dash-kpi"><div class="dash-kpi-lbl">Valeur empire</div><div class="dash-kpi-val">${this.fmt(totalValue)}</div></div>
        <div class="dash-kpi"><div class="dash-kpi-lbl">Établissements</div><div class="dash-kpi-val">${s.businesses.length}</div></div>
        <div class="dash-kpi"><div class="dash-kpi-lbl">Semaine</div><div class="dash-kpi-val">${s.week}</div></div>
      </div>

      ${alerts.length ? `<div class="alerts-section">
        <h3>Alertes</h3>
        ${alerts.map(a => `<div class="alert-item">${a}</div>`).join('')}
      </div>` : ''}

      <div class="chart-section">
        <h3>Cash-flow — historique</h3>
        <canvas id="cf-chart" height="180"></canvas>
      </div>

      <div class="chart-section">
        <h3>Performance par établissement</h3>
        <canvas id="biz-chart" height="180"></canvas>
      </div>
    </div>`;
  },

  renderChart() {
    const s = this.state;
    if (!s.history?.length) return;

    const ctx1 = document.getElementById('cf-chart');
    const ctx2 = document.getElementById('biz-chart');
    if (!ctx1 || !ctx2) return;

    const labels = s.history.map(h => 'S' + h.week);
    const cfData = s.history.map(h => h.revenue - h.expenses);
    const cashData = s.history.map(h => h.cash);

    new Chart(ctx1, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Cash-flow', data: cfData, borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)', borderWidth: 1.5, tension: 0.3, pointRadius: 2 },
          { label: 'Trésorerie', data: cashData, borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.06)', borderWidth: 1.5, tension: 0.3, pointRadius: 2 },
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

    const bizLabels = s.businesses.map(b => b.name);
    const bizRevs = s.businesses.map(b => Engine.calcRevenue(b, s.week));
    const bizExps = s.businesses.map(b => Engine.calcExpenses(b));

    new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: bizLabels,
        datasets: [
          { label: 'Revenus', data: bizRevs, backgroundColor: '#1D9E75', borderRadius: 3 },
          { label: 'Charges', data: bizExps, backgroundColor: '#E24B4A', borderRadius: 3 },
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
  },

  // ── LOG ──────────────────────────────────────────────

  tplLog() {
    const logs = this.state.log || [];
    if (!logs.length) return '<p class="muted">Aucun événement pour l\'instant.</p>';
    return `<div class="log-list">
      ${logs.map(l => `<div class="log-item log-${l.type}">
        <span class="log-week">S${l.week}</span>
        <span class="log-msg">${l.msg}</span>
      </div>`).join('')}
    </div>`;
  },

  // ── MODALS ──────────────────────────────────────────────

  showModal(html) {
    document.getElementById('modal-overlay').innerHTML = `
      <div class="modal">
        ${html}
        <button class="btn-secondary modal-close" onclick="UI.closeModal()">Fermer</button>
      </div>`;
    document.getElementById('modal-overlay').classList.add('open');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  },

  showOpenModal(typeId) {
    const type = BUSINESS_TYPES.find(t => t.id === typeId);
    const supKey = Engine.getSupplierKey(typeId);
    const suppliers = SUPPLIERS[supKey] || [];
    const distOpts = DISTRICTS.map(d => `<option value="${d.id}">${d.name} — trafic ×${d.traffic} | loyer ×${d.rentMult}</option>`).join('');
    const supOpts = suppliers.map(s => `<option value="${s.id}">${s.name} — qualité ×${s.quality} | prix ×${s.priceMult} | fiabilité ${Math.round(s.reliability*100)}%</option>`).join('');

    this.showModal(`
      <h2>${type.icon} Ouvrir : ${type.name}</h2>
      <p class="modal-desc">${type.desc}</p>
      <div class="modal-cost">Coût d'ouverture : <strong>${this.fmt(type.openCost)}</strong> | Trésorerie : <strong>${this.fmt(this.state.cash)}</strong></div>

      <div class="form-group">
        <label>Nom de l'établissement</label>
        <input type="text" id="inp-name" value="${type.name}" placeholder="${type.name}">
      </div>
      <div class="form-group">
        <label>Quartier <span class="muted">(influence trafic & loyer)</span></label>
        <select id="inp-dist">${distOpts}</select>
      </div>
      ${suppliers.length ? `<div class="form-group">
        <label>Fournisseur principal <span class="muted">(influence qualité & coût stocks)</span></label>
        <select id="inp-sup">${supOpts}</select>
      </div>` : ''}

      <div class="modal-actions">
        <button class="btn-primary" onclick="UI.confirmOpen('${typeId}')">Confirmer l'ouverture</button>
      </div>
    `);
  },

  confirmOpen(typeId) {
    const name = document.getElementById('inp-name')?.value?.trim();
    const districtId = document.getElementById('inp-dist')?.value;
    const supplierId = document.getElementById('inp-sup')?.value || null;
    const result = Engine.openBusiness(this.state, typeId, districtId, supplierId, name);
    if (result.success) {
      DB.addLog(this.state, 'good', `Ouverture : ${name || typeId} (${DISTRICTS.find(d=>d.id===districtId)?.name}).`);
      DB.save(this.state);
      this.closeModal();
      this.renderAll();
    } else {
      alert(result.msg);
    }
  },

  showUpgradeModal(bizId) {
    const biz = this.state.businesses.find(b => b.id === bizId);
    const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
    const available = type.upgrades.filter(u => !biz.upgrades?.includes(u.id));
    const done = type.upgrades.filter(u => biz.upgrades?.includes(u.id));

    const availHtml = available.length
      ? available.map(u => `<div class="upgrade-item">
          <div class="upgrade-info">
            <div class="upgrade-name">${u.name}</div>
            <div class="upgrade-desc muted">${u.desc}</div>
          </div>
          <div class="upgrade-right">
            <span class="upgrade-cost">${this.fmt(u.cost)}</span>
            <button class="btn-primary btn-sm" ${this.state.cash < u.cost ? 'disabled' : ''} onclick="UI.applyUpgrade('${bizId}','${u.id}')">Acheter</button>
          </div>
        </div>`).join('')
      : '<p class="muted">Toutes les améliorations sont débloquées.</p>';

    const doneHtml = done.length
      ? done.map(u => `<div class="upgrade-item done"><span class="upgrade-name">${u.name}</span><span class="badge-done">✓ Actif</span></div>`).join('')
      : '';

    this.showModal(`
      <h2>Améliorations — ${biz.name}</h2>
      <div class="upgrade-list">${availHtml}</div>
      ${doneHtml ? `<div class="upgrade-done"><h4>Actifs</h4>${doneHtml}</div>` : ''}
    `);
  },

  applyUpgrade(bizId, upgradeId) {
    const result = Engine.applyUpgrade(this.state, bizId, upgradeId);
    if (result.success) {
      const biz = this.state.businesses.find(b => b.id === bizId);
      const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
      const upg = type.upgrades.find(u => u.id === upgradeId);
      DB.addLog(this.state, 'good', `${biz.name} : amélioration "${upg.name}" appliquée.`);
      DB.save(this.state);
      this.closeModal();
      this.showUpgradeModal(bizId);
      this.renderKpis();
    } else {
      alert(result.msg);
    }
  },

  showSupplierModal(bizId) {
    const biz = this.state.businesses.find(b => b.id === bizId);
    const supKey = Engine.getSupplierKey(biz.typeId);
    const suppliers = SUPPLIERS[supKey] || [];
    const current = Engine.getSupplier(biz);

    const html = suppliers.map(s => `
      <div class="supplier-item ${s.id === biz.supplierId ? 'active' : ''}">
        <div class="supplier-info">
          <div class="supplier-name">${s.name} ${s.id === biz.supplierId ? '<span class="badge-done">Actuel</span>' : ''}</div>
          <div class="supplier-desc muted">${s.desc}</div>
          <div class="supplier-stats">
            <span>Qualité ×${s.quality}</span>
            <span>Prix ×${s.priceMult}</span>
            <span>Fiabilité ${Math.round(s.reliability*100)}%</span>
            <span>Commande min. ×${s.minOrder}</span>
          </div>
        </div>
        ${s.id !== biz.supplierId ? `<button class="btn-secondary btn-sm" onclick="UI.changeSupplier('${bizId}','${s.id}')">Choisir</button>` : ''}
      </div>`).join('');

    this.showModal(`<h2>Fournisseur — ${biz.name}</h2><div class="supplier-list">${html}</div>`);
  },

  changeSupplier(bizId, supplierId) {
    const biz = this.state.businesses.find(b => b.id === bizId);
    biz.supplierId = supplierId;
    const sup = Engine.getSupplier(biz);
    DB.addLog(this.state, 'neutral', `${biz.name} : fournisseur changé pour ${sup?.name}.`);
    DB.save(this.state);
    this.closeModal();
    this.renderAll();
  },

  showHireModal(bizId) {
    const biz = this.state.businesses.find(b => b.id === bizId);
    const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
    const compatible = STAFF_ROLES.filter(r => r.sectors.includes(type.sector));
    const html = compatible.map(role => `
      <div class="role-item">
        <div>
          <div class="role-name">${role.name}</div>
          <div class="muted" style="font-size:12px;">${role.effect}${role.value ? ' +'+role.value : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="role-salary">${role.weeklySalary} €/sem.</span>
          <button class="btn-primary btn-sm" onclick="UI.doHire('${bizId}','${role.id}')">Embaucher</button>
        </div>
      </div>`).join('');
    this.showModal(`<h2>Recruter — ${biz.name}</h2><p class="muted">Places restantes : ${type.staffNeeded - (biz.staff?.length||0)}</p><div class="roles-list">${html}</div>`);
  },

  doHire(bizId, roleId) {
    const result = Engine.hireStaff(this.state, bizId, roleId);
    if (result.success) {
      const biz = this.state.businesses.find(b => b.id === bizId);
      const role = STAFF_ROLES.find(r => r.id === roleId);
      DB.addLog(this.state, 'neutral', `${biz.name} : ${role.name} embauché.`);
      DB.save(this.state);
      this.closeModal();
      this.renderAll();
    } else {
      alert(result.msg);
    }
  },

  fireStaff(bizId, staffId) {
    const biz = this.state.businesses.find(b => b.id === bizId);
    const st = biz.staff?.find(s => s.id === staffId);
    const role = STAFF_ROLES.find(r => r.id === st?.roleId);
    if (!confirm(`Licencier ${role?.name} ?`)) return;
    Engine.fireStaff(this.state, bizId, staffId);
    DB.addLog(this.state, 'neutral', `${biz.name} : ${role?.name} licencié.`);
    DB.save(this.state);
    this.renderAll();
  },

  confirmSell(bizId) {
    const biz = this.state.businesses.find(b => b.id === bizId);
    const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
    const sellPrice = Math.round(type.openCost * 0.55);
    if (!confirm(`Vendre ${biz.name} pour ${this.fmt(sellPrice)} ?`)) return;
    Engine.sellBusiness(this.state, bizId);
    DB.addLog(this.state, 'neutral', `${biz.name} vendu pour ${this.fmt(sellPrice)}.`);
    DB.save(this.state);
    this.renderAll();
  },

  manualRestock(bizId, stockId) {
    const result = Engine.manualRestock(this.state, bizId, stockId);
    DB.addLog(this.state, result.success ? 'neutral' : 'bad', result.msg);
    DB.save(this.state);
    this.renderAll();
  },

  toggleAutoRestock(bizId, checked) {
    const biz = this.state.businesses.find(b => b.id === bizId);
    if (biz) {
      biz.autoRestock = checked;
      DB.save(this.state);
    }
  },

  // ── NAVIGATION ──────────────────────────────────────────

  switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    this.renderTab(name);
  },

  bindEvents(name) {},

  // ── WEEK ────────────────────────────────────────────────

  nextWeek() {
    const btn = document.getElementById('btn-next-week');
    if (btn) btn.disabled = true;

    const results = Engine.processWeek(this.state);

    results.events.forEach(ev => {
      DB.addLog(this.state, ev.event.type, `${ev.bizName} — ${ev.event.title} : ${ev.event.desc}`);
    });
    results.alerts.forEach(a => {
      DB.addLog(this.state, 'bad', a);
    });

    DB.addLog(this.state, 'neutral',
      `Bilan S${results.week} — Revenus : ${this.fmt(results.totalRevenue)} | Charges : ${this.fmt(results.totalExpenses)} | Net : ${this.fmtSigned(results.totalRevenue - results.totalExpenses)}`
    );

    DB.save(this.state);

    if (results.events.length || results.alerts.length) {
      this.showWeekSummary(results);
    } else {
      this.renderAll();
      if (btn) btn.disabled = false;
    }
  },

  showWeekSummary(results) {
    const eventsHtml = results.events.map(ev =>
      `<div class="summary-event ${ev.event.type}">
        <strong>${ev.bizName} — ${ev.event.title}</strong><br>
        <span class="muted">${ev.event.desc}</span>
      </div>`).join('');

    const alertsHtml = results.alerts.map(a =>
      `<div class="summary-alert">${a}</div>`).join('');

    const bizHtml = results.bizResults.map(b =>
      `<div class="summary-biz">
        <span>${b.name}</span>
        <span class="${b.profit >= 0 ? 'positive' : 'negative'}">${this.fmtSigned(b.profit)}</span>
      </div>`).join('');

    this.showModal(`
      <h2>Bilan — Semaine ${results.week}</h2>
      <div class="summary-totals">
        <div><span class="muted">Revenus</span><strong class="positive">${this.fmt(results.totalRevenue)}</strong></div>
        <div><span class="muted">Charges</span><strong class="negative">${this.fmt(results.totalExpenses)}</strong></div>
        <div><span class="muted">Trésorerie</span><strong>${this.fmt(this.state.cash)}</strong></div>
      </div>
      ${bizHtml ? `<div class="summary-biz-list">${bizHtml}</div>` : ''}
      ${eventsHtml ? `<div class="summary-events"><h4>Événements</h4>${eventsHtml}</div>` : ''}
      ${alertsHtml ? `<div class="summary-alerts"><h4>Alertes</h4>${alertsHtml}</div>` : ''}
      <div class="modal-actions">
        <button class="btn-primary" onclick="UI.closeModal();UI.renderAll();document.getElementById('btn-next-week').disabled=false;">Continuer →</button>
      </div>
    `);
  },
};
