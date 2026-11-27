import { beginSliderDrag, applySliderChange } from "../model/slider-history";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import * as Select from "@radix-ui/react-select";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import { Check, ChevronDown } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode, Ref, SelectHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Button({
  className,
  variant = "default",
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "ghost" | "accent" | "danger"; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-[var(--ease-out)] disabled:opacity-[var(--disabled-opacity)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface)]",
        variant === "default" && "bg-[var(--btn-default-bg)] text-[var(--btn-default-text)] border border-[var(--border-base)] hover:bg-[var(--btn-default-hover)] shadow-[var(--shadow-sm)]",
        variant === "ghost" && "text-[var(--text-secondary)] hover:bg-[var(--btn-default-bg)] hover:text-[var(--text-main)]",
        variant === "accent" && "bg-[var(--border-focus)] text-white hover:bg-sky-400 font-semibold shadow-[var(--shadow-sm)]",
        variant === "danger" && "bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:bg-rose-500/25 border border-rose-500/20",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "h-8 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-2.5 text-xs text-[var(--text-main)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--focus-ring)]/20",
        props.className,
      )}
    />
  );
}

export function NativeSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-8 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-2.5 text-xs text-[var(--text-main)] outline-none transition-colors duration-150 focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--focus-ring)]/20",
        props.className,
      )}
    />
  );
}

export function Toggle({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      {label && <Label.Root className="text-sm text-[var(--text-main)]">{label}</Label.Root>}
      <Switch.Root
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-5 w-9 rounded-full bg-white/10 data-[state=checked]:bg-[var(--border-focus)]"
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white transition data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-zinc-950" />
      </Switch.Root>
    </div>
  );
}

export function Range({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Slider.Root
          onPointerDownCapture={beginSliderDrag}
      className="relative flex h-8 w-full items-center"
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([next]) => applySliderChange(() => onChange(next))}
    >
      <Slider.Track className="relative h-1.5 grow rounded-full bg-[var(--border-strong)]">
        <Slider.Range className="absolute h-full rounded-full bg-[var(--border-focus)]" />
      </Slider.Track>
      <Slider.Thumb className="block size-4 rounded-full bg-white border border-[var(--border-strong)] shadow-[var(--shadow-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" />
    </Slider.Root>
  );
}

export function SelectBox<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <Select.Root value={value} onValueChange={(next) => onChange(next as T)}>
      <Select.Trigger className="inline-flex h-8 w-full items-center justify-between rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-2.5 text-xs text-[var(--text-main)] shadow-[var(--shadow-sm)] transition hover:border-[var(--border-focus)]">
        <Select.Value />
        <Select.Icon>
          <ChevronDown className="size-3.5 opacity-60" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="ui-select-popover z-50 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-main)] shadow-[var(--shadow-panel)]">
          <Select.Viewport className="p-1">
            {options.map((option) => (
              <Select.Item
                key={option.id}
                value={option.id}
                className="flex cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-xs outline-none hover:bg-[var(--bg-surface-elevated)] data-[highlighted]:bg-[var(--bg-surface-elevated)]"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check className="size-3.5 text-[var(--border-focus)]" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function Swatch({ color, active, onClick }: { color: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("ui-swatch size-6 rounded-full border border-[var(--border-strong)] shadow-[var(--shadow-sm)]", active && "ring-2 ring-[var(--focus-ring)] ring-offset-2 ring-offset-[var(--bg-surface)]")}
      style={{ background: color }}
      aria-label={color}
    />
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-modal-overlay fixed inset-0 z-40" />
        <Dialog.Content className="ui-modal-content fixed z-50 overflow-auto rounded-xl border p-5">
          <Dialog.Title className="mb-4 text-sm font-semibold text-[var(--text-main)]">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
