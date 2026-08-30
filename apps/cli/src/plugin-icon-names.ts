import { PLUGIN_STARTER_FILES } from "@bb/templates/plugin-scaffold";

const ICON_REGISTRY_TARGET = "components/ui/icon-registry.ts";
const ICON_COMPONENT_TARGET = "components/ui/icon.tsx";
const EXTENDED_NAMES_BINDING = "EXTENDED_ICON_NAMES";
const CORE_MAP_BINDING = "CORE_ICON_MAP";

export interface IconVocabulary {
  core: string[];
  extended: string[];
  all: string[];
}

function starterFileContent(target: string): string {
  const file = PLUGIN_STARTER_FILES.find((entry) => entry.target === target);
  if (file === undefined) {
    throw new Error(
      `The plugin starter set no longer contains ${target}, which is where the icon names come from.`,
    );
  }
  return file.content;
}

function bindingLiteral(
  source: string,
  binding: string,
  open: "[" | "{",
): string {
  const close = open === "[" ? "]" : "}";
  const bindingAt = source.indexOf(binding);
  if (bindingAt === -1) {
    throw new Error(`${binding} is no longer declared in the starter file.`);
  }
  const from = source.indexOf(open, bindingAt);
  if (from === -1) {
    throw new Error(`${binding} is no longer assigned a ${open} literal.`);
  }
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const character = source[index];
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return source.slice(from, index + 1);
    }
  }
  throw new Error(`${binding}'s literal is unterminated.`);
}

export function extendedIconNames(): string[] {
  const literal = bindingLiteral(
    starterFileContent(ICON_REGISTRY_TARGET),
    EXTENDED_NAMES_BINDING,
    "[",
  );
  return [...literal.matchAll(/"([A-Za-z0-9]+)"/g)]
    .map(([, name]) => name as string)
    .sort();
}

export function coreIconNames(): string[] {
  const literal = bindingLiteral(
    starterFileContent(ICON_COMPONENT_TARGET),
    CORE_MAP_BINDING,
    "{",
  );
  return [...literal.matchAll(/^\s{2}([A-Za-z0-9]+):\s/gm)]
    .map(([, name]) => name as string)
    .sort();
}

export function iconVocabulary(): IconVocabulary {
  const core = coreIconNames();
  const extended = extendedIconNames();
  return { core, extended, all: [...new Set([...core, ...extended])].sort() };
}
