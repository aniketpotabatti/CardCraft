import { useEffect, useRef } from "react";
import type { TextLayer } from "../../model/types";

interface Props {
  layer: TextLayer;
  scale: number;
  offset: { x: number; y: number };
  onChange: (text: string) => void;
  onClose: () => void;
}

export function TextEditor({ layer, scale, offset, onChange, onClose }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.select();
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [layer.id]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  };

  return (
    <textarea
      ref={ref}
      defaultValue={layer.text}
      placeholder="Type your text…"
      onChange={handleInput}
      onBlur={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.blur();
        }
      }}
      style={{
        position: "absolute",
        left: offset.x + layer.x * scale,
        top: offset.y + layer.y * scale,
        width: Math.max(80, layer.width * scale),
        minHeight: layer.fontSize * layer.lineHeight * scale,
        margin: 0,
        padding: "0px",
        boxSizing: "border-box",
        border: "1.5px solid #6ea8fe",
        borderRadius: "2px",
        resize: "none",
        background: "transparent",
        caretColor: layer.color,
        color: layer.color,
        fontFamily: layer.fontFamily,
        fontSize: `${layer.fontSize * scale}px`,
        fontWeight: layer.fontWeight,
        fontStyle: layer.italic ? "italic" : "normal",
        textTransform: layer.uppercase ? "uppercase" : "none",
        lineHeight: layer.lineHeight,
        letterSpacing: `${layer.letterSpacing * scale}px`,
        textAlign: layer.align,
        overflow: "hidden",
        outline: "none",
        transform: `rotate(${layer.rotation}deg)`,
        transformOrigin: "top left",
        zIndex: 50,
        WebkitTextFillColor: layer.color,
      }}
      className="placeholder:opacity-55"
    />
  );
}
