import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the environment command bar with real safety context", () => {
    render(<App />);

    const commandBar = screen.getByTestId("environment-command-bar");
    expect(commandBar).toHaveTextContent("ENVIRONMENT CONTROL");
    expect(commandBar).toHaveTextContent("本地优先");
    expect(commandBar).toHaveTextContent("只读预检");
    expect(screen.getByRole("button", { name: "开始配置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看诊断" })).toBeInTheDocument();
  });
});
