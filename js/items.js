// Open items first: dated ones by deadline, then undated in the order they were added.
export function sortOpen(items) {
  return items
    .filter((i) => !i.done)
    .sort((a, b) => {
      if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
      if (Boolean(a.due) !== Boolean(b.due)) return a.due ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

// Done items, the most recently ticked first.
export function sortDone(items) {
  return items
    .filter((i) => i.done)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
}

// The to-do page shows the shared tasks, the person's own private ones, or every
// task with a deadline (shared and own together), soonest first.
export function inScope(items, scope, userId) {
  if (scope === 'mine') return items.filter((i) => i.owner === userId);
  if (scope === 'deadlines') return items.filter((i) => i.due && (!i.owner || i.owner === userId));
  return items.filter((i) => !i.owner);
}

// The person's own lists: shared ones and the private ones only they can see.
export function splitLists(lists, userId) {
  const custom = lists.filter((l) => l.kind === 'custom');
  return {
    shared: custom.filter((l) => !l.owner),
    mine: custom.filter((l) => l.owner === userId),
  };
}

// The watchlist: films still to see, those one of them asked for, and the seen ones.
export function filmsFor(items, filter) {
  if (filter === 'all') return items;
  return items.filter((i) => i.done || i.assignee === filter);
}
