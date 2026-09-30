/**
 * A11Y-9: nothing announces itself in the wrong language.
 *
 * Until 2026-09-30 `index.html` declared `lang="en"` over an all-Finnish interface, so a screen
 * reader pronounced every Finnish name by English rules. The UI primitives carried the mirror
 * image: English names ("Close", "Go to previous page") and, on the pager, visible English
 * ("Previous", "Next") that the teacher sees on *Läsnäolot* past twenty Students.
 *
 * The document half reads the file, as `tokens-contrast.test.ts` reads `index.css`. The primitive
 * half renders the three the app shows — the pager, the dialog and the drawer — and asks for their
 * names the way a screen reader would.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

const HTML = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

describe('the language the app announces itself in', () => {
  it('declares the page Finnish', () => {
    expect(HTML).toMatch(/<html\s+lang="fi"/);
  });

  it('names the pager in Finnish, visibly and to a screen reader', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `Rivi ${i}` }));
    render(
      <DataTable
        columns={[{ id: 'name', header: 'Nimi' }]}
        data={rows}
        pagination={{ currentPage: 2, totalItems: 200, pageSize: 20, onPageChange: () => {} }}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Sivutus' })).toBeInTheDocument();
    expect(screen.getByLabelText('Edellinen sivu')).toHaveTextContent('Edellinen');
    expect(screen.getByLabelText('Seuraava sivu')).toHaveTextContent('Seuraava');
    // Ten pages from page 2 draw an ellipsis. Its sr-only text sits under `aria-hidden`, so nothing
    // reads it today; it is asserted so the file holds no English for the day that changes.
    expect(screen.getByText('Lisää sivuja')).toBeInTheDocument();
    expect(screen.queryByText(/Previous|Next|More pages/)).not.toBeInTheDocument();
  });

  it('names the dialog close button in Finnish', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Uusi kurssi</DialogTitle>
          <DialogDescription>Kuvaus</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Sulje' })).toBeInTheDocument();
  });

  it('names the drawer close button in Finnish', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Valikko</SheetTitle>
          <SheetDescription>Kuvaus</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole('button', { name: 'Sulje' })).toBeInTheDocument();
  });
});
