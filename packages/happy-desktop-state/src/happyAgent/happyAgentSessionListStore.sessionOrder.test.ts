import { expect, it, vi } from "vitest";
import type { MutationRejectedDelta } from "../happyAgentConnection/types.js";
import {
    happyAgentSessionListStoreCreate,
    type HappyAgentSessionListDeps,
} from "./happyAgentSessionListStore.js";
import type {
    HappyAgentProject,
    HappyAgentProjectId,
    HappyAgentSessionId,
    HappyAgentSessionSummary,
    HappyAgentWorktree,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

/**
 * A workspace's sessions stand in one order the host keeps for every client:
 * the phone lists a project's chats in it, and another window shows its strip
 * in it. Moving a session here asks the host to move it; the row moves at once
 * and keeps that place until the host has answered every move made in that
 * workspace and a read after the last answer has been applied. A refused move
 * puts the host's order back.
 */

const PROJECT = {
    id: "prj_one" as HappyAgentProjectId,
    name: "one",
    orderKey: "a0",
    path: "/work/one",
    displayPath: "~/one",
    kind: "regular",
    status: "ready",
    presence: "present",
} as HappyAgentProject;

const WORKTREE = {
    id: "wt_one" as HappyAgentWorktreeId,
    projectId: "prj_one" as HappyAgentProjectId,
    name: "feature",
    creatorAgentId: null,
    orderKey: "a0",
    path: "/work/one-feature",
    displayPath: "~/one-feature",
    status: "ready",
    presence: "present",
} as HappyAgentWorktree;

const session = (id: string, orderKey: string, worktree = false): HappyAgentSessionSummary =>
    ({
        id: id as HappyAgentSessionId,
        projectId: PROJECT.id,
        ...(worktree ? { worktreeId: WORKTREE.id } : {}),
        orderKey,
        cwd: worktree ? WORKTREE.path : PROJECT.path,
        displayCwd: worktree ? WORKTREE.displayPath : PROJECT.displayPath,
        providerId: "claude",
        modelId: "default",
        permissionMode: "default",
        status: "idle",
        activeSubagentCount: 0,
        pendingQuestion: false,
        title: id,
        createdAt: 1_763_999_000_000,
        updatedAt: 1_763_999_000_000,
    }) as unknown as HappyAgentSessionSummary;

/** Long enough for a catalog read the list was told about to be reconciled. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function listCreate(initial: readonly HappyAgentSessionSummary[]) {
    let mutation = 0;
    const reorderSession = vi.fn(
        (_sessionId: string, _afterId: string | null) => `mut_reorder_${String(++mutation)}`,
    );
    // The host's answer to each move, which a test gives when it wants to.
    const answers = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
    const sessionReorderWait = vi.fn(
        (mutationId: string) =>
            new Promise<void>((resolve, reject) => answers.set(mutationId, { resolve, reject })),
    );
    let hostSessions = initial;
    let catalogChanged = (): void => undefined;
    let rejected = (_rejection: MutationRejectedDelta): void => undefined;
    const deps = {
        client: {},
        catalogSource: {
            read: () =>
                Promise.resolve({
                    catalog: { bots: [], projects: [PROJECT], tasks: [], worktrees: [WORKTREE] },
                    sessions: hostSessions,
                    archivedSessions: [],
                }),
            subscribe: (listener: () => void) => {
                catalogChanged = listener;
                return () => undefined;
            },
            [Symbol.dispose]: () => undefined,
        },
        connectActions: { reorderSession, sessionReorderWait },
        connectMutationSubscribe: (listener: (rejection: MutationRejectedDelta) => void) => {
            rejected = listener;
            return () => undefined;
        },
    } as unknown as HappyAgentSessionListDeps;
    const list = happyAgentSessionListStoreCreate(deps);
    const unsubscribe = list.subscribe(() => undefined);
    const project = () => {
        const projects = list.get().projects;
        return projects.type === "ready"
            ? projects.value.find((candidate) => candidate.id === PROJECT.id)
            : undefined;
    };
    return {
        list,
        reorderSession,
        order: () => project()?.conversations.map((summary) => summary.id) ?? [],
        worktreeOrder: () =>
            project()
                ?.worktrees.find((worktree) => worktree.id === WORKTREE.id)
                ?.conversations.map((summary) => summary.id) ?? [],
        /** The host lists these sessions now, and says so. */
        async hostLists(next: readonly HappyAgentSessionSummary[]) {
            hostSessions = next;
            catalogChanged();
            await settle();
        },
        /**
         * The host takes a move and lists `next` from then on. Its answer is
         * adopted into the catalog, which announces it, before the move's own
         * wait settles, as the connection does.
         */
        async hostTakes(mutationId: string, next: readonly HappyAgentSessionSummary[]) {
            hostSessions = next;
            catalogChanged();
            answers.get(mutationId)!.resolve();
            await settle();
        },
        async hostRefuses(mutationId: string) {
            rejected({
                type: "mutation_rejected",
                action: "reorder_session",
                message: "Not in this workspace.",
                mutationId,
            });
            answers.get(mutationId)!.reject(new Error("Not in this workspace."));
            await settle();
        },
        dispose() {
            unsubscribe();
            list[Symbol.dispose]();
        },
    };
}

