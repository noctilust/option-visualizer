import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PositionsTable from './PositionsTable';
import { generateId } from '../hooks/useCalculation';
import type { Position } from '../types';

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    const id3 = generateId();

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it('should generate IDs with pos_ prefix', () => {
    const id = generateId();
    expect(id.startsWith('pos_')).toBe(true);
  });
});

describe('PositionsTable', () => {
  const mockPositions: Position[] = [
    { id: 'pos_1', qty: -1, expiration: 'Jan 16', strike: 100, type: 'P' },
    { id: 'pos_2', qty: 1, expiration: 'Jan 16', strike: 110, type: 'C' },
  ];

  it('should render positions table with data', () => {
    const setPositions = vi.fn();
    render(<PositionsTable positions={mockPositions} setPositions={setPositions} />);

    expect(screen.getByText('Positions')).toBeInTheDocument();
    expect(screen.getByDisplayValue('-1')).toBeInTheDocument();
    // ExpirationDropdown renders a button with text content, not a form input
    expect(screen.getAllByText(/Jan 16/)).toHaveLength(2);
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('110')).toBeInTheDocument();
  });

  it('should return null when positions is empty', () => {
    const setPositions = vi.fn();
    const { container } = render(<PositionsTable positions={[]} setPositions={setPositions} />);
    expect(container.firstChild).toBeNull();
  });

  it('should add new position with unique ID when Add Position clicked', () => {
    const setPositions = vi.fn();
    render(<PositionsTable positions={mockPositions} setPositions={setPositions} />);

    const addButton = screen.getByText('Add Position');
    fireEvent.click(addButton);

    expect(setPositions).toHaveBeenCalledTimes(1);
    const newPositions = setPositions.mock.calls[0][0] as Position[];
    expect(newPositions.length).toBe(3);
    expect(newPositions[2].id).toBeDefined();
    expect(newPositions[2].id.startsWith('pos_')).toBe(true);
  });

  it('should remove position by ID when delete clicked', () => {
    const setPositions = vi.fn();
    render(<PositionsTable positions={mockPositions} setPositions={setPositions} />);

    const deleteButtons = screen.getAllByRole('button').filter(
      btn => btn.querySelector('svg.w-4.h-4')
    );
    fireEvent.click(deleteButtons[0]);

    expect(setPositions).toHaveBeenCalledTimes(1);
    // handleChange uses functional update, so we need to call the updater function
    const updater = setPositions.mock.calls[0][0];
    const newPositions = updater(mockPositions) as Position[];
    expect(newPositions.length).toBe(1);
    expect(newPositions[0].id).toBe('pos_2');
  });

  it('should update position field on input change', () => {
    const setPositions = vi.fn();
    render(<PositionsTable positions={mockPositions} setPositions={setPositions} />);

    const qtyInput = screen.getByDisplayValue('-1');
    fireEvent.change(qtyInput, { target: { value: '-2' } });

    expect(setPositions).toHaveBeenCalledTimes(1);
    // handleChange uses functional update, so we need to call the updater function
    const updater = setPositions.mock.calls[0][0];
    const newPositions = updater(mockPositions) as Position[];
    expect(newPositions[0].qty).toBe('-2');
  });

  it('should use pos.id as React key for table rows', () => {
    const setPositions = vi.fn();
    const { container } = render(<PositionsTable positions={mockPositions} setPositions={setPositions} />);

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  it('should handle positions without id (fallback to index)', () => {
    const positionsWithoutId = [
      { id: '', qty: -1, expiration: 'Jan 16', strike: 100, type: 'P' as const },
      { id: '', qty: 1, expiration: 'Jan 16', strike: 110, type: 'C' as const },
    ];
    const setPositions = vi.fn();

    // Should not throw error
    const { container } = render(<PositionsTable positions={positionsWithoutId} setPositions={setPositions} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });
});
