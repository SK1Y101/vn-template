const storyContainer = document.getElementById("story-container");
const weatherOverlay = document.getElementById("weather-overlay");
const effectOverlay = document.getElementById("effect-overlay");

let config;
let colours;
let storyData;
let povColours = {};
let lastNode = -1;

// Regexes

let COLOUR_PATTERN;
let BACKGROUND_PATTERN;

const PACE_PATTERN = /\/(slowest|slower|slow|fastest|faster|fast|pace \d+\s?(ms|s))/ig;
const PAUSE_PATTERN = /^\/pause \d+s?(ms|s)$/ig;

const EFFECT_PATTERN = /\/(shake|nudge|bounce|slide-left|slide-right|pulse|blink|grow|pop|glow|tilt|wobble|wave)/ig;

const POV_PATTERN = /\/pov \w+/ig;

const MESSAGE_UNSENT_PATTERN = /\/message\-unsent \w+/ig;
const MESSAGE_PATTERN = /\/message (\w+)/ig;
const MESSAGE_TITLE_PATTERN = /^\/message\-title [^/]+$/ig;

const BACKGROUND_EFFECT_PATTERN = /^\/(?:(focus|bloom|noise|chromatic) (\d+(\.\d+)?\%?|reset))|(effect reset)$/ig;
let BACKGROUND_TINT_PATTERN;

const WEATHER_PATTERN = /^\/(rain|snow|fog|dust|fireflies|blizzard|harsh-sun|clear|none)$/ig;

function keepView() {
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth' // optional, makes it animate nicely
    });
}

async function loadConfig() {
    let configText;
    try {
        let res = await fetch("config.yaml");
        if (!res.ok) throw new Error("config.yaml not found");
        configText = await res.text();
    } catch {
        let res = await fetch("../config.yaml");
        if (!res.ok) throw new Error("No config.yaml found");
        configText = await res.text();
    }

    if (!configText.trim()) {
        throw new Error("Config file is empty");
    }

    config = jsyaml.load(configText);
}


async function loadColours() {
    const text = await fetch("named_colours").then(r => r.text());
    colours = text.toLowerCase().split(/\r?\n/).filter(Boolean);
    COLOUR_PATTERN = new RegExp(`\/(${colours.join('|')}|reset|colour #(?:[0-9a-f]{3}){1,2})`, "gi");
    BACKGROUND_PATTERN = new RegExp(`^\/background (${colours.join('|')}|reset|#(?:[0-9a-f]{3}){1,2})`, "gi");
    BACKGROUND_TINT_PATTERN = new RegExp(
        `^/tint\\s+(?:` +
        // three 1-3 digit numbers separated by spaces or commas (allow extra spaces)
        `\\d{1,3}(?:[ ,]\\s*\\d{1,3}){2}` +
        `|` +
        // 3- or 6-digit hex (#fff or #ffaa33)
        `#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})` +
        `|` +
        // reset
        `reset` +
        `|` +
        // color names (escaped)
        `(?:${colours.join('|') })` +
        `)\\s*$`,
        'i' // case-insensitive
    );

}

// URL to state and back
function loadStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    const encodedState = params.get("state");
    if (!encodedState) return { path: [], variants: [], povColours: {}};
    try {
        return JSON.parse(atob(encodedState));
    } catch {
        return { path: [], variants: [], povColours: []};
    }
}

function saveStateToURL(path, variants) {
    const encodedState = btoa(JSON.stringify({path, variants, povColours}));
    const url = new URL(window.location);
    url.searchParams.set("state", encodedState);
    window.history.replaceState(null, "", url);
}

// helper functions
function error(message) {
    const errorMessage = document.createElement("div");
    errorMessage.innerHTML = message;

    storyContainer.appendChild(errorMessage);
    throw new Error(message);
}

// Render the components
async function fadeText(element) {
    const speed = parseFloat(element.dataset.speed);
    const fadeDuration = parseFloat(config.fadeDuration) * (speed / config.textSpeed);
    const computedOpacity = parseFloat(getComputedStyle(element).opacity) || 1;

    element.style.opacity = 0;
    element.style.transition = `opacity ${fadeDuration}ms ease`;
    element.getBoundingClientRect();

    requestAnimationFrame(() => element.style.opacity = computedOpacity);
    keepView();
    await new Promise(r => setTimeout(r, Math.max(speed, fadeDuration)));
}

