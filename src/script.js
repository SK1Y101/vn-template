const storyContainer = document.getElementById("story-container");

let config;
let storyData;
let lastNode = -1;

// Regexes
// fetch the colours from file to match the validator
let COLOUR_PATTERN;
let META_COLOUR_PATTERN;
fetch("named_colours").then(response => response.text()).then( text => {
    const colours = text.split(/\r?\n/).filter(Boolean);
    COLOUR_PATTERN = new RegExp(`\/(${colours.join('|')}|colour #(?:[0-9a-f]{3}){1,2})`, "gi");
    META_COLOUR_PATTERN = new RegExp(`(${colours.join('|')}|#(?:[0-9a-f]{3}){1,2})`, "gi");
});

const PACE_PATTERN = /\/(slowest|slower|slow|fastest|faster|fast|pace (\d+)\s?ms)/ig;
const META_PACE_PATTERN = /(slowest|slower|slow|fastest|faster|fast|(\d+)s?ms)/ig;

async function loadConfig() {
    const res = await fetch("../config.yaml");
    const text = await res.text();
    config = jsyaml.load(text);
}

// URL to state and back
function loadStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    const encodedState = params.get("state");
    if (!encodedState) return { path: [], variants: [] };
    try {
        return JSON.parse(atob(encodedState));
    } catch {
        return { path: [], variants: [] };
    }
}

function saveStateToURL(path, variants) {
    const encodedState = btoa(JSON.stringify({path, variants}));
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
    await new Promise(r => setTimeout(r, fadeDuration - speed/2));
}

function extractRegex(line, regex = COLOUR_PATTERN) {
    const match = line.match(regex);
    if (match) {
        const found = match[0].startsWith("/") ? match[0].slice(1) : match[0];
        return [found, line.replace(regex, "")];
    }
    return [null, line];
}

function parsePaceMultiplier(pace) {
    if (!pace) {
        return 1
    }

    const cleanpace = pace.replace("ms", "").trim();
    const isNumber = cleanpace !== "" && isFinite(cleanpace);

    if (isNumber) {
        return parseFloat(cleanpace) / config.textSpeed;
    }

    return config.paceMultipliers[pace] || 1
}

async function renderText(nodeContainer, node, variantIdx) {
    const storyPart = document.createElement("div");
    storyPart.className = "story-part";

    nodeContainer.appendChild(storyPart);

    const variant = node.variants[variantIdx];

    // extract the node colour choice
    const partColour = extractRegex(variant.colour || "", META_COLOUR_PATTERN)[0];
    storyPart.style.color = partColour;

    // extract the speed for this part
    const partPace = parsePaceMultiplier(
        extractRegex(variant.pace || "", META_PACE_PATTERN)[0]
    );

    // print the lines
    const lines = variant.text.split("\n").filter(elem => elem.trim !== "");
    for (const line of lines) {
        const storyLine = document.createElement("div");
        storyLine.className = "story-line";

        const [col, colourless_line] = extractRegex(line, COLOUR_PATTERN);
        storyLine.style.color = col;

        const [pace, paceless_line] = extractRegex(colourless_line, PACE_PATTERN);

        // parse markdown to html
        storyLine.innerHTML = marked.parse(paceless_line);
        storyPart.append(storyLine);

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

async function renderChoices(nodeContainer, path, variants, storyIndex, node, variantIdx) {
    const choicesContainer = document.createElement("div");
    choicesContainer.className = "story-choices";
    nodeContainer.appendChild(choicesContainer);

    // fetch the variants so we can find the choices allowed
    const variant = node.variants[variantIdx];

    // fetch the choices for this node
    const choices = variant.choices ? Object.entries(variant.choices) : [];

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
                    saveStateToURL(path, variants);
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
            continue;
        }

        // fetch the current variant, and then render.
        const variantIdx = chooseVariant(node, variants[i]);
        await renderNode(path, variants, i, node, variantIdx);
        lastNode = i;
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

    document.body.style.background = config.backgroundColour || "#111";
    storyContainer.style.color = config.textColour || "#eee";

    storyData = await fetch("story.json").then(r => r.json());
    const { path, variants } = loadStateFromURL();

    if (!path.length) {
        resetStory();
    } else {
        renderPath(path, variants);
    }
}

initStory();
