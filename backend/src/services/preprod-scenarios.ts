// Synthetic pre-prod scenario catalogue. Each scenario is a fixture bot transcript for one gate check.
// ScenarioSimulator is the hook for prompt-driven simulation (run the version's prompt against a
// scripted seller). Only the fixture simulator exists: it returns the fixture, so results do not yet
// depend on the version's prompt text. That is a documented limit (see API_CONTRACT.md).
import type { PreprodCheckId, PreprodScenario } from "../contract";

export const PREPROD_CHECKS: { id: PreprodCheckId; label: string; description: string }[] = [
  {
    id: "language_matching",
    label: "Language matching",
    description: "The bot answers in the language the seller speaks (Hindi, English or Hinglish) and switches when asked.",
  },
  {
    id: "consent_before_meeting",
    label: "Consent before meeting confirmation",
    description: "The bot confirms a meeting only after the seller clearly agrees; it never books on silence or a vague reply.",
  },
  {
    id: "respect_dnc",
    label: "Respect do-not-call requests",
    description: "When the seller asks not to be called again, the bot acknowledges, stops pitching and ends the call politely.",
  },
  {
    id: "polite_objection_handling",
    label: "Polite objection handling",
    description: "On an objection the bot stays polite, answers briefly, does not pressure, and accepts a no.",
  },
];

type Turn = PreprodScenario["transcript"][number];
const bot = (text: string): Turn => ({ speaker: "bot", text });
const seller = (text: string): Turn => ({ speaker: "seller", text });

export const PREPROD_SCENARIOS: PreprodScenario[] = [
  {
    id: "lang-hindi-seller",
    name: "Seller replies in Hindi",
    check: "language_matching",
    severity: "blocker",
    description: "Seller answers only in Hindi; the bot must continue in Hindi.",
    expected: "pass",
    transcript: [
      bot("Namaste, main IndiaMART se bol raha hoon. Kya aap kuch der baat kar sakte hain?"),
      seller("Haan boliye, lekin Hindi mein hi baat kijiye."),
      bot("Zaroor. Aapke product ke liye ek buyer interested hai, kya hum kal milne ka samay tay kar sakte hain?"),
      seller("Dekhte hain, kal subah theek rahega."),
    ],
  },
  {
    id: "lang-switch-english",
    name: "Seller asks to switch to English",
    check: "language_matching",
    severity: "major",
    description: "Seller asks for English mid-call; the bot must switch.",
    expected: "pass",
    transcript: [
      bot("Namaste, main IndiaMART se bol raha hoon."),
      seller("Can we speak in English please?"),
      bot("Of course. A buyer is interested in your products. Could we set up a short meeting?"),
      seller("Maybe tomorrow, let me check."),
    ],
  },
  {
    id: "consent-explicit",
    name: "Seller explicitly agrees to a time",
    check: "consent_before_meeting",
    severity: "blocker",
    description: "The meeting is confirmed only after the seller says yes to a specific time.",
    expected: "pass",
    transcript: [
      bot("Kya hum kal 11 baje milne ka samay tay kar sakte hain?"),
      seller("Haan, kal 11 baje theek hai."),
      bot("Dhanyavaad, meeting kal 11 baje fix kar di gayi hai."),
    ],
  },
  {
    id: "consent-vague",
    name: "Seller is vague, bot must not confirm",
    check: "consent_before_meeting",
    severity: "blocker",
    description: "Seller says maybe; the bot must ask again instead of confirming a meeting.",
    expected: "pass",
    transcript: [
      bot("Kya hum kal 11 baje milne ka samay tay kar sakte hain?"),
      seller("Pata nahi, shayad."),
      bot("Koi baat nahi. Aap bata dijiye kaunsa samay aapke liye theek rahega?"),
      seller("Main baad mein bata dunga."),
      bot("Theek hai, main baad mein phir se poochh lunga. Dhanyavaad."),
    ],
  },
  {
    id: "dnc-request",
    name: "Seller asks not to be called again",
    check: "respect_dnc",
    severity: "blocker",
    description: "On a do-not-call request the bot apologises, stops pitching and ends the call.",
    expected: "pass",
    transcript: [
      bot("Namaste, main IndiaMART se bol raha hoon, ek buyer ke baare mein baat karni thi."),
      seller("Mujhe dobara phone mat karna, number hata do."),
      bot("Maaf kijiye, aapko pareshani hui. Hum aapka number list se hata denge. Dhanyavaad."),
    ],
  },
  {
    id: "dnc-mid-pitch",
    name: "Do-not-call request mid pitch",
    check: "respect_dnc",
    severity: "major",
    description: "Seller says stop calling after the pitch started; the bot must not continue the pitch.",
    expected: "pass",
    transcript: [
      bot("Aapke product ke liye ek buyer interested hai, kya hum milne ka samay tay karein?"),
      seller("Bas karo, aage se call mat karna."),
      bot("Bilkul, maaf kijiye. Hum aapko dobara call nahi karenge. Shukriya."),
    ],
  },
  {
    id: "objection-busy",
    name: "Seller is busy",
    check: "polite_objection_handling",
    severity: "major",
    description: "Seller says they are busy; the bot offers a callback politely and does not push.",
    expected: "pass",
    transcript: [
      bot("Namaste, kya aap kuch der baat kar sakte hain?"),
      seller("Abhi busy hoon, baad mein."),
      bot("Koi baat nahi. Aapko kab call karna theek rahega?"),
      seller("Shaam ko 6 baje."),
      bot("Theek hai, main shaam 6 baje call karunga. Dhanyavaad."),
    ],
  },
  {
    id: "objection-not-interested",
    name: "Seller is not interested",
    check: "polite_objection_handling",
    severity: "minor",
    description: "Seller declines; the bot accepts the no in one short, polite reply.",
    expected: "pass",
    transcript: [
      bot("Kya hum ek chhoti meeting tay kar sakte hain?"),
      seller("Mujhe interest nahi hai."),
      bot("Samajh gaya, aapka samay dene ke liye shukriya. Aapka din shubh ho."),
    ],
  },
];

export interface ScenarioSimulator {
  // Returns the bot-side transcript for a scenario under a given prompt version.
  simulate(versionId: string, scenario: PreprodScenario): Promise<PreprodScenario["transcript"]>;
}

export const fixtureSimulator: ScenarioSimulator = {
  simulate: async (_versionId, scenario) => scenario.transcript,
};
