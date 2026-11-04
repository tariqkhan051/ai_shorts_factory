/**
 * Browser automation port used by GoogleFlowPlaywrightProvider.
 * Keeps Playwright behind an interface so unit tests never launch Chromium.
 */

export type FlowBrowserSessionOptions = {
  profileDir: string;
  headless: boolean;
  baseUrl: string;
  diagnosticDir: string;
};

export interface FlowBrowserSession {
  goto(url: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  selectOption(selector: string, value: string): Promise<void>;
  waitForSelector(selector: string, options?: { timeoutMs?: number }): Promise<void>;
  isVisible(selector: string): Promise<boolean>;
  textContent(selector: string): Promise<string | null>;
  screenshot(filePath: string): Promise<void>;
  /**
   * Trigger download via selector click and save to destinationPath.
   * Implementations must use browser download events — never invent CDN URLs.
   */
  downloadViaClick(selector: string, destinationPath: string): Promise<void>;
  close(): Promise<void>;
}

export type FlowBrowserSessionFactory = (
  options: FlowBrowserSessionOptions,
) => Promise<FlowBrowserSession>;
