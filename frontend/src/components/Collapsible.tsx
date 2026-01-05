import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Only collapsible on mobile (< md breakpoint) */
  mobileOnly?: boolean;
  icon?: ReactNode;
  className?: string;
}

export default function Collapsible({
  title,
  children,
  defaultOpen = false,
  mobileOnly = false,
  icon,
  className = '',
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const contentRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Measure content height for animation
  useEffect(() => {
    if (contentRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (contentRef.current) {
          setHeight(contentRef.current.scrollHeight);
        }
      });
      resizeObserver.observe(contentRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // If mobileOnly and not on mobile, render children directly
  if (mobileOnly && !isMobile) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 mb-4">
          {icon}
          <h3 className="text-lg font-medium">{title}</h3>
        </div>
        {children}
      </div>
    );
  }

  const isCollapsible = !mobileOnly || isMobile;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => isCollapsible && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 mb-4 ${
          isCollapsible ? 'cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={isOpen}
        aria-controls="collapsible-content"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-lg font-medium">{title}</h3>
        </div>
        {isCollapsible && (
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        )}
      </button>

      <div
        id="collapsible-content"
        style={{
          height: isOpen ? height : 0,
          overflow: 'hidden',
          transition: 'height 0.2s ease-out',
        }}
      >
        <div ref={contentRef}>{children}</div>
      </div>
    </div>
  );
}
