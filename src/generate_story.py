from __future__ import annotations
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Callable
from yaml import safe_load
import sys
from json import dumps
from collections import Counter
import re

SPEEDS = "fastest|faster|fast|slowest|slower|slow"
PACE_PATTERN = re.compile(rf"/({SPEEDS}|speed \d+\s?ms)")
META_PACE_PATTERN = re.compile(rf"^({SPEEDS}|\d+\s?ms)$")
EXCESSIVE_THRESHOLD = 0.25
DEBUG = "-debug" in sys.argv

NAMED_COLOURS = Path("src/named_colours").read_text().lower().splitlines()
HEX_COLOURS = r"#(?:[0-9a-f]{3}){1,2}"
COLOUR_PATTERN = re.compile(rf"/({'|'.join(NAMED_COLOURS)}|colour {HEX_COLOURS})")
META_COLOUR_PATTERN = re.compile(rf"^({'|'.join(NAMED_COLOURS)}|{HEX_COLOURS})$")

EFFECT_PATTERN = re.compile(r"/(shake|nudge|bounce|slide-left|slide-right|pulse|blink|grow|pop|glow|tilt|wobble|wave)")
META_EFFECT_PATTERN = re.compile(EFFECT_PATTERN.pattern[1:])

POV_PATTERN = re.compile(r"/pov \w+")
META_POV_PATTERN = re.compile(r"^\w+$")

MESSAGE_PATTERN = re.compile(r"/message(-unsent)? \w+")
META_MESSAGE_PATTERN = re.compile(r"message-pov \w+")

MESSAGE_TITLE_PATTERN = re.compile(r"^/message-title ([^/]+)$")
META_MESSAGE_TITLE_PATTERN = re.compile(r"message-title .+")

def debug(msg: str):
    if DEBUG:
        print(f" - {msg}")

@dataclass
class StoryParts:
    variants: list[StoryPart]
    is_start: bool = False
    is_end: bool = False

    @property
    def revisit(self) -> bool:
        return all(variant.revisit for variant in self.variants)

@dataclass
class StoryPart:
    text: str
    filepath: Path
    pathname: str
    pace: str | None
    colour: str | None
    effect: str | None
    pov: str | None
    messagepov: str | None
    messagetitle: str | None
    revisit: bool = True
    choices: dict[str, str] = field(default_factory=dict)

def parse_markdown(content: str) -> tuple[dict[str, Any], str]:
    content = content.strip()
    if not content.startswith('---'):
        return {}, content
    _, meta, body = content.split('---', 2)
    return safe_load(meta), body.strip().replace("\\", "/")


def find_parts() ->  dict[str, StoryParts]:
    parts: dict[str, StoryParts] = {}
    base = Path("story")
    for f in base.glob("**/*.md"):
        has_variants = len(f.parts) > 2

        pathname = f.parts[-2] if has_variants else f.stem

        metadata, body = parse_markdown(f.read_text("utf-8"))
        this_part = StoryPart(
            choices={k:v for k,v in metadata.get("choices", {}).items() if k and v},
            text = body,
            filepath=f,
            pathname=pathname,
            pace=metadata.get("pace"),
            colour=metadata.get("colour"),
            effect=metadata.get("effect"),
            pov=metadata.get("pov"),
            revisit=metadata.get("revisit", True),
            messagepov=metadata.get("message-pov"),
            messagetitle=metadata.get("message-title"),
        )

        if pathname not in parts:
            parts[pathname] = StoryParts(
                is_start=metadata.get("start", False),
                is_end=metadata.get("end", False),
                variants = [this_part]
            )
        else:
            parts[pathname].variants.append(this_part)
        debug(f"added {f.name} to {pathname}")

    return parts

