// In-memory stand-ins for Devvit's server APIs, for local loop tests.
type Ctx = { userId?: string; username?: string; postId?: string; subredditName?: string };
export const context: Ctx = { subredditName: 'mechdaily_test' };
export const log: string[] = [];

const str = new Map<string, string>();
const hash = new Map<string, Map<string, string>>();
const zs = new Map<string, Map<string, number>>();
const H = (k: string) => hash.get(k) ?? hash.set(k, new Map()).get(k)!;
const Z = (k: string) => zs.get(k) ?? zs.set(k, new Map()).get(k)!;

export const redis = {
  get: async (k: string) => str.get(k),
  set: async (k: string, v: string) => void str.set(k, v),
  del: async (...ks: string[]) => ks.forEach((k) => (str.delete(k), hash.delete(k), zs.delete(k))),
  incrBy: async (k: string, n: number) => {
    const v = Number(str.get(k) ?? 0) + n;
    str.set(k, String(v));
    return v;
  },
  hGet: async (k: string, f: string) => H(k).get(f),
  hSet: async (k: string, o: Record<string, string>) => {
    for (const [f, v] of Object.entries(o)) H(k).set(f, v);
    return Object.keys(o).length;
  },
  hSetNX: async (k: string, f: string, v: string) => (H(k).has(f) ? 0 : (H(k).set(f, v), 1)),
  hGetAll: async (k: string) => Object.fromEntries(H(k)),
  hLen: async (k: string) => H(k).size,
  hDel: async (k: string, fs: string[]) => fs.forEach((f) => H(k).delete(f)),
  hIncrBy: async (k: string, f: string, n: number) => {
    const v = Number(H(k).get(f) ?? 0) + n;
    H(k).set(f, String(v));
    return v;
  },
  zIncrBy: async (k: string, m: string, n: number) => {
    const v = (Z(k).get(m) ?? 0) + n;
    Z(k).set(m, v);
    return v;
  },
  zAdd: async (k: string, ...ms: { member: string; score: number }[]) => ms.forEach((m) => Z(k).set(m.member, m.score)),
  zScore: async (k: string, m: string) => Z(k).get(m),
  zRange: async (k: string, a: number, b: number, opts?: { reverse?: boolean }) => {
    const arr = [...Z(k)].map(([member, score]) => ({ member, score })).sort((x, y) => x.score - y.score);
    if (opts?.reverse) arr.reverse();
    return arr.slice(a, b < 0 ? undefined : b + 1);
  },
};

let postN = 0;
export const reddit = {
  submitCustomPost: async (o: { title?: string; postData?: unknown }) => {
    const id = `t3_post${++postN}`;
    log.push(`POST ${id}: ${o.title} ${JSON.stringify(o.postData ?? {})}`);
    return { id };
  },
  submitComment: async (o: { id: string; text: string }) => {
    log.push(`COMMENT on ${o.id}:\n${o.text}`);
    return { distinguish: async () => log.push('  (distinguished)') };
  },
  setUserFlair: async (o: unknown) => void log.push(`FLAIR ${JSON.stringify(o)}`),
};
export const createServer = () => null;
export const getServerPort = () => 0;
