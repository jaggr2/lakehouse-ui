import { Component, inject, signal } from '@angular/core';
import { PercentPipe } from '@angular/common';
import { ApiService } from '../core/api.service';
import type { EvalReport, EvalRun, FeedbackRecord, QueryResponse, WeakSignalRecord } from '../core/api.types';

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
        @if (history().length > 1) {
          <div class="row" style="margin-top: 10px; align-items: flex-end; height: 36px">
            @for (run of history(); track run.id) {
              <div [style.height.%]="run.score * 100"
                   [style.width.px]="Math.max(8, 120 / history().length)"
                   [title]="run.ts + ' — ' + run.passed + '/' + run.total"
                   style="background: var(--accent); border-radius: 2px"></div>
            }
            <span class="small muted">score trend</span>
          </div>
        }
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

    <div class="card" style="margin-bottom: 16px">
      <h4 style="margin-top: 0">Weak signals (M5)</h4>
      <p class="small muted">Usage patterns that candidate a golden question: rephrased asks and copy+edit corrections. Promote one to make it a test.</p>
      @for (s of signals(); track s.id) {
        <div class="row small" style="margin-top: 8px">
          <span class="chip gray">{{ s.kind }}</span>
          <span style="flex: 1">{{ s.prompt }}</span>
          <button class="ghost" (click)="promoteWeak(s)">Promote to golden</button>
        </div>
      } @empty {
        <p class="muted small">No candidates yet &mdash; they appear as the workbench gets used.</p>
      }
    </div>

    @if (queue().length > 0) {
      <div class="card" style="margin-bottom: 16px">
        <h4 style="margin-top: 0">Self-improvement queue</h4>
        <p class="small muted">Corrections become golden questions &mdash; the eval set grows from real mistakes.</p>
        @for (f of queue(); track f.id) {
          <div class="row small" style="margin-top: 8px">
            <span class="chip" [class]="f.status === 'open' ? 'chip warn' : 'chip good'">{{ f.status }}</span>
            @if (f.scoreBefore !== null) {
              <span class="chip gray" title="eval score before -> after promotion (M6)">impact {{ f.scoreBefore }} &rarr; {{ f.scoreAfter ?? 'pending' }}</span>
            }
            <span style="flex: 1">{{ f.prompt }}</span>
            @if (f.status === 'open') {
              <button class="ghost" (click)="promote(f)">Promote to golden</button>
            }
          </div>
        }
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

      <div class="card" style="margin-top: 14px">
        <div class="row">
          <h4 style="margin: 0">Improve this answer</h4>
          @if (feedbackSent()) {
            <span class="chip good">correction submitted — thank you</span>
          } @else if (!feedbackOpen()) {
            <button class="ghost" (click)="openFeedback(r)">👎 this was wrong</button>
          }
        </div>
        @if (feedbackOpen()) {
          <p class="small muted" style="margin: 8px 0">
            The correction becomes a golden question — future answers improve and the eval set grows.
          </p>
          <textarea rows="3" [value]="correctedSql()"
                    (input)="correctedSql.set($any($event.target).value)"></textarea>
          <input type="text" placeholder="notes (optional) — e.g. messages means mail"
                 style="margin-top: 8px" [value]="feedbackNotes()"
                 (input)="feedbackNotes.set($any($event.target).value)" />
          <div class="row" style="margin-top: 8px">
            <button (click)="submitFeedback(r)">Submit correction</button>
            <button class="ghost" (click)="feedbackOpen.set(false)">Cancel</button>
          </div>
        }
      </div>
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
  readonly history = signal<EvalRun[]>([]);
  readonly queue = signal<FeedbackRecord[]>([]);
  readonly signals = signal<WeakSignalRecord[]>([]);
  readonly feedbackOpen = signal(false);
  readonly feedbackSent = signal(false);
  readonly correctedSql = signal('');
  readonly feedbackNotes = signal('');
  readonly Math = Math;

  readonly examples = [
    'what did Radarr grab last week',
    'how many parcels arrived this week',
    'which areas were most active today',
    'how often did ingest fail this month',
  ];

  constructor() {
    this.refreshFeedback();
    this.refreshWeakSignals();
    void this.api.evalHistory().then((h) => this.history.set(h));
  }

  openFeedback(r: QueryResponse): void {
    this.correctedSql.set(r.sql);
    this.feedbackNotes.set('');
    this.feedbackOpen.set(true);
    this.feedbackSent.set(false);
  }

  submitFeedback(r: QueryResponse): void {
    void this.api
      .submitFeedback({
        prompt: this.prompt(),
        generatedSql: r.sql,
        correctedSql: this.correctedSql() || undefined,
        notes: this.feedbackNotes() || undefined,
      })
      .then(() => {
        this.feedbackSent.set(true);
        this.feedbackOpen.set(false);
        this.refreshFeedback();
      });
    // M5 weak signal: a correction that only tweaks the generated SQL is a
    // copy+edit - the edited SQL is a candidate golden question (mined by the
    // improver for the filters/atoms users keep adding).
    const edited = this.correctedSql().trim();
    if (edited && edited !== r.sql.trim() && this.similarity(r.sql, edited) >= 0.6) {
      void this.api.submitWeakSignal({
        kind: 'sql_edit',
        prompt: this.prompt(),
        prevPrompt: r.sql,
        sql: edited,
      }).then(() => this.refreshWeakSignals());
    }
  }

  promote(f: FeedbackRecord): void {
    void this.api.promoteFeedback(f.id).then(() => this.refreshFeedback());
  }

  private refreshFeedback(): void {
    void this.api.listFeedback().then((items) => this.queue.set(items));
  }

  private refreshWeakSignals(): void {
    void this.api.weakSignals('candidate').then((items) => this.signals.set(items));
  }

  promoteWeak(s: WeakSignalRecord): void {
    void this.api.promoteWeakSignal(s.id).then(() => this.refreshWeakSignals());
  }

  private lastAsk: { prompt: string; ts: number } | null = null;

  /** Token-overlap similarity, used to spot copy+edit corrections (M5). */
  private similarity(a: string, b: string): number {
    const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
    const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
    if (ta.size === 0 || tb.size === 0) return 0;
    let shared = 0;
    for (const t of ta) if (tb.has(t)) shared++;
    return shared / Math.max(ta.size, tb.size);
  }

  run(): void {
    const p = this.prompt().trim();
    if (!p) return;
    this.running.set(true);
    this.error.set(null);
    this.res.set(null);
    void this.api
      .query({ prompt: p })
      .then((r) => {
        this.res.set(r);
        // M5 weak signal: rephrasing a question soon after an answer means the
        // answer missed - the rephrase is a candidate golden question.
        const last = this.lastAsk;
        this.lastAsk = { prompt: p, ts: Date.now() };
        if (last && p.toLowerCase() !== last.prompt.toLowerCase() && Date.now() - last.ts < 5 * 60_000) {
          void this.api
            .submitWeakSignal({ kind: 'rephrase', prompt: p, prevPrompt: last.prompt })
            .then(() => this.refreshWeakSignals());
        }
      })
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
