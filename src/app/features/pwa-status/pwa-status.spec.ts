import { TestBed } from "@angular/core/testing";
import { SwUpdate, VersionEvent } from "@angular/service-worker";
import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import { PwaStatus } from "./pwa-status";

describe("PWA status", () => {
  it("explains the limitations of offline access and clears on reconnect", () => {
    TestBed.configureTestingModule({ imports: [PwaStatus] });
    const fixture = TestBed.createComponent(PwaStatus);
    fixture.detectChanges();

    window.dispatchEvent(new Event("offline"));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const notice = root.querySelector(".offline-notice") as HTMLElement;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("uncached articles will not load");

    window.dispatchEvent(new Event("online"));
    fixture.detectChanges();
    expect(notice.hidden).toBe(true);
    fixture.destroy();
  });

  it("discloses possible cached news even while online", () => {
    TestBed.configureTestingModule({ imports: [PwaStatus] });
    const fixture = TestBed.createComponent(PwaStatus);
    window.dispatchEvent(new Event("online"));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain("News may be cached");
    expect(root.textContent).toContain("Refresh news");
    fixture.destroy();
  });

  it("shows a reload action only when a new worker version is ready", () => {
    const versions = new Subject<VersionEvent>();
    const unrecoverable = new Subject<{ reason: string }>();
    TestBed.configureTestingModule({
      imports: [PwaStatus],
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: true,
            versionUpdates: versions,
            unrecoverable,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PwaStatus);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const notice = root.querySelector(".update-notice") as HTMLElement;
    expect(notice.hidden).toBe(true);

    versions.next({
      type: "VERSION_DETECTED",
      version: { hash: "next" },
    });
    fixture.detectChanges();
    expect(notice.hidden).toBe(true);

    versions.next({
      type: "VERSION_READY",
      currentVersion: { hash: "old" },
      latestVersion: { hash: "next" },
    });
    fixture.detectChanges();
    expect(notice.hidden).toBe(false);
    expect(notice.querySelector("button")?.textContent).toContain("Reload");
    fixture.destroy();
  });

  it("warns when the service worker reports an unrecoverable cache", () => {
    const versions = new Subject<VersionEvent>();
    const broken = new Subject<{ reason: string }>();
    TestBed.configureTestingModule({
      imports: [PwaStatus],
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: true,
            versionUpdates: versions,
            unrecoverable: broken,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PwaStatus);
    fixture.detectChanges();
    broken.next({ reason: "a cached file is missing" });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const notice = root.querySelector(".broken-notice") as HTMLElement;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("offline cache cannot be recovered");
    fixture.destroy();
  });
});
