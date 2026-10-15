import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DateSelector from './DateSelector';

describe('DateSelector management DTE', () => {
  it('adds a preset and marker for the management day', () => {
    const setEvalDaysFromNow = vi.fn();
    render(
      <DateSelector
        evalDaysFromNow={0}
        setEvalDaysFromNow={setEvalDaysFromNow}
        maxDaysToExpiration={45}
        managementDte={21}
      />,
    );

    expect(screen.getByTestId('management-dte-marker')).toHaveTextContent('21 DTE');
    fireEvent.click(screen.getByRole('button', { name: 'Show P/L at 21 days to expiration' }));
    expect(setEvalDaysFromNow).toHaveBeenCalledWith(24);
  });

  it('omits the marker when the trade is already inside the management window', () => {
    render(
      <DateSelector
        evalDaysFromNow={0}
        setEvalDaysFromNow={() => {}}
        maxDaysToExpiration={14}
        managementDte={21}
      />,
    );
    expect(screen.queryByTestId('management-dte-marker')).not.toBeInTheDocument();
  });
});
