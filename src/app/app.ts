import { DOCUMENT } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { PwaStatus } from "./features/pwa-status/pwa-status";

@Component({
  selector: "app-root",
  imports: [RouterLink, RouterLinkActive, RouterOutlet, PwaStatus],
  templateUrl: "./app.html",
  styleUrl: "./app.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly document = inject(DOCUMENT);

  focusMain(): void {
    this.document.getElementById("main-content")?.focus();
  }
}
