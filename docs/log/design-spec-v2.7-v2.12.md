# Design spec v2.7–v2.12 — the form language finished against real use
_2026-08-23T18:35:40Z · `75d9b21`_

Design spec v2.7–v2.12 — the form language finished against real use of the deployed flow:
step alignment and the neutral variant `6ce8522`; the deep ramp and aero materials `ad7f718`;
the derived press value and the brand hexes `ffe8e3c`; the resend cooldown, the 1px label
offset and the step title's type `e80dee9`; the cooldown starting at the first send `1726709`;
field state to the leading icon, the 24h label zone, one step-chrome variant, and the
wrong-code/expired split `75d9b21`. `/dev` gated on the build mode — `f9ef16b`.

The form language was settled over two runs against real use of the sign-in flow: v2.3–v2.6 over
T0.5 and T0.6, then these six. What the deep ramp and the aero materials came to in tokens is the
#08090C base, `--grad-primary` on the primary fill, field sheen, and the press squish. And the
helper line narrowed to a helper line carrying only its own field's errors, which is why a form
with two bad fields no longer says both things under one of them.