function extractRegex(line, regex = COLOUR_PATTERN) {
    const match = line.match(regex);
    if (match) {
        const found = match[0].startsWith("/") ? match[0].slice(1) : match[0];
        return [found, line.replace(regex, "")];
    }
    return [null, line];
}

function extractRegexArg(line, regex = COLOUR_PATTERN) {
    const match = line.match(regex);
    if (match) {
        const found = match[0].split(" ");
        const args = found.slice(1).join(" ");
        return [args, line.replace(regex, ""), found[0].replace("/", "")];
    }
    return [null, line];
}

function extractMultipleRegex(line, regex = EFFECT_PATTERN) {
    const match = line.match(regex);
    if (match) {
        let matches = [];
        for (const m of match) { matches.push(m.replace("\/", "")); }
        return [matches, line.replace(regex, "")];
    }
    return [null, line];
}

function toMillis(speed) {
    if (speed.endsWith("ms")) {
        return parseFloat(speed.replace("ms", "").trim());
    } else if (speed.endsWith("s")) {
        return 1000 * parseFloat(speed.replace("s", "").trim());
    }
}

function parsePaceMultiplier(pace) {
    if (!pace) {
        return 1;
    }

    pace = pace.replace("pace", "");

    const cleanpace = pace.replace("ms", "").replace("s","").trim();
    const isNumber = cleanpace !== "" && isFinite(cleanpace);

    if (isNumber) {
        return toMillis(pace) / config.textSpeed;
    }

    return config.paceMultipliers[pace] || 1;
}

function parsePOVColour(pov, partpov = null) {
    if (!pov) { return null; }
    if (povColours[pov]) { return povColours[pov]; }
    allowedColours = colours.filter(col => !Object.values(povColours).includes(col)) || colours;
    if (partpov) {
        contrastingColours = allowedColours.filter(col => contrast(col, povColours[partpov]) >= 10) || allowedColours;
    } else {
        contrastingColours = allowedColours;
    }
    selected = contrastingColours[Math.floor(Math.random() * contrastingColours.length)];
    povColours[pov] = selected;
    return selected;
}

function parseColor(color) {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = color;
    let c = ctx.fillStyle;

    // if hex, convert to r,g,b
    if (c[0] === "#") {
        if (c.length === 4) { // #rgb
            return [
                parseInt(c[1] + c[1], 16),
                parseInt(c[2] + c[2], 16),
                parseInt(c[3] + c[3], 16)
            ];
        }
        return [
            parseInt(c[1] + c[2], 16),
            parseInt(c[3] + c[4], 16),
            parseInt(c[5] + c[6], 16)
        ];
    }

    // if rgb(a)
    const m = c.match(/\d+/g);
    if (m) return m.slice(0, 3).map(Number);

    // fallback to white
    return [255, 255, 255];
}

function contrast(fg, bg) {
    const [r1, g1, b1] = parseColor(fg);
    const [r2, g2, b2] = parseColor(bg);

    const b1v = (r1 * 299 + g1 * 587 + b1 * 114) / 1000;
    const b2v = (r2 * 299 + g2 * 587 + b2 * 114) / 1000;

    return Math.abs(b1v - b2v);
}


function createPOVContainer(pov, partpov = null) {
    const povContainer = document.createElement("div");
    const povName = document.createElement("div");
    const colour = parsePOVColour(pov, partpov);

    povContainer.style.borderColor = colour;
    povContainer.style.background = `
        linear-gradient(
            180deg,
            color-mix(in srgb, ${colour} 30%, transparent) 0%,
            color-mix(in srgb, ${colour} 10%, transparent) 100%
        )
    `;
    povContainer.classList.add("story-pov");

    povName.style.color = colour;
    povName.textContent = pov;
    povName.classList.add("pov-name");
    //  we might need to adjust the contrast
    const bgContrast = contrast(colour, getComputedStyle(document.body).backgroundColor);
    if (bgContrast < 60) {
        povName.style.background = `color-mix(in srgb, ${colour} 50%, white)`;
    }

    povContainer.appendChild(povName);
    return povContainer;
}

