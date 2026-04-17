import { cloneElement, useId, useState } from 'react';
import clsx from 'clsx';

/**
 * Tooltip — accessible, lightweight tooltip wrapper.
 *
 * Why a hand-rolled component instead of pulling in @radix-ui/popper:
 *   The chat surface only needs static positioning (above/below) for
 *   short helper strings. A 30 KB positioning library would dwarf the
 *   actual visual element. We keep the component dependency-free and
 *   layer it on top of any focusable child.
 *
 * Accessibility contract:
 *   - The tooltip body is rendered as `role="tooltip"` and connected
 *     to the trigger via `aria-describedby` so screen readers announce
 *     it as supplemental help, not as a separate region.
 *   - The trigger child must be focusable (button, link, input). We
 *     forward the `aria-describedby` so consumers don't need to wire
 *     it manually. Hover AND focus open the tooltip — keyboard-only
 *     users get the same affordance as mouse users.
 *   - Pressing `Escape` while the trigger has focus dismisses the
 *     tooltip without losing focus.
 *
 * Behaviour:
 *   - The tooltip body is positioned with absolute layout in a
 *     `relative` wrapper. Consumers that need a portal (e.g. inside
 *     overflow-hidden lists) should fall back to `title=""` for now.
 *   - Animations honour `prefers-reduced-motion` via the global CSS
 *     hook in `index.css`.
 */
const POSITION_CLASSES = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
};

const ARROW_CLASSES = {
  top: 'left-1/2 top-full -translate-x-1/2 -translate-y-1/2 rotate-45',
  bottom: 'left-1/2 bottom-full -translate-x-1/2 translate-y-1/2 rotate-45',
  left: 'top-1/2 left-full -translate-x-1/2 -translate-y-1/2 rotate-45',
  right: 'top-1/2 right-full translate-x-1/2 -translate-y-1/2 rotate-45',
};

const Tooltip = ({
  label,
  children,
  position = 'top',
  className,
  delayMs = 150,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  let openTimer = null;

  const handleOpen = () => {
    if (disabled || !label) return;
    if (openTimer) window.clearTimeout(openTimer);
    if (delayMs > 0) {
      openTimer = window.setTimeout(() => setOpen(true), delayMs);
    } else {
      setOpen(true);
    }
  };

  const handleClose = () => {
    if (openTimer) window.clearTimeout(openTimer);
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') handleClose();
  };

  /* Forward aria-describedby + the open/close handlers onto the single
   * focusable child so callers wrap their existing element directly. */
  const trigger = cloneElement(children, {
    'aria-describedby': open ? tooltipId : children.props['aria-describedby'],
    onMouseEnter: (event) => {
      children.props.onMouseEnter?.(event);
      handleOpen();
    },
    onMouseLeave: (event) => {
      children.props.onMouseLeave?.(event);
      handleClose();
    },
    onFocus: (event) => {
      children.props.onFocus?.(event);
      handleOpen();
    },
    onBlur: (event) => {
      children.props.onBlur?.(event);
      handleClose();
    },
    onKeyDown: (event) => {
      children.props.onKeyDown?.(event);
      handleKeyDown(event);
    },
  });

  if (!label) return children;

  return (
    <span className={clsx('relative inline-flex', className)}>
      {trigger}
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={clsx(
            'pointer-events-none absolute z-50 max-w-xs whitespace-normal rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg',
            'dark:bg-gray-100 dark:text-gray-900',
            POSITION_CLASSES[position] ?? POSITION_CLASSES.top,
          )}
        >
          {label}
          <span
            aria-hidden="true"
            className={clsx(
              'absolute h-2 w-2 bg-gray-900 dark:bg-gray-100',
              ARROW_CLASSES[position] ?? ARROW_CLASSES.top,
            )}
          />
        </span>
      ) : null}
    </span>
  );
};

export default Tooltip;
