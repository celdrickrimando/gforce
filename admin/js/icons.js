/* ============================================================
   GForce — Icon set
   Hand-authored inline SVGs (stroke, currentColor) used instead
   of emoji anywhere in the UI. Keep this the only place glyphs
   for status/theme are defined so there's one rule to enforce:
   no emoji, ever — icons only.
   ============================================================ */
const Icons = {
  base(inner, size=14){
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex-shrink:0;">${inner}</svg>`;
  },
  moon(size){ return this.base(`<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>`, size); },
  sun(size){ return this.base(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`, size); },
  check(size){ return this.base(`<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>`, size); },
  x(size){ return this.base(`<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>`, size); },
  alert(size){ return this.base(`<path d="M12 3.5 22 20H2L12 3.5Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>`, size); },
  bell(size){ return this.base(`<path d="M6 8a6 6 0 0 1 12 0c0 4.5 1.5 6 2 7H4c.5-1 2-2.5 2-7Z"/><path d="M10 19a2 2 0 0 0 4 0"/>`, size); },
  chevron(size){ return this.base(`<path d="M6 9l6 6 6-6"/>`, size); }
};
