/** "Too many incorrect attempts. Please wait 45 seconds and try again." (seconds under a minute, minutes after that) */
export function tooManyMessage(retryAfterSeconds: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  const wait =
    seconds < 60
      ? `${seconds} second${seconds === 1 ? "" : "s"}`
      : (() => {
          const minutes = Math.ceil(seconds / 60);
          return minutes === 1 ? "a minute" : `${minutes} minutes`;
        })();
  return `Too many incorrect attempts. Please wait ${wait} and try again.`;
}
