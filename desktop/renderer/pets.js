// Island pets: tiny friends that live in the island. Drawn here as SVG (front-facing, so they read at 18 px),
// shared by the island and the picker in Customize. Every pet has the same eye sets (open, shut, happy, surprised)
// and named parts (.ear, .tail, .wing) so one set of moods animates them all.
const INK = '#1b1d22';
function eyes(l, r, y, c = INK) {
  return `<g class="e e-open" fill="${c}"><ellipse cx="${l}" cy="${y}" rx="1.45" ry="1.75"/><ellipse cx="${r}" cy="${y}" rx="1.45" ry="1.75"/></g>`
    + `<g class="e e-shut" stroke="${c}" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M${l - 1.7} ${y} q1.7 1.3 3.4 0M${r - 1.7} ${y} q1.7 1.3 3.4 0"/></g>`
    + `<g class="e e-joy" stroke="${c}" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M${l - 1.7} ${y + .7} q1.7 -2.3 3.4 0M${r - 1.7} ${y + .7} q1.7 -2.3 3.4 0"/></g>`
    + `<g class="e e-wow"><circle cx="${l}" cy="${y}" r="2.1" fill="${c}"/><circle cx="${r}" cy="${y}" r="2.1" fill="${c}"/><circle cx="${l + .7}" cy="${y - .7}" r=".7" fill="#fff"/><circle cx="${r + .7}" cy="${y - .7}" r=".7" fill="#fff"/></g>`;
}
const blush = (l, r, y) => `<g class="blush" fill="#ff8fa3"><ellipse cx="${l}" cy="${y}" rx="1.7" ry="1"/><ellipse cx="${r}" cy="${y}" rx="1.7" ry="1"/></g>`;

