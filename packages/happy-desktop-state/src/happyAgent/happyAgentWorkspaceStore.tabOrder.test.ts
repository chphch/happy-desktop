import { expect, it, vi } from "vitest";
import type { HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type { HappyAgentGroupId, HappyAgentSessionId } from "./happyAgentTypes.js";
import { happyAgentWorkspaceMemoryStoreCreate } from "./happyAgentWorkspaceMemory.js";
import { happyAgentWorkspaceStoreCreate } from "./happyAgentWorkspaceStore.js";

/**
 * A project's strip holds its sessions and the files opened beside them. The
 * sessions stand in the order the daemon keeps for every client, so the strip
 * shows a move another client made; where the files stand is this window's
 * own. Dragging a session past another one asks the daemon to move it, after
 * the session now before it.
 */

const GROUP = "prj_one" as HappyAgentGroupId;
const FILE = `${GROUP}\u0000notes.md`;

function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) =>
            property === "then"
                ? undefined
                : property === Symbol.iterator
                  ? function* () {}
                  : inert(),
        apply: () => undefined,
    });
}

function store(initial: readonly string[]) {
    let order = [...initial];
    const project = () => ({
        id: GROUP,
        kind: "regular",
        name: "one",
        conversations: order.map((id) => ({
            id,
            title: id,
            subtitle: "~/one",
            updatedAt: 1_763_999_000_000,
            activity: "idle" as const,
            participants: [],
        })),
        worktrees: [],
    });
    let list = {
        projects: { type: "ready", value: [project()] },
        bots: [],
        botsCreating: [],
        archivedSessions: [],
        catalogRevision: 1,
        sessionCreateFailures: new Map(),
        worktreeCreateFailures: new Map(),
        projectCreateFailures: new Map(),
        subtaskFailures: new Map(),
        tasks: [],
        taskDirectory: [],
        tasksArchived: [],
        tasksJoining: new Set(),
        taskFailures: new Map(),
    } as unknown as HappyAgentSessionListSnapshot;
    const listeners = new Set<() => void>();
    /** The list now holds the sessions in this order, as after the daemon's answer. */
    const listOrders = (next: readonly string[]) => {
        order = [...next];
        list = {
            ...list,
            projects: { type: "ready", value: [project()] },
            catalogRevision: list.catalogRevision + 1,
        } as unknown as HappyAgentSessionListSnapshot;
        for (const listener of listeners) listener();
    };
    // The list moves the row at once, the way the real one does, and answers
    // whether the daemon took the move.
    const sessionReorder = vi.fn((sessionId: string, afterId: string | null) => {
        const remaining = order.filter((id) => id !== sessionId);
        const at = afterId === null ? 0 : remaining.indexOf(afterId) + 1;
        listOrders([...remaining.slice(0, at), sessionId, ...remaining.slice(at)]);
        return Promise.resolve(true);
    });
    const loading = { type: "loading" } as const;
    const client = new Proxy(
        {
            memory: happyAgentWorkspaceMemoryStoreCreate(),
            models: {
                get: () => loading,
                load: () => new Promise(() => undefined),
                subscribe: () => () => undefined,
            },
            sessionList: () =>
                new Proxy(
                    {
                        get: () => list,
                        sessionReorder,
                        subscribe: (listener: () => void) => {
                            listeners.add(listener);
                            return () => listeners.delete(listener);
                        },
                    },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            chat: () => new Promise(() => undefined),
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
            workspaceFileRead: () => new Promise(() => undefined),
            workspaceFileBytesRead: () => new Promise(() => undefined),
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client, { output: () => undefined });
    const unsubscribe = workspace.subscribe(() => undefined);
    workspace.conversationOpen(initial[0] as HappyAgentSessionId, GROUP);
    return { workspace, unsubscribe, sessionReorder, listOrders };
}

it("keeps a file where the reader put it while the sessions follow the list's order", () => {
    const { workspace, unsubscribe, sessionReorder, listOrders } = store(["s_a", "s_b", "s_c"]);
    workspace.fileOpen(GROUP, "notes.md", "file");
    expect(workspace.get().tabOrder).toEqual(["s_a", "s_b", "s_c", FILE]);

    // Where a file stands is this window's own: nothing is asked of the daemon.
    workspace.tabReorder(FILE, "s_a");
    expect(workspace.get().tabOrder).toEqual(["s_a", FILE, "s_b", "s_c"]);
    expect(sessionReorder).not.toHaveBeenCalled();

    // Another client puts s_c first. The sessions take the list's order in
    // the places sessions hold, and the file keeps its place.
    listOrders(["s_c", "s_a", "s_b"]);
    expect(workspace.get().tabOrder).toEqual(["s_c", FILE, "s_a", "s_b"]);
    unsubscribe();
});

it("asks the daemon to move a session dragged past another, after the session now before it", () => {
    const { workspace, unsubscribe, sessionReorder } = store(["s_a", "s_b", "s_c"]);
    workspace.fileOpen(GROUP, "notes.md", "file");
    workspace.tabReorder(FILE, "s_a");

    workspace.tabReorder("s_c", FILE);
    expect(sessionReorder).toHaveBeenLastCalledWith("s_c", "s_a");
    expect(workspace.get().tabOrder).toEqual(["s_a", FILE, "s_c", "s_b"]);

    workspace.tabReorder("s_b", null);
    expect(sessionReorder).toHaveBeenLastCalledWith("s_b", null);
    expect(workspace.get().tabOrder).toEqual(["s_b", "s_a", FILE, "s_c"]);
    expect(sessionReorder).toHaveBeenCalledTimes(2);
    unsubscribe();
});

it("puts the strip back as it was, files included, when the daemon refuses a move", async () => {
    const { workspace, unsubscribe, sessionReorder, listOrders } = store(["s_a", "s_b", "s_c"]);
    workspace.fileOpen(GROUP, "notes.md", "file");
    workspace.tabReorder(FILE, "s_a");
    expect(workspace.get().tabOrder).toEqual(["s_a", FILE, "s_b", "s_c"]);

    // The list moves the row, then the daemon refuses and the list puts its
    // own order back.
    sessionReorder.mockImplementationOnce((sessionId: string) => {
        listOrders([sessionId, "s_a", "s_b"]);
        return Promise.resolve().then(() => {
            listOrders(["s_a", "s_b", "s_c"]);
            return false;
        });
    });
    workspace.tabReorder("s_c", null);
    expect(workspace.get().tabOrder).toEqual(["s_c", "s_a", FILE, "s_b"]);

    await vi.waitFor(() => expect(workspace.get().tabOrder).toEqual(["s_a", FILE, "s_b", "s_c"]));
    unsubscribe();
});

it("asks nothing when a session passes only a file", () => {
    const { workspace, unsubscribe, sessionReorder } = store(["s_a", "s_b"]);
    workspace.fileOpen(GROUP, "notes.md", "file");
    workspace.tabReorder(FILE, "s_a");
    expect(workspace.get().tabOrder).toEqual(["s_a", FILE, "s_b"]);

    workspace.tabReorder("s_b", "s_a");
    expect(workspace.get().tabOrder).toEqual(["s_a", "s_b", FILE]);
    expect(sessionReorder).not.toHaveBeenCalled();
    unsubscribe();
});
