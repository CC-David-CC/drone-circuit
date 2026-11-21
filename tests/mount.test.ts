import { describe, expect, it } from "./test-shim.ts";
import { mount } from "../src/mount.ts";

interface FakeElement {
  dataset: Record<string, string>;
  children: FakeElement[];
  append(...children: FakeElement[]): void;
  replaceChildren(): void;
}

function fakeMake(): (tagName: string, className?: string) => HTMLElement {
  return (tagName: string, className?: string) => {
    void tagName; void className;
    const element: FakeElement = {
      dataset: {},
      children: [],
      append(...children: FakeElement[]) {
        this.children.push(...children);
      },
      replaceChildren() {
        this.children = [];
      },
    };
    return element as unknown as HTMLElement;
  };
}

describe("Drone Circuit mount contract", () => {
  it("returns the contract shape and disposes idempotently", () => {
    const result = mount({ ui: { make: fakeMake() } }, { autostart: false });
    expect(result.element).toBeDefined();
    result.dispose();
    result.dispose();
  });
});
