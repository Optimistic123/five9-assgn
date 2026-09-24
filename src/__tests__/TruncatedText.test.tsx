import { act, fireEvent, render, screen } from '@testing-library/react';
import { TruncatedText } from '../components/TruncatedText';

const TEXT = 'Space Test Program 2 is a rideshare managed by the U.S. Air Force…';

function mockOverflow(overflowing: boolean) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(overflowing ? 200 : 60);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TruncatedText', () => {
  it('opens a popover with the full text on hover when truncated, and closes on leave', () => {
    mockOverflow(true);
    render(<TruncatedText text={TEXT} />);
    const clamped = screen.getByText(TEXT);
    expect(clamped).toHaveAttribute('tabindex', '0');

    fireEvent.mouseEnter(clamped);
    expect(screen.queryByTestId('details-popover')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId('details-popover')).toHaveTextContent(TEXT);

    fireEvent.mouseLeave(clamped);
    act(() => vi.advanceTimersByTime(130));
    expect(screen.getByTestId('details-popover')).toHaveClass('is-closing');
    act(() => vi.advanceTimersByTime(130));
    expect(screen.queryByTestId('details-popover')).not.toBeInTheDocument();
  });

  it('opens on keyboard focus and closes on Escape', () => {
    mockOverflow(true);
    render(<TruncatedText text={TEXT} />);
    fireEvent.focus(screen.getByText(TEXT));
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId('details-popover')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId('details-popover')).not.toBeInTheDocument();
  });

  it('does nothing when the text fits', () => {
    mockOverflow(false);
    render(<TruncatedText text="Short" />);
    const el = screen.getByText('Short');
    expect(el).not.toHaveAttribute('tabindex');
    fireEvent.mouseEnter(el);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByTestId('details-popover')).not.toBeInTheDocument();
  });

  it('stays open while scrolling inside the popover, closes when the page scrolls', () => {
    mockOverflow(true);
    render(<TruncatedText text={TEXT} />);
    fireEvent.mouseEnter(screen.getByText(TEXT));
    act(() => vi.advanceTimersByTime(200));
    const popover = screen.getByTestId('details-popover');

    fireEvent.scroll(popover);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId('details-popover')).not.toHaveClass('is-closing');

    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByTestId('details-popover')).not.toBeInTheDocument();
  });
});
