import { DOCUMENT } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SwUpdate } from "@angular/service-worker";

@Component({
  selector: "app-pwa-status",
  templateUrl: "./pwa-status.html",
  styleUrl: "./pwa-status.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaStatus {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly updates = inject(SwUpdate, { optional: true });

  readonly offline = signal(false);
  readonly updateReady = signal(false);
  readonly unrecoverable = signal(false);

  constructor() {
    const view = this.document.defaultView;
    if (view) {
      this.offline.set(view.navigator.onLine === false);
      const wentOnline = () => this.offline.set(false);
      const wentOffline = () => this.offline.set(true);
      view.addEventListener("online", wentOnline);
      view.addEventListener("offline", wentOffline);
      this.destroyRef.onDestroy(() => {
        view.removeEventListener("online", wentOnline);
        view.removeEventListener("offline", wentOffline);
      });
    }

    if (this.updates?.isEnabled) {
      this.updates.versionUpdates
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event) => {
          if (event.type === "VERSION_READY") {
            this.updateReady.set(true);
          }
        });
      this.updates.unrecoverable
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.unrecoverable.set(true));
    }
  }

  refresh(): void {
    // Reload all bundles together rather than mixing versions of lazy chunks.
    this.document.location.reload();
  }
}
