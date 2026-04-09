const GAME_CONFIG = {
  dayDuration: 20000,
  openHour: 9,
  closeHour: 19,
  tickInterval: 500,
};

const SALON = {
  id: 'salon',
  name: 'Salon de coiffure',
  openCost: 3000,
  weeklyRent: 400,
  baseCustomersPerDay: 20,
  revenuePerCustomer: 35,
  staffSlots: 3,
  stocks: [
    { id: 'shampoing', name: 'Shampoings & soins', unit: 'flacons', capacity: 60, dailyUse: 6, orderSize: 30, baseCost: 90 },
    { id: 'coloration', name: 'Colorations', unit: 'tubes', capacity: 40, dailyUse: 3, orderSize: 20, baseCost: 130 },
    { id: 'materiel', name: 'Matériel jetable', unit: 'lots', capacity: 30, dailyUse: 2, orderSize: 15, baseCost: 50 },
  ],
  upgrades: [
    { id: 'cabin', name: 'Cabine VIP', cost: 2000, desc: '+12 € par client', effect: 'revenuePerCustomer', value: 12 },
    { id: 'online', name: 'Réservation en ligne', cost: 800, desc: '+5 clients par jour', effect: 'customersPerDay', value: 5 },
    { id: 'formation', name: 'Formation équipe', cost: 1200, desc: 'Réduit les démissions', effect: 'retention' },
    { id: 'vitrine', name: 'Vitrine modernisée', cost: 600, desc: '+3 clients par jour', effect: 'customersPerDay', value: 3 },
  ],
};

const DISTRICTS = [
  { id: 'center', name: 'Centre-ville', traffic: 1.4, rentMult: 1.6, desc: 'Fort trafic, loyer élevé' },
  { id: 'commercial', name: 'Zone commerciale', traffic: 1.15, rentMult: 1.1, desc: 'Bon flux, concurrence dense' },
  { id: 'residential', name: 'Quartier résidentiel', traffic: 0.8, rentMult: 0.7, desc: 'Clientèle fidèle, faible trafic' },
  { id: 'trendy', name: 'Quartier tendance', traffic: 1.1, rentMult: 1.35, desc: 'Volatile mais porteur' },
];

const SUPPLIERS = [
  { id: 'sup1', name: 'L\'Oréal Pro', quality: 1.2, priceMult: 1.35, reliability: 0.97, desc: 'Premium, très fiable' },
  { id: 'sup2', name: 'Beauté Grossiste', quality: 1.0, priceMult: 1.0, reliability: 0.88, desc: 'Standard, bon rapport qualité-prix' },
  { id: 'sup3', name: 'Import Discount', quality: 0.7, priceMult: 0.6, reliability: 0.65, desc: 'Moins cher, livraisons incertaines' },
];

const STAFF_ROLES = [
  { id: 'coiffeur', name: 'Coiffeur', salary: 220, effect: 'customers', value: 6, desc: '+6 clients/jour' },
  { id: 'senior', name: 'Coiffeur senior', salary: 320, effect: 'revenue', value: 8, desc: '+8 € par client' },
  { id: 'gerant', name: 'Gérant', salary: 450, effect: 'autonomy', desc: 'Gère les stocks automatiquement' },
  { id: 'apprenti', name: 'Apprenti', salary: 120, effect: 'customers', value: 3, desc: '+3 clients/jour, nécessite supervision' },
];

const RANDOM_EVENTS = [
  { id: 'ev1', type: 'good', title: 'Bouche à oreille', desc: 'Un client influent vous recommande. +5 clients aujourd\'hui.', effect: { type: 'customers_today', value: 5 } },
  { id: 'ev2', type: 'good', title: 'Article local', desc: 'Le journal du quartier parle de vous. +8 clients aujourd\'hui.', effect: { type: 'customers_today', value: 8 } },
  { id: 'ev3', type: 'bad', title: 'Employé absent', desc: 'Un employé est malade aujourd\'hui.', effect: { type: 'staff_absent' } },
  { id: 'ev4', type: 'bad', title: 'Fuite d\'eau', desc: 'Dégât mineur. Réparation : 200 €.', effect: { type: 'cash_penalty', value: 200 } },
  { id: 'ev5', type: 'bad', title: 'Rupture fournisseur', desc: 'Votre fournisseur ne livre pas aujourd\'hui.', effect: { type: 'supplier_fail' } },
  { id: 'ev6', type: 'neutral', title: 'Inspection', desc: 'Contrôle d\'hygiène. Tout est en ordre.', effect: { type: 'none' } },
  { id: 'ev7', type: 'bad', title: 'Mauvais avis en ligne', desc: 'Un avis négatif. -3 clients pendant 3 jours.', effect: { type: 'customers_penalty', value: 3, duration: 3 } },
  { id: 'ev8', type: 'good', title: 'Fête de quartier', desc: 'Fort passage aujourd\'hui. +10 clients.', effect: { type: 'customers_today', value: 10 } },
];
