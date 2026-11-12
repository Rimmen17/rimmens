// Background patterns. The pattern itself lives in css/style.css; the choice is
// remembered per device only, so each of them can pick their own.
const KEY = 'rimmens-wall';

export const WALLS = [
  { id: 'leaves', label: 'Blade' },
  { id: 'stars', label: 'Stjerner' },
  { id: 'hearts', label: 'Hjerter' },
  { id: 'dots', label: 'Prikker' },
  { id: 'clouds', label: 'Skyer' },
  { id: 'flowers', label: 'Blomster' },
  { id: 'plain', label: 'Ingen' },
];

export function savedWall() {
  try {
    const id = localStorage.getItem(KEY);
    return WALLS.some((w) => w.id === id) ? id : 'leaves';
  } catch {
    return 'leaves';
  }
}

export function applyWall(id) {
  document.body.dataset.wall = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Private browsing: the choice lasts until the page is closed.
  }
}
