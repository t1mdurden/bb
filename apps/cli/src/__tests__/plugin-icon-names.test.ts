import { describe, expect, it } from "vitest";
import { PLUGIN_STARTER_FILES } from "@bb/templates/plugin-scaffold";
import {
  coreIconNames,
  extendedIconNames,
  iconVocabulary,
} from "../plugin-icon-names.js";

function starterFileContent(target: string): string {
  const file = PLUGIN_STARTER_FILES.find((entry) => entry.target === target);
  expect(
    file,
    `${target} is missing from the plugin starter set`,
  ).toBeDefined();
  return file?.content ?? "";
}

describe("plugin icon vocabulary", () => {
  it("reads the core names from the icon component every scaffold vendors", () => {
    const core = coreIconNames();

    expect(core).toContain("Zap");
    expect(core).toContain("ListTodo");
    expect(core.length).toBeGreaterThan(20);
  });

  it("reads the lazily loaded names from the extended registry", () => {
    const extended = extendedIconNames();

    expect(extended).toContain("Columns2");
    expect(extended).toContain("GitBranch");
    expect(extended.length).toBeGreaterThan(50);
  });

  it("names every icon the vendored component can actually render", () => {
    const iconSource = starterFileContent("components/ui/icon.tsx");
    const registrySource = starterFileContent("components/ui/icon-registry.ts");

    for (const name of coreIconNames()) {
      expect(iconSource, `core icon "${name}"`).toContain(`  ${name}: `);
    }
    for (const name of extendedIconNames()) {
      expect(registrySource, `extended icon "${name}"`).toContain(`"${name}"`);
    }
  });

  it("returns one sorted, deduplicated list to print", () => {
    const { core, extended, all } = iconVocabulary();

    expect(all).toEqual([...all].sort());
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set([...core, ...extended]));
  });

  it("uses names a manifest and a slot registration can carry verbatim", () => {
    for (const name of iconVocabulary().all) {
      expect(name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    }
  });
});
