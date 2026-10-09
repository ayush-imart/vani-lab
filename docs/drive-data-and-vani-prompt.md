# Drive data and the VANI prompt

Rules: the data is for the hackathon only and must not leave the approved environment. Use aggregates, with no raw records in prompts, commits or demos. [L: AGENTS.md, provided-data/README.md]

## Contents [L: provided-data/drive-materials/extracted/Aids to solve Problems/]
- **Best-Time-to-Call:** 530,748 call attempts Apr-Sep 2026 across 149,363 sellers. Outcomes: Not Answered 261,293, Not Interested 116,364, General 78,365, Call Later / Busy 43,672, Meeting Fixed 31,054. Bot versions include `main_vani` (SquadStack) and `arrowhead`. [L: BesTime to Call/Best-Time-to-Call - Data Dictionary.md]
- **Persona files (PS07):** seller files (149,363), answered bot calls (269,455), evaluator outputs (disposition, seller_questions, incorrect_mf, location_confirmation, latency_repetition and more), call turns (139,555 turns across 12,788 calls), a 5,000-call recording sample and executive calls. They contain real seller names. [L: Persona Files-.../PS07_DATA_DICTIONARY.md]
- **Global Context seller dataset:** gc_bot_calls, gc_bot_call_turns and others. **call_recordings:** 713 mp3 files.
- **Call quality matrix:** "Current Definitions of Call Quality Matrix being used in VANI.png" lists outcome accuracy, quantity and spec accuracy, probing errors, looping behaviour, word errors, dead air above 5 seconds and overall pass / fatal rules. These are good Judge guardrails.

## Buyer-side VANI prompt
Source: `Sarvam Prompt - Buyer Side VANI.docx` (about 159,000 characters; the extracted copy lives only in the session scratchpad). [L: same folder]
- **Role:** an IndiaMART Help Desk virtual assistant for buyers whose call to a seller was redirected. It understands the requirement, collects product, quantity, specifications, name and location, creates a quality buy lead and connects a live seller. Languages: English, Hindi, Telugu.
- **Mechanics:** template variables (`{%if ...%}`, `@ call_step`, `@ buyer_disposition`), tools such as `end_interaction`, per-field ask limits, an intent priority list.
- **Mismatch (decision pending):** the app's KPIs (Meeting Fixed, location confirmed, callback) are seller-side, while this prompt's natural outcomes are lead quality and seller connection.

## Sources
- Problem 5 statement [L: provided-data/hackathon/problem-5-agent-ab-testing.md]