def all_nodes(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        nodes.extend(path.variants)
    return nodes

def starting_nodes(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for name, path in parts.items():
        if path.is_start:
            nodes.extend(path.variants)
    return nodes


def ending_nodes(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        if path.is_end:
            nodes.extend(path.variants)
    return nodes


def start_end_nodes(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        if path.is_end and path.is_start:
            nodes.extend(path.variants)
    return nodes

def empty_nodes(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        for part in path.variants:
            if not part.text:
                nodes.append(part)
    return nodes

def duplicate_nodes(parts: dict[str, StoryParts]) -> list[StoryPart]:
    text = []
    nodes = []
    for _, path in parts.items():
        for part in path.variants:
            if part.text in text:
                nodes.append(part)
            else:
                text.append(part.text)
    return nodes

def invalid_links(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        if path.is_end:
            continue

        for part in path.variants:
            for choice in part.choices.values():
                if choice not in parts.keys():
                    nodes.append(part)
                    break
                if choice is None:
                    nodes.append(part)
                    break
    return nodes

def dead_ends(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        if not path.is_end:
            for part in path.variants:
                if not part.choices:
                    nodes.append(part)
    return nodes

def continuing_ends(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        if path.is_end:
            for part in path.variants:
                if part.choices:
                    nodes.append(part)
    return nodes

def revist_variants(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        for part in path.variants:
            if path.revisit and not part.revisit:
                nodes.append(part)
    return nodes

def noncontinuing_variants(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        variant_choices = any([len(part.choices) > 0 for part in path.variants])
        for part in path.variants:
            if variant_choices and not part.choices:
                nodes.append(part)
    return nodes

def single_choice(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        if not path.is_end:
            for part in path.variants:
                if len(part.choices) == 1:
                    nodes.append(part)
    return nodes

def duplicate_choices(parts: dict[str, StoryParts]) -> list[StoryPart]:
    nodes = []
    for _, path in parts.items():
        if not path.is_end:
            for part in path.variants:
                if len(part.choices.values()) != len(set(part.choices.values())):
                    nodes.append(part)
    return nodes

def unreachable_nodes(parts: dict[str, StoryParts]) -> list[StoryPart]:
    stack = starting_nodes(parts)
    every_node = all_nodes(parts)
    if not stack:
        return every_node

    visited: set[str] = set()
    while stack:
        node = stack.pop()
        if node.filepath.name in visited:
            continue

        visited.add(node.filepath.name)
        if parts[node.pathname].is_end:
            continue

        for choice in node.choices.values():
            if choice in parts:
                stack.extend(
                    parts[choice].variants
                )
    return [node for node in every_node if node.filepath.name not in visited]

def looping_nodes(parts: dict[str, StoryParts]) -> list[list[StoryPart]]:
    loops: list[list[StoryPart]] = []
    def depth_search(node: StoryPart, ancestors: list[StoryPart] = []) -> None:
        ancestor_names = [ancestor.pathname for ancestor in ancestors]
        if node.pathname in ancestor_names:
            loops.append(ancestors+[node])
            return

        if parts[node.pathname].is_end:
            return

        # we've visited too many nodes without looping, how?
        if len(ancestors) > 2 * len(parts):
            return

        for choice in node.choices.values():
            if choice in parts:
                # skip if we're not revisitin
                if not parts[choice].revisit and choice in ancestor_names:
                    continue

                for variant in parts[choice].variants:
                    depth_search(variant, ancestors + [node])

    for node in starting_nodes(parts):
        depth_search(node)

    def canonical_looping(loop: list[StoryPart]) -> tuple[list[StoryPart], list[str]]:
        names = [part.pathname for part in loop]
        start = names.index(names[-1])

        loop = loop[start:]
        names = names[start:]

        rotations = [tuple(names[i:]+names[:i]) for i in range(len(names))]
        minimum = min(rotations)
        for i in range(len(loop)):
            if minimum == [part.pathname for part in loop]:
                return loop[i:]+loop[:i], names[i:]+names[:i]
        return loop, names

    unique: list[list[StoryPart]] = []
    unique_name: list[list[str]] = []
    for loop in loops:
        this_loop, this_name = canonical_looping(loop)
        if this_name not in unique_name:
            unique.append(this_loop)
            unique_name.append(this_name)

    return unique

def escapable_looping_nodes(parts: dict[str, StoryParts]) -> list[list[StoryPart]]:
    escapable: list[list[StoryPart]] = []
    all_loops = looping_nodes(parts)

    def can_escape(loop: list[StoryPart]) -> bool:
        loop_names = {node.pathname for node in loop}

        def search(node: StoryPart, visited: set[str]) -> bool:
            thispart = parts[node.pathname]
            if thispart.is_end:
                return True

            if node.pathname in visited:
                return False

            visited = visited | {node.pathname}

            for variant in thispart.variants:
                for choice in variant.choices.values():
                    if choice not in parts:
                        continue

                    if choice not in loop_names:
                        for v in parts[choice].variants:
                            if search(v, visited):
                                return True
                    else:
                        for v in parts[choice].variants:
                            if search(v, visited):
                                return True
            return False

        return any(search(node, set()) for node in loop)

    for loop in all_loops:
        if can_escape(loop):
            escapable.append(loop)

    return escapable

def innescapable_looping_nodes(parts: dict[str, StoryParts]) -> list[list[StoryPart]]:
    innescapable: list[list[StoryPart]] = []
    all_loops = looping_nodes(parts)

    def can_escape(loop: list[StoryPart]) -> bool:
        loop_names = {node.pathname for node in loop}

        def search(node: StoryPart, visited: set[str]) -> bool:
            thispart = parts[node.pathname]
            if thispart.is_end:
                return True

            if node.pathname in visited:
                return False

            visited = visited | {node.pathname}

            for variant in thispart.variants:
                for choice in variant.choices.values():
                    if choice not in parts:
                        continue

                    if choice not in loop_names:
                        for v in parts[choice].variants:
                            if search(v, visited):
                                return True
                    else:
                        for v in parts[choice].variants:
                            if search(v, visited):
                                return True
            return False

        return any(search(node, set()) for node in loop)

    for loop in all_loops:
        if not can_escape(loop):
            innescapable.append(loop)

    return innescapable


def abnormal_paths(parts: dict[str, StoryParts]) -> list[list[StoryPart]]:
    all_paths: list[list[StoryPart]] = []
    visited_paths: set[tuple[str]] = set()

    def traverse(node: StoryPart, path: list[StoryPart] = []):
        new_path = path + [node]
        pathnames = tuple(p.pathname for p in new_path)

        # the path found is way too long.
        if len(path) > 5 * len(parts):
            return

        if pathnames in visited_paths:
            return
        visited_paths.add(pathnames)

        this_part = parts[node.pathname]

        has_valid_choices = any(
            any(
                choice in parts
                for choice in variant.choices.values()
            )
            for variant in this_part.variants
        )

        if this_part.is_end or not has_valid_choices:
            all_paths.append(new_path)
            return

        for variant in this_part.variants:
            for choice in variant.choices.values():
                if choice not in parts:
                    continue

                # skip if we're not revisitin
                if choice in pathnames and not parts[choice].revisit:
                    continue

                for next_variant in parts[choice].variants:
                    traverse(next_variant, new_path)

    for start in starting_nodes(parts):
        traverse(start)

    if not all_paths:
        return []

    average_path = sum(len(path) for path in all_paths) / len(all_paths)
    return [path for path in all_paths if abs(len(path) - average_path) > 1]

def command_metadata(parts: dict[str, StoryParts], regex: re.Pattern[str] = META_COLOUR_PATTERN, property: str = "colour") -> list[StoryPart]:
    nodes = []

    for path in parts.values():
        for part in path.variants:
            if match:=getattr(part, property, None):
                if not regex.match(match):
                    nodes.append(part)

    return nodes

def commands_in_text(parts: dict[str, StoryParts], regex: re.Pattern[str] = META_COLOUR_PATTERN, allow_multiple: bool = False) -> list[StoryPart]:
    nodes = []

    for path in parts.values():
        for part in path.variants:
            for line in part.text.splitlines():
                stripped = line.strip()
                if not stripped:
                    continue

                markers = regex.findall(stripped)
                if not allow_multiple and len(markers) > 1:
                    nodes.append(part)
                    break

                if markers and not stripped.startswith("/"):
                    nodes.append(part)
                    break

    return nodes

def excessive_commands(parts: dict[str, StoryParts], regex: re.Pattern[str] = META_COLOUR_PATTERN, threshold: float = 0.5) -> list[StoryPart]:
    nodes = []

    for path in parts.values():
        for part in path.variants:
            lines = [line for line in part.text.splitlines() if line.strip()]
            if not lines:
                continue

            if match := regex.findall(part.text):
                frequency = Counter(match)

                # we're using a certain effect marker a lot, consider applying it to the node itself
                most_used = frequency.most_common(1)[0][1]
                fraction = most_used / len(lines)
                if fraction > threshold and len(lines) > 4:
                    nodes.append(part)

    return nodes

def colour_metadata(parts: dict[str, StoryParts])-> list[StoryPart]:
    return command_metadata(parts, META_COLOUR_PATTERN, "colour")
def colour_markers(parts: dict[str, StoryParts])-> list[StoryPart]:
    return commands_in_text(parts, COLOUR_PATTERN)
def excessive_colours(parts: dict[str, StoryParts])-> list[StoryPart]:
    return excessive_commands(parts, COLOUR_PATTERN)

def pace_metadata(parts: dict[str, StoryParts])-> list[StoryPart]:
    return command_metadata(parts, META_PACE_PATTERN, "pace")
def pace_markers(parts: dict[str, StoryParts])-> list[StoryPart]:
    return commands_in_text(parts, PACE_PATTERN)
def excessive_pacing(parts: dict[str, StoryParts])-> list[StoryPart]:
    return excessive_commands(parts, PACE_PATTERN)

def effect_metadata(parts: dict[str, StoryParts])-> list[StoryPart]:
    return command_metadata(parts, META_EFFECT_PATTERN, "effect")
def effect_markers(parts: dict[str, StoryParts])-> list[StoryPart]:
    return commands_in_text(parts, EFFECT_PATTERN, allow_multiple=True)
def excessive_effects(parts: dict[str, StoryParts])-> list[StoryPart]:
    return excessive_commands(parts, EFFECT_PATTERN)

def pov_metadata(parts: dict[str, StoryParts])-> list[StoryPart]:
    return command_metadata(parts, META_POV_PATTERN, "pov")
def pov_markers(parts: dict[str, StoryParts])-> list[StoryPart]:
    return commands_in_text(parts, POV_PATTERN)
def excessive_povs(parts: dict[str, StoryParts])-> list[StoryPart]:
    return excessive_commands(parts, POV_PATTERN)

def message_metadata(parts: dict[str, StoryParts])-> list[StoryPart]:
    return command_metadata(parts, META_MESSAGE_PATTERN, "message-pov")
def message_markers(parts: dict[str, StoryParts])-> list[StoryPart]:
    return commands_in_text(parts, MESSAGE_PATTERN)

def message_title_metadata(parts: dict[str, StoryParts])-> list[StoryPart]:
    return command_metadata(parts, META_MESSAGE_TITLE_PATTERN, "message-title")
def message_title_markers(parts: dict[str, StoryParts])-> list[StoryPart]:
    return commands_in_text(parts, MESSAGE_TITLE_PATTERN)


def generate_json(parts: dict[str, StoryParts]) -> dict[str, Any]:
    output = {}
    for pathname, part in parts.items():
        output[pathname] = {
            "start": part.is_start,
            "end": part.is_end,
            "revisit": part.revisit,
            "variants": [
                {
                    "choices": v.choices,
                    "text": v.text
                } | ( {"pace": v.pace} if v.pace else {}
                ) | ( {"colour": v.colour} if v.colour else {}
                ) | ( {"effect": v.effect} if v.effect else {}
                ) | ( {"pov": v.pov} if v.pov else {}
                ) | ( {"messagepov": v.messagepov} if v.messagepov else {}
                ) | ( {"messagetitle": v.messagetitle} if v.messagetitle else {}
                )
                for v in part.variants
            ],
        }
    return output

def pretty_print_paths(value: Any, indent: int = 0, separators: list[str] | None = None):
    """
    Nicely prints StoryPart(s) or nested paths with custom separators per depth.
    """
    if separators is None:
        separators = [", ", "; ", " - "]

    def format_paths(val: Any, depth: int = 0) -> str:
        sep = separators[depth] if depth < len(separators) else separators[-1]

        if isinstance(val, StoryPart):
            return val.filepath.name
        elif isinstance(val, list):
            return sep.join(sorted(set(format_paths(v, depth + 1) for v in val)))
        else:
            return str(val)

    formatted = format_paths(value)
    print(" " * indent + f" - {formatted}")

def sucess(text: str) -> None:
    print(f"✅ {text}")

def warning(text: str) -> None:
    print(f"⚠️  {text}")

def failure(text: str) -> None:
    print(f"❌ {text}")

@dataclass
class StoryCheck:
    function: Callable[[dict[str, StoryParts]], list[StoryPart] | list[list[StoryPart]]]
    check_type: str
    required: bool = True
    raise_on_empty: bool = False

def main() -> int:
    print("Searching for story parts")
    parts = find_parts()

    if not parts:
        failure("Could not locate any story parts")
        return 1
    else:
        print(f"Story contains {len(parts)} distinct parts with "f"{len(all_nodes(parts))} total variations")

    print("Validating story pathways\n")

    checks = [
        StoryCheck(starting_nodes, "at least one starting part", raise_on_empty=True),
        StoryCheck(ending_nodes, "at least one ending part", raise_on_empty=True),
        StoryCheck(start_end_nodes, "parts that are both start and end points"),
        StoryCheck(empty_nodes, "parts without text"),
        StoryCheck(duplicate_nodes, "parts with duplicate text"),
        StoryCheck(invalid_links, "parts with missing or invalid links", False),

        StoryCheck(dead_ends, "parts with no choices"),
        StoryCheck(continuing_ends, "ending parts contain choices"),
        StoryCheck(noncontinuing_variants, "parts with choices on only some variants"),
        StoryCheck(revist_variants, "parts are revisitable while others aren't"),
        StoryCheck(single_choice, "parts with a single choice", False),
        StoryCheck(duplicate_choices, "parts with duplicate choice paths", False),

        StoryCheck(unreachable_nodes, "parts that cannot be reached"),
        StoryCheck(escapable_looping_nodes, "parts with looping choices", False),
        StoryCheck(innescapable_looping_nodes, "parts with innescapable looping choices", True),
        StoryCheck(abnormal_paths, "parts with very short comparable paths", False),

        StoryCheck(colour_metadata, "parts with valid colour options", True),
        StoryCheck(colour_markers, "parts with valid colour markers", True),
        StoryCheck(excessive_colours, "to many parts with non-unique colour markers", True),

        StoryCheck(pace_metadata, "parts with valid pace options", True),
        StoryCheck(pace_markers, "parts with valid pace markers", True),
        StoryCheck(excessive_pacing, "to many parts with non-unique pace markers", True),

        StoryCheck(effect_metadata, "parts with valid effect options", True),
        StoryCheck(effect_markers, "parts with valid effect markers", True),
        StoryCheck(excessive_effects, "to many parts with non-unique effect markers", True),

        StoryCheck(pov_metadata, "parts with valid pov options", True),
        StoryCheck(pov_markers, "parts with valid pov markers", True),
        StoryCheck(excessive_povs, "to many parts with non-unique pov markers", True),

        StoryCheck(message_metadata, "parts with valid message-pov options", True),
        StoryCheck(message_markers, "parts with valid message markers", True),

        StoryCheck(message_title_metadata, "parts with valid message-title options", True),
        StoryCheck(message_title_markers, "parts with valid message title markers", True),
    ]

    func_pad = 0
    for check in checks:
        if (thislen := len(check.function.__name__)) and thislen>func_pad:
            func_pad = thislen

    failures = 0
    warnings = 0
    check_count = len(checks)
    checkpad = len(str(check_count))
    for i, check in enumerate(checks):
        text = str(i+1).rjust(checkpad) + f"/{check_count} " + check.function.__name__.capitalize().ljust(func_pad) + f" - {check.check_type}"
        value = check.function(parts)
        if (not value and check.raise_on_empty) or(value and not check.raise_on_empty):

            if check.required:
                failure(text)
                failures += 1
            else:
                warning(text)
                warnings += 1

            if value:
                pretty_print_paths(value, 4+checkpad*2)
        else:
            sucess(text)

    if failures:
        return 1

    print("\nStory has passed all required steps")

    json = generate_json(parts)
    story_path = Path("src/story.json")
    story_path.write_text(dumps(json, indent=2))

if __name__ == "__main__":
    code = main()
    if code:
        print("---")
        failure("Could not generate story, fix and rerun")
    sys.exit(code)
