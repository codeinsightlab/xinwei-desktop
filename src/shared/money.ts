import { formatMinor } from '../domain/salary';
/** One masking rule for widgets, settings and change previews. Never return raw amounts when hidden. */
export function privateMoney(value: bigint | undefined, hidden: boolean): string {
  return hidden ? '••••••' : value===undefined ? '—' : formatMinor(value);
}