export const PETS = {
  cat: {
    name: 'Mochi', kind: 'cat',
    svg: `<path class="tail" d="M22.5 26c4 0 6-3 5-7" stroke="#e9e3d6" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <path class="ear l" d="M6.5 11 8 2.8l5.5 5.4z" fill="#f4f0e8"/><path class="ear r" d="M25.5 11 24 2.8l-5.5 5.4z" fill="#f4f0e8"/>
      <path d="M8.3 8.6 8.9 5l2.6 2.4zM23.7 8.6 23.1 5l-2.6 2.4z" fill="#f7a8b8"/>
      <ellipse cx="16" cy="24.5" rx="7.6" ry="5.5" fill="#efe9de"/><ellipse cx="16" cy="14.5" rx="10" ry="8.3" fill="#f4f0e8"/>
      <ellipse cx="12.3" cy="29.3" rx="2.3" ry="1.4" fill="#f4f0e8"/><ellipse cx="19.7" cy="29.3" rx="2.3" ry="1.4" fill="#f4f0e8"/>
      ${eyes(12, 20, 15)}<path d="M15.2 17.6h1.6l-.8 .9z" fill="#f08aa0"/>${blush(9, 23, 18)}`,
  },
  bunny: {
    name: 'Tofu', kind: 'bunny',
    svg: `<g class="ear l"><ellipse cx="11.5" cy="5.5" rx="2.6" ry="6.2" fill="#fbfbfb"/><ellipse cx="11.5" cy="5.8" rx="1.2" ry="4.4" fill="#f7b3c2"/></g>
      <g class="ear r"><ellipse cx="20.5" cy="5.5" rx="2.6" ry="6.2" fill="#fbfbfb"/><ellipse cx="20.5" cy="5.8" rx="1.2" ry="4.4" fill="#f7b3c2"/></g>
      <circle class="tail" cx="24" cy="26" r="2.4" fill="#ffffff"/>
      <ellipse cx="16" cy="24.5" rx="7.8" ry="5.6" fill="#f1f1f1"/><ellipse cx="16" cy="16" rx="9" ry="7.6" fill="#fbfbfb"/>
      <ellipse cx="12.5" cy="29.4" rx="2.4" ry="1.3" fill="#fbfbfb"/><ellipse cx="19.5" cy="29.4" rx="2.4" ry="1.3" fill="#fbfbfb"/>
      ${eyes(12.6, 19.4, 16)}<path d="M15.3 18.4h1.4l-.7 .8z" fill="#f08aa0"/>${blush(10, 22, 19.2)}`,
  },
  chick: {
    name: 'Pip', kind: 'bird',
    svg: `<path d="M14.6 6.6c.4-2.4 2-3.4 3.2-2.4-1.6 .2-2 1.2-1.6 2.4z" fill="#ffc93c"/>
      <ellipse cx="16" cy="18" rx="10.5" ry="10.2" fill="#ffd95e"/>
      <path class="wing l" d="M6.2 18.5c-2.4 1-2.6 4.4-.6 5.6 1.4-.6 2.2-2.6 1.6-5.6z" fill="#ffc93c"/>
      <path class="wing r" d="M25.8 18.5c2.4 1 2.6 4.4 .6 5.6-1.4-.6-2.2-2.6-1.6-5.6z" fill="#ffc93c"/>
      <path d="M12.5 28.6v2M19.5 28.6v2" stroke="#f29b38" stroke-width="1.4" stroke-linecap="round"/>
      ${eyes(12.3, 19.7, 15.5)}<path d="M14.6 18h2.8l-1.4 1.8z" fill="#f29b38"/>${blush(9.6, 22.4, 19)}`,
  },
  panda: {
    name: 'Bao', kind: 'bear', // charcoal, not black: it has to show on the black pill
    svg: `<circle class="ear l" cx="8" cy="7.5" r="3.6" fill="#555a66"/><circle class="ear r" cx="24" cy="7.5" r="3.6" fill="#555a66"/>
      <ellipse cx="16" cy="24.5" rx="8" ry="5.6" fill="#555a66"/><ellipse cx="16" cy="23.6" rx="5.6" ry="4.4" fill="#f5f5f2"/>
      <ellipse cx="16" cy="15" rx="10" ry="8.4" fill="#f5f5f2"/>
      <ellipse cx="11.6" cy="15.4" rx="2.9" ry="3.4" transform="rotate(-24 11.6 15.4)" fill="#555a66"/><ellipse cx="20.4" cy="15.4" rx="2.9" ry="3.4" transform="rotate(24 20.4 15.4)" fill="#555a66"/>
      <ellipse cx="12" cy="29.3" rx="2.5" ry="1.5" fill="#555a66"/><ellipse cx="20" cy="29.3" rx="2.5" ry="1.5" fill="#555a66"/>
      ${eyes(11.9, 20.1, 15.2, '#ffffff')}<ellipse cx="16" cy="18.6" rx="1.2" ry=".8" fill="#555a66"/>${blush(8.6, 23.4, 19)}`,
  },
  puppy: {
    name: 'Biscuit', kind: 'dog',
    svg: `<path class="tail" d="M23 25c3.6-.4 4.6-3 3.8-5.4" stroke="#d9a066" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <ellipse cx="16" cy="24.5" rx="7.8" ry="5.6" fill="#d9a066"/><ellipse cx="16" cy="15" rx="9.6" ry="8.2" fill="#e3ad73"/>
      <path class="ear l" d="M7.6 8.4C4.4 9 4 15 6.4 17.6c1.8-.6 3-4.2 2.6-8.4z" fill="#9c6b3e"/><path class="ear r" d="M24.4 8.4c3.2 .6 3.6 6.6 1.2 9.2-1.8-.6-3-4.2-2.6-8.4z" fill="#9c6b3e"/>
      <ellipse cx="16" cy="18.6" rx="4.2" ry="3.2" fill="#f6e3cc"/>
      <ellipse cx="12" cy="29.3" rx="2.4" ry="1.4" fill="#e3ad73"/><ellipse cx="20" cy="29.3" rx="2.4" ry="1.4" fill="#e3ad73"/>
      ${eyes(12.2, 19.8, 14.6)}<ellipse cx="16" cy="17.4" rx="1.3" ry=".9" fill="${INK}"/>${blush(9.4, 22.6, 18.4)}`,
  },
  ghost: {
    name: 'Boo', kind: 'ghost',
    svg: `<path d="M6 16a10 10 0 0 1 20 0v12.5l-3.3-2.2-3.4 2.2-3.3-2.2-3.3 2.2-3.4-2.2L6 28.5z" fill="#eef0ff"/>
      <path class="wing l" d="M6.2 18.4c-2 .4-3 2.2-2.6 3.6 1.4 0 2.4-1 2.6-1.8z" fill="#e2e5fb"/><path class="wing r" d="M25.8 18.4c2 .4 3 2.2 2.6 3.6-1.4 0-2.4-1-2.6-1.8z" fill="#e2e5fb"/>
      ${eyes(12.4, 19.6, 15)}<ellipse cx="16" cy="19.2" rx="1.3" ry="1" fill="#4a4f66"/>${blush(9.6, 22.4, 18.2)}`,
  },
  slime: {
    name: 'Jelly', kind: 'blob',
    svg: `<path d="M16 5.5c4 4.8 11 8.6 11 15.2 0 5.4-4.8 8.6-11 8.6S5 26.1 5 20.7c0-6.6 7-10.4 11-15.2z" fill="#7fe0b5"/>
      <ellipse cx="11" cy="15.5" rx="1.7" ry="2.6" transform="rotate(28 11 15.5)" fill="#c9f5e1"/>
      ${eyes(12.6, 19.4, 20)}<path d="M14.8 23q1.2 1 2.4 0" stroke="${INK}" stroke-width="1.1" stroke-linecap="round" fill="none"/>${blush(9.8, 22.2, 23)}`,
  },
};
export const PET_IDS = Object.keys(PETS);
export const petSvg = (id) => `<svg class="pet-svg" viewBox="0 0 32 32" aria-hidden="true">${PETS[id]?.svg || ''}</svg>`;
