const Engine = {

  createNewGame() {
    return {
      cash: 10000,
      day: 1,
      dayOfWeek: 1,
      hour: 9,
      phase: 'menu',
      salon: null,
      log: [],
      history: [],
    };
  },

  createSalon(districtId, supplierId, name) {
    const district = DISTRICTS.find(d => d.id === districtId);
    const stocks = {};
    SALON.stocks.forEach(s => { stocks[s.id] = Math.round(s.capacity * 0.6); });
    return {
      name: name || 'Mon salon',
      districtId,
      supplierId,
      level: 1,
      staff: [],
      stocks,
      upgrades: [],
      autoRestock: false,
      reputation: 50,
      regularClients: 0,
      totalClientsServed: 0,
      activeEffects: [],
      pendingOrders: [],
      openedDay: 1,
      weeklyStats: { revenue: 0, expenses: 0, clients: 0 },
      allTimeRevenue: 0,
    };
  },

  isOpen(state) {
    return state.hour >= GAME_CONFIG.openHour && state.hour < GAME_CONFIG.closeHour;
  },

  getDayName(dayOfWeek) {
    return ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][dayOfWeek - 1];
  },

  getDistrict(salon) {
    return DISTRICTS.find(d => d.id === salon.districtId) || DISTRICTS[0];
  },

  getSupplier(salon) {
    return SUPPLIERS.find(s => s.id === salon.supplierId) || SUPPLIERS[1];
  },

  calcCustomersPerHour(state) {
    if (!state.salon || !this.isOpen(state)) return 0;
    const salon = state.salon;
    const district = this.getDistrict(salon);
    const supplier = this.getSupplier(salon);

    let basePerDay = SALON.baseCustomersPerDay * district.traffic;

    salon.upgrades.forEach(upId => {
      const upg = SALON.upgrades.find(u => u.id === upId);
      if (upg?.effect === 'customersPerDay') basePerDay += upg.value;
    });

    salon.staff.forEach(st => {
      const role = STAFF_ROLES.find(r => r.id === st.roleId);
      if (role?.effect === 'customers') basePerDay += role.value;
    });

    salon.activeEffects.forEach(ef => {
      if (ef.type === 'customers_today') basePerDay += ef.value;
      if (ef.type === 'customers_penalty') basePerDay -= ef.value;
    });

    basePerDay *= (0.5 + salon.reputation / 100);

    const stockPenalty = this.calcStockPenalty(salon);
    basePerDay *= (1 - stockPenalty);

    const hoursOpen = GAME_CONFIG.closeHour - GAME_CONFIG.openHour;
    const hour = state.hour;
    const curve = this.getDayCurve(hour);

    return Math.max(0, (basePerDay / hoursOpen) * curve);
  },

  getDayCurve(hour) {
    const curves = { 9:0.6, 10:0.9, 11:1.1, 12:0.8, 13:0.7, 14:0.9, 15:1.0, 16:1.1, 17:1.2, 18:0.8 };
    return curves[hour] || 0.8;
  },

  calcRevenuePerClient(salon) {
    const supplier = this.getSupplier(salon);
    let base = SALON.revenuePerCustomer * supplier.quality;
    salon.upgrades.forEach(upId => {
      const upg = SALON.upgrades.find(u => u.id === upId);
      if (upg?.effect === 'revenuePerCustomer') base += upg.value;
    });
    salon.staff.forEach(st => {
      const role = STAFF_ROLES.find(r => r.id === st.roleId);
      if (role?.effect === 'revenue') base += role.value;
    });
    return Math.round(base);
  },

  calcWeeklyExpenses(salon) {
    const district = this.getDistrict(salon);
    let total = Math.round(SALON.weeklyRent * district.rentMult);
    salon.staff.forEach(st => {
      const role = STAFF_ROLES.find(r => r.id === st.roleId);
      if (role) total += role.salary;
    });
    return total;
  },

  calcStockPenalty(salon) {
    let penalty = 0;
    SALON.stocks.forEach(stockDef => {
      const qty = salon.stocks[stockDef.id] || 0;
      const ratio = qty / stockDef.capacity;
      if (qty <= 0) penalty += 0.3;
      else if (ratio < 0.15) penalty += 0.15;
      else if (ratio < 0.3) penalty += 0.05;
    });
    return Math.min(penalty, 0.9);
  },

  getStockAlerts(salon) {
    const alerts = [];
    SALON.stocks.forEach(stockDef => {
      const qty = salon.stocks[stockDef.id] || 0;
      const ratio = qty / stockDef.capacity;
      if (qty <= 0) alerts.push({ stockId: stockDef.id, name: stockDef.name, level: 'critical' });
      else if (ratio < 0.2) alerts.push({ stockId: stockDef.id, name: stockDef.name, level: 'low' });
    });
    return alerts;
  },

  tickHour(state) {
    if (!state.salon) return { clients: 0, revenue: 0, events: [] };
    const salon = state.salon;
    const events = [];

    if (!this.isOpen(state)) {
      if (state.hour === GAME_CONFIG.closeHour) {
        this.endOfDay(state, events);
      }
      return { clients: 0, revenue: 0, events };
    }

    const customersThisHour = this.calcCustomersPerHour(state);
    const clientsServed = Math.round(customersThisHour * (0.85 + Math.random() * 0.3));
    const revenuePerClient = this.calcRevenuePerClient(salon);
    const revenue = clientsServed * revenuePerClient;

    state.cash += revenue;
    salon.totalClientsServed += clientsServed;
    salon.weeklyStats.revenue += revenue;
    salon.weeklyStats.clients += clientsServed;
    salon.allTimeRevenue += revenue;

    SALON.stocks.forEach(stockDef => {
      const use = (stockDef.dailyUse / (GAME_CONFIG.closeHour - GAME_CONFIG.openHour)) * clientsServed / Math.max(1, SALON.baseCustomersPerDay / 10);
      salon.stocks[stockDef.id] = Math.max(0, (salon.stocks[stockDef.id] || 0) - use);
    });

    if (salon.autoRestock) {
      this.processAutoRestock(state, events);
    }

    if (Math.random() < 0.03 && state.hour === 11) {
      this.triggerRandomEvent(state, events);
    }

    salon.activeEffects = salon.activeEffects.filter(ef => ef.remainingHours === undefined || ef.remainingHours-- > 0);

    return { clients: clientsServed, revenue, events };
  },

  processAutoRestock(state, events) {
    const salon = state.salon;
    const supplier = this.getSupplier(salon);
    SALON.stocks.forEach(stockDef => {
      const qty = salon.stocks[stockDef.id] || 0;
      const ratio = qty / stockDef.capacity;
      if (ratio < 0.25) {
        const cost = Math.round(stockDef.baseCost * supplier.priceMult);
        if (state.cash >= cost) {
          if (Math.random() < supplier.reliability) {
            salon.stocks[stockDef.id] = Math.min(stockDef.capacity, qty + stockDef.orderSize);
            state.cash -= cost;
            salon.weeklyStats.expenses += cost;
          } else {
            events.push({ type: 'bad', msg: `Livraison ${stockDef.name} échouée — fournisseur indisponible.` });
          }
        } else {
          events.push({ type: 'bad', msg: `Fonds insuffisants pour réapprovisionner ${stockDef.name}.` });
        }
      }
    });
  },

  manualRestock(state, stockId) {
    const salon = state.salon;
    const stockDef = SALON.stocks.find(s => s.id === stockId);
    const supplier = this.getSupplier(salon);
    if (!stockDef || !supplier) return { success: false, msg: 'Erreur.' };
    const cost = Math.round(stockDef.baseCost * supplier.priceMult);
    if (state.cash < cost) return { success: false, msg: `Fonds insuffisants (${cost} € requis).` };
    if (Math.random() > supplier.reliability) return { success: false, msg: `${supplier.name} ne peut pas livrer maintenant.` };
    salon.stocks[stockId] = Math.min(stockDef.capacity, (salon.stocks[stockId] || 0) + stockDef.orderSize);
    state.cash -= cost;
    salon.weeklyStats.expenses += cost;
    return { success: true, msg: `+${stockDef.orderSize} ${stockDef.unit} livrés. Coût : ${cost} €.` };
  },

  endOfDay(state, events) {
    const salon = state.salon;
    salon.activeEffects = salon.activeEffects.filter(ef => {
      if (ef.duration !== undefined) { ef.duration--; return ef.duration > 0; }
      return true;
    });

    if (state.dayOfWeek === 5) {
      const salaries = salon.staff.reduce((a, st) => {
        const role = STAFF_ROLES.find(r => r.id === st.roleId);
        return a + (role?.salary || 0);
      }, 0);
      if (salaries > 0) {
        state.cash -= salaries;
        salon.weeklyStats.expenses += salaries;
        events.push({ type: 'neutral', msg: `Paie du vendredi : ${salaries} € versés.` });
        if (state.cash < 0) events.push({ type: 'bad', msg: 'Trésorerie négative après la paie !' });
      }
    }

    if (state.dayOfWeek === 1) {
      const district = this.getDistrict(salon);
      const rent = Math.round(SALON.weeklyRent * district.rentMult);
      state.cash -= rent;
      salon.weeklyStats.expenses += rent;
      events.push({ type: 'neutral', msg: `Loyer semaine : ${rent} € prélevés.` });

      state.history.push({
        day: state.day,
        revenue: salon.weeklyStats.revenue,
        expenses: salon.weeklyStats.expenses,
        clients: salon.weeklyStats.clients,
        cash: state.cash,
      });
      if (state.history.length > 30) state.history.shift();

      salon.weeklyStats = { revenue: 0, expenses: 0, clients: 0 };
    }

    if (salon.totalClientsServed > 0 && salon.totalClientsServed % 50 === 0) {
      salon.regularClients = Math.min(50, salon.regularClients + 1);
      salon.reputation = Math.min(100, salon.reputation + 2);
      events.push({ type: 'good', msg: `Réputation en hausse ! ${salon.regularClients} clients réguliers.` });
    }
  },

  triggerRandomEvent(state, events) {
    const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
    const salon = state.salon;
    switch (ev.effect.type) {
      case 'customers_today':
        salon.activeEffects.push({ type: 'customers_today', value: ev.effect.value, duration: 1 });
        break;
      case 'customers_penalty':
        salon.activeEffects.push({ type: 'customers_penalty', value: ev.effect.value, duration: ev.effect.duration });
        break;
      case 'cash_penalty':
        state.cash -= ev.effect.value;
        break;
      case 'staff_absent':
        if (salon.staff.length > 0) {
          const idx = Math.floor(Math.random() * salon.staff.length);
          salon.staff[idx].absentToday = true;
        }
        break;
      case 'supplier_fail':
        salon.pendingOrders = [];
        break;
      default: break;
    }
    events.push({ type: ev.type, msg: `${ev.title} — ${ev.desc}` });
    this.addLog(state, ev.type, ev.title + ' : ' + ev.desc);
  },

  advanceHour(state) {
    state.hour++;
    if (state.hour >= 24) {
      state.hour = 0;
      state.day++;
      state.dayOfWeek = ((state.dayOfWeek) % 7) + 1;
    }
  },

  hireStaff(state, roleId) {
    const salon = state.salon;
    const role = STAFF_ROLES.find(r => r.id === roleId);
    if (!role) return { success: false, msg: 'Poste inconnu.' };
    if ((salon.staff?.length || 0) >= SALON.staffSlots) return { success: false, msg: `Maximum ${SALON.staffSlots} employés.` };
    salon.staff.push({ id: 'staff_' + Date.now(), roleId, hiredDay: state.day });
    return { success: true };
  },

  fireStaff(state, staffId) {
    state.salon.staff = state.salon.staff.filter(s => s.id !== staffId);
    return { success: true };
  },

  applyUpgrade(state, upgradeId) {
    const salon = state.salon;
    const upg = SALON.upgrades.find(u => u.id === upgradeId);
    if (!upg) return { success: false, msg: 'Amélioration introuvable.' };
    if (salon.upgrades.includes(upgradeId)) return { success: false, msg: 'Déjà appliqué.' };
    if (state.cash < upg.cost) return { success: false, msg: `Fonds insuffisants (${upg.cost} € requis).` };
    salon.upgrades.push(upgradeId);
    state.cash -= upg.cost;
    return { success: true };
  },

  openSalon(state, districtId, supplierId, name) {
    if (state.cash < SALON.openCost) return { success: false, msg: 'Fonds insuffisants.' };
    state.salon = this.createSalon(districtId, supplierId, name);
    state.cash -= SALON.openCost;
    state.phase = 'playing';
    state.hour = GAME_CONFIG.openHour;
    return { success: true };
  },

  addLog(state, type, msg) {
    state.log = state.log || [];
    state.log.unshift({ type, msg, day: state.day, hour: state.hour });
    if (state.log.length > 80) state.log.pop();
  },

  calcProjectedWeeklyProfit(state) {
    if (!state.salon) return 0;
    const salon = state.salon;
    const hoursOpen = GAME_CONFIG.closeHour - GAME_CONFIG.openHour;
    const avgCustomersPerDay = this.calcCustomersPerHour(state) * hoursOpen;
    const revenuePerDay = avgCustomersPerDay * this.calcRevenuePerClient(salon);
    const weeklyRevenue = revenuePerDay * 7;
    const weeklyExpenses = this.calcWeeklyExpenses(salon);
    return Math.round(weeklyRevenue - weeklyExpenses);
  },
};
