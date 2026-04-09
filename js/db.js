const DB = {

  SAVE_KEY: 'empire_save',

  save(state) {
    try {
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Sauvegarde échouée :', e);
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Chargement échoué :', e);
      return null;
    }
  },

  deleteSave() {
    localStorage.removeItem(this.SAVE_KEY);
  },

  hasSave() {
    return !!localStorage.getItem(this.SAVE_KEY);
  },

  addLog(state, type, msg) {
    state.log = state.log || [];
    state.log.unshift({
      type,
      msg,
      week: state.week,
      timestamp: Date.now(),
    });
    if (state.log.length > 100) state.log.pop();
  },

};
