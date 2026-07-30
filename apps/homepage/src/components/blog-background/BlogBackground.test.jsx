// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BlogBackground from "./BlogBackground";

describe("BlogBackground", () => {
  it("renders a static lightweight background without persistent animation layers", () => {
    const { container } = render(<BlogBackground />);
    const background = container.querySelector(".workstation-blog-background");

    expect(background).not.toBeNull();
    expect(background.children).toHaveLength(2);
    expect(background.querySelector("canvas")).toBeNull();
    expect(background.querySelector("[style*='animation']")).toBeNull();
  });
});
