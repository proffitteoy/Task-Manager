// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useSWRMock } = vi.hoisted(() => ({
  useSWRMock: vi.fn(),
}));

vi.mock("swr", () => ({ default: useSWRMock }));
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="music-player" />,
}));
vi.mock("components/blog-background/BlogBackground", () => ({
  default: () => <div data-testid="blog-background" />,
}));

import WorkstationDashboard from "./dashboard";

const dashboardData = {
  tasks: [],
  projects: [],
  timer: { running: false, paused: false },
  summary: {},
  review: null,
  settings: {},
};

describe("WorkstationDashboard runtime polling", () => {
  let visibilityState;

  beforeEach(() => {
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    window.history.replaceState(null, "", "/");
    localStorage.clear();
    useSWRMock.mockReset();
    useSWRMock.mockImplementation((key) => ({
      data: key === "/api/workstation/widgets/workstation" ? dashboardData : undefined,
      error: null,
      isLoading: false,
      mutate: vi.fn(),
    }));
  });

  it("mounts only the active panel and unmounts the music visualizer when leaving music", () => {
    const { container } = render(<WorkstationDashboard />);

    expect(screen.queryByTestId("music-player")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    expect(container.querySelector(".workstation-tab-panel .hidden")).toBeNull();

    fireEvent.click(document.getElementById("workstation-tab-music"));
    expect(screen.getByTestId("music-player")).toBeInTheDocument();
    expect(container.querySelector(".workstation-music-tab")).not.toBeNull();

    fireEvent.click(document.getElementById("workstation-tab-stats"));
    expect(screen.queryByTestId("music-player")).not.toBeInTheDocument();
    expect(container.querySelector(".workstation-music-tab")).toBeNull();
  });

  it("samples resources only on the visible activity tab and pauses polling while hidden", () => {
    render(<WorkstationDashboard />);

    let aggregateCall = latestCallForKey("/api/workstation/widgets/workstation");
    let resourceCall = latestResourceCall();
    expect(aggregateCall[2]).toEqual(
      expect.objectContaining({
        refreshInterval: 30_000,
        refreshWhenHidden: false,
        refreshWhenOffline: false,
      })
    );
    expect(aggregateCall[2].isPaused()).toBe(false);
    expect(resourceCall[0]).toBeNull();
    expect(resourceCall[2].refreshInterval).toBe(15_000);

    fireEvent.click(document.getElementById("workstation-tab-activity"));
    resourceCall = latestResourceCall();
    expect(resourceCall[0]).toBe("/api/workstation/system-resources");

    act(() => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });

    aggregateCall = latestCallForKey("/api/workstation/widgets/workstation");
    resourceCall = latestResourceCall();
    expect(aggregateCall[2].refreshInterval).toBe(0);
    expect(aggregateCall[2].isPaused()).toBe(true);
    expect(resourceCall[0]).toBeNull();
  });
});

function latestCallForKey(key) {
  return [...useSWRMock.mock.calls].reverse().find(([candidate]) => candidate === key);
}

function latestResourceCall() {
  return [...useSWRMock.mock.calls].reverse().find(([, , options]) => options?.refreshInterval === 15_000);
}
