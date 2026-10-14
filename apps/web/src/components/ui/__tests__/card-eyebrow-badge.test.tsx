import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../Card.js';
import { Eyebrow } from '../Eyebrow.js';
import { Badge } from '../Badge.js';

describe('Card, Eyebrow, and Badge Primitives', () => {
  describe('Card', () => {
    it('renders with hairline border and 8px border radius', () => {
      render(
        <Card data-testid="card-root">
          <CardHeader>
            <CardTitle>Emergency Dispatch</CardTitle>
            <CardDescription>Matching active volunteer donors</CardDescription>
          </CardHeader>
          <CardContent>Content body</CardContent>
        </Card>
      );

      const card = screen.getByTestId('card-root');
      expect(card).toBeInTheDocument();
      expect(card.className).toContain('border-[#212327]');
      expect(card.className).toContain('rounded-[8px]');
      expect(screen.getByText('Emergency Dispatch')).toBeInTheDocument();
    });
  });

  describe('Eyebrow', () => {
    it('renders monospace uppercase tracked typography', () => {
      render(<Eyebrow variant="sunset">CRITICAL NOTIFICATION</Eyebrow>);
      const eyebrow = screen.getByText('CRITICAL NOTIFICATION');
      expect(eyebrow).toBeInTheDocument();
      expect(eyebrow.className).toContain('eyebrow-mono');
      expect(eyebrow.className).toContain('text-[#ffc285]');
    });
  });

  describe('Badge', () => {
    it('renders status variants with pill shape', () => {
      const { rerender } = render(<Badge variant="urgent" dot>Active Emergency</Badge>);
      const urgentBadge = screen.getByText('Active Emergency');
      expect(urgentBadge).toBeInTheDocument();
      expect(urgentBadge.parentElement?.className).toContain('border-[#ff7a17]');

      rerender(<Badge variant="info">Simulation Run</Badge>);
      const infoBadge = screen.getByText('Simulation Run');
      expect(infoBadge.parentElement?.className).toContain('border-[#a0c3ec]');

      rerender(<Badge variant="success">Fulfilled</Badge>);
      const successBadge = screen.getByText('Fulfilled');
      expect(successBadge.parentElement?.className).toContain('border-[#ffffff]');
    });
  });
});