function caseCheck(pov) {
    return config.povCaseInsensitive ? pov.toLowerCase() : pov;
}

function adjustTextColour(obj, bgColour) {
    if (!obj.style.color) {
        if (contrast(bgColour, config.textColour) < 60) {
            obj.style.color = config.darkTextColour;
        }
    }
}

function addNewLine(part, line, pov, lastpov, lastpovcontainer, partpov) {
    if (pov) {
        const isPart = caseCheck(pov) === caseCheck(partpov);
        if (isPart) {
            // use the default container
            part.appendChild(line);
            return null;
        } else if (caseCheck(pov) === caseCheck(lastpov)) {
            // out pov hasn't changed
            lastpovcontainer.appendChild(line);
            return lastpovcontainer
        } else {
            // change to a new pov container
            const newpovcontainer =createPOVContainer(pov, !isPart ? partpov : null);
            adjustTextColour(line, newpovcontainer.style.background);
            newpovcontainer.appendChild(line);
            part.appendChild(newpovcontainer);
            return newpovcontainer
        }
    } else {
        part.appendChild(line);
        return null;
    }
}

function formatMessage(storypart, messagecontainer, messageObj, lastmsgObj, pov, lastpov, partpov, unsent, messagetitle) {
    const povcolour = parsePOVColour(pov, partpov);
    const mainPov = pov === partpov;

    if (!messagecontainer) {
        messagecontainer = document.createElement("div");
        messagecontainer.classList.add("messages");
        storypart.appendChild(messagecontainer);

        if (messagetitle) {
            titlename = document.createElement("div");
            titlename.textContent = messagetitle;
            titlename.classList.add("message-title")
            messagecontainer.appendChild(titlename)
        }
    }

    if (lastpov === pov) {
        lastmsgObj.classList.add("merge-bottom");
        messageObj.classList.add("merge-top");
    } else {
        // add a name marker!
        messageAuthor = document.createElement("div");
        messageAuthor.style.color = povcolour;
        messageAuthor.textContent = pov;
        messageAuthor.classList.add("message-author", mainPov ? "left" : "right");
        messagecontainer.appendChild(messageAuthor);
    }
    messageObj.classList.add("message", mainPov ? "left" : "right");

    if (unsent) {
        messageObj.classList.add("unsent", "pulse");
        messageObj.style.background = `color-mix(in srgb, ${povcolour} 30%, transparent)`;
    } else {
        messageObj.style.background = povcolour
    }

    // update the text colour if it won't be readable
    adjustTextColour(messageObj, povcolour);

    messagecontainer.appendChild(messageObj);

    return [messagecontainer, messageObj, pov];
}

function smoothSwapClasses(element, classname, fadeTime) {
    oldElement = element.cloneNode(false);
    element.parentNode.insertBefore(oldElement, element);
    element.opacity = 0;
    element.className = classname;
    requestAnimationFrame(() => element.style.opacity = 1);

    oldElement.opacity = 0;

    setTimeout(() => {
        oldElement.remove();
    }, fadeTime);
}

function updateWeather(weather) {
    if (weather) {
        const newWeather = weather === "clear" || weather === "none" ? "" : `weather-${weather}`;
        smoothSwapClasses(weatherOverlay, newWeather, config.effectTransitionTime || 2000)
    }
}

function updateBackground(colour) {
    if (colour) {
        // apply the new bg colour
        document.body.style.transition = `all ${parseFloat(config.backgroundTransitionTime)}ms ease`;
        document.body.style.background = colour.replace("reset", config.backgroundColour);
        // update text to make it readable too
        document.body.style.transition = `all ${parseFloat(config.backgroundTransitionTime)}ms ease`;
        storyContainer.style.color = contrast(config.textColour, colour)>60 ? config.textColour : config.darkTextColour;
    }
}

