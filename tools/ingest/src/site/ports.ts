const LONG_TO_SHORT: Array<[RegExp, string]> = [
  [/^(?:GigabitEthernet|GigE|Gi)\s*/i, 'Gi'],
  [/^(?:TenGigE|TenGigabitEthernet|Te)\s*/i, 'Te'],
  [/^(?:HundredGigE|Hu)\s*/i, 'Hu'],
  [/^(?:FortyGigE|Fo)\s*/i, 'Fo'],
  [/^(?:FourHundredGigE|FH)\s*/i, 'FH'],
];

/** "GigabitEthernet0/0/0/1" | "R21C- Gi 0/0/0/1" | "Te 0/0/0/30" -> "Gi0/0/0/1" | "Te0/0/0/30" */
export function shortPort(raw: string): string {
  let s = raw.trim().replace(/^[A-Za-z0-9]+-\s+(?=[A-Za-z])/, ''); // drop "R21C- " prefix
  for (const [re, short] of LONG_TO_SHORT) {
    if (re.test(s)) {
      s = s.replace(re, short);
      break;
    }
  }
  return s.replace(/\s+/g, '');
}

/** Slot of an interface name: "Te0/1/0/30" -> "0/1". Returns null if not an interface. */
export function slotOfInterface(name: string): string | null {
  const m = /^[A-Za-z]+\s*(\d+)\/(\d+)\/\d+\/\d+$/.exec(name.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}
