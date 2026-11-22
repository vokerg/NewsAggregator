import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { NewsItem } from "../../core/models/news";

@Component({
  selector: "app-news-card",
  imports: [DatePipe],
  templateUrl: "./news-card.html",
  styleUrl: "./news-card.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsCard {
  readonly item = input.required<NewsItem>();
}
