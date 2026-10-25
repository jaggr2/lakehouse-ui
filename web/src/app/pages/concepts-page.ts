import { Component, inject, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import type { Concept } from '../core/api.types';

@Component({
  selector: 'app-concepts-page',
  imports: [RouterLink, JsonPipe],
  template: `
    <h2>Concept registry</h2>
    <p class="page-sub">
      The formal meaning layer: every mapped column inherits these semantics —
      units, grain, timezone. This is what keeps generated queries exact.
    </p>

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else {
      <table class="data">
        <thead>
          <tr><th>Concept</th><th>Synonyms</th><th>Unit / grain</th><th>Mapped columns</th></tr>
        </thead>
        <tbody>
          @for (c of concepts(); track c.id) {
            <tr>
              <td>
                <strong>{{ c.label }}</strong><br>
                <span class="mono small muted">{{ c.id }}</span>
              </td>
              <td>
                @for (s of c.synonyms; track s) { <span class="chip gray">{{ s }}</span>&nbsp; }
              </td>
              <td class="small">
                @if (c.unit | json; as unit) {
                  @if (unit !== '{}') { <span class="chip">{{ unit }}</span><br> }
                }
                <span class="muted">{{ c.grain }}</span>
              </td>
              <td>
                @for (col of c.columns; track col.table + col.column) {
                  <a class="chip" [routerLink]="['/table', col.table]">
                    {{ col.table }}.{{ col.column }} <span class="muted">({{ col.role }})</span>
                  </a>
                } @empty { <span class="muted small">unmapped</span> }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class ConceptsPage {
  private readonly api = inject(ApiService);
  readonly concepts = signal<Concept[]>([]);
  readonly loading = signal(true);

  constructor() {
    void this.api.concepts().then((c) => {
      this.concepts.set(c);
      this.loading.set(false);
    });
  }
}
