// Answers on an event (Kommer, Bliver forsinket, Kommer ikke, with a short note), as in Rimbak.
import { el } from './dom.js';

export const STATUSES = [
  { id: 'joining', label: 'Kommer' },
  { id: 'late', label: 'Bliver forsinket' },
  { id: 'not_joining', label: 'Kommer ikke' },
];

// Who answered what, in the order of STATUSES, plus everyone who has not answered yet.
export function groupAnswers(answers, profiles) {
  const nameOf = (id) => profiles.find((p) => p.id === id)?.name ?? 'Ukendt';
  const groups = STATUSES.map((s) => ({
    ...s,
    people: answers.filter((a) => a.status === s.id).map((a) => ({ name: nameOf(a.userId), note: a.note })),
  }));
  const missing = profiles.filter((p) => !answers.some((a) => a.userId === p.id)).map((p) => ({ name: p.name, note: '' }));
  return { groups, missing };
}

export function answerBlock(ev, state, h) {
  const answers = state.responses.get(ev.id) ?? [];
  const mine = answers.find((a) => a.userId === state.user.id);
  const note = el('input', {
    class: 'note',
    type: 'text',
    maxlength: '120',
    placeholder: 'Besked, fx "20 minutter forsinket"',
    'aria-label': 'Besked til dit svar',
    hidden: !mine,
  });
  note.value = mine?.note ?? '';
  note.addEventListener('change', () => h.onAnswer(ev.id, mine.status, note.value.trim()));

  const { groups, missing } = groupAnswers(answers, state.profiles);
  const row = (cls, label, people) => el('li', { class: `group ${cls}` },
    el('span', { class: 'group-label', text: `${label} (${people.length})` }),
    people.map((p) => el('span', { class: 'person' }, p.name, p.note && el('em', { text: ` "${p.note}"` }))));

  return el('div', { class: 'rsvp' },
    el('div', { class: 'answers', role: 'group', 'aria-label': 'Dit svar' },
      STATUSES.map((s) => el('button', {
        type: 'button',
        class: `answer ${s.id}`,
        'aria-pressed': String(mine?.status === s.id),
        text: s.label,
        onclick: () => h.onAnswer(ev.id, s.id, note.value.trim()),
      }))),
    note,
    el('ul', { class: 'summary' },
      groups.map((g) => row(g.id, g.label, g.people)),
      missing.length > 0 && row('missing', 'Mangler svar', missing)));
}
