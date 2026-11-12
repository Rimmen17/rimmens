import { el } from './dom.js';
import { dueInfo } from './dates.js';
import { filmsFor, inScope, sortDone, sortOpen, splitLists } from './items.js';
import { personName, personTone } from './people.js';

const itemsOf = (state, listId) => state.items.filter((i) => i.listId === listId);

function itemRow(item, state, h, { meta = false, editable = false, film = false } = {}) {
  const tick = el('button', {
    type: 'button',
    class: 'tick',
    role: 'checkbox',
    'aria-checked': String(item.done),
    'aria-label': film ? `${item.text} set` : item.text,
    onclick: () => h.onToggle(item),
  });
  const due = meta && !item.done && item.due && dueInfo(item.due);
  // On the watchlist "nobody" means everyone wants to see it, so only a named person gets a chip.
  const who = item.assignee && (!film || !item.done);
  const metaRow = (meta || film) && (who || due || (film && item.note)) && el('span', { class: 'meta' },
    who && el('span', { class: `chip ${personTone(state, item.assignee)}`, text: film ? `${personName(state, item.assignee)} vil se den` : personName(state, item.assignee) }),
    due && el('span', { class: `chip due ${due.tone}`, text: due.label }),
    film && item.note && el('span', { class: 'note', text: item.note }));
  const body = [el('span', { class: 'text', text: item.text }), metaRow];
  return el('li', { class: `item${item.done ? ' done' : ''}` },
    tick,
    editable
      ? el('button', { type: 'button', class: 'item-text', 'aria-label': `Rediger ${item.text}`, onclick: () => h.onEditItem(item) }, body)
      : el('span', { class: 'item-text' }, body),
    !editable && el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Slet ${item.text}`, text: '×', onclick: () => h.onDeleteItem(item.id) }));
}

// The ticked-off part of a list: folded away, with a button to clear it.
function doneBox(listId, done, label, state, h, rowOpts) {
  if (!done.length) return null;
  const open = state.showDone.has(listId);
  return el('div', { class: 'done-box' },
    el('div', { class: 'done-head' },
      el('button', { type: 'button', class: 'link', 'aria-expanded': String(open), text: `${open ? '▾' : '▸'} ${label} (${done.length})`, onclick: () => h.onToggleDone(listId) }),
      el('button', { type: 'button', class: 'link', text: 'Ryd', onclick: () => h.onClearDone(listId, done.map((i) => i.id)) })),
    open && el('ul', { class: 'items card' }, done.map((i) => itemRow(i, state, h, rowOpts))));
}

function listBody(container, listId, items, state, h, { emptyText, doneLabel, rowOpts, open: openItems, withDone = true }) {
  const open = openItems ?? sortOpen(items);
  container.replaceChildren(...[
    open.length
      ? el('ul', { class: 'items card' }, open.map((i) => itemRow(i, state, h, rowOpts)))
      : el('p', { class: 'empty card', text: emptyText }),
    withDone && doneBox(listId, sortDone(items), doneLabel, state, h, rowOpts),
  ].filter(Boolean));
}

function chipRow(box, options, current, onPick) {
  box.replaceChildren(...options.map((o) => el('button', {
    type: 'button',
    class: 'chip-btn',
    'aria-pressed': String(current === o.id),
    text: o.label,
    onclick: () => onPick(o.id),
  })));
}

const SCOPES = [{ id: 'shared', label: 'Fælles' }, { id: 'mine', label: 'Min egen' }, { id: 'deadlines', label: 'Deadlines' }];

export function renderTodo(scopeBox, container, list, state, h) {
  chipRow(scopeBox, SCOPES, state.todoScope, h.onScope);
  if (!list) return container.replaceChildren();
  const items = inScope(itemsOf(state, list.id), state.todoScope, state.user.id);
  if (state.todoScope === 'deadlines') {
    // Only what is still open, soonest first; ticking one here moves it to its own list's "Færdige".
    return listBody(container, list.id, items, state, h, {
      emptyText: 'Ingen opgaver med deadline. Giv en opgave en dato, så dukker den op her.',
      rowOpts: { meta: true, editable: true },
      withDone: false,
    });
  }
  const mine = state.todoScope === 'mine';
  listBody(container, `${list.id}:${state.todoScope}`, items, state, h, {
    emptyText: mine ? 'Din egen liste er tom.' : 'Ingen fælles opgaver i familien. Nyd det.',
    doneLabel: 'Færdige',
    rowOpts: { meta: true, editable: true },
  });
}

export function renderShopping(container, list, state, h) {
  if (!list) return container.replaceChildren();
  const items = itemsOf(state, list.id);
  // In the order they were added: that is usually the order they came to mind.
  const open = items.filter((i) => !i.done).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  listBody(container, list.id, items, state, h, {
    emptyText: 'Indkøbslisten er tom.',
    doneLabel: 'I kurven',
    rowOpts: {},
    open,
  });
}

export function renderFilms(filterBox, container, list, state, h) {
  const options = [{ id: 'all', label: 'Alle' }, ...state.profiles.map((p) => ({ id: p.id, label: `${p.name} vil se` }))];
  chipRow(filterBox, options, state.filmFilter, h.onFilmFilter);
  if (!list) return container.replaceChildren();
  const items = filmsFor(itemsOf(state, list.id), state.filmFilter);
  // Newest wishes on top: the film you just heard about is the one you want to find again.
  const open = items.filter((i) => !i.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  listBody(container, list.id, items, state, h, {
    emptyText: state.filmFilter === 'all' ? 'Ingen film på listen. Tilføj den næste, I hører om.' : 'Ingen film her endnu.',
    doneLabel: 'Set',
    rowOpts: { film: true, editable: true },
    open,
  });
}

function listCards(lists, state, h) {
  return el('div', { class: 'list-grid' }, lists.map((l) => {
    const left = itemsOf(state, l.id).filter((i) => !i.done).length;
    return el('button', { type: 'button', class: 'list-card card', onclick: () => h.onOpenList(l.id) },
      el('span', { class: 'name', text: l.name }),
      el('span', { class: 'count', text: left === 1 ? '1 punkt' : `${left} punkter` }));
  }));
}

export function renderListsGrid(container, state, h) {
  const { shared, mine } = splitLists(state.lists, state.user.id);
  container.replaceChildren(
    el('h3', { class: 'section-title', text: 'Fælles lister' }),
    shared.length
      ? listCards(shared, state, h)
      : el('p', { class: 'empty card', text: 'Ingen fælles lister endnu. Lav fx en til ønskesedler, ferieplaner eller opskrifter.' }),
    el('h3', { class: 'section-title', text: 'Mine private lister' }),
    el('p', { class: 'hint', text: 'Kun du kan se dem. Godt til gaveidéer.' }),
    mine.length
      ? listCards(mine, state, h)
      : el('p', { class: 'empty card', text: 'Ingen private lister endnu.' }));
}

export function renderListDetail(container, list, state, h) {
  listBody(container, list.id, itemsOf(state, list.id), state, h, {
    emptyText: 'Listen er tom. Tilføj det første punkt ovenfor.',
    doneLabel: 'Afkrydset',
    rowOpts: {},
  });
}
