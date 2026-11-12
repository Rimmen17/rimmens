// Each of the six has a colour; "Alle" (nobody in particular) has its own.
// The colour follows the order of the names, so it never changes between visits.
export const EVERYONE = 'Alle';

export function personTone(state, id) {
  const i = id ? state.profiles.findIndex((p) => p.id === id) : -1;
  return i < 0 ? 'both' : `p${(i % 6) + 1}`;
}

export function personName(state, id) {
  return (id && state.profiles.find((p) => p.id === id)?.name) || EVERYONE;
}
