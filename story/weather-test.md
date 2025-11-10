---
revisit: false
choices:
    How can I change the text speed: speed-test
    How can I apply text effects: effect-test
    How to make POV explicitly clear: pov-test
    How can I show messages between people: messages-test
    How can I visually show the weather at that time: weather-test
    How can I add extra background effects: background-effects
    What happens to a choice with no implementation: not-done
    What about when I end the story: end
pace: slower
---

We can add background effects that will persist until they're removed or overwritten, that signify certain weathers for moods.

These can be applied as either `/(weather)` in the text, or `weather: (weather)` on the story part metadata.

our options are:

/rain

Rain

/pause 1s

/snow

Snow

/pause 1s

/fog

Fog

/pause 1s

/dust

Dust

/pause 1s

/fireflies

Fireflies

/pause 1s

/blizzard

Blizzard

/pause 1s

/harsh-sun

Harsh sun

/pause 1s

/clear

Clear will remove

/pause 1s

/none

So will None.
