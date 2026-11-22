import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { describe, expect, it } from "vitest";
import { App } from "./app";

describe("App shell", () => {
  it("renders main navigation and a keyboard skip link", () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const skip = root.querySelector("button.skip-link") as HTMLButtonElement;
    skip.click();
    expect(document.activeElement).toBe(root.querySelector("main"));
    expect(root.querySelector("main")?.id).toBe("main-content");
    expect(root.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Main navigation",
    );
  });
});
