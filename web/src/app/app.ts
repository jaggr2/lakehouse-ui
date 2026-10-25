import { Component } from '@angular/core';
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
      </nav>
      <main><router-outlet /></main>
    </div>
  `,
})
export class App {}
