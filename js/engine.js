const Engine = {

  getCurrentSeason(week) {
    const idx = Math.floor(((week - 1) % 52) / 13);
    return SEASONS[idx];
  },

  getSupplierKey(bizType) {
    if (['resto', 'bar'].includes(bizType)) return 'food';
    if (bizType === 'salon') return 'salon';
    if (bizType === 'florist') return 'florist';
    if (bizType === 'fashion') return 'retail';
    if (['gym', 'studio'].includes(bizType)) return 'services';
    return 'food';
  },

  calcRevenue(biz, week) {
    const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
    if (!type) return 0;

    if (type.id === 'studio') {
      let base = (type.weeklyRevenue || 550);
      biz.upgrades?.forEach(upId => {
        const upg = type.upgrades.find(u => u.id === upId);
        if (upg?.effect === 'weeklyRevenue') base += upg.value;
      });
      return Math.round(base);
    }

    const district = DISTRICTS.find(d => d.id === biz.districtId) || DISTRICTS[0];
    const season = this.getCurrentSeason(week);
    const seasonMult = season.multipliers[type.id] || 1.0;

    let customers = type.baseCustomersPerWeek * district.traffic * seasonMult;
    let revenuePerCustomer = type.revenuePerCustomer;

    biz.upgrades?.forEach(upId => {
      const upg = type.upgrades.find(u => u.id === upId);
      if (!upg) return;
      if (upg.effect === 'customers') customers += upg.value;
      if (upg.effect === 'revenuePerCustomer') revenuePerCustomer += upg.value;
    });

    biz.staff?.forEach(s => {
      const role = STAFF_ROLES.find(r => r.id === s.roleId);
      if (!role) return;
      if (role.effect === 'customers') customers += role.value || 0;
      if (role.effect === 'revenuePerCustomer') revenuePerCustomer += role.value || 0;
    });

    const supplier = this.getSupplier(biz);
    if (supplier) revenuePerCustomer *= supplier.quality;

    biz.activeEffects?.forEach(ef => {
      if (ef.type === 'customers_bonus') customers *= (1 + ef.value);
      if (ef.type === 'revenue_bonus') revenuePerCustomer *= (1 + ef.value);
    });

    const stockPenalty = this.calcStockPenalty(biz, type);
    customers *= (1 - stockPenalty);

    biz.lastCustomers = Math.round(customers);
    return Math.round(customers * revenuePerCustomer);
  },

  calcExpenses(biz) {
    const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
    if (!type) return 0;

    const district = DISTRICTS.find(d => d.id === biz.districtId) || DISTRICTS[0];
    let total = 0;

    total += Math.round(type.weeklyRent * district.rentMult);

    biz.staff?.forEach(s => {
      const role = STAFF_ROLES.find(r => r.id === s.roleId);
      if (role) total += role.weeklySalary;
    });

    total += this.calcStockCost(biz, type);

    biz.activeEffects?.forEach(ef => {
      if (ef.type === 'rent_increase') total = Math.round(total * (1 + ef.value));
    });

    return total;
  },

  getSupplier(biz) {
    if (!biz.supplierId) return null;
    const key = this.getSupplierKey(biz.typeId);
    const list = SUPPLIERS[key] || [];
    return list.find(s => s.id === biz.supplierId) || null;
  },

  calcStockCost(biz, type) {
    if (!type.stocks.length) return 0;
    let cost = 0;
    const supplier = this.getSupplier(biz);
    const priceMult = supplier ? supplier.priceMult : 1.0;

    type.stocks.forEach(stockDef => {
      const current = biz.stocks?.[stockDef.id] || 0;
      const needed = stockDef.weeklyUse * 2;
      if (current < needed) {
        cost += Math.round(stockDef.baseCost * priceMult);
      }
    });
    return cost;
  },

  calcStockPenalty(biz, type) {
    if (!type.stocks.length) return 0;
    let penalty = 0;
    type.stocks.forEach(stockDef => {
      const current = biz.stocks?.[stockDef.id] || 0;
      if (current <= 0) penalty += 0.25;
      else if (current < stockDef.weeklyUse) penalty += 0.1;
    });
    return Math.min(penalty, 0.8);
  },

  consumeStocks(biz, type) {
    if (!type.stocks.length) return;
    type.stocks.forEach(stockDef => {
      const current = biz.stocks?.[stockDef.id] || 0;
      biz.stocks[stockDef.id] = Math.max(0, current - stockDef.weeklyUse);
    });
  },

  autoRestock(biz, type, state) {
    if (!biz.autoRestock) return 0;
    if (!type.stocks.length) return 0;
    const supplier = this.getSupplier(biz);
    if (!supplier) return 0;

    if (Math.random() > supplier.reliability) {
      return -1;
    }

    let totalCost = 0;
    const priceMult = supplier.priceMult;

    type.stocks.forEach(stockDef => {
      const current = biz.stocks?.[stockDef.id] || 0;
      const threshold = stockDef.weeklyUse * 2;
      if (current < threshold) {
        const cost = Math.round(stockDef.baseCost * priceMult);
        if (state.cash >= cost) {
          biz.stocks[stockDef.id] = (current + stockDef.orderSize);
          state.cash -= cost;
          totalCost += cost;
        }
      }
    });
    return totalCost;
  },

  manualRestock(biz, stockId, state) {
    const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
    const stockDef = type?.stocks.find(s => s.id === stockId);
    if (!stockDef) return { success: false, msg: 'Stock introuvable.' };

    const supplier = this.getSupplier(biz);
    if (!supplier) return { success: false, msg: 'Aucun fournisseur sélectionné.' };

    const cost = Math.round(stockDef.baseCost * supplier.priceMult);
    if (state.cash < cost) return { success: false, msg: `Fonds insuffisants. Coût : ${cost} €.` };

    if (Math.random() > supplier.reliability) {
      return { success: false, msg: `${supplier.name} ne peut pas livrer cette semaine.` };
    }

    biz.stocks[stockId] = (biz.stocks[stockId] || 0) + stockDef.orderSize;
    state.cash -= cost;
    return { success: true, msg: `Commande reçue : +${stockDef.orderSize} ${stockDef.unit}. Coût : ${cost} €.` };
  },

  tickActiveEffects(biz) {
    if (!biz.activeEffects) return;
    biz.activeEffects = biz.activeEffects
      .map(ef => ({ ...ef, duration: (ef.duration || 1) - 1 }))
      .filter(ef => ef.duration > 0);
  },

  triggerRandomEvent(biz, state) {
    if (Math.random() > 0.18) return null;
    const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
    const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);

    if (!biz.activeEffects) biz.activeEffects = [];

    switch (event.effect.type) {
      case 'customers_bonus':
      case 'revenue_bonus':
        biz.activeEffects.push({ ...event.effect });
        break;
      case 'cash_penalty':
        state.cash -= event.effect.value;
        break;
      case 'staff_absent':
        biz.staffAbsent = event.effect.duration;
        break;
      case 'supplier_fail':
        biz.supplierFail = event.effect.duration;
        break;
      case 'rent_increase':
        biz.activeEffects.push({ ...event.effect, duration: 999 });
        break;
      default:
        break;
    }

    return { bizName: type?.name || biz.typeId, event };
  },

  processWeek(state) {
    const results = {
      week: state.week,
      totalRevenue: 0,
      totalExpenses: 0,
      events: [],
      alerts: [],
      bizResults: [],
    };

    state.businesses.forEach(biz => {
      const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
      if (!type) return;

      this.tickActiveEffects(biz);

      const autoRestockResult = this.autoRestock(biz, type, state);
      if (autoRestockResult === -1) {
        results.alerts.push(`⚠️ ${biz.name} : livraison fournisseur échouée cette semaine.`);
      }

      const rev = this.calcRevenue(biz, state.week);
      const exp = this.calcExpenses(biz);
      const profit = rev - exp;

      state.cash += profit;
      results.totalRevenue += rev;
      results.totalExpenses += exp;

      this.consumeStocks(biz, type);

      const stockPenalty = this.calcStockPenalty(biz, type);
      if (stockPenalty > 0) {
        results.alerts.push(`📦 ${biz.name} : stocks bas, -${Math.round(stockPenalty * 100)}% clients.`);
      }

      const ev = this.triggerRandomEvent(biz, state);
      if (ev) results.events.push(ev);

      results.bizResults.push({
        id: biz.id,
        name: biz.name,
        revenue: rev,
        expenses: exp,
        profit,
        customers: biz.lastCustomers || 0,
      });
    });

    if (state.cash < 0) {
      results.alerts.push('🔴 Trésorerie négative ! Agissez rapidement.');
    }

    state.week++;
    state.history = state.history || [];
    state.history.push({
      week: results.week,
      revenue: results.totalRevenue,
      expenses: results.totalExpenses,
      cash: state.cash,
    });
    if (state.history.length > 52) state.history.shift();

    return results;
  },

  openBusiness(state, typeId, districtId, supplierId, customName) {
    const type = BUSINESS_TYPES.find(t => t.id === typeId);
    if (!type) return { success: false, msg: 'Type de business inconnu.' };
    if (state.cash < type.openCost) return { success: false, msg: `Fonds insuffisants. Coût d'ouverture : ${type.openCost} €.` };

    const stocks = {};
    type.stocks.forEach(s => { stocks[s.id] = s.orderSize; });

    const biz = {
      id: 'biz_' + Date.now(),
      typeId,
      name: customName || type.name,
      districtId,
      supplierId,
      level: 1,
      staff: [],
      stocks,
      upgrades: [],
      autoRestock: false,
      activeEffects: [],
      openedWeek: state.week,
    };

    state.businesses.push(biz);
    state.cash -= type.openCost;
    return { success: true, biz };
  },

  sellBusiness(state, bizId) {
    const idx = state.businesses.findIndex(b => b.id === bizId);
    if (idx === -1) return { success: false, msg: 'Établissement introuvable.' };
    const biz = state.businesses[idx];
    const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
    const sellPrice = Math.round(type.openCost * 0.55);
    state.businesses.splice(idx, 1);
    state.cash += sellPrice;
    return { success: true, sellPrice };
  },

  applyUpgrade(state, bizId, upgradeId) {
    const biz = state.businesses.find(b => b.id === bizId);
    if (!biz) return { success: false, msg: 'Établissement introuvable.' };
    const type = BUSINESS_TYPES.find(t => t.id === biz.typeId);
    const upg = type?.upgrades.find(u => u.id === upgradeId);
    if (!upg) return { success: false, msg: 'Amélioration introuvable.' };
    if (biz.upgrades?.includes(upgradeId)) return { success: false, msg: 'Déjà appliqué.' };
    if (state.cash < upg.cost) return { success: false, msg: `Fonds insuffisants. Coût : ${upg.cost} €.` };
    biz.upgrades = biz.upgrades || [];
    biz.upgrades.push(upgradeId);
    state.cash -= upg.cost;
    return { success: true };
  },

  hireStaff(state, bizId, roleId) {
    const biz = state.businesses.find(b => b.id === bizId);
    const type = BUSINESS_TYPES.find(t => t.id === biz?.typeId);
    const role = STAFF_ROLES.find(r => r.id === roleId);
    if (!biz || !type || !role) return { success: false, msg: 'Données invalides.' };
    if (!role.sectors.includes(type.sector)) return { success: false, msg: `Ce poste n'est pas compatible avec ${type.name}.` };
    const currentStaff = biz.staff?.length || 0;
    if (currentStaff >= type.staffNeeded) return { success: false, msg: `Effectif maximum atteint (${type.staffNeeded} employés).` };
    biz.staff = biz.staff || [];
    biz.staff.push({ roleId, hiredWeek: state.week, id: 'staff_' + Date.now() });
    return { success: true };
  },

  fireStaff(state, bizId, staffId) {
    const biz = state.businesses.find(b => b.id === bizId);
    if (!biz) return { success: false };
    biz.staff = biz.staff.filter(s => s.id !== staffId);
    return { success: true };
  },

  initNewGame() {
    return {
      cash: 10000,
      week: 1,
      businesses: [],
      history: [],
      log: [],
    };
  },
};
