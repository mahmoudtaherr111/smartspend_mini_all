import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Keyboard } from "@capacitor/keyboard";
import { Capacitor } from "@capacitor/core";
import { registerBackButtonHandler } from "@/lib/back-button-manager";

interface VirtualKeyboardState {
  isKeyboardOpen: boolean;
  keyboardHeight: number;
}

const VirtualKeyboardContext = createContext<VirtualKeyboardState | null>(null);

const KEYBOARD_OPEN_THRESHOLD_PX = 80;

export function VirtualKeyboardProvider({ children }: { children: ReactNode }) {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    if (Capacitor.isNativePlatform()) {
      // Suppress Safari accessory bar on iOS
      Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});

      const willShowSub = Keyboard.addListener("keyboardWillShow", (info) => {
        setIsKeyboardOpen(true);
        setKeyboardHeight(info.keyboardHeight);
        root.classList.add("keyboard-active");
        root.style.setProperty("--keyboard-height", `${info.keyboardHeight}px`);
      });

      const willHideSub = Keyboard.addListener("keyboardWillHide", () => {
        setIsKeyboardOpen(false);
        setKeyboardHeight(0);
        root.classList.remove("keyboard-active");
        root.style.setProperty("--keyboard-height", "0px");
      });

      return () => {
        willShowSub.then((sub) => sub.remove()).catch(() => {});
        willHideSub.then((sub) => sub.remove()).catch(() => {});
      };
    } else if (typeof window !== "undefined" && window.visualViewport) {
      const handleResize = () => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        const heightDiff = window.innerHeight - viewport.height;
        const isOpen = heightDiff > KEYBOARD_OPEN_THRESHOLD_PX;

        setIsKeyboardOpen(isOpen);
        setKeyboardHeight(isOpen ? heightDiff : 0);

        if (isOpen) {
          root.classList.add("keyboard-active");
          root.style.setProperty("--keyboard-height", `${heightDiff}px`);
          root.style.setProperty(
            "--visual-viewport-height",
            `${viewport.height}px`,
          );
        } else {
          root.classList.remove("keyboard-active");
          root.style.setProperty("--keyboard-height", "0px");
          root.style.setProperty(
            "--visual-viewport-height",
            `${window.innerHeight}px`,
          );
        }
      };

      window.visualViewport.addEventListener("resize", handleResize);
      window.visualViewport.addEventListener("scroll", handleResize);
      handleResize();
      return () => {
        window.visualViewport?.removeEventListener("resize", handleResize);
        window.visualViewport?.removeEventListener("scroll", handleResize);
        root.classList.remove("keyboard-active");
        root.style.setProperty("--keyboard-height", "0px");
        root.style.setProperty(
          "--visual-viewport-height",
          `${window.innerHeight}px`,
        );
      };
    }
  }, []);

  useEffect(() => {
    if (!isKeyboardOpen || !Capacitor.isNativePlatform()) return;

    return registerBackButtonHandler(() => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) activeElement.blur();
      Keyboard.hide().catch(() => {});
      return true;
    }, 100);
  }, [isKeyboardOpen]);

  const value = useMemo(
    () => ({ isKeyboardOpen, keyboardHeight }),
    [isKeyboardOpen, keyboardHeight],
  );

  return createElement(VirtualKeyboardContext.Provider, { value }, children);
}

export function useVirtualKeyboard(): VirtualKeyboardState {
  const state = useContext(VirtualKeyboardContext);
  if (!state) {
    throw new Error(
      "useVirtualKeyboard must be used inside VirtualKeyboardProvider",
    );
  }
  return state;
}
