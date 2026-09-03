import { useState, type ReactNode } from "react";

type TooltipProps = {
  children: ReactNode;
  label: string;
};

export function Tooltip({ children, label }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="tooltip"
      onBlur={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible ? (
        <span className="tooltip__content" role="tooltip">
          {label}
        </span>
      ) : null}
    </span>
  );
}
