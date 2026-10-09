// Scripted synthetic bot for the call window. No real calls and no model: replies come from a fixed
// script per version, echoing a short part of what the seller typed. A backend voice agent replaces this.
import type { VersionId } from "./performance-data";

const SCRIPTS: Record<VersionId, string[]> = {
  A: [
    "Namaste! Main IndiaMART se VANI bol rahi hoon. Kya abhi baat karne ka sahi samay hai?",
    "Aap kaun se products supply karte hain, aur kis shehar mein hain?",
    "Kya aap IndiaMART ke executive se milna chahenge, business opportunities ke liye?",
    "Theek hai. Kaunsi date aur time aapke liye sahi rahega?",
    "Dhanyavaad, aapka din achha rahe!",
  ],
  B: [
    "Namaste! VANI, IndiaMART se. Kya main aapse ek minute baat kar sakti hoon?",
    "Kya aap hamare executive se is hafte milna chahenge? Isse aapke buyers badh sakte hain.",
    "Agar abhi mushkil hai, to main callback bhi set kar sakti hoon. Kab theek rahega?",
    "Theek hai, main date aur time confirm karti hoon.",
    "Dhanyavaad, aapka din achha rahe!",
  ],
  C: [
    "Namaste ji! Main IndiaMART se VANI bol rahi hoon. Do minute hain aapke paas?",
    "Aap kya banate ya bechte hain? Thoda bataiye.",
    "Accha ji. Kya hum ek meeting fix kar sakte hain?",
    "Bilkul. Kaunsa din theek rahega aapko?",
    "Shukriya ji, ram ram!",
  ],
};

const ECHO_LENGTH = 40;

export function openingLine(version: VersionId): string {
  return SCRIPTS[version][0] as string;
}

// turn = number of seller messages sent so far (1-based for the first reply).
export function botReply(version: VersionId, turn: number, sellerText: string): string {
  const script = SCRIPTS[version];
  const next = script[Math.min(turn, script.length - 1)] as string;
  const heard = sellerText.trim().slice(0, ECHO_LENGTH);
  return heard ? `Samajh gayi: "${heard}". ${next}` : next;
}
