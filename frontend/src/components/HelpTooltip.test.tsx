import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HelpTooltip from './HelpTooltip';

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

describe('HelpTooltip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('portals and clamps the tooltip inside a narrow viewport', () => {
    setViewport(375, 667);
    render(<HelpTooltip term="iv">IV</HelpTooltip>);
    const trigger = screen.getByRole('button', { name: /help: implied volatility/i });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 350,
      y: 100,
      left: 350,
      top: 100,
      right: 366,
      bottom: 116,
      width: 16,
      height: 16,
      toJSON: () => ({}),
    });

    fireEvent.click(trigger);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveClass('fixed');
    expect(tooltip).toHaveStyle({ left: '79px', width: '288px' });
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('closes the portaled tooltip when escape is pressed', () => {
    setViewport(375, 667);
    render(<HelpTooltip term="iv">IV</HelpTooltip>);
    const trigger = screen.getByRole('button', { name: /help: implied volatility/i });

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
