import { Component, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import type { QueryResponse } from '../core/api.types';

@Component({
  selector: 'app-workbench-page',
  template: `
    <h2>Query workbench</h2>
    <p class="page-sub">
      Ask in plain language or write SQL. Execution goes through the governed
      path: gold layer only, SELECT only, scan caps enforced. The grounding
      shows which concepts and joins the answer used.
    </p>

    <textarea rows="4" placeholder="e.g. what did Radarr grab last week"
              [value]="prompt()" (input)="prompt.set($any($event.target).value)"></textarea>
    <div class="row" style="margin: 10px 0">
      <button [disabled]="running() || !prompt().trim()" (click)="run()">Run</button>
      @for (ex of examples; track ex) {
        <button class="ghost" (click)="prompt.set(ex); run()">{{ ex }}</button>
      }
    </div>

    @if (running()) { <p class="muted">Querying…</p> }

    @if (error(); as err) {
      <div class="card" style="border-color: var(--bad)">
        <strong style="color: var(--bad)">Rejected / failed</strong>
        <p class="small">{{ err }}</p>
      </div>
    }

    @if (res(); as r) {
      <div class="grid cols3">
        <div class="card">
          <h4>Grounding</h4>
          <div class="row">
            @for (c of r.grounding.concepts; track c) { <span class="chip">{{ c }}</span> }
          </div>
          <div class="row" style="margin-top:8px">
            @for (j of r.grounding.joins; track j) { <span class="chip gray">{{ j }}</span> }
          </div>
          <p class="small muted" style="margin-top:8px">timezone: {{ r.grounding.timezone }}</p>
        </div>
        <div class="card" style="grid-column: span 2">
          <h4>Generated SQL</h4>
          <pre>{{ r.sql }}</pre>
        </div>
      </div>

      <h3>Results ({{ r.rows.length }} {{ r.truncated ? '(truncated)' : '' }})</h3>
      <table class="data">
        <thead>
          <tr>@for (c of r.columns; track c) { <th>{{ c }}</th> }</tr>
        </thead>
        <tbody>
          @for (row of r.rows; track $index) {
            <tr>@for (cell of row; track $index) { <td class="small">{{ cell }}</td> }</tr>
          } @empty {
            <tr><td [attr.colspan]="r.columns.length" class="muted">No rows.</td></tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class WorkbenchPage {
  private readonly api = inject(ApiService);
  readonly prompt = signal('');
  readonly res = signal<QueryResponse | null>(null);
  readonly error = signal<string | null>(null);
  readonly running = signal(false);

  readonly examples = [
    'what did Radarr grab last week',
    'how many parcels arrived this week',
    'which areas were most active today',
    'how often did ingest fail this month',
  ];

  run(): void {
    const p = this.prompt().trim();
    if (!p) return;
    this.running.set(true);
    this.error.set(null);
    this.res.set(null);
    void this.api
      .query({ prompt: p })
      .then((r) => this.res.set(r))
      .catch((e: Error) => this.error.set(e.message))
      .finally(() => this.running.set(false));
  }
}