function updateEffect(effectType, value) {
    effectOverlay.style.transition = `
        --focus-size ${parseFloat(config.effectTransitionTime) || 2000}ms ease,
        --chromatic ${parseFloat(config.effectTransitionTime) || 2000}ms ease,
        --bloom ${parseFloat(config.effectTransitionTime) || 2000}ms ease,
        --noise ${parseFloat(config.effectTransitionTime) || 2000}ms ease,
        --tint-r ${parseFloat(config.effectTransitionTime) || 2000}ms ease,
        --tint-g ${parseFloat(config.effectTransitionTime) || 2000}ms ease,
        --tint-b ${parseFloat(config.effectTransitionTime) || 2000}ms ease
    `;

    let focus = 100;
    let bloom = 0;
    let noise = 0;
    let chromatic = 0;
    let tint = [0, 0, 0];

    switch (effectType) {
        case "focus":
            focus = parseFloat(value.replace("%", ""));
            break;
        case "bloom":
            bloom = parseFloat(value);
            break
        case "noise":
            noise = parseFloat(value);
            break
        case "chromatic":
            chromatic = parseFloat(value);
            break
        case "tint":
            value = value.trim().toLowerCase();
            const parts = value.split(/[ ,]+/).filter(Boolean);
            if (parts.length === 3 && parts.every(v => /^\d+(\.\d+)?$/.test(v))) {
                tint = parts.map(Number);
                break
            }

            // use the browser to resolve named colors or hex
            const ctx = document.createElement('canvas').getContext('2d');
            ctx.fillStyle = value;
            const computed = ctx.fillStyle; // normalized form like 'rgb(147, 112, 219)'
            if (!computed.startsWith('rgb')) break;

            tint = computed.match(/\d+/g).map(Number);
            break
        default:
            break;
    }

    effectOverlay.style.setProperty("--focus-size", `${focus*1.05}%`);
    effectOverlay.style.setProperty("--bloom", `${bloom}`);
    effectOverlay.style.setProperty("--noise", `${noise}`);
    effectOverlay.style.setProperty("--chromatic", `${chromatic}`);

    effectOverlay.style.setProperty("--tint-r", tint[0]/255);
    effectOverlay.style.setProperty("--tint-g", tint[1]/255);
    effectOverlay.style.setProperty("--tint-b", tint[2]/255);
}

async function renderText(nodeContainer, node, variantIdx) {
    const storyPart = document.createElement("div");
    storyPart.className = "story-part";

    nodeContainer.appendChild(storyPart);

    const variant = node.variants[variantIdx];

    // extract the node colour choice
    const partColour = variant.colour;
    storyPart.style.color = partColour;

    // extract the speed for this part
    const partPace = parsePaceMultiplier(variant.pace);

    // extract any effect classes
    const effectPart = variant.effect ? variant.effect.split() : [];

    const partpov = variant.pov;
    let partpovcontainer;
    if (partpov) {
        partpovcontainer = createPOVContainer(partpov);
        storyPart.appendChild(partpovcontainer)
    }
    let lastpov;
    let lastpovcontainer;

    // messaging pov
    const partmessagepov = variant.messagepov || partpov;
    let lastmessageobj;
    let lastmessagepov;
    let messagescontainer;

    // messaging title
    const messageparttitle = variant.messagetitlt;
    let messagetitle;

    // background effects
    updateBackground(variant.background);
    updateWeather(variant.weather);

    // print the lines
    const lines = variant.text.split("\n").filter(elem => elem.trim());
    for (const line of lines) {
        // single line commands that should exit early
        const foundtitle = extractRegexArg(line, MESSAGE_TITLE_PATTERN)[0];
        if (foundtitle) {
            messagetitle = foundtitle.replace("message-title", "").trim();
            continue;
        }

        const foundpause = extractRegexArg(line, PAUSE_PATTERN)[0];
        if (foundpause) {
            await new Promise(r => setTimeout(r, toMillis(foundpause)));
            continue;
        }

        const [foundbgvalue, _, foundbgeffect] = extractRegexArg(line, BACKGROUND_EFFECT_PATTERN);
        if (foundbgeffect) {
            updateEffect(foundbgeffect, foundbgvalue);
            continue
        }
        const foundtint = extractRegexArg(line, BACKGROUND_TINT_PATTERN)[0];
        if (foundtint) {
            updateEffect("tint", foundtint);
            continue
        }

        const foundbackground = extractRegexArg(line, BACKGROUND_PATTERN)[0];
        if (foundbackground) {
            updateBackground(foundbackground);
            continue
        }

        const foundweather = extractRegex(line, WEATHER_PATTERN)[0];
        if (foundweather) {
            updateWeather(foundweather);
            continue
        }

        // commands that still output text
        const storyLine = document.createElement("div");
        storyLine.className = "story-line";

        const [col, colourless_line] = extractRegex(line, COLOUR_PATTERN);
        if (col) { storyLine.style.color = col.replace("colour", "").replace("reset", config.textColour).trim(); }

        const [pace, paceless_line] = extractRegex(colourless_line, PACE_PATTERN);

        const [effects, effectless_text] = extractMultipleRegex(paceless_line, EFFECT_PATTERN);
        if (effects) { storyLine.classList.add(...effects); };
        if (effectPart) { storyLine.classList.add(...effectPart); };

        // register povs if needed
        const [pov, povlesstext] = extractRegexArg(effectless_text, POV_PATTERN);

        // determine any messages
        const [unsentmessagepov, unsentlesstext] = extractRegexArg(povlesstext, MESSAGE_UNSENT_PATTERN);
        const [messagepov, messagelesstext] = extractRegexArg(unsentlesstext, MESSAGE_PATTERN);

        // parse markdown to html
        storyLine.innerHTML = marked.parse(messagelesstext);

        // render as a message or not
        const foundmessagepov = unsentmessagepov || messagepov;
        if (foundmessagepov) {
            if (!partmessagepov) { partmessagepov = foundmessagepov; }
            [messagescontainer, lastmessageobj, lastmessagepov] = formatMessage(storyPart, messagescontainer, storyLine, lastmessageobj, foundmessagepov, lastmessagepov, partmessagepov, unsentmessagepov, messagetitle || messageparttitle);
            lastpovcontainer = null;
            lastpov = null;
        } else {
            messagescontainer = null;
            lastmessageobj = null;
            lastmessagepov = null;
            messagetitle = null;
            lastpovcontainer = addNewLine(partpovcontainer || storyPart, storyLine, pov || partpov, lastpov, lastpovcontainer, partpov);
            lastpov = pov || variant.pov;
        }

        // ensure we wait the right amount of time between lines of text
        const speed = parsePaceMultiplier(pace) * partPace * config.textSpeed;
        storyLine.dataset.speed = speed;
        await fadeText(storyLine);
    }
}

