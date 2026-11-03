import { defaultConfig, defaultProfile } from '../domain/model';
import { newLedger, reduceEngagement } from '../domain/engagement';
import { clock } from '../application/clock';
import { previewState } from '../application/preview-state';

// Fixtures are imported only in DEV. Opening a preview never reads personal records.
export function setupPreview() {
  const params = new URLSearchParams(location.search);
  const mode = params.get('preview');
  if (!mode) return;
  const base = '2026-11-03';
  const time = (hour: string, day = base) => Date.parse(day + 'T' + hour + '+08:00');
  const instants: Record<string,number> = {
    lunch:time('12:30'), after:time('18:00'), overtime:time('18:47'), closed:time('18:47'),
    rest:time('10:00','2026-11-07'), before:time('08:30'), return:time('09:10','2026-11-09'),
    'not-started':time('09:10'), 'late-free':time('09:10'), 'late-paid':time('09:10'),
    'save-failure':time('09:10'), pending:time('09:10','2026-11-04'),
  };
  const instant = instants[mode] ?? time('14:30');
  const started = performance.now();
  clock.now = params.get('motion') === 'live' ? () => instant + Math.floor(performance.now()-started) : () => instant;
  const c = defaultConfig();
  c.profile = defaultProfile();
  c.preferences.closeHintSeen = true;
  if (mode === 'privacy') c.preferences.privacyMode = true;
  if (mode === 'long') c.profile.amountMinor = 9999999999;
  c.engagement = newLedger(time('09:00'));
  if (mode === 'late-paid') c.engagement.policy = {mode:'PER_MINUTE',graceMinutes:0,perMinuteMinor:100};
  if (['working','lunch','after','overtime','closed','privacy','long','return','pending'].includes(mode)) {
    c.engagement = reduceEngagement(c,{type:'start'},time('09:00')).ledger;
    if (['after','closed','return'].includes(mode)) {
      c.engagement = reduceEngagement(c,{type:'end'},mode==='closed'?time('18:47'):time('18:00')).ledger;
    }
  }
  if (mode === 'invalid') for (let d=1;d<=30;d++) c.overrides[base.slice(0,8)+String(d).padStart(2,'0')] = 'rest';
  if (mode === 'onboarding') c.profile = null;
  previewState.enabled = true;
  previewState.config = c;
  previewState.failSave = mode === 'save-failure';
  const theme=params.get('theme');
  if (theme==='light' || theme==='dark') document.documentElement.dataset.theme=theme;
}
