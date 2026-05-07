// Haptic feedback utilities
const VIBRATION_PATTERNS = {
  light: [10],
  medium: [20],
  heavy: [30],
  success: [10, 50, 10],
  error: [20, 50, 20],
  navigation: [15],
} as const;

export type VibrationPattern = keyof typeof VIBRATION_PATTERNS;

export function hapticFeedback(pattern: VibrationPattern = "light"): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return;
  }

  const durations = VIBRATION_PATTERNS[pattern];
  if (durations.some((d) => d > 0)) {
    try {
      navigator.vibrate(durations);
    } catch {
      // Vibration not supported or failed silently
    }
  }
}

export function hapticLight(): void {
  hapticFeedback("light");
}

export function hapticMedium(): void {
  hapticFeedback("medium");
}

export function hapticSuccess(): void {
  hapticFeedback("success");
}

export function hapticError(): void {
  hapticFeedback("error");
}