function unselectChoices() {
    const choiceButtons = document.getElementsByClassName("story-choice");
    for (const button of choiceButtons) {
        button.removeEventListener("click", button._clickButton);
        button.style.pointerEvents = null;
        button.style.cursor = null;
        button.classList.remove("active");
        button.classList.add("unselected");
        if (button.classList.contains("selected")) {
            button.classList.remove("unselected");
        }
    }
}

function redoButton() {
    const button = document.createElement("div");
    button.className = "story-choice redo";
    button.textContent = "Restart story";
    button.style.backgroundColor = config.redoButtonColour || "#0a84ff";
    button.style.opacity = 1;
    button.style.pointerEvents = null;

    // handle the reset action
    button.addEventListener("click", resetStory);
    return button;
}

function visitable(path, choices) {
    return Object.entries(choices).filter(([_, target]) => {
        const node = storyData[target];
        if (!node) return true; // unimplemented, sure, let it show
        const alreadyVisited = path.slice(0, lastNode+2).includes(target);
        return !alreadyVisited || node.revisit;
    });
}


async function renderChoices(nodeContainer, path, variants, storyIndex, node, variantIdx) {
    const choicesContainer = document.createElement("div");
    choicesContainer.className = "story-choices";
    nodeContainer.appendChild(choicesContainer);

    // fetch the variants so we can find the choices allowed
    const variant = node.variants[variantIdx];

    // fetch the choices for this node
    const choices = variant.choices ? visitable(path, variant.choices) : [];

    // determine if these choices have already been made
    const isCurrent = storyIndex >= path.length - 1;

    // and if there are further choices to be made
    const isEnd = node.end || choices.length === 0;

    const buttons = [];

    // if this is an ending node, show a redo button
    if (isEnd) {
        buttons.push(redoButton());
    }
    // otherwise, show the choices
    else {
        for (const [label, target] of choices) {
            const choiceButton = document.createElement("div");
            choiceButton.className = "story-choice";
            choiceButton.textContent = label;
            choiceButton.style.pointerEvents = null;

            // unselected past choices get the class applied
            if (!isCurrent) {
                // if the next part of the story is this past choices target, it was chosen
                if (path[storyIndex + 1] === target) {
                    choiceButton.classList.add("selected");
                } else {
                    choiceButton.classList.add("unselected");
                }
            } else {
                choiceButton.classList.add("active");
            }

            // handle the choice selection
            choiceButton._clickButton = () => {
                if (isCurrent) {
                    path.push(target);
                    variants.push(variantIdx);
                    choiceButton.classList.add("selected");
                    saveStateToURL(path, variants, povColours);
                    unselectChoices();
                    renderPath(path, variants, storyIndex + 1);
                }
            }

            choiceButton.addEventListener("click", choiceButton._clickButton);
            buttons.push(choiceButton);
        }
    }

    const speed = parseFloat(config.choiceSpeed);
    for (const button of buttons) {
        choicesContainer.appendChild(button);
        keepView();
        await new Promise(r => setTimeout(r, speed));
    }

    // allow clicking the buttons if it's the active choice
    if (isCurrent) {
        for (const button of buttons) {
            button.style.pointerEvents = "auto";
            button.style.cursor = "pointer";
        }
    }
}

