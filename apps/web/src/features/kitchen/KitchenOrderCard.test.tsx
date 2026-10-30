import type { OrderDto } from '@rkds/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dayBadge, KitchenOrderCard } from './KitchenOrderCard';

const NOW = Date.parse('2026-10-29T14:00:00.000Z'); // 19:00 PKT

function order(overrides: Partial<OrderDto> = {}): OrderDto {
  return {
    id: 'o1',
    orderNumber: 7,
    displayNumber: '007',
    businessDate: '2026-10-29',
    text: '2x Chicken Tikka\n\n1x Garlic Naan',
    kind: 'TEXT',
    items: null,
    notes: null,
    source: 'FOODPANDA',
    prepMinutes: 20,
    status: 'ACTIVE',
    createdAt: '2026-10-29T13:50:00.000Z',
    deadlineAt: '2026-10-29T14:10:00.000Z',
    completedAt: null,
    cancelledAt: null,
    updatedAt: '2026-10-29T13:50:00.000Z',
    version: 1,
    ...overrides,
  };
}

describe('KitchenOrderCard (FR-KIT-03/10)', () => {
  it('shows the number, the full multi-line text, the source and the timer', () => {
    render(<KitchenOrderCard order={order()} now={NOW} isNew={false} />);
    expect(screen.getByRole('heading', { name: '#007' })).toBeInTheDocument();
    const text = screen.getByText(/2x Chicken Tikka/);
    expect(text.textContent).toBe('2x Chicken Tikka\n\n1x Garlic Naan');
    expect(text).toHaveClass('order-text');
    expect(text).toHaveAttribute('dir', 'auto');
    expect(screen.getByText('Foodpanda')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('10:00');
  });

  it('renders HTML in the order text literally: no element is created', () => {
    const { container } = render(
      <KitchenOrderCard
        order={order({ text: '<img src=x onerror=alert(1)><b>bold</b>' })}
        now={NOW}
        isNew={false}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)><b>bold</b>')).toBeInTheDocument();
  });

  it('overdue cards show OVERDUE with a + timer', () => {
    render(
      <KitchenOrderCard
        order={order({ deadlineAt: '2026-10-29T13:55:00.000Z' })}
        now={NOW}
        isNew={false}
      />,
    );
    expect(screen.getByRole('timer')).toHaveTextContent('+05:00');
    expect(screen.getByText('OVERDUE')).toBeInTheDocument();
  });

  it('marks new orders and orders from an earlier business day', () => {
    render(<KitchenOrderCard order={order({ businessDate: '2026-10-28' })} now={NOW} isNew />);
    expect(screen.getByText('NEW')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });

  it('menu orders show each line with its quantity and size (ADR-027)', () => {
    render(
      <KitchenOrderCard
        order={order({
          kind: 'MENU',
          text: '2 × Zinger Burger\n1 × Masala Fries (Large)',
          items: [
            {
              itemId: 'zinger-burger',
              variantId: 'regular',
              name: 'Zinger Burger',
              variant: null,
              quantity: 2,
              unitPrice: 460,
            },
            {
              itemId: 'masala-fries',
              variantId: 'large',
              name: 'Masala Fries',
              variant: 'Large',
              quantity: 1,
              unitPrice: 200,
            },
          ],
        })}
        now={NOW}
        isNew={false}
      />,
    );
    const lines = screen.getAllByRole('listitem');
    expect(lines.map((li) => li.textContent)).toEqual(['2×Zinger Burger', '1×Masala FriesLarge']);
    expect(screen.queryByText(/Rs /)).not.toBeInTheDocument(); // no prices on the kitchen screen
  });

  it('kitchen notes appear in their own block with line breaks kept', () => {
    render(
      <KitchenOrderCard
        order={order({ notes: 'No onions\nSauce separate' })}
        now={NOW}
        isNew={false}
      />,
    );
    const notes = screen.getByRole('region', { name: 'Kitchen notes' });
    expect(notes).toHaveTextContent('KITCHEN NOTES');
    expect(screen.getByText(/No onions/).textContent).toBe('No onions\nSauce separate');
  });

  it('shows no notes block when there are no notes', () => {
    render(<KitchenOrderCard order={order()} now={NOW} isNew={false} />);
    expect(screen.queryByRole('region', { name: 'Kitchen notes' })).toBeNull();
    expect(screen.queryByText('KITCHEN NOTES')).toBeNull();
  });

  it('renders HTML in notes literally', () => {
    const { container } = render(
      <KitchenOrderCard order={order({ notes: '<b>hot</b>' })} now={NOW} isNew={false} />,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<b>hot</b>')).toBeInTheDocument();
  });

  it('dayBadge: none today, "Yesterday", otherwise the date', () => {
    expect(dayBadge(order(), NOW)).toBeNull();
    expect(dayBadge(order({ businessDate: '2026-10-28' }), NOW)).toBe('Yesterday');
    expect(dayBadge(order({ businessDate: '2026-10-25' }), NOW)).toBe('2026-10-25');
    // 02:00 PKT on the 30th still belongs to the 29th (cutoff 06:00).
    expect(dayBadge(order(), Date.parse('2026-10-29T21:00:00.000Z'))).toBeNull();
  });
});
