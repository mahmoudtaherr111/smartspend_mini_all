import * as React from "react";
import { Button } from "./button";
import { useHaptics } from "@/hooks/useHaptics";

export function HapticButton({ onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { lightTap } = useHaptics();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    lightTap(); // Give a light physical feedback on click
    if (onClick) {
      onClick(e);
    }
  };

  return <Button onClick={handleClick} {...props} />;
}
