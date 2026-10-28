// src/components/tour/Tour.jsx
// Guided product tour: dims the app, spotlights a real element, follows the
// user across routes, opens the mobile drawer when needed, and re-measures on
// scroll/resize. Auto-starts once (flag in localStorage); replay via the
// 'sf:start-tour' window event (the topbar help button fires it).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, MousePointerClick } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { STEPS, tourStats } from './tourSteps';
import '../../styles/tour.css';

const KEY = 'sf_tour_done';
const PAD = 8;
const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return '1'; } },
  set: () => { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } },
};

/** First visible element for a selector (desktop + drawer sidebars both exist). */
function findTarget(sel) {
  if (!sel) return null;
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export default function Tour({ navigate, path, setMobileNav }) {
  const { state } = useInventory();
  const [idx, setIdx] = useState(-1); // -1 = closed
  const [rect, setRect] = useState(null);
  const [cardPos, setCardPos] = useState({});
  const cardRef = useRef(null);
  const step = STEPS[idx];
  const isMobile = () => window.matchMedia('(max-width: 720px)').matches;

  const close = useCallback(() => { store.set(); setIdx(-1); setMobileNav(false); }, [setMobileNav]);

  // start: first visit (after a beat) or on demand
  useEffect(() => {
    const start = () => { setMobileNav(false); navigate('/dashboard'); setRect(null); setIdx(0); };
    window.addEventListener('sf:start-tour', start);
    const t = store.get() ? null : setTimeout(start, 900);
    return () => { window.removeEventListener('sf:start-tour', start); clearTimeout(t); };
  }, [navigate, setMobileNav]);

  // go to the step's page, open drawer if its target lives there, wait for target
  useEffect(() => {
    if (!step) return undefined;
    let cancelled = false;
    if (path !== step.route) { navigate(step.route); return undefined; }
    setMobileNav(Boolean(step.nav) && isMobile());
    let tries = 0;
    const find = () => {
      if (cancelled) return;
      const el = findTarget(step.target);
      if (el || !step.target || tries++ > 30) {
        if (el && !step.nav) {
          const top = el.getBoundingClientRect().top + window.scrollY - 76;
          window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
        setTimeout(() => !cancelled && measure(el), step.nav ? 260 : 340);
      } else setTimeout(find, 60);
    };
    const measure = (el) => {
      const r = (el || findTarget(step.target))?.getBoundingClientRect();
      setRect(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : { none: true });
    };
    find();
    const re = () => measure();
    window.addEventListener('resize', re);
    window.addEventListener('scroll', re, true);
    return () => { cancelled = true; window.removeEventListener('resize', re); window.removeEventListener('scroll', re, true); };
  }, [step, path, navigate, setMobileNav]);

  // place the card: bottom sheet on phones, beside the target on desktop
  useLayoutEffect(() => {
    if (!rect || !cardRef.current) return;
    if (isMobile()) return;
    const c = cardRef.current.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    if (rect.none) { setCardPos({ top: (H - c.height) / 2, left: (W - c.width) / 2 }); return; }
    const below = rect.top + rect.height + PAD + 14;
    const above = rect.top - PAD - 14 - c.height;
    const right = rect.left + rect.width + PAD + 14;
    let top, left;
    if (right + c.width < W - 12 && rect.width < W * 0.4) { left = right; top = rect.top; }
    else if (below + c.height < H - 12) { top = below; left = rect.left; }
    else if (above > 12) { top = above; left = rect.left; }
    else { top = H - c.height - 16; left = W - c.width - 16; }
    setCardPos({
      top: Math.min(Math.max(12, top), H - c.height - 12),
      left: Math.min(Math.max(12, left), W - c.width - 12),
    });
  }, [rect, idx]);

  const go = useCallback((d) => {
    const n = idx + d;
    if (n >= STEPS.length) close(); else if (n >= 0) { setRect(null); setIdx(n); }
  }, [idx, close]);

  useEffect(() => {
    if (idx < 0) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [idx, go, close]);

  if (!step) return null;
  const sheet = isMobile();
  const hasRect = rect && !rect.none;
  const vh = window.innerHeight;
  const spot = hasRect ? {
    top: Math.max(4, rect.top - PAD), left: Math.max(4, rect.left - PAD),
    width: rect.width + PAD * 2, height: Math.min(rect.height + PAD * 2, vh - 8),
  } : null;
  const act = step.action;
  const runAction = () => findTarget(act.selector)?.click();

  return (
    <div className="tour-root" role="dialog" aria-label="Product tour">
      <div className="tour-block" />
      <div className={`tour-spot${spot ? '' : ' none'}`} style={spot || undefined} />
      <div ref={cardRef} className={`tour-card${sheet ? ' sheet' : ''}`} style={sheet ? undefined : { top: cardPos.top ?? -999, left: cardPos.left ?? -999 }} key={idx}>
        <button className="tour-x" onClick={close} aria-label="Skip tour"><X size={15} /></button>
        <div className="tour-step">Step {idx + 1} of {STEPS.length}</div>
        <h4>{step.title}</h4>
        <p>{step.body(tourStats(state))}</p>
        {act ? <button className="btn btn-secondary btn-sm tour-try" onClick={runAction}><MousePointerClick size={14} /> {act.label}</button> : null}
        <div className="tour-bar"><i style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} /></div>
        <div className="tour-foot">
          <button className="btn btn-ghost btn-sm" onClick={close}>Skip</button>
          <span className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => go(-1)} disabled={idx === 0} aria-label="Previous step"><ChevronLeft size={14} /> Back</button>
          <button className="btn btn-primary btn-sm" onClick={() => go(1)}>{idx === STEPS.length - 1 ? 'Finish' : 'Next'} {idx === STEPS.length - 1 ? null : <ChevronRight size={14} />}</button>
        </div>
      </div>
    </div>
  );
}
