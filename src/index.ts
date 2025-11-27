import { PathLike } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Generates a temporary file path for atomic write operations
 * @param file - Target file path
 * @returns Temporary file path in the same directory with .tmp extension
 * @internal
 */
function temp(file: PathLike): string {
  const path = file instanceof URL ? fileURLToPath(file) : file.toString()
  return join(dirname(path), `.${basename(path)}.tmp`)
}

type Done = () => void
type Fail = (error: Error) => void
type Content = Parameters<typeof writeFile>[1]

/**
 * Atomic file writer with write coalescing
 * 
 * Ensures safe file writes using the atomic write pattern (write to temp file + rename).
 * Multiple concurrent writes are automatically coalesced - only the latest data is written.
 * 
 * @example
 * ```typescript
 * const writer = new Writer('data.json')
 * 
 * // Single write
 * await writer.write('{"name": "test"}')
 * 
 * // Concurrent writes (automatically coalesced)
 * await Promise.all([
 *   writer.write('data 1'),
 *   writer.write('data 2'),
 *   writer.write('data 3'), // Only this will be written
 * ])
 * ```
 * 
 * @see https://en.wikipedia.org/wiki/Atomic_operation for atomic operations
 */
export class Writer {
  /** Target file path */
  #target: PathLike
  /** Temporary file path for atomic writes */
  #tmp: string
  /** Whether a write operation is currently active */
  #active = false
  /** Callbacks for the current write operation */
  #current: [Done, Fail] | null = null
  /** Callbacks for the next queued write operation */
  #waiting: [Done, Fail] | null = null
  /** Promise for queued write operations */
  #queued: Promise<void> | null = null
  /** Buffer holding the latest data to be written */
  #buffer: Content | null = null

  /**
   * Creates a new atomic file writer
   * @param file - Path to the file to write to
   */
  constructor(file: PathLike) {
    this.#target = file
    this.#tmp = temp(file)
  }

  /**
   * Writes data to the file atomically
   * 
   * If a write is already in progress, this write will be queued and coalesced
   * with other concurrent writes. Only the latest data will be written.
   * 
   * @param content - Data to write (string or Buffer)
   * @returns Promise that resolves when the write completes
   * @throws Error if the write operation fails
   * 
   * @example
   * ```typescript
   * await writer.write('hello world')
   * await writer.write(Buffer.from('binary data'))
   * ```
   */
  async write(content: Content): Promise<void> {
    if (!this.#active) {
      this.#active = true

      try {
        await writeFile(this.#tmp, content, 'utf-8')
        await rename(this.#tmp, this.#target)
        const c = this.#current
        if (c) c[0]()
      } catch (err) {
        const c = this.#current
        if (c && err instanceof Error) c[1](err)
        throw err
      } finally {
        this.#active = false
        this.#current = this.#waiting
        this.#waiting = null
        this.#queued = null
        
        const next = this.#buffer
        if (next) {
          this.#buffer = null
          await this.write(next)
        }
      }
      return
    }

    this.#buffer = content
    if (!this.#queued) {
      this.#queued = new Promise((d, f) => {
        this.#waiting = [d, f]
      })
    }
    return this.#queued
  }

  /**
   * Gets the target file path
   * @returns The file path this writer writes to
   */
  get path(): PathLike {
    return this.#target
  }

  /**
   * Checks if the writer is currently writing
   * @returns true if a write operation is in progress, false otherwise
   */
  get busy(): boolean {
    return this.#active
  }
}

export default Writer