const ids = (sessionId: string, afterId: string | null) =>
    [sessionId as HappyAgentSessionId, afterId as HappyAgentSessionId | null] as const;

it("moves a session at once and keeps it there until the host has answered", async () => {
    const t = listCreate([session("s_a", "a0"), session("s_b", "a1"), session("s_c", "a2")]);
    await vi.waitFor(() => expect(t.order()).toEqual(["s_a", "s_b", "s_c"]));

    const moved = t.list.sessionReorder(...ids("s_c", null));
    expect(t.order()).toEqual(["s_c", "s_a", "s_b"]);
    expect(t.reorderSession).toHaveBeenLastCalledWith("s_c", null);

    // A read from before the host answered does not put the row back. The
    // session created meanwhile shows the read was applied.
    await t.hostLists([
        session("s_a", "a0"),
        session("s_b", "a1"),
        session("s_c", "a2"),
        session("s_d", "a3"),
    ]);
    expect(t.order()).toEqual(["s_c", "s_a", "s_b", "s_d"]);

    await t.hostTakes("mut_reorder_1", [
        session("s_a", "a0"),
        session("s_b", "a1"),
        session("s_c", "Zz"),
        session("s_d", "a3"),
    ]);
    await expect(moved).resolves.toBe(true);

    // From here the order is the host's, so another client's move shows too.
    await t.hostLists([
        session("s_a", "a1V"),
        session("s_b", "a1"),
        session("s_c", "Zz"),
        session("s_d", "a3"),
    ]);
    expect(t.order()).toEqual(["s_c", "s_b", "s_a", "s_d"]);
    t.dispose();
});

it("keeps a second move's order while the host has answered only the first", async () => {
    const t = listCreate([session("s_a", "a0"), session("s_b", "a1"), session("s_c", "a2")]);
    await vi.waitFor(() => expect(t.order()).toEqual(["s_a", "s_b", "s_c"]));

    void t.list.sessionReorder(...ids("s_c", null));
    void t.list.sessionReorder(...ids("s_a", null));
    expect(t.order()).toEqual(["s_a", "s_c", "s_b"]);

    // The host has taken the first move only: the row the second one moved
    // stays where the reader put it.
    await t.hostTakes("mut_reorder_1", [
        session("s_a", "a0"),
        session("s_b", "a1"),
        session("s_c", "Zz"),
        session("s_d", "a3"),
    ]);
    expect(t.order()).toEqual(["s_a", "s_c", "s_b", "s_d"]);

    await t.hostTakes("mut_reorder_2", [
        session("s_a", "Zy"),
        session("s_b", "a1"),
        session("s_c", "Zz"),
        session("s_d", "a3"),
    ]);
    await t.hostLists([
        session("s_a", "Zy"),
        session("s_b", "Zx"),
        session("s_c", "Zz"),
        session("s_d", "a3"),
    ]);
    expect(t.order()).toEqual(["s_b", "s_a", "s_c", "s_d"]);
    t.dispose();
});

