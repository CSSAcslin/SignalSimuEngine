import { GripHorizontal, Maximize2, Minimize2, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useRef } from "react";

export type FloatingPanelPosition = {
  x: number;
  y: number;
};

export const FloatingPanel = ({
  title,
  position,
  className = "",
  zIndex,
  onMove,
  onClose,
  onFocus,
  maximized = false,
  onToggleMaximize,
  children
}: {
  title: string;
  position: FloatingPanelPosition;
  className?: string;
  zIndex: number;
  onMove: (position: FloatingPanelPosition) => void;
  onClose: () => void;
  onFocus: () => void;
  maximized?: boolean;
  onToggleMaximize?: () => void;
  children: ReactNode;
}) => {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panelX: number; panelY: number } | undefined>(undefined);

  const movePanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const panel = event.currentTarget.parentElement;
    const width = panel?.offsetWidth ?? 320;
    const height = panel?.offsetHeight ?? 240;
    onMove({
      x: Math.min(Math.max(8, window.innerWidth - width - 8), Math.max(8, drag.panelX + event.clientX - drag.x)),
      y: Math.min(Math.max(8, window.innerHeight - height - 8), Math.max(8, drag.panelY + event.clientY - drag.y))
    });
  };

  return (
    <section
      className={`floating-panel ${className} ${maximized ? "maximized" : ""}`}
      style={{ left: position.x, top: position.y, zIndex }}
      onPointerDown={onFocus}
    >
      <div
        className="floating-panel-title"
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
          dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panelX: position.x, panelY: position.y };
          event.currentTarget.setPointerCapture(event.pointerId);
          onFocus();
        }}
        onPointerMove={movePanel}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          dragRef.current = undefined;
        }}
        onPointerCancel={() => {
          dragRef.current = undefined;
        }}
      >
        <GripHorizontal size={15} />
        <strong>{title}</strong>
        <div className="floating-panel-actions">
          {onToggleMaximize ? (
            <button type="button" onClick={onToggleMaximize} title={maximized ? "Restore panel" : "Maximize panel"}>
              {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          ) : null}
          <button type="button" onClick={onClose} title={`Close ${title}`}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="floating-panel-content">{children}</div>
    </section>
  );
};
