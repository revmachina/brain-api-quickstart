// Hardcoded simulated dialogue that mirrors a real foreclosure-pressure
// conversation. No audio, no LLM — the focus is the Brain API surface.
// Each turn prints with a small delay for readability.

export interface DialogueTurn {
  speaker: 'Agent' | 'Seller'
  text:    string
  // Optional metadata describing what brain-api action this turn drives.
  // Used by the demo runner to time the corresponding API calls.
  hint?:   string
}

export const FORECLOSURE_DIALOGUE: DialogueTurn[] = [
  { speaker: 'Agent',  text: 'Hi Maria, this is Alex with Revmachina — I understand you\'re dealing with a tight timeline on the property. Got a couple minutes?', hint: 'opening' },
  { speaker: 'Seller', text: 'Yeah, I have a minute. The auction is in 18 days, I just need this done.' },
  { speaker: 'Agent',  text: 'I hear you. Most folks in your spot are weighing two things — the highest number on paper, and the number that actually closes before the auction date. Which matters more?' },
  { speaker: 'Seller', text: 'I need it to close. But your offer\'s too low. I was expecting more.', hint: 'objection_price_too_low' },
  { speaker: 'Agent',  text: 'Totally fair. The number reflects what we can pay given the timeline you\'re working with — auction in 18 days. A retail sale at full asking takes 60 to 90 days. What\'s your hard floor?' },
  { speaker: 'Seller', text: 'I\'d need at least 175. Anything below that doesn\'t cover what I owe.' },
  { speaker: 'Agent',  text: 'Understood. Let me run the numbers and get back to you in 24 hours with our best offer at that floor or as close as we can get. Sound good?' },
  { speaker: 'Seller', text: 'Yeah, that works. Call me tomorrow afternoon.', hint: 'callback_scheduled' },
]

export async function playDialogue(turns: DialogueTurn[], opts: { perTurnMs?: number } = {}): Promise<void> {
  const perTurn = opts.perTurnMs ?? 600
  for (const turn of turns) {
    const prefix = turn.speaker === 'Agent' ? '   Agent:  ' : '   Seller: '
    console.log(`${prefix}"${turn.text}"`)
    await sleep(perTurn)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