it("keeps a session moved twice where the second move put it", async () => {
    const t = listCreate([session("s_a", "a0"), session("s_b", "a1"), session("s_c", "a2")]);
    await vi.waitFor(() => expect(t.order()).toEqual(["s_a", "s_b", "s_c"]));

    void t.list.sessionReorder(...ids("s_c", null));
    void t.list.sessionReorder(...ids("s_c", "s_a"));
    expect(t.order()).toEqual(["s_a", "s_c", "s_b"]);

    // The first answer gives s_c a new key, which is not the second answer.
    await t.hostTakes("mut_reorder_1", [
        session("s_a", "a0"),
        session("s_b", "a1"),
        session("s_c", "Zz"),
    ]);
    expect(t.order()).toEqual(["s_a", "s_c", "s_b"]);

    await t.hostTakes("mut_reorder_2", [
        session("s_a", "a0"),
        session("s_b", "a1"),
        session("s_c", "a0V"),
    ]);
    await t.hostLists([session("s_a", "a2"), session("s_b", "a1"), session("s_c", "a0V")]);
    expect(t.order()).toEqual(["s_c", "s_b", "s_a"]);
    t.dispose();
});

it("puts the host's order back when the host refuses a move, and says so", async () => {
    const t = listCreate([session("s_a", "a0"), session("s_b", "a1"), session("s_c", "a2")]);
    await vi.waitFor(() => expect(t.order()).toEqual(["s_a", "s_b", "s_c"]));

    const moved = t.list.sessionReorder(...ids("s_b", "s_c"));
    expect(t.order()).toEqual(["s_a", "s_c", "s_b"]);

    await t.hostRefuses("mut_reorder_1");
    await expect(moved).resolves.toBe(false);
    expect(t.order()).toEqual(["s_a", "s_b", "s_c"]);
    t.dispose();
});

it("asks nothing for a move that changes no order or names a session it cannot follow", async () => {
    const t = listCreate([
        session("s_a", "a0"),
        session("s_b", "a1"),
        session("w_a", "a0", true),
        session("w_b", "a1", true),
    ]);
    await vi.waitFor(() => expect(t.order()).toEqual(["s_a", "s_b"]));

    // Already where it would go.
    await expect(t.list.sessionReorder(...ids("s_b", "s_a"))).resolves.toBe(true);
    // After a session of another workspace, or after itself.
    await expect(t.list.sessionReorder(...ids("s_b", "w_a"))).resolves.toBe(false);
    await expect(t.list.sessionReorder(...ids("s_b", "s_b"))).resolves.toBe(false);
    expect(t.reorderSession).not.toHaveBeenCalled();
    expect(t.order()).toEqual(["s_a", "s_b"]);
    t.dispose();
});

it("moves a worktree's session among that worktree's sessions only", async () => {
    const t = listCreate([
        session("s_a", "a0"),
        session("s_b", "a1"),
        session("w_a", "a0", true),
        session("w_b", "a1", true),
    ]);
    await vi.waitFor(() => expect(t.worktreeOrder()).toEqual(["w_a", "w_b"]));

    void t.list.sessionReorder(...ids("w_b", null));
    expect(t.worktreeOrder()).toEqual(["w_b", "w_a"]);
    expect(t.order()).toEqual(["s_a", "s_b"]);
    expect(t.reorderSession).toHaveBeenLastCalledWith("w_b", null);
    t.dispose();
});
