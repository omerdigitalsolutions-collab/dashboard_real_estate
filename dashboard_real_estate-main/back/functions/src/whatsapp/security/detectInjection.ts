const injectionPatterns: RegExp[] = [
  /ignore\s+(previous|all|above|instructions)/i,
  /system\s*:/i,
  /you\s+are\s+now/i,
  /act\s+as\s+(admin|super|system)/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /pretend\s+(to\s+be|you\s+are)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /override\s+(your\s+)?instructions/i,
  /תתעלם\s*מ/,
  /הוראות\s+קודמות/,
  /אתה\s+עכשיו/,
  /גישה\s+לכל/,
];

export function detectInjection(text: string): { isInjection: boolean; score: number } {
  let score = 0;
  for (const pattern of injectionPatterns) {
    if (pattern.test(text)) score++;
  }
  return { isInjection: score > 0, score };
}
