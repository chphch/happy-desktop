import { afterEach, expect, it, vi } from "vitest";
import { connectHappyAgent } from "./connectHappyAgent.js";
import type { HappyAgentConnection } from "./types.js";
import {
    fakeHappyAgentDaemonCreate,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";

/* The daemon keeps one order of a workspace's sessions for every client, and a
 * move names the session it goes after, taking every move made before it as
 * done. So moves reach the daemon one at a time, in the order they were made,
 * and a move placed after a session still being created waits for that
 * creation. */

const openConnections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
});

function harnessOpen(daemon: FakeHappyAgentDaemon) {
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
        onMutationRejected: () => undefined,
    });
    openConnections.push(connection);
    const watch = { projects: 0 };
    connection.connectGroups({
        onChange(projects) {
            watch.projects = projects.length;
        },
        onError: () => undefined,
    });
    return { connection, watch };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const moved = (daemon: FakeHappyAgentDaemon) =>
    daemon.calls.filter((call) => call.method === "reorderAgent").map((call) => call.args[0]);

it("sends session moves one at a time, in the order they were made", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed();
    const a = daemon.agentSeed(project.id);
    daemon.agentSeed(project.id);
    const c = daemon.agentSeed(project.id);
    const { connection, watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(watch.projects).toBe(1));

    const resume = daemon.pause("reorderAgent");
    const first = connection.reorderSession(c.id, null);
    const second = connection.reorderSession(a.id, null);
    await vi.waitFor(() => expect(moved(daemon)).toEqual([c.id]));
    // The second move waits for the first to be answered, though it moves
    // another session.
    await settle();
    expect(moved(daemon)).toEqual([c.id]);

    resume();
    await vi.waitFor(() => expect(moved(daemon)).toEqual([c.id, a.id]));
    await expect(connection.sessionReorderWait(first)).resolves.toBeUndefined();
    await expect(connection.sessionReorderWait(second)).resolves.toBeUndefined();
});

it("waits for the session a move goes after to be created", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed();
    const b = daemon.agentSeed(project.id);
    const { connection, watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(watch.projects).toBe(1));

    const resume = daemon.pause("createAgent");
    const created = connection.createSession({
        cwd: "/work/demo",
        projectId: project.id,
        workspaceId: project.id,
    });
    connection.reorderSession(b.id, created);
    await settle();
    expect(moved(daemon)).toEqual([]);

    resume();
    await vi.waitFor(() => expect(moved(daemon)).toEqual([b.id]));
    const call = daemon.calls.find((entry) => entry.method === "reorderAgent")!;
    expect(call.args[1]).toMatchObject({ afterId: created });
});

it("tells whether the daemon took a move", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed();
    const a = daemon.agentSeed(project.id);
    daemon.agentSeed(project.id);
    const { connection, watch } = harnessOpen(daemon);
    await vi.waitFor(() => expect(watch.projects).toBe(1));

    daemon.failOnce("reorderAgent", new Error("The agent is not in that workspace."));
    const refused = connection.reorderSession(a.id, null);
    await expect(connection.sessionReorderWait(refused)).rejects.toThrow();

    const taken = connection.reorderSession(a.id, null);
    await expect(connection.sessionReorderWait(taken)).resolves.toBeUndefined();
});
