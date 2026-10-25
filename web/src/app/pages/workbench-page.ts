import { Component, inject, signal } from '@angular/core';
import { PercentPipe } from '@angular/common';
import { ApiService } from '../core/api.service';
import type { EvalReport, QueryResponse } from '../core/api.types';

@Component({
  selector: 'app-workbench-page',
  imports: [PercentPipe],
  template: `
    <h2>Query workbench</h2>
    <p class="page-sub">
      Ask in plain language or write SQL. NL→SQL is grounded in the semantic
      graph (concepts, joins, timezone) and executed through the governed
      path: gold layer only, SELECT only, scan caps enforced.
    </p>

    <textarea rows="4" placeholder="e.g. what did Radarr grab last week"
              [value]="prompt()" (input)="prompt.set($any($event.target).value)"></textarea>
    <div class="row" style="margin: 10px 0">
      <button [disabled]="running() || !prompt().trim()" (click)="run()">Run</button>
      <button class="ghost" [disabled]="runningEvals()" (click)="runGoldenEvals()">
        {{ runningEvals() ? 'Running evals…' : 'Run golden-question evals' }}
      </button>
      @for (ex of examples; track ex) {
        <button class="ghost" (click)="prompt.set(ex); run()">{{ ex }}</button>
      }
    </div>

    @if (evals(); as e) {
      <div class="card" style="margin-bottom: 16px">
        <div class="row">
          <h4 style="margin: 0">Golden-question evals</h4>
          <span class="badge-num">{{ e.passed }}/{{ e.total }}</span>
          <div class="meter"><span [style.width.%]="e.score * 100" [style.background]="e.score >= 1 ? 'var(--good)' : 'var(--warn)'"></span></div>
          <span class="chip gray">{{ e.llmAvailable ? 'LLM generation' : 'fallback generation' }}</span>
        </div>
        <table class="data" style="margin-top: 10px">
          <thead><tr><th>Question</th><th>Result</th><th>Via</th><th>Missing assertions</th></tr></thead>
          <tbody>
            @for (r of e.results; track r.q) {
              <tr>
                <td class="small">{{ r.q }}</td>
                <td><span class="chip" [class]="r.passed ? 'chip good' : 'chip bad'">{{ r.passed ? 'pass' : 'fail' }}</span></td>
                <td><span class="chip gray">{{ r.llmUsed ? 'llm' : 'fallback' }}</span></td>
                <td class="small muted">{{ r.missing.join(', ') || '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

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
          @if (r.generation; as gen) {
            <div class="row" style="margin-top:8px">
              <span class="chip" [class]="gen.llmUsed ? 'chip good' : 'chip warn'">{{ gen.llmUsed ? 'LLM generated' : 'deterministic fallback' }}</span>
              @if (gen.goldenMatch; as gq) {
                <span class="chip gray">golden: {{ gq }} ({{ gen.goldenScore | percent: '1.0-0' }})</span>
              }
            </div>
          }
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
  readonly evals = signal<EvalReport | null>(null);
  readonly runningEvals = signal(false);

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

  runGoldenEvals(): void {
    this.runningEvals.set(true);
    void this.api
      .evals()
      .then((e) => this.evals.set(e))
      .finally(() => this.runningEvals.set(false));
  }
}