async function renderNode(path, variants, storyIndex, node, variantIdx) {
    // create the node container
    const nodeContainer = document.createElement("div");
    nodeContainer.className = "story-node";
    storyContainer.appendChild(nodeContainer);

    // create the text
    await renderText(nodeContainer, node, variantIdx);

    // create the choices, if they exist
    // because choices will progress the story, we need to pass the path and variants trackers
    await renderChoices(nodeContainer, path, variants, storyIndex, node, variantIdx);

    // ensure we have scrolled enough
    keepView();
}

function chooseVariant(node, index = null) {
    // use the defined variant, or select one at random
    return index ?? Math.floor(Math.random() * node.variants.length);
}

// Render the story
async function renderPath(path, variants, startIndex = null) {
    const fromIndex = startIndex ?? lastNode + 1;
    for (let i = fromIndex; i < path.length; i++) {
        const nodeName = path[i];
        const node = storyData[nodeName];

        // node not implemented
        if (!node) {
            const emptyNode = document.createElement("div");
            emptyNode.className = "story-part";
            emptyNode.innerHTML = "<em>Pathway not implemented yet.</em>";
            emptyNode.dataset.speed = config.textSpeed;

            storyContainer.appendChild(emptyNode);
            await fadeText(emptyNode);

            storyContainer.appendChild(redoButton());
            keepView();
            continue;
        }

        // fetch the current variant, and then render.
        const variantIdx = chooseVariant(node, variants[i]);
        await renderNode(path, variants, i, node, variantIdx);
        lastNode = i;
    }
}

function updatePOVColours(povState) {
    if (!povState) { return }
    for (const [key, value] of Object.entries(povState)) {
        if (!povColours[key]) {
            povColours[key] = value;
        }
    }
}

function resetStory() {
    lastNode = -1;

    // fetch all nodes with start=true
    const startNodes = Object.entries(storyData).filter(([k,v]) => v.start).map(([k]) => k);
    if (!startNodes.length) {
        error("No starting story nodes defined");
    }

    const startIdx = Math.floor(Math.random() * startNodes.length);
    const startNode = startNodes[startIdx];

    // we want to randomly select a variant from the path rendering code
    const path = [startNode];
    const variants = [];

    // ensure the previous story and url is reset correctly
    storyContainer.innerHTML = "";
    const url = new URL(window.location);
    url.searchParams.delete("state");
    window.history.replaceState(null, "", url);

    // begin again
    renderPath(path, variants);
}

// Start the rendering of the story plz
async function initStory() {
    await loadConfig();
    await loadColours();
    updatePOVColours(config.povColours);

    document.body.style.background = config.backgroundColour || "#111";
    storyContainer.style.color = config.textColour || "#eee";

    storyData = await fetch("story.json").then(r => r.json());
    const state = loadStateFromURL();
    const path = state["path"];

    updatePOVColours(state["povColours"]);

    if (!path.length) {
        resetStory();
    } else {
        renderPath(path, state["variants"]);
    }
}

initStory();
