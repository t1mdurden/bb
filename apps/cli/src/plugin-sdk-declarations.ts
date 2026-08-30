import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DECLARATION_DIRECTORIES = [
  join("node_modules", "@get-bb", "plugin-sdk", "bundled-types"),
  "types",
] as const;

const DECLARATION_KINDS = [
  "interface",
  "type",
  "class",
  "function",
  "const",
  "let",
  "var",
  "enum",
  "namespace",
] as const;

const DECLARATION_START = new RegExp(
  `^(?:export\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(${DECLARATION_KINDS.join("|")})\\s+([A-Za-z_$][\\w$]*)`,
);

const OPENING_BRACKETS = new Set(["{", "(", "["]);
const CLOSING_BRACKETS = new Set(["}", ")", "]"]);

export interface SdkDeclarationFile {
  entry: string;
  fileName: string;
  text: string;
}

export interface SdkDeclaration {
  entry: string;
  name: string;
  kind: string;
  line: number;
  text: string;
}

export interface SdkMember {
  entry: string;
  owner: string;
  member: string;
  line: number;
  text: string;
}

function entryNameOf(fileName: string): string | null {
  if (fileName === "bb-plugin-sdk.d.ts") return "root";
  const match = /^bb-plugin-sdk-(.+)\.d\.ts$/.exec(fileName);
  return match?.[1] ?? null;
}

export async function loadSdkDeclarationFiles(
  rootDir: string,
): Promise<SdkDeclarationFile[]> {
  for (const relativeDirectory of DECLARATION_DIRECTORIES) {
    const directory = join(rootDir, relativeDirectory);
    let fileNames: string[];
    try {
      fileNames = await readdir(directory);
    } catch {
      continue;
    }
    const files: SdkDeclarationFile[] = [];
    for (const fileName of fileNames.sort()) {
      const entry = entryNameOf(fileName);
      if (entry === null) continue;
      files.push({
        entry,
        fileName,
        text: await readFile(join(directory, fileName), "utf8"),
      });
    }
    if (files.length > 0) return files;
  }
  return [];
}

function docCommentAbove(lines: readonly string[], line: number): string[] {
  let end = line - 1;
  while (end >= 0 && lines[end]?.trim() === "") end -= 1;
  if (end < 0 || lines[end]?.trim().endsWith("*/") !== true) return [];
  let start = end;
  while (start >= 0 && lines[start]?.trim().startsWith("/*") !== true) {
    start -= 1;
  }
  return start < 0 ? [] : lines.slice(start, end + 1);
}

function declarationBody(lines: readonly string[], start: number): string[] {
  let depth = 0;
  let sawBrace = false;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const character of line) {
      if (OPENING_BRACKETS.has(character)) {
        depth += 1;
        if (character === "{") sawBrace = true;
      } else if (CLOSING_BRACKETS.has(character)) {
        depth -= 1;
      }
    }
    if (depth <= 0 && (sawBrace || line.trimEnd().endsWith(";"))) {
      return lines.slice(start, index + 1);
    }
  }
  return lines.slice(start);
}

function declarationsIn(file: SdkDeclarationFile): SdkDeclaration[] {
  const lines = file.text.split("\n");
  const found: SdkDeclaration[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = DECLARATION_START.exec(lines[index] ?? "");
    if (match === null) continue;
    const [, kind, name] = match;
    if (kind === undefined || name === undefined) continue;
    found.push({
      entry: file.entry,
      name,
      kind,
      line: index + 1,
      text: [...docCommentAbove(lines, index), ...declarationBody(lines, index)]
        .join("\n")
        .trimEnd(),
    });
  }
  return found;
}

export function allDeclarations(
  files: readonly SdkDeclarationFile[],
): SdkDeclaration[] {
  return files.flatMap(declarationsIn);
}

export function findDeclarations(
  files: readonly SdkDeclarationFile[],
  name: string,
): SdkDeclaration[] {
  return allDeclarations(files).filter(
    (declaration) => declaration.name === name,
  );
}

export function findMembers(
  files: readonly SdkDeclarationFile[],
  ownerName: string,
  memberName: string,
): SdkMember[] {
  const members: SdkMember[] = [];
  const memberStart = new RegExp(
    `^\\s*(?:readonly\\s+)?${memberName}(?:\\?)?\\s*[(<:]`,
  );
  for (const owner of findDeclarations(files, ownerName)) {
    const lines = owner.text.split("\n");
    const bodyStart = lines.findIndex((line) => DECLARATION_START.test(line));
    for (let index = 0; index < lines.length; index += 1) {
      if (!memberStart.test(lines[index] ?? "")) continue;
      members.push({
        entry: owner.entry,
        owner: owner.name,
        member: memberName,
        line: owner.line + index - Math.max(bodyStart, 0),
        text: [
          ...docCommentAbove(lines, index),
          ...declarationBody(lines, index),
        ]
          .join("\n")
          .trimEnd(),
      });
    }
  }
  return members;
}

export function searchDeclarationNames(
  files: readonly SdkDeclarationFile[],
  query: string,
): SdkDeclaration[] {
  const needle = query.toLowerCase();
  const seen = new Set<string>();
  return allDeclarations(files)
    .filter((declaration) => declaration.name.toLowerCase().includes(needle))
    .filter((declaration) => {
      const key = `${declaration.entry}:${declaration.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        left.name.length - right.name.length ||
        left.name.localeCompare(right.name),
    );
}
