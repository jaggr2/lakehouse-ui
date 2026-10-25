import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <nav class="side">
        <h1>Lakehouse</h1>
        <div class="sub">data catalog &amp; workbench</div>
        <a routerLink="/" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="active">Catalog</a>
        <a routerLink="/lineage" routerLinkActive="active">Lineage</a>
        <a routerLink="/concepts" routerLinkActive="active">Concepts</a>
        <a routerLink="/workbench" routerLinkActive="active">Query workbench</a>
        <a routerLink="/architecture" routerLinkActive="active">Architecture</a>
        <button class="theme-toggle" (click)="toggleTheme()">
          {{ theme() === 'dark' ? 'Light theme' : 'Dark theme' }}
        </button>
      </nav>
      <main><router-outlet /></main>
    </div>
  `,
})
export class App {
  readonly theme = signal<string>(this.initialTheme());

  constructor() {
    document.documentElement.dataset['theme'] = this.theme();
  }

  toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.dataset['theme'] = next;
    localStorage.setItem('lakehouse-theme', next);
  }

  private initialTheme(): string {
    const saved = localStorage.getItem('lakehouse-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
