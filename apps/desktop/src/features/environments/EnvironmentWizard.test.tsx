import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EnvironmentWizard } from "./EnvironmentWizard";
import type { ProbeResult } from "./environmentApi";
import {
  blockingProbe,
  clearProbe,
  readyProfile
} from "./environmentTestFixtures";

describe("EnvironmentWizard", () => {
  it("renders a desktop workspace with a dedicated status rail", () => {
    render(<EnvironmentWizard initialProfile={readyProfile} />);

    expect(screen.getByTestId("environment-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("environment-form-panel")).toBeInTheDocument();
    expect(screen.getByTestId("environment-status-rail")).toBeInTheDocument();
  });

  it("marks the active and completed steps without relying only on color", () => {
    render(<EnvironmentWizard initialProfile={readyProfile} initialStep={3} />);

    const steps = screen.getByRole("list", { name: "环境绑定步骤" });

    expect(within(steps).getByText("目录映射").closest("li")).toHaveAttribute(
      "aria-current",
      "step"
    );
    expect(within(steps).getByText("基础信息").closest("li")).toHaveAttribute(
      "data-state",
      "complete"
    );
    expect(within(steps).getByText("检查并保存").closest("li")).toHaveAttribute(
      "data-state",
      "upcoming"
    );
  });

  it("disables save while a blocking diagnostic exists", () => {
    render(
      <EnvironmentWizard
        initialProbe={blockingProbe}
        initialProfile={readyProfile}
        initialStep={4}
      />
    );

    expect(screen.getByRole("button", { name: "保存环境" })).toBeDisabled();
  });

  it("walks through four steps, probes, and saves a valid profile", async () => {
    const api = {
      listEnvironments: vi.fn().mockResolvedValue([]),
      probeEnvironment: vi.fn().mockResolvedValue(clearProbe),
      saveEnvironment: vi.fn().mockResolvedValue(clearProbe)
    };

    render(<EnvironmentWizard api={api} initialProfile={readyProfile} />);

    expect(screen.getByRole("heading", { name: "基础信息" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "Python 与 API" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "目录映射" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "检查并保存" })).toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: "保存环境" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "检查环境" }));
    await waitFor(() => expect(api.probeEnvironment).toHaveBeenCalledWith(readyProfile));
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);
    await waitFor(() => expect(api.saveEnvironment).toHaveBeenCalledWith(readyProfile));
    expect(screen.getByText("环境已保存")).toBeInTheDocument();
  });

  it("locks duplicate actions while a probe is pending", async () => {
    let resolveProbe!: (value: ProbeResult) => void;
    const pendingProbe = new Promise<ProbeResult>((resolve) => {
      resolveProbe = resolve;
    });
    const api = {
      listEnvironments: vi.fn().mockResolvedValue([]),
      probeEnvironment: vi.fn().mockReturnValue(pendingProbe),
      saveEnvironment: vi.fn()
    };

    render(
      <EnvironmentWizard
        api={api}
        initialProfile={readyProfile}
        initialStep={4}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "检查环境" }));

    expect(screen.getByRole("button", { name: "检查中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存环境" })).toBeDisabled();

    resolveProbe(clearProbe);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存环境" })).toBeEnabled()
    );
  });

  it("exposes the current step and request state for reduced-motion-safe styling", () => {
    render(<EnvironmentWizard initialProfile={readyProfile} initialStep={2} />);

    expect(screen.getByTestId("environment-workspace")).toHaveAttribute(
      "data-step",
      "2"
    );
    expect(screen.getByTestId("environment-workspace")).toHaveAttribute(
      "data-request-state",
      "idle"
    );
  });

  it("shows a non-color readiness label before and after validation", async () => {
    const api = {
      listEnvironments: vi.fn().mockResolvedValue([]),
      probeEnvironment: vi.fn().mockResolvedValue(clearProbe),
      saveEnvironment: vi.fn().mockResolvedValue(clearProbe)
    };

    render(
      <EnvironmentWizard
        api={api}
        initialProfile={readyProfile}
        initialStep={4}
      />
    );

    expect(screen.getByRole("status", { name: "环境保存状态" })).toHaveTextContent(
      "待检查"
    );
    fireEvent.click(screen.getByRole("button", { name: "检查环境" }));
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "环境保存状态" })).toHaveTextContent(
        "可以保存"
      )
    );
  });
});
