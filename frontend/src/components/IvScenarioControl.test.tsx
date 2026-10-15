import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IvScenarioControl from './IvScenarioControl';
import { createStore } from '../utils/store';

vi.mock('./HelpTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('IvScenarioControl', () => {
  it('previews while sliding and commits on release', () => {
    const previewStore = createStore(0);
    const setIvShiftPct = vi.fn();
    render(<IvScenarioControl ivShiftPct={0} setIvShiftPct={setIvShiftPct} previewStore={previewStore} />);

    const slider = screen.getByRole('slider', { name: 'Implied volatility change' });
    fireEvent.change(slider, { target: { value: '-40' } });

    expect(previewStore.get()).toBe(-40);
    expect(screen.getByText('IV -40%')).toBeInTheDocument();
    expect(setIvShiftPct).not.toHaveBeenCalled();

    fireEvent.mouseUp(slider);
    expect(setIvShiftPct).toHaveBeenCalledWith(-40);
  });
});
