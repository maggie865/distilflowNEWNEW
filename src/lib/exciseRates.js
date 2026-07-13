// NZ Customs excise rate schedule for spirits containing more than 23% vol.
// Rates are per LAL (litre of absolute alcohol), GST exclusive.
// To add a future rate change, prepend a new entry with the effective date.
export const EXCISE_RATE_SCHEDULE = [
  { from: '2026-07-01', rate: 71.034, label: 'from 1 July 2026' },
  { from: '2000-01-01', rate: 68.915, label: 'until 30 June 2026' },
];

export const getExciseRate = (forDate) => {
  const d = new Date(forDate);
  const applicable = EXCISE_RATE_SCHEDULE
    .filter(r => d >= new Date(r.from))
    .sort((a, b) => new Date(b.from) - new Date(a.from));
  return applicable[0] || EXCISE_RATE_SCHEDULE[EXCISE_RATE_SCHEDULE.length - 1];
};

export const getCurrentExciseRate = () => getExciseRate(new Date());