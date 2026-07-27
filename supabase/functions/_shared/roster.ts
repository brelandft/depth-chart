import { ROSTER_DATA_B64 } from "./roster-data.ts";
import { norm } from "./match.ts";

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type Entry = { name: string; key: string; tier: number };
type Roster = Record<string, Record<string, Record<string, Entry[]>>>;

let _rosterPromise: Promise<Roster> | null = null;

export function getRoster(): Promise<Roster> {
  if (!_rosterPromise) {
    _rosterPromise = (async () => {
      const bytes = b64ToBytes(ROSTER_DATA_B64);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      const text = await new Response(stream).text();
      // { nfl: { TEN: { QB: [[name,tier,y0,y1],...] } }, cfb: { LSU: { WR: [[name,tier],...] } } }
      const raw = JSON.parse(text);
      const indexed: Roster = {};
      for (const league of Object.keys(raw)) {
        indexed[league] = {};
        for (const team of Object.keys(raw[league])) {
          indexed[league][team] = {};
          for (const pos of Object.keys(raw[league][team])) {
            indexed[league][team][pos] = raw[league][team][pos].map((e: any[]) => ({
              name: e[0],
              key: norm(e[0]),
              tier: e[1],
            }));
          }
        }
      }
      return indexed;
    })();
  }
  return _rosterPromise;
}
