import type { ButtonHTMLAttributes } from "react";
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline-light" | "light" | "outline-danger";
}) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}
