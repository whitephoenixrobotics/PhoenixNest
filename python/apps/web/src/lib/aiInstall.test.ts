import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the network layer so the store logic is tested in isolation.
vi.mock("@/lib/api", () => ({
  aiPull: vi.fn(),
  aiSelectModel: vi.fn(),
}));

import { aiPull, aiSelectModel } from "@/lib/api";
import {
  startInstall,
  cancelInstall,
  clearInstallError,
  getInstallState,
} from "@/lib/aiInstall";

beforeEach(() => {
  vi.clearAllMocks();
  clearInstallError();
});

describe("aiInstall store", () => {
  it("exposes live progress, then clears and selects the model on success", async () => {
    let midFlight: ReturnType<typeof getInstallState> | null = null;
    vi.mocked(aiPull).mockImplementation(async (_name, onProgress) => {
      onProgress("กำลังดาวน์โหลด", 42);
      midFlight = getInstallState(); // captured while the pull is running
    });
    vi.mocked(aiSelectModel).mockResolvedValue(undefined);

    const ok = await startInstall("m");

    expect(ok).toBe(true);
    expect(midFlight!).toMatchObject({ name: "m", pct: 42 });
    expect(aiSelectModel).toHaveBeenCalledWith("ollama:m");
    expect(getInstallState()).toMatchObject({ name: null, error: null });
  });

  it("surfaces the error and does not select on failure", async () => {
    vi.mocked(aiPull).mockRejectedValue(new Error("network down"));

    const ok = await startInstall("m");

    expect(ok).toBe(false);
    expect(getInstallState().error).toBe("network down");
    expect(aiSelectModel).not.toHaveBeenCalled();
  });

  it("treats an aborted pull as a cancel, not an error", async () => {
    vi.mocked(aiPull).mockImplementation(
      (_name, _onProgress, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        }),
    );

    const pending = startInstall("m");
    expect(getInstallState().name).toBe("m"); // in progress
    cancelInstall();
    const ok = await pending;

    expect(ok).toBe(false);
    expect(getInstallState()).toMatchObject({ name: null, error: null });
  });

  it("ignores a second install while one is already running", async () => {
    let release!: () => void;
    vi.mocked(aiPull).mockImplementation(
      () => new Promise<void>((r) => (release = r)),
    );
    vi.mocked(aiSelectModel).mockResolvedValue(undefined);

    const first = startInstall("a");
    const second = await startInstall("b"); // must bail immediately

    expect(second).toBe(false);
    expect(getInstallState().name).toBe("a");

    release();
    await first;
    expect(getInstallState().name).toBeNull();
  });
});
