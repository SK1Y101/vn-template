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
rain
/pause 1s

/snow
snow
/pause 1s

/fog
fog
/pause 1s

/overcast
overcast
/pause 1s

/fireflies
fireflies
/pause 1s

/blizzard
blizzard
/pause 1s

/dust
dust
/pause 1s

/wind
wind
/pause 1s

/sunny
sunny
/pause 1s

/aurora
aurora
/pause 1s

/thunderstorm
thunderstorm
/pause 1s

/night
night
/pause 1s

/clear

Clear and none will remove

/pause 1s
