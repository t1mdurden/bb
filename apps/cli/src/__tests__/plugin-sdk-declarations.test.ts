import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findDeclarations,
  findMembers,
  loadSdkDeclarationFiles,
  searchDeclarationNames,
} from "../plugin-sdk-declarations.js";

const ROOT_DECLARATIONS = `import Database from 'better-sqlite3';

/**
 * Thread reads and writes.
 */
interface ThreadsArea {
    archive(args: ThreadActionArgs): Promise<ThreadArchiveResult>;
    /** Every thread in a project, newest first. */
    list(args?: ThreadListArgs): Promise<ThreadListResult>;
    spawn(args: ThreadSpawnArgs): Promise<ThreadSpawnResult>;
}
interface ThreadListArgs {
    archived?: boolean;
    limit?: number;
    projectId?: string;
}
type ThreadListResult = ThreadListResponse;
declare const threadListResponseSchema: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
}>>;
declare function definePluginApp(setup: PluginAppSetup): PluginAppDefinition;
`;

const APP_DECLARATIONS = `interface PluginNavPanelProps {
    subPath: string;
}
`;

async function writeDeclarations(
  rootDir: string,
  relativeDirectory: string,
): Promise<void> {
  const directory = join(rootDir, relativeDirectory);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "bb-plugin-sdk.d.ts"),
    ROOT_DECLARATIONS,
    "utf8",
  );
  await writeFile(
    join(directory, "bb-plugin-sdk-app.d.ts"),
    APP_DECLARATIONS,
    "utf8",
  );
}

describe("plugin SDK declaration lookup", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "bb-plugin-api-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("reads the declarations an npm-layout plugin compiles against", async () => {
    await writeDeclarations(
      workDir,
      join("node_modules", "@get-bb", "plugin-sdk", "bundled-types"),
    );

    const files = await loadSdkDeclarationFiles(workDir);

    expect(files.map((file) => file.entry)).toEqual(["app", "root"]);
  });

  it("reads the vendored declarations a pre-npm plugin still carries", async () => {
    await writeDeclarations(workDir, "types");

    const files = await loadSdkDeclarationFiles(workDir);

    expect(files.map((file) => file.entry)).toEqual(["app", "root"]);
  });

  it("returns nothing outside a plugin directory", async () => {
    expect(await loadSdkDeclarationFiles(workDir)).toEqual([]);
  });

  it("prints an interface with its doc comment and nothing after it", async () => {
    await writeDeclarations(workDir, "types");
    const files = await loadSdkDeclarationFiles(workDir);

    const [found] = findDeclarations(files, "ThreadListArgs");

    expect(found?.kind).toBe("interface");
    expect(found?.entry).toBe("root");
    expect(found?.text).toBe(
      [
        "interface ThreadListArgs {",
        "    archived?: boolean;",
        "    limit?: number;",
        "    projectId?: string;",
        "}",
      ].join("\n"),
    );
  });

  it("ends a type alias at its semicolon rather than running on", async () => {
    await writeDeclarations(workDir, "types");
    const files = await loadSdkDeclarationFiles(workDir);

    const [found] = findDeclarations(files, "ThreadListResult");

    expect(found?.text).toBe("type ThreadListResult = ThreadListResponse;");
  });

  it("prints one member instead of the whole area interface", async () => {
    await writeDeclarations(workDir, "types");
    const files = await loadSdkDeclarationFiles(workDir);

    const [found] = findMembers(files, "ThreadsArea", "list");

    expect(found?.text).toBe(
      [
        "    /** Every thread in a project, newest first. */",
        "    list(args?: ThreadListArgs): Promise<ThreadListResult>;",
      ].join("\n"),
    );
    expect(found?.line).toBe(9);
  });

  it("keeps a member lookup from matching a longer name", async () => {
    await writeDeclarations(workDir, "types");
    const files = await loadSdkDeclarationFiles(workDir);

    expect(findMembers(files, "ThreadsArea", "spaw")).toEqual([]);
  });

  it("finds a declaration in every entrypoint it appears in", async () => {
    await writeDeclarations(workDir, "types");
    const files = await loadSdkDeclarationFiles(workDir);

    expect(
      findDeclarations(files, "PluginNavPanelProps").map(
        (found) => found.entry,
      ),
    ).toEqual(["app"]);
  });

  it("searches names case-insensitively, shortest first", async () => {
    await writeDeclarations(workDir, "types");
    const files = await loadSdkDeclarationFiles(workDir);

    expect(
      searchDeclarationNames(files, "threadlist").map((found) => found.name),
    ).toEqual([
      "ThreadListArgs",
      "ThreadListResult",
      "threadListResponseSchema",
    ]);
  });

  it("covers declare const and declare function, not just interfaces", async () => {
    await writeDeclarations(workDir, "types");
    const files = await loadSdkDeclarationFiles(workDir);

    expect(findDeclarations(files, "definePluginApp")[0]?.kind).toBe(
      "function",
    );
    expect(findDeclarations(files, "threadListResponseSchema")[0]?.kind).toBe(
      "const",
    );
  });
});
