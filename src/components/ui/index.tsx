import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { X } from "lucide-react";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
const variants = cva("button", {
  variants: {
    variant: {
      default: "primary",
      outline: "outline",
      ghost: "ghost",
      destructive: "destructive",
    },
  },
  defaultVariants: { variant: "default" },
});
export function Button({
  className,
  variant,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variants>) {
  return <button className={cn(variants({ variant }), className)} {...props} />;
}
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("card", className)} {...props} />;
}
export function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("badge", className)}>{children}</span>;
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-overlay" />
        <DialogPrimitive.Content className="modal">
          <div className="section-heading">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description>
                {description || "请核对内容后保存，数据将写入本机数据库。"}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" aria-label="关闭窗口">
                <X size={20} />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const id = React.useId();
  return (
    <div className={wide ? "field wide" : "field"}>
      <label htmlFor={id}>{label}</label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id: string }>, {
            id,
          })
        : children}
    </div>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <span>—</span>
      <p>{children}</p>
    </div>
  );
}
