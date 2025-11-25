/*
 * SPDX-FileCopyrightText: misskey-dev
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class StatusError extends Error {
  public statusCode: number;
  public statusMessage?: string | undefined;
  public origin?: Error | undefined;
  public isClientError: boolean;

  constructor(message: string, statusCode: number, statusMessage?: string, origin?: Error) {
    super(message);
    this.name = 'StatusError';
    this.statusCode = statusCode;
    this.origin = origin;
    this.statusMessage = statusMessage;
    this.isClientError = typeof this.statusCode === 'number' && this.statusCode >= 400 && this.statusCode < 500;
  }
}
