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
---

We can change the background to show different changes in the story

/background aquamarine

For example, we can use `/background (colour)` to fade in a new colour

Lets pause and appreciate it

What if we want to show the focus slowly narrowing in?

/focus 80%

We can use `/focus (percent)%` to say what fraction of the screen should be visible under a vignette

You can use it to show a few different things

/pause 1s
/focus 30%

like a character slowly getting sleepier, or maybe something else

/pause 1s
/focus reset

You can use `/focus reset` to go back to normal!


We can also remove the background colors with `/background reset`

/background reset

That's exciting isn't it?

You should probably note, effects will persist until the next part that writes a new one (either in the metadata or in the text as commands). it's possible for a background colour to stay for many many choices if you don't reset/overwrite it!

sometimes it's faster just to use `/effect reset` to remove all of the changes above

/effect reset
