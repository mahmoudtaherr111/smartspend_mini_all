/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PwaOfflineSyncDialog } from "./PwaOfflineSyncDialog";

// Mock router navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// Mock Sonner toast
vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("PwaOfflineSyncDialog — Unique Entity ID Deletion & Synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads queues and assigns unique IDs to items missing an ID", () => {
    const legacyTexts = [
      { text: "غداء عمل 150", timestamp: 1700000000000 },
      { text: "بنزين 200", timestamp: 1700000001000 },
    ];
    const legacyManual = [
      { amount: "300", category: "طعام", description: "عشاء", timestamp: 1700000002000 },
    ];

    localStorage.setItem("smartspend_offline_texts", JSON.stringify(legacyTexts));
    localStorage.setItem("smartspend_offline_manual", JSON.stringify(legacyManual));

    render(<PwaOfflineSyncDialog isOnline={true} />);

    // Check banner presence
    expect(screen.getByText(/لديك 3 عمليات مسجلة أوفلاين/)).toBeTruthy();

    // Verify localStorage has been updated with unique IDs
    const storedTexts = JSON.parse(localStorage.getItem("smartspend_offline_texts") || "[]");
    expect(storedTexts[0].id).toBeDefined();
    expect(storedTexts[1].id).toBeDefined();
    expect(storedTexts[0].id).not.toBe(storedTexts[1].id);

    const storedManual = JSON.parse(localStorage.getItem("smartspend_offline_manual") || "[]");
    expect(storedManual[0].id).toBeDefined();
  });

  it("deletes items strictly by unique entity ID, preventing index-shift race conditions", () => {
    const textItems = [
      { id: "text-id-alpha", text: "أول معاملة", timestamp: 1700000000000 },
      { id: "text-id-beta", text: "ثاني معاملة", timestamp: 1700000001000 },
      { id: "text-id-gamma", text: "ثالث معاملة", timestamp: 1700000002000 },
    ];
    localStorage.setItem("smartspend_offline_texts", JSON.stringify(textItems));

    render(<PwaOfflineSyncDialog isOnline={true} />);

    // Open dialog
    const openBtn = screen.getByText("مراجعة ومزامنة");
    fireEvent.click(openBtn);

    expect(screen.getByText('"أول معاملة"')).toBeTruthy();
    expect(screen.getByText('"ثاني معاملة"')).toBeTruthy();
    expect(screen.getByText('"ثالث معاملة"')).toBeTruthy();

    // Find delete buttons (all trash icons)
    const deleteButtons = screen.getAllByTitle("حذف");
    expect(deleteButtons.length).toBe(3);

    // Delete middle item ("ثاني معاملة" with id text-id-beta)
    fireEvent.click(deleteButtons[1]);

    const remainingTexts = JSON.parse(localStorage.getItem("smartspend_offline_texts") || "[]");
    expect(remainingTexts.length).toBe(2);
    expect(remainingTexts.find((item: any) => item.id === "text-id-beta")).toBeUndefined();
    expect(remainingTexts[0].id).toBe("text-id-alpha");
    expect(remainingTexts[1].id).toBe("text-id-gamma");
  });

  it("deletes manual items strictly by unique entity ID", () => {
    const manualItems = [
      { id: "manual-id-1", amount: "50", category: "مواصلات", timestamp: 1700000000000 },
      { id: "manual-id-2", amount: "100", category: "سوبرماركت", timestamp: 1700000001000 },
    ];
    localStorage.setItem("smartspend_offline_manual", JSON.stringify(manualItems));

    render(<PwaOfflineSyncDialog isOnline={true} />);

    // Open dialog
    fireEvent.click(screen.getByText("مراجعة ومزامنة"));

    expect(screen.getByText(/50 ج\.م - مواصلات/)).toBeTruthy();
    expect(screen.getByText(/100 ج\.م - سوبرماركت/)).toBeTruthy();

    // Delete first manual item
    const deleteButtons = screen.getAllByTitle("حذف");
    fireEvent.click(deleteButtons[0]);

    const remainingManual = JSON.parse(localStorage.getItem("smartspend_offline_manual") || "[]");
    expect(remainingManual.length).toBe(1);
    expect(remainingManual[0].id).toBe("manual-id-2");
  });
});
