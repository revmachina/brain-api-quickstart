"""Hardcoded simulated dialogue mirroring a foreclosure-pressure conversation.

No audio, no LLM. The focus is the Brain API surface.
"""

from __future__ import annotations

import time
from dataclasses import dataclass


@dataclass
class DialogueTurn:
    speaker: str  # "Agent" | "Seller"
    text: str
    hint: str | None = None


FORECLOSURE_DIALOGUE: list[DialogueTurn] = [
    DialogueTurn("Agent",  "Hi Maria, this is Alex with Revmachina — I understand you're dealing with a tight timeline on the property. Got a couple minutes?", "opening"),
    DialogueTurn("Seller", "Yeah, I have a minute. The auction is in 18 days, I just need this done."),
    DialogueTurn("Agent",  "I hear you. Most folks in your spot are weighing two things — the highest number on paper, and the number that actually closes before the auction date. Which matters more?"),
    DialogueTurn("Seller", "I need it to close. But your offer's too low. I was expecting more.", "objection_price_too_low"),
    DialogueTurn("Agent",  "Totally fair. The number reflects what we can pay given the timeline you're working with — auction in 18 days. A retail sale at full asking takes 60 to 90 days. What's your hard floor?"),
    DialogueTurn("Seller", "I'd need at least 175. Anything below that doesn't cover what I owe."),
    DialogueTurn("Agent",  "Understood. Let me run the numbers and get back to you in 24 hours with our best offer at that floor or as close as we can get. Sound good?"),
    DialogueTurn("Seller", "Yeah, that works. Call me tomorrow afternoon.", "callback_scheduled"),
]


def play_dialogue(turns: list[DialogueTurn], per_turn_ms: int = 350) -> None:
    delay = per_turn_ms / 1000.0
    for turn in turns:
        prefix = "   Agent:  " if turn.speaker == "Agent" else "   Seller: "
        print(f'{prefix}"{turn.text}"')
        time.sleep(delay)
