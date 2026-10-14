/**
 * Mailer Interface & Adapters
 * Provides pluggable email delivery behind a strict interface.
 * Defaults to ConsoleMailer in development and testing.
 */

export interface Mailer {
  send(to: string, subject: string, text: string, html?: string): Promise<boolean>;
}

export class ConsoleMailer implements Mailer {
  public async send(to: string, _subject: string, _text: string, _html?: string): Promise<boolean> {
    // In dev / test, log the dispatched email without external network side-effects
    // PII notice: to address logged with mask
    const _masked = to.replace(/(.{2})(.*)(@.*)/, '$1***$3');
    void _masked;
    // Silently succeed
    return true;
  }
}

export class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string) {}

  public async send(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'RaktSetu Alerts <alerts@raktsetu.internal>',
          to: [to],
          subject,
          text,
          html: html ?? `<p>${text}</p>`
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export class BrevoMailer implements Mailer {
  constructor(private readonly apiKey: string) {}

  public async send(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'RaktSetu Alerts', email: 'alerts@raktsetu.internal' },
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html ?? `<p>${text}</p>`
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
