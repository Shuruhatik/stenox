import { PathLike } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function temp(file: PathLike): string {
  const path = file instanceof URL ? fileURLToPath(file) : file.toString()
  return join(dirname(path), `.${basename(path)}.tmp`)
}

type Done = () => void
type Fail = (error: Error) => void
type Content = Parameters<typeof writeFile>[1]

export class Writer {
  #target: PathLike
  #tmp: string
  #active = false
  #current: [Done, Fail] | null = null
  #waiting: [Done, Fail] | null = null
  #queued: Promise<void> | null = null
  #buffer: Content | null = null

  constructor(file: PathLike) {
    this.#target = file
    this.#tmp = temp(file)
  }

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

  get path(): PathLike {
    return this.#target
  }

  get busy(): boolean {
    return this.#active
  }
}

export default Writer
