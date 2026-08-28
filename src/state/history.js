/**
 * Undo/redo command stack.
 *
 * A command is `{ label, bytes?, undo(), redo() }`. Three kinds are pushed by
 * the app: raster ops (before/after pixels of only the touched tiles), object
 * ops (small JSON snapshots) and map ops (seed re-runs, or a bounded snapshot
 * when the previous map contained hand-painted pixels).
 *
 * The stack is capped by entry count *and* a total byte budget, evicting the
 * oldest entries first, so a long painting session cannot exhaust memory.
 */
export class CommandStack {
  constructor({ limit = 50, byteBudget = 160 * 1024 * 1024 } = {}) {
    this.limit = limit;
    this.byteBudget = byteBudget;
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Total bytes currently retained by both stacks. */
  get bytes() {
    const sum = (total, command) => total + (command.bytes || 0);
    return this.undoStack.reduce(sum, 0) + this.redoStack.reduce(sum, 0);
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #notify() {
    for (const listener of this.listeners) listener(this);
  }

  #evict() {
    while (this.undoStack.length > this.limit) this.undoStack.shift();
    while (this.bytes > this.byteBudget && this.undoStack.length > 1) this.undoStack.shift();
  }

  /** Record an already-applied command. Clears the redo branch. */
  push(command) {
    if (!command || typeof command.undo !== "function" || typeof command.redo !== "function") {
      throw new TypeError("A history command needs undo() and redo() functions.");
    }
    this.undoStack.push(command);
    this.redoStack.length = 0;
    this.#evict();
    this.#notify();
    return command;
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) return null;
    command.undo();
    this.redoStack.push(command);
    this.#notify();
    return command;
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) return null;
    command.redo();
    this.undoStack.push(command);
    this.#notify();
    return command;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.#notify();
  }
}

export const history = new CommandStack();
