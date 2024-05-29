// Copyright (c) 2022 Davide Aversa

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import * as _ from 'lodash'

export interface SignalBindingAsync<S, T> {
  listener?: string
  handler: (source: S, data: T) => Promise<void>
}

export interface IAsyncSignal<S, T> {
  bind(listener: string, handler: (source: S, data: T) => Promise<void>): void
  unbind(listener: string): void
}

export class AsyncSignal<S, T> implements IAsyncSignal<S, T> {
  private handlers: Array<SignalBindingAsync<S, T>> = []

  public bind(listener: string, handler: (source: S, data: T) => Promise<void>): void {
    if (this.contains(listener)) {
      this.unbind(listener)
    }
    this.handlers.push({ listener, handler })
  }

  public unbind(listener: string): void {
    this.handlers = this.handlers.filter((h) => h.listener !== listener)
  }

  public async trigger(source: S, data: T): Promise<void> {
    // Duplicate the array to avoid side effects during iteration.
    this.handlers.slice(0).map((h) => h.handler(source, data))
  }

  public async triggerAwait(source: S, data: T): Promise<void> {
    // Duplicate the array to avoid side effects during iteration.
    const promises = this.handlers.slice(0).map((h) => h.handler(source, data))
    await Promise.all(promises)
  }

  public contains(listener: string): boolean {
    return _.some(this.handlers, (h) => h.listener === listener)
  }

  public expose(): IAsyncSignal<S, T> {
    return this
  }
}
